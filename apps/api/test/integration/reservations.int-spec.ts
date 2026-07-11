import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, ReservationStatus, Role } from '@no-overlap/db';
import { PrismaPg } from '@prisma/adapter-pg';
import { createTestApp, registerAndLogin } from './helpers';

const DAY = 86_400_000;

/**
 * Fires many concurrent bookings at the SAME slot and proves exactly one wins, leaving zero
 * overlapping active rows in the database. The GiST exclusion constraint is the referee;
 * this exercises it under real concurrency, end to end over HTTP against real Postgres.
 */
describe('Reservations — concurrency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let hostToken: string;
  let guestToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    // Bind the HTTP server to a real ephemeral port ONCE. Otherwise supertest lazily calls
    // server.listen(0) on each request's first use, and 100 concurrent requests race to listen on the
    // same server — which surfaces as `read ECONNRESET`. Pre-listening makes them all reuse one socket.
    await app.listen(0);

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });
    hostToken = (await registerAndLogin(app, Role.HOST)).accessToken;
    guestToken = (await registerAndLogin(app, Role.GUEST)).accessToken;
  });

  const freshListing = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/listings')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        title: 'Storm',
        city: 'Berlin',
        nightlyPriceCents: 8900,
        maxGuests: 4,
      })
      .expect(201);
    return res.body.id as string;
  };

  /** Fires `n` concurrent identical holds; reports how they resolved and the DB truth. */
  const runStorm = async (listingId: string, n: number) => {
    // Well into the future so every hold clears the service's "checkIn must be in the future" guard;
    // each storm targets a fresh listing, so this shared range never collides across tests.
    const checkIn = new Date(Date.now() + 60 * DAY).toISOString();
    const checkOut = new Date(Date.now() + 64 * DAY).toISOString();
    const results = await Promise.all(
      Array.from({ length: n }, () =>
        request(app.getHttpServer())
          .post('/reservations')
          .set('Authorization', `Bearer ${guestToken}`)
          .send({ listingId, checkIn, checkOut }),
      ),
    );
    const created = results.filter((r) => r.status === 201).length;
    const conflicts = results.filter((r) => r.status === 409).length;
    const other = n - created - conflicts;
    const activeInDb = await prisma.reservation.count({
      where: {
        listingId,
        status: { in: [ReservationStatus.HELD, ReservationStatus.CONFIRMED] },
      },
    });
    return { created, conflicts, other, activeInDb };
  };

  it('exactly one of 100 concurrent identical holds wins; rest 409; one active row in DB', async () => {
    const listingId = await freshListing();
    const { created, conflicts, other, activeInDb } = await runStorm(
      listingId,
      100,
    );
    expect(created).toBe(1); // exactly one winner
    expect(conflicts).toBe(99); // everyone else: slot taken
    expect(other).toBe(0); // no unexpected errors
    expect(activeInDb).toBe(1); // the DB truth — zero overlapping active reservations
  });

  // The 10k correctness soak. Opt-in via SOAK_N so CI stays fast and stable; run
  // locally with `SOAK_N=10000 pnpm --filter api test:int` to capture the README number.
  const SOAK_N = Number(process.env.SOAK_N ?? 0);
  (SOAK_N > 0 ? it : it.skip)(
    `soak: ${SOAK_N} concurrent holds still yield exactly one active reservation`,
    async () => {
      const listingId = await freshListing();
      const { created, conflicts, other, activeInDb } = await runStorm(
        listingId,
        SOAK_N,
      );
      console.log(
        `[soak] n=${SOAK_N} created=${created} conflicts=${conflicts} other=${other}`,
      );
      expect(created).toBe(1);
      expect(activeInDb).toBe(1); // the invariant holds at scale
    },
    120_000,
  );
});

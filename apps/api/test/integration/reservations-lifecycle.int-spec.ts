import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, ReservationStatus, Role } from '@no-overlap/db';
import { PrismaPg } from '@prisma/adapter-pg';
import { ReservationExpiryService } from '../../src/booking/reservation-expiry.service';
import { createTestApp, registerAndLogin } from './helpers';

const DAY = 86_400_000;

/**
 * The reservation saga over HTTP against real Postgres: guarded transitions, idempotency, compensation
 * (cancel frees the slot), owner-scoping, and the expiry sweep. The sweep is driven directly via
 * sweepExpiredHolds() rather than the scheduler, so the test is deterministic and never waits on a clock.
 */
describe('Reservations — lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let sweep: ReservationExpiryService;
  let hostToken: string;
  let guestToken: string;
  let otherGuestToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });
    sweep = app.get(ReservationExpiryService, { strict: false });
    hostToken = (await registerAndLogin(app, Role.HOST)).accessToken;
    guestToken = (await registerAndLogin(app, Role.GUEST)).accessToken;
    otherGuestToken = (await registerAndLogin(app, Role.GUEST)).accessToken;
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let seq = 0;
  const futureRange = () => {
    const base = 200 + seq++ * 10; // distinct windows so nothing collides
    return {
      checkIn: new Date(Date.now() + base * DAY).toISOString(),
      checkOut: new Date(Date.now() + (base + 4) * DAY).toISOString(),
    };
  };
  const freshListing = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/listings')
      .set(auth(hostToken))
      .send({
        title: 'L',
        city: 'Berlin',
        nightlyPriceCents: 8900,
        maxGuests: 4,
      })
      .expect(201);
    return res.body.id;
  };
  const post = (path: string, token: string) =>
    request(app.getHttpServer()).post(path).set(auth(token));

  it('confirm: HELD -> CONFIRMED (200)', async () => {
    const listingId = await freshListing();
    const held = await post('/reservations', guestToken)
      .send({ listingId, ...futureRange() })
      .expect(201);
    const res = await post(
      `/reservations/${held.body.id}/confirm`,
      guestToken,
    ).expect(200);
    expect(res.body.status).toBe(ReservationStatus.CONFIRMED);
  });

  it('confirm is idempotent (second confirm stays CONFIRMED, no error)', async () => {
    const listingId = await freshListing();
    const held = await post('/reservations', guestToken)
      .send({ listingId, ...futureRange() })
      .expect(201);
    await post(`/reservations/${held.body.id}/confirm`, guestToken).expect(200);
    const again = await post(
      `/reservations/${held.body.id}/confirm`,
      guestToken,
    ).expect(200);
    expect(again.body.status).toBe(ReservationStatus.CONFIRMED);
  });

  it('cancel frees the slot: a previously-409 overlap succeeds after cancel', async () => {
    const listingId = await freshListing();
    const range = futureRange();
    const first = await post('/reservations', guestToken)
      .send({ listingId, ...range })
      .expect(201);
    await post('/reservations', guestToken)
      .send({ listingId, ...range })
      .expect(409); // overlap rejected
    await post(`/reservations/${first.body.id}/cancel`, guestToken).expect(200);
    await post('/reservations', guestToken)
      .send({ listingId, ...range })
      .expect(201); // slot reopened
  });

  it('illegal transition: confirming a CANCELLED reservation -> 409', async () => {
    const listingId = await freshListing();
    const held = await post('/reservations', guestToken)
      .send({ listingId, ...futureRange() })
      .expect(201);
    await post(`/reservations/${held.body.id}/cancel`, guestToken).expect(200);
    await post(`/reservations/${held.body.id}/confirm`, guestToken).expect(409);
  });

  it('owner-scoped: another guest cannot act on your reservation -> 404', async () => {
    const listingId = await freshListing();
    const held = await post('/reservations', guestToken)
      .send({ listingId, ...futureRange() })
      .expect(201);
    await post(`/reservations/${held.body.id}/confirm`, otherGuestToken).expect(
      404,
    );
  });

  it('the sweep expires a past-TTL hold and frees its slot', async () => {
    const listingId = await freshListing();
    const range = futureRange();
    const held = await post('/reservations', guestToken)
      .send({ listingId, ...range })
      .expect(201);

    // Backdate the TTL so the hold is now stale, then drive the sweep directly.
    await prisma.reservation.update({
      where: { id: held.body.id },
      data: { holdExpiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await sweep.sweepExpiredHolds();
    expect(expired).toBeGreaterThanOrEqual(1);

    const after = await prisma.reservation.findUnique({
      where: { id: held.body.id },
    });
    expect(after?.status).toBe(ReservationStatus.EXPIRED);

    await post('/reservations', guestToken)
      .send({ listingId, ...range })
      .expect(201); // slot freed
  });
});

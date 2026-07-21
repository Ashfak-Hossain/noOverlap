import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, ReservationStatus, Role } from '@no-overlap/db';
import { PrismaPg } from '@prisma/adapter-pg';
import { BookingService } from '../../src/booking/booking.service';
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
  let booking: BookingService;
  let hostToken: string;
  let guestToken: string;
  let otherGuestToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });
    sweep = app.get(ReservationExpiryService, { strict: false });
    booking = app.get(BookingService, { strict: false });
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

  it('a successful payment confirms the hold', async () => {
    const listingId = await freshListing();
    const held = await post('/reservations', guestToken)
      .send({ listingId, ...futureRange() })
      .expect(201);

    // There is no manual confirm endpoint: a reservation is only confirmed by a payment result
    // arriving from the worker. This drives that path directly, without the queue, for determinism.
    expect(await booking.applyPaymentSucceeded(held.body.id)).toEqual({
      outcome: 'applied',
    });

    const res = await request(app.getHttpServer())
      .get(`/reservations/${held.body.id}`)
      .set(auth(guestToken))
      .expect(200);
    expect(res.body.status).toBe(ReservationStatus.CONFIRMED);
  });

  it('a redelivered success is a no-op, not a second confirm', async () => {
    const listingId = await freshListing();
    const held = await post('/reservations', guestToken)
      .send({ listingId, ...futureRange() })
      .expect(201);

    await booking.applyPaymentSucceeded(held.body.id);
    // At-least-once delivery means this message can arrive twice; the conditional update makes the
    // repeat harmless rather than an error.
    expect(await booking.applyPaymentSucceeded(held.body.id)).toEqual({
      outcome: 'already-settled',
    });

    const after = await prisma.reservation.findUnique({
      where: { id: held.body.id },
    });
    expect(after?.status).toBe(ReservationStatus.CONFIRMED);
  });

  it('a failed payment releases the hold and frees the slot', async () => {
    const listingId = await freshListing();
    const range = futureRange();
    const held = await post('/reservations', guestToken)
      .send({ listingId, ...range })
      .expect(201);

    expect(await booking.applyPaymentFailed(held.body.id)).toEqual({
      outcome: 'applied',
    });

    const after = await prisma.reservation.findUnique({
      where: { id: held.body.id },
    });
    expect(after?.status).toBe(ReservationStatus.CANCELLED);

    // Compensation actually releases the slot: the same range books again.
    await post('/reservations', guestToken)
      .send({ listingId, ...range })
      .expect(201);
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

  it('a charge that lands after the hold is gone demands a refund', async () => {
    const listingId = await freshListing();
    const held = await post('/reservations', guestToken)
      .send({ listingId, ...futureRange() })
      .expect(201);
    await post(`/reservations/${held.body.id}/cancel`, guestToken).expect(200);

    // The money moved but the slot is already released, so the booking cannot simply be revived —
    // the caller is told to compensate instead of silently keeping the charge.
    expect(await booking.applyPaymentSucceeded(held.body.id)).toEqual({
      outcome: 'refund-required',
      status: ReservationStatus.CANCELLED,
    });

    const after = await prisma.reservation.findUnique({
      where: { id: held.body.id },
    });
    expect(after?.status).toBe(ReservationStatus.CANCELLED); // never revived
  });

  it('owner-scoped: another guest cannot act on your reservation -> 404', async () => {
    const listingId = await freshListing();
    const held = await post('/reservations', guestToken)
      .send({ listingId, ...futureRange() })
      .expect(201);
    await post(`/reservations/${held.body.id}/cancel`, otherGuestToken).expect(
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

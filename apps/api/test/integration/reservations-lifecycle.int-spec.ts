import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, ReservationStatus, Role } from '@no-overlap/db';
import { PrismaPg } from '@prisma/adapter-pg';
import { BookingService } from '../../src/booking/booking.service';
import { ReservationExpiryService } from '../../src/booking/reservation-expiry.service';
import { ReservationCompletionService } from '../../src/booking/reservation-completion.service';
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
  let completion: ReservationCompletionService;
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
    completion = app.get(ReservationCompletionService, { strict: false });
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

  /**
   * A stay can only be booked into the future, so reaching a past check-out means confirming a
   * reservation over HTTP and then backdating it in the database. That is the only way to construct
   * the state; the sweep itself is exercised for real.
   */
  const confirmedStayEndingInThePast = async (): Promise<string> => {
    const listingId = await freshListing();
    const held = await post('/reservations', guestToken)
      .send({ listingId, ...futureRange() })
      .expect(201);
    await booking.applyPaymentSucceeded(held.body.id);

    const id = held.body.id as string;
    await prisma.reservation.update({
      where: { id },
      data: {
        checkIn: new Date(Date.now() - 5 * DAY),
        checkOut: new Date(Date.now() - 2 * DAY),
      },
    });
    return id;
  };

  it('the sweep completes a confirmed stay whose check-out has passed', async () => {
    const id = await confirmedStayEndingInThePast();

    expect(await completion.sweepCompletedStays()).toBeGreaterThanOrEqual(1);

    const after = await prisma.reservation.findUnique({ where: { id } });
    // COMPLETED was unreachable before this sweep existed: a legal transition target that nothing
    // ever moved a row into.
    expect(after?.status).toBe(ReservationStatus.COMPLETED);
  });

  it('sweeping twice changes nothing the second time', async () => {
    const id = await confirmedStayEndingInThePast();
    await completion.sweepCompletedStays();

    // The status filter is what makes this idempotent: the first run's rows are no longer CONFIRMED,
    // so they cannot match again. This is also why two instances sweeping concurrently is safe.
    expect(await completion.sweepCompletedStays()).toBe(0);

    const after = await prisma.reservation.findUnique({ where: { id } });
    expect(after?.status).toBe(ReservationStatus.COMPLETED);
  });

  it('the sweep leaves a stay that is still running, and one that was never paid for', async () => {
    const listingId = await freshListing();
    const running = await post('/reservations', guestToken)
      .send({ listingId, ...futureRange() })
      .expect(201);
    await booking.applyPaymentSucceeded(running.body.id);

    // A hold whose dates have passed without payment is the expiry sweep's business, not this one's:
    // completing it would record a stay that never happened, and make it reviewable.
    const unpaid = await post('/reservations', guestToken)
      .send({ listingId, ...futureRange() })
      .expect(201);
    // Both ends move: the exclusion constraint indexes tstzrange(check_in, check_out), and Postgres
    // refuses a range that ends before it starts.
    await prisma.reservation.update({
      where: { id: unpaid.body.id },
      data: {
        checkIn: new Date(Date.now() - 5 * DAY),
        checkOut: new Date(Date.now() - 2 * DAY),
      },
    });

    await completion.sweepCompletedStays();

    expect(
      (await prisma.reservation.findUnique({ where: { id: running.body.id } }))
        ?.status,
    ).toBe(ReservationStatus.CONFIRMED);
    expect(
      (await prisma.reservation.findUnique({ where: { id: unpaid.body.id } }))
        ?.status,
    ).toBe(ReservationStatus.HELD);
  });
});

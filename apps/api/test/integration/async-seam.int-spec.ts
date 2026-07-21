import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import request from 'supertest';
import { PrismaClient, ReservationStatus, Role } from '@no-overlap/db';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  BOOKING_HELD,
  CHARGE_QUEUE,
  REFUND_QUEUE,
  REFUND_REQUESTED,
} from '@no-overlap/contracts';
import type { Queue } from 'bullmq';
import { BookingService } from '../../src/booking/booking.service';
import { OutboxRelayService } from '../../src/booking/outbox-relay.service';
import { createTestApp, registerAndLogin } from './helpers';

const DAY = 86_400_000;

/**
 * The async seam: the transactional outbox, the polling relay, and the settlement of payment results
 * back onto the reservation.
 *
 * The relay is driven directly rather than on its timer, so every assertion is deterministic instead
 * of a race against a two-second interval.
 */
describe('Async seam — outbox, relay, settlement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let relay: OutboxRelayService;
  let booking: BookingService;
  let chargeQueue: Queue;
  let refundQueue: Queue;
  let hostToken: string;
  let guestToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });
    relay = app.get(OutboxRelayService, { strict: false });
    booking = app.get(BookingService, { strict: false });
    chargeQueue = app.get<Queue>(getQueueToken(CHARGE_QUEUE), {
      strict: false,
    });
    refundQueue = app.get<Queue>(getQueueToken(REFUND_QUEUE), {
      strict: false,
    });
    hostToken = (await registerAndLogin(app, Role.HOST)).accessToken;
    guestToken = (await registerAndLogin(app, Role.GUEST)).accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // A clean queue per test so counts assert only what this test produced.
    await chargeQueue.obliterate({ force: true });
    await refundQueue.obliterate({ force: true });
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let seq = 0;
  const futureRange = () => {
    const base = 900 + seq++ * 10; // windows distinct from the other specs
    return {
      checkIn: new Date(Date.now() + base * DAY).toISOString(),
      checkOut: new Date(Date.now() + (base + 3) * DAY).toISOString(),
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
    return res.body.id as string;
  };
  const hold = async (listingId: string, range = futureRange()) => {
    const res = await request(app.getHttpServer())
      .post('/reservations')
      .set(auth(guestToken))
      .send({ listingId, ...range })
      .expect(201);
    return res.body.id as string;
  };

  it('writes the reservation and its BookingHeld event in one transaction', async () => {
    const id = await hold(await freshListing());

    const rows = await prisma.outbox.findMany({ where: { aggregateId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe(BOOKING_HELD);
    expect(rows[0].publishedAt).toBeNull();
    // The event carries what the worker needs, and the amount agrees with the reservation itself.
    const reservation = await prisma.reservation.findUnique({ where: { id } });
    expect(rows[0].payload).toMatchObject({
      type: BOOKING_HELD,
      reservationId: id,
      idempotencyKey: id,
      amountCents: reservation!.priceTotalCents,
    });
  });

  it('a rejected overlap writes neither a reservation nor an orphan event', async () => {
    const listingId = await freshListing();
    const range = futureRange();
    await hold(listingId, range);

    const before = await prisma.outbox.count();
    await request(app.getHttpServer())
      .post('/reservations')
      .set(auth(guestToken))
      .send({ listingId, ...range })
      .expect(409);

    // The whole transaction rolled back, so the loser never queued a phantom charge.
    expect(await prisma.outbox.count()).toBe(before);
  });

  it('the relay publishes unsent rows and marks them published', async () => {
    const id = await hold(await freshListing());

    expect(await relay.publishBatch()).toBeGreaterThanOrEqual(1);

    const row = await prisma.outbox.findFirst({ where: { aggregateId: id } });
    expect(row!.publishedAt).not.toBeNull();
    expect(await chargeQueue.getWaitingCount()).toBeGreaterThanOrEqual(1);
  });

  it('concurrent relays never publish the same row twice (SKIP LOCKED)', async () => {
    const listingId = await freshListing();
    await hold(listingId);
    await hold(await freshListing());
    await hold(await freshListing());

    const unpublishedBefore = await prisma.outbox.count({
      where: { publishedAt: null },
    });
    expect(unpublishedBefore).toBeGreaterThanOrEqual(3);

    // Two relays race over the same backlog. SKIP LOCKED makes them claim disjoint rows rather than
    // fight over the same ones, so the totals must add up exactly with no double-publishing.
    const [a, b] = await Promise.all([
      relay.publishBatch(),
      relay.publishBatch(),
    ]);

    expect(a + b).toBe(unpublishedBefore);
    expect(await prisma.outbox.count({ where: { publishedAt: null } })).toBe(0);
    expect(await chargeQueue.getWaitingCount()).toBe(unpublishedBefore);
  });

  it('re-publishes rows that were sent but never marked (at-least-once)', async () => {
    const id = await hold(await freshListing());
    await relay.publishBatch();

    // Simulate a crash between the publish and the mark: the row is unpublished again, so the next
    // pass sends it a second time. Losing an event would be the unacceptable failure; sending it
    // twice is safe, because the charge is idempotent downstream.
    await prisma.outbox.updateMany({
      where: { aggregateId: id },
      data: { publishedAt: null },
    });

    expect(await relay.publishBatch()).toBeGreaterThanOrEqual(1);
    const row = await prisma.outbox.findFirst({ where: { aggregateId: id } });
    expect(row!.publishedAt).not.toBeNull();
  });

  it('a cancelled paid booking queues a refund for the same key', async () => {
    const id = await hold(await freshListing());
    await booking.applyPaymentSucceeded(id); // as the worker's result would

    await request(app.getHttpServer())
      .post(`/reservations/${id}/cancel`)
      .set(auth(guestToken))
      .expect(200);

    const jobs = await refundQueue.getJobs(['waiting', 'delayed', 'active']);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data).toMatchObject({
      type: REFUND_REQUESTED,
      reservationId: id,
      idempotencyKey: id, // the key the charge settled under
    });
  });

  it('cancelling an unpaid hold queues no refund', async () => {
    const id = await hold(await freshListing());

    await request(app.getHttpServer())
      .post(`/reservations/${id}/cancel`)
      .set(auth(guestToken))
      .expect(200);

    // Nothing was ever charged, so there is nothing to give back.
    expect(await refundQueue.getJobs(['waiting', 'delayed', 'active'])).toEqual(
      [],
    );
  });

  it('settlement cannot revive a hold the sweep already expired', async () => {
    const id = await hold(await freshListing());
    await prisma.reservation.update({
      where: { id },
      data: { status: ReservationStatus.EXPIRED },
    });

    expect(await booking.applyPaymentSucceeded(id)).toEqual({
      outcome: 'refund-required',
      status: ReservationStatus.EXPIRED,
    });
    const after = await prisma.reservation.findUnique({ where: { id } });
    expect(after!.status).toBe(ReservationStatus.EXPIRED);
  });
});

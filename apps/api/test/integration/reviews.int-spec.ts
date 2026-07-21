import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, Role } from '@no-overlap/db';
import { PrismaPg } from '@prisma/adapter-pg';
import { BookingService } from '../../src/booking/booking.service';
import { ReservationCompletionService } from '../../src/booking/reservation-completion.service';
import { createTestApp, registerAndLogin } from './helpers';

const DAY = 86_400_000;

/**
 * The review eligibility guard over HTTP against real Postgres.
 *
 * The rule being proven is "only the guest whose stay has ended, exactly once" — and equally that its
 * three failures are distinguishable in the right way: someone else's reservation must look missing,
 * not forbidden, while the two legitimate-but-refused cases are conflicts.
 */
describe('Reviews — eligibility (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let booking: BookingService;
  let completion: ReservationCompletionService;
  let hostToken: string;
  let guestToken: string;
  let otherGuestToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });
    booking = app.get(BookingService, { strict: false });
    completion = app.get(ReservationCompletionService, { strict: false });
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
    const base = 900 + seq++ * 10; // distinct windows so nothing collides
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
        title: 'R',
        city: 'Lisbon',
        nightlyPriceCents: 7500,
        maxGuests: 2,
      })
      .expect(201);
    return res.body.id as string;
  };

  /** A reservation the guest holds but has not paid for, on a listing of its own unless one is given. */
  const heldStay = async (onListing?: string): Promise<string> => {
    const listingId = onListing ?? (await freshListing());
    const res = await request(app.getHttpServer())
      .post('/reservations')
      .set(auth(guestToken))
      .send({ listingId, ...futureRange() })
      .expect(201);
    return res.body.id as string;
  };

  let pastSeq = 0;
  /** A stay the guest paid for, whose dates have passed and which the sweep has completed. */
  const completedStay = async (onListing?: string): Promise<string> => {
    const id = await heldStay(onListing);
    await booking.applyPaymentSucceeded(id);
    // A distinct past window per stay: while the row is still CONFIRMED it counts as active, so two
    // backdated to the same range on one listing would collide with the exclusion constraint.
    const start = 6 + pastSeq++ * 5;
    await prisma.reservation.update({
      where: { id },
      data: {
        checkIn: new Date(Date.now() - start * DAY),
        checkOut: new Date(Date.now() - (start - 3) * DAY),
      },
    });
    await completion.sweepCompletedStays();
    return id;
  };

  const review = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/reviews').set(auth(token)).send(body);

  it('the guest who took a completed stay can review it', async () => {
    const reservationId = await completedStay();

    const res = await review(guestToken, {
      reservationId,
      rating: 5,
      body: 'Exactly as described.',
    }).expect(201);

    expect(res.body).toMatchObject({
      reservationId,
      rating: 5,
      body: 'Exactly as described.',
    });
    expect(res.body.id).toEqual(expect.any(String));
  });

  it('refuses a second review of the same stay', async () => {
    const reservationId = await completedStay();
    await review(guestToken, { reservationId, rating: 4 }).expect(201);

    // Settled by the unique index rather than a prior existence check, so two concurrent submissions
    // cannot both pass and both insert.
    const res = await review(guestToken, { reservationId, rating: 1 }).expect(
      409,
    );
    expect(res.body.type).toContain('review-already-exists');

    // The refused attempt changed nothing — the first verdict stands.
    const stored = await prisma.review.findUnique({
      where: { reservationId },
    });
    expect(stored?.rating).toBe(4);
  });

  it('refuses a stay that has not finished', async () => {
    const reservationId = await heldStay();

    const res = await review(guestToken, { reservationId, rating: 5 }).expect(
      409,
    );
    // A conflict, not a 404: the request is well-formed and merely premature — it can succeed later.
    expect(res.body.type).toContain('review-stay-not-finished');
  });

  it('another guest’s reservation is indistinguishable from one that does not exist', async () => {
    const reservationId = await completedStay();

    // Both answers must be the same 404, or the difference between them tells an attacker which
    // reservation ids are real.
    const notMine = await review(otherGuestToken, {
      reservationId,
      rating: 5,
    }).expect(404);
    const notReal = await review(otherGuestToken, {
      reservationId: '00000000-0000-4000-8000-000000000000',
      rating: 5,
    }).expect(404);
    expect(notMine.body.type).toEqual(notReal.body.type);

    // The rejection left nothing behind, so the real guest can still review.
    await review(guestToken, { reservationId, rating: 3 }).expect(201);
  });

  it('rejects a rating outside 1–5 before any of that is considered', async () => {
    const reservationId = await completedStay();
    await review(guestToken, { reservationId, rating: 6 }).expect(400);
    await review(guestToken, { reservationId, rating: 0 }).expect(400);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/reviews')
      .send({
        reservationId: '00000000-0000-4000-8000-000000000000',
        rating: 5,
      })
      .expect(401);
  });

  describe('read side', () => {
    const readReviews = (listingId: string) =>
      request(app.getHttpServer()).get(`/listings/${listingId}/reviews`);

    it('reports a listing with no reviews as null, not zero', async () => {
      const listingId = await freshListing();

      const res = await readReviews(listingId).expect(200);
      // Zero is a rating a listing can actually earn. Reporting it for "nobody has said anything yet"
      // would state something untrue, and would rank an unreviewed listing below a badly-reviewed one.
      expect(res.body).toEqual({
        averageRating: null,
        count: 0,
        reviews: [],
      });
    });

    it('returns a listing’s reviews with their average', async () => {
      const listingId = await freshListing();
      const first = await completedStay(listingId);
      const second = await completedStay(listingId);

      await review(guestToken, { reservationId: first, rating: 5 }).expect(201);
      await review(guestToken, {
        reservationId: second,
        rating: 2,
        body: 'Noisy street.',
      }).expect(201);

      const res = await readReviews(listingId).expect(200);
      expect(res.body.count).toBe(2);
      expect(res.body.averageRating).toBeCloseTo(3.5);
      expect(res.body.reviews).toHaveLength(2);
      expect(
        res.body.reviews.map((r: { rating: number }) => r.rating).sort(),
      ).toEqual([2, 5]);
    });

    it('does not mix in another listing’s reviews', async () => {
      const [mine, other] = [await freshListing(), await freshListing()];
      await review(guestToken, {
        reservationId: await completedStay(mine),
        rating: 5,
      }).expect(201);
      await review(guestToken, {
        reservationId: await completedStay(other),
        rating: 1,
      }).expect(201);

      const res = await readReviews(mine).expect(200);
      expect(res.body.count).toBe(1);
      expect(res.body.averageRating).toBe(5);
      expect(res.body.reviews[0].listingId).toBe(mine);
    });

    it('is readable without signing in', async () => {
      const listingId = await freshListing();
      await review(guestToken, {
        reservationId: await completedStay(listingId),
        rating: 4,
      }).expect(201);

      // No Authorization header: reviews are what a guest reads while deciding whether to book, so
      // hiding them behind an account would withhold the thing that helps most before sign-up.
      const res = await readReviews(listingId).expect(200);
      expect(res.body.averageRating).toBe(4);
    });
  });
});

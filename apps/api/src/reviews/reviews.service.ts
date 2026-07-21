import { Injectable } from '@nestjs/common';
import { Prisma, ReservationStatus } from '@no-overlap/db';
import { AppException } from 'src/common/errors/app.exception';
import { BookingService } from 'src/booking/booking.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListingReviewsDto } from './dto/listing-reviews.dto';
import { ReviewResponseDto } from './dto/review-response.dto';

/** Postgres unique-violation code surfaced by Prisma; here it means the stay is already reviewed. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

// The only columns allowed out of the API. An allow-list, so a new internal column cannot leak by
// default.
const REVIEW_SELECT = {
  id: true,
  reservationId: true,
  listingId: true,
  rating: true,
  body: true,
  createdAt: true,
} satisfies Prisma.ReviewSelect;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly booking: BookingService,
  ) {}

  /**
   * Records a guest's review of a stay they took.
   *
   * Three things can make this illegitimate, and they get three different answers on purpose. A
   * reservation that is not the caller's is reported as missing rather than forbidden, so reservation
   * ids cannot be probed for existence — someone else's booking and a booking that never existed are
   * indistinguishable from outside. A stay that has not finished is a conflict, because the request is
   * well-formed and merely premature; it can succeed later. A stay already reviewed is likewise a
   * conflict, and one that will never succeed.
   *
   * Whether the reservation is the caller's is Booking's knowledge, so it is asked for through that
   * module's service rather than by querying its tables — which also means the 404 semantics are
   * defined in exactly one place instead of being re-derived here.
   *
   * The already-reviewed case is settled by the `reviews.reservation_id` unique index, not by looking
   * first. Two concurrent submissions would both pass a prior existence check and both insert; letting
   * the database arbitrate makes the second a violation to translate rather than a race to lose. Same
   * pattern as registration against the unique email, and as the exclusion constraint against
   * overlapping stays.
   *
   * @throws AppException `NOT_FOUND` when the reservation is not this guest's, or does not exist.
   * @throws AppException `REVIEW_STAY_NOT_FINISHED` when the stay has not yet completed.
   * @throws AppException `REVIEW_ALREADY_EXISTS` when this reservation was already reviewed.
   */
  async create(
    guestId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    const reservation = await this.booking.getOwned(guestId, dto.reservationId);

    // One status check, and only because the completion sweep exists to make COMPLETED reachable.
    // Comparing check-out against the clock here instead would put that arithmetic in every caller
    // that needs to know whether a stay is over.
    if (reservation.status !== ReservationStatus.COMPLETED) {
      throw new AppException(
        'REVIEW_STAY_NOT_FINISHED',
        'A stay can be reviewed only once it has ended.',
      );
    }

    try {
      return await this.prisma.review.create({
        data: {
          reservationId: dto.reservationId,
          // Taken from the reservation just authorised, never from the request. A client-supplied
          // listing id would let a guest attach a genuine review to a property they never stayed at.
          listingId: reservation.listingId,
          rating: dto.rating,
          body: dto.body,
        },
        select: REVIEW_SELECT,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === PRISMA_UNIQUE_VIOLATION
      ) {
        throw new AppException('REVIEW_ALREADY_EXISTS');
      }
      throw err; // unexpected: generic 500
    }
  }

  /**
   * A listing's reviews, newest first, with the summary a rating display needs.
   *
   * Both queries filter on the review's own `listingId` rather than joining through reservations,
   * which is what keeps this read inside the module that owns it.
   *
   * The average is computed on read. That is the right default at this size — it is a single indexed
   * aggregate, and a stored average is a second copy of the truth that every write has to remember to
   * update. If review volume ever makes this the expensive part of rendering a listing, the answer is
   * a maintained column updated in the same transaction as the insert, not a cache that can drift.
   *
   * @returns `averageRating: null` for a listing nobody has reviewed — see {@link ListingReviewsDto}
   * for why that is not zero.
   */
  async forListing(listingId: string): Promise<ListingReviewsDto> {
    const [reviews, summary] = await Promise.all([
      this.prisma.review.findMany({
        where: { listingId },
        orderBy: { createdAt: 'desc' },
        select: REVIEW_SELECT,
      }),
      this.prisma.review.aggregate({
        where: { listingId },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    return {
      // Prisma already returns null for the average of an empty set, which is the honest answer.
      averageRating: summary._avg.rating,
      count: summary._count,
      reviews,
    };
  }
}

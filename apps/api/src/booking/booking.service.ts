import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ms from 'ms';
import { AppException } from 'src/common/errors/app.exception';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationResponseDto } from './dto/reservation-response.dto';
import { isExclusionViolation } from './exclusion-violation';
import { Prisma, ReservationStatus } from '@no-overlap/db';

const MS_PER_DAY = 86_400_000; // one day (24 × 60 × 60 × 1000)

// The only columns allowed out of the API. An allow-list (not a deny-list / `omit`) so a new
// internal column can't leak by default. `version` is deliberately absent: it is internal
// bookkeeping, not part of the API contract.
const RESERVATION_SELECT = {
  id: true,
  listingId: true,
  guestId: true,
  checkIn: true,
  checkOut: true,
  status: true,
  priceTotalCents: true,
  holdExpiresAt: true,
  createdAt: true,
} satisfies Prisma.ReservationSelect;

// The reservation lifecycle expressed as data: the ONLY legal moves. Every status change goes through
// this one map, so "which transitions are allowed" has a single home instead of scattered checks.
const ALLOWED_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  [ReservationStatus.HELD]: [
    ReservationStatus.CONFIRMED,
    ReservationStatus.CANCELLED,
    ReservationStatus.EXPIRED,
  ],
  [ReservationStatus.CONFIRMED]: [
    ReservationStatus.CANCELLED,
    ReservationStatus.COMPLETED,
  ],
  [ReservationStatus.EXPIRED]: [],
  [ReservationStatus.CANCELLED]: [],
  [ReservationStatus.COMPLETED]: [],
};

/** The single gate for every status change: throws if `from -> to` is not a legal move. */
function assertTransition(
  from: ReservationStatus,
  to: ReservationStatus,
): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new AppException(
      'INVALID_STATE_TRANSITION',
      `Cannot move a ${from} reservation to ${to}.`,
    );
  }
}

@Injectable()
export class BookingService {
  private readonly holdTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    // Parse the human-friendly HOLD_TTL (e.g. "15m") once at startup; getOrThrow fails fast if unset.
    this.holdTtlMs = ms(
      config.getOrThrow<string>('HOLD_TTL') as ms.StringValue,
    );
  }

  /**
   * Places a HELD reservation. Concurrency-safe by construction: the insert relies on the
   * `no_overlapping_active_reservations` exclusion constraint to reject overlaps at the
   * database level — exactly one of N racing callers commits; the rest surface as SLOT_TAKEN. There
   * is deliberately NO pre-SELECT to "check availability": that would reopen the TOCTOU race.
   */
  async hold(
    guestId: string,
    dto: CreateReservationDto,
  ): Promise<ReservationResponseDto> {
    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);

    const now = new Date();

    // Reject a backwards or zero-length range: check-out must come strictly after check-in.
    if (checkOut <= checkIn) {
      throw new AppException(
        'VALIDATION_FAILED',
        'checkOut must be after checkIn.',
      );
    }

    // Reject a hold that starts in the past
    if (checkIn < now) {
      throw new AppException(
        'VALIDATION_FAILED',
        'checkIn must be in the future.',
      );
    }

    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
    });
    // Inactive or missing both surface as 404 — an unbookable listing shouldn't reveal that it exists.
    if (!listing || !listing.active) {
      throw new AppException('NOT_FOUND');
    }

    // Price = nights × the nightly rate. "Nights" is the count of calendar days between the check-in
    // and check-out dates — the time-of-day on the timestamps drives the overlap range, not pricing.
    // UTC date parts keep the count stable regardless of the server's timezone.
    const nights = Math.round(
      (Date.UTC(
        checkOut.getUTCFullYear(),
        checkOut.getUTCMonth(),
        checkOut.getUTCDate(),
      ) -
        Date.UTC(
          checkIn.getUTCFullYear(),
          checkIn.getUTCMonth(),
          checkIn.getUTCDate(),
        )) /
        MS_PER_DAY,
    );
    const priceTotalCents = nights * listing.nightlyPriceCents;

    try {
      return await this.prisma.reservation.create({
        select: RESERVATION_SELECT,
        data: {
          listingId: dto.listingId,
          guestId,
          checkIn,
          checkOut,
          priceTotalCents,
          holdExpiresAt: new Date(Date.now() + this.holdTtlMs),
        },
      });
    } catch (err) {
      if (isExclusionViolation(err))
        throw new AppException('RESERVATION_SLOT_TAKEN');
      throw err;
    }
  }

  /** Every reservation the guest owns, newest first — their "my trips" view. */
  listOwnedBy(guestId: string): Promise<ReservationResponseDto[]> {
    return this.prisma.reservation.findMany({
      where: { guestId },
      orderBy: { createdAt: 'desc' },
      select: RESERVATION_SELECT,
    });
  }

  /**
   * A single reservation owned by the guest.
   *
   * @throws AppException `NOT_FOUND` when no reservation with that id belongs to this guest.
   * @remarks Scoping the lookup by `guestId` makes another guest's id indistinguishable from a
   * missing one — deliberately a 404, never a 403, so ids can't be probed for existence.
   */
  async getOwned(guestId: string, id: string): Promise<ReservationResponseDto> {
    const r = await this.prisma.reservation.findFirst({
      where: { id, guestId },
      select: RESERVATION_SELECT,
    });
    if (!r) throw new AppException('NOT_FOUND');
    return r;
  }

  /**
   * Confirms a held reservation after (stubbed) payment succeeds. Idempotent: re-confirming an
   * already-CONFIRMED reservation is a no-op returning the same state.
   */
  async confirm(guestId: string, id: string): Promise<ReservationResponseDto> {
    const current = await this.getOwned(guestId, id);
    if (current.status === ReservationStatus.CONFIRMED) {
      return current; // idempotent no-op
    }
    assertTransition(current.status, ReservationStatus.CONFIRMED); // HELD -> CONFIRMED; else 409

    await this.chargeStub(current);

    // Atomic transition: only flip a row that is STILL held. updateMany filters on status inside the
    // same statement the DB runs, so a hold that expired (or was cancelled) between the read above and
    // this write cannot be revived — the check and the act are one operation, not two.
    const { count } = await this.prisma.reservation.updateMany({
      where: { id, status: ReservationStatus.HELD },
      data: { status: ReservationStatus.CONFIRMED },
    });

    if (count === 0) {
      // We lost the race. Re-read the truth and react to it.
      const latest = await this.getOwned(guestId, id);
      if (latest.status === ReservationStatus.CONFIRMED) {
        return latest; // a concurrent confirm won
      }
      assertTransition(latest.status, ReservationStatus.CONFIRMED); // EXPIRED/CANCELLED -> 409
    }

    return this.getOwned(guestId, id);
  }

  /**
   * Cancels a reservation (the compensation step). The freed slot is immediately re-bookable because
   * the exclusion constraint ignores CANCELLED rows. Idempotent.
   */
  async cancel(guestId: string, id: string): Promise<ReservationResponseDto> {
    const current = await this.getOwned(guestId, id);
    if (current.status === ReservationStatus.CANCELLED) {
      return current; // idempotent no-op
    }
    assertTransition(current.status, ReservationStatus.CANCELLED); // HELD/CONFIRMED -> CANCELLED; else 409

    return this.prisma.reservation.update({
      where: { id },
      data: { status: ReservationStatus.CANCELLED },
      select: RESERVATION_SELECT,
    });
  }

  /**
   * Placeholder for the payment charge.
   */
  private async chargeStub(
    _reservation: ReservationResponseDto,
  ): Promise<void> {
    // no-op success for now
  }
}

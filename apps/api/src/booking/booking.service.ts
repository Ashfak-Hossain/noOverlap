import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ms from 'ms';
import { AppException } from 'src/common/errors/app.exception';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationResponseDto } from './dto/reservation-response.dto';
import { isExclusionViolation } from './exclusion-violation';
import { Prisma, ReservationStatus } from '@no-overlap/db';
import { BOOKING_HELD, type BookingHeld } from '@no-overlap/contracts';
import { InjectQueue } from '@nestjs/bullmq';
import {
  REFUND_QUEUE,
  REFUND_REQUESTED,
  type RefundRequested,
} from '@no-overlap/contracts';
import { Queue } from 'bullmq';

/**
 * What applying a payment result did to the reservation. Reported rather than thrown, because a
 * result for an already-settled booking is ordinary under at-least-once delivery, not a fault.
 */
export type SettlementOutcome =
  | { outcome: 'applied' }
  | { outcome: 'already-settled' }
  | { outcome: 'missing' }
  | { outcome: 'refund-required'; status: ReservationStatus };

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
    @InjectQueue(REFUND_QUEUE) private readonly refundQueue: Queue,
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
      return await this.prisma.$transaction(async (tx) => {
        const reservation = await tx.reservation.create({
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

        const event = {
          type: BOOKING_HELD,
          version: 1,
          reservationId: reservation.id,
          amountCents: reservation.priceTotalCents,
          idempotencyKey: reservation.id,
        } satisfies BookingHeld;

        await tx.outbox.create({
          data: {
            aggregateId: reservation.id,
            type: BOOKING_HELD,
            payload: event,
          },
        });

        return reservation;
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
   * Cancels a reservation (the compensation step). The freed slot is immediately re-bookable because
   * the exclusion constraint ignores CANCELLED rows. Idempotent.
   */
  async cancel(guestId: string, id: string): Promise<ReservationResponseDto> {
    const current = await this.getOwned(guestId, id);
    if (current.status === ReservationStatus.CANCELLED) {
      return current; // idempotent no-op
    }
    assertTransition(current.status, ReservationStatus.CANCELLED);

    // A confirmed reservation was paid, so releasing it must give the money back. The idempotency key
    // is the reservation id — the same key the charge settled under.
    const wasPaid = current.status === ReservationStatus.CONFIRMED;

    const cancelled = await this.prisma.reservation.update({
      where: { id },
      data: { status: ReservationStatus.CANCELLED },
      select: RESERVATION_SELECT,
    });

    if (wasPaid) {
      await this.refundQueue.add(
        REFUND_REQUESTED,
        {
          type: REFUND_REQUESTED,
          version: 1,
          reservationId: id,
          idempotencyKey: id,
        } satisfies RefundRequested,
        { jobId: `${REFUND_REQUESTED}-${id}` },
      );
    }

    return cancelled;
  }

  /**
   * Applies a successful charge: HELD -> CONFIRMED.
   *
   * Idempotent by construction. The conditional update only touches a row that is still HELD, so a
   * redelivered result cannot re-confirm, and a hold that expired between the charge and this message
   * cannot be revived.
   *
   * @returns `refund-required` when the charge succeeded but the hold is already gone — money moved
   * with no booking to show for it, which the caller must compensate.
   */
  async applyPaymentSucceeded(
    reservationId: string,
  ): Promise<SettlementOutcome> {
    const { count } = await this.prisma.reservation.updateMany({
      where: { id: reservationId, status: ReservationStatus.HELD },
      data: { status: ReservationStatus.CONFIRMED },
    });
    if (count === 1) {
      return { outcome: 'applied' };
    }

    const current = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { status: true },
    });
    if (!current) {
      return { outcome: 'missing' };
    }
    if (current.status === ReservationStatus.CONFIRMED) {
      return { outcome: 'already-settled' };
    }
    // EXPIRED or CANCELLED: the slot is gone but the card was charged.
    return { outcome: 'refund-required', status: current.status };
  }

  /**
   * Applies a declined charge: HELD -> CANCELLED, which releases the slot immediately because the
   * exclusion constraint ignores cancelled rows. This is the saga's compensation step.
   *
   * Idempotent: a redelivered failure finds the reservation already settled and does nothing.
   */
  async applyPaymentFailed(reservationId: string): Promise<SettlementOutcome> {
    const { count } = await this.prisma.reservation.updateMany({
      where: {
        id: reservationId,
        status: ReservationStatus.HELD,
      },
      data: { status: ReservationStatus.CANCELLED },
    });
    if (count === 1) {
      return { outcome: 'applied' };
    }

    const current = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { status: true },
    });
    return current ? { outcome: 'already-settled' } : { outcome: 'missing' };
  }
}

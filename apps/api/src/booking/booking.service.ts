import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ms from 'ms';
import { AppException } from 'src/common/errors/app.exception';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationResponseDto } from './dto/reservation-response.dto';
import { isExclusionViolation } from './exclusion-violation';

const MS_PER_DAY = 86_400_000; // one day (24 × 60 × 60 × 1000)

@Injectable()
export class BookingService {
  private readonly holdTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    // Parse the HOLD_TTL ("15m") once at startup;
    this.holdTtlMs = ms(
      config.getOrThrow<string>('HOLD_TTL') as ms.StringValue,
    );
  }

  /**
   * Places a HELD reservation. Concurrency-safe by construction: the insert relies on the
   * `no_overlapping_active_reservations` exclusion constraint (ADR-0003) to reject overlaps at the
   * database level — exactly one of N racing callers commits; the rest surface as SLOT_TAKEN. There
   * is deliberately NO pre-SELECT to "check availability": that would reopen the TOCTOU race.
   */
  async hold(
    guestId: string,
    dto: CreateReservationDto,
  ): Promise<ReservationResponseDto> {
    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);

    if (checkOut > checkIn) {
      throw new AppException('VALIDATION_FAILED');
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
    });
    if (!r) throw new AppException('NOT_FOUND');
    return r;
  }
}

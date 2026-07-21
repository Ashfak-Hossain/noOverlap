import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ReservationStatus } from '@no-overlap/db';
import { PrismaService } from 'src/prisma/prisma.service';
import { RealtimeGateway } from 'src/realtime/realtime.gateway';

/**
 * Background sweep that finishes stays. A CONFIRMED reservation whose check-out has passed becomes
 * COMPLETED.
 *
 * Without this, COMPLETED is dead state: it is a legal transition target that nothing ever reaches,
 * so a stay stays CONFIRMED forever. Everything downstream that means "the stay is over" — review
 * eligibility above all — would otherwise have to re-derive it from dates on every read, and each
 * place doing that arithmetic is a place it can be done differently. Sweeping once means the rule
 * lives in one query and every reader gets to ask a status question instead.
 *
 * Distinct from the expiry sweep, which reclaims holds nobody paid for. This one retires bookings that
 * were honoured.
 */
@Injectable()
export class ReservationCompletionService {
  private readonly logger = new Logger(ReservationCompletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Complete every confirmed stay whose check-out has passed. A single set-based UPDATE, so it is
   * atomic and idempotent: a second run matches nothing, because the first run's rows are no longer
   * CONFIRMED. Two instances sweeping at once is equally safe — the status filter is the guard, so the
   * loser of any race simply updates zero rows.
   *
   * @returns the number of stays completed (used by tests; the scheduler ignores it).
   * @remarks The `@Interval` schedule is kept separate from this logic so a test can drive the sweep
   * directly instead of waiting on the clock.
   */
  @Interval(300_000) // every 5 minutes: the cadence only bounds how soon a finished stay is reviewable
  async sweepCompletedStays(): Promise<number> {
    // Read the candidates first, only so their listings can be notified afterwards. The update below
    // still filters on status itself, so this read grants it no authority and reopens no race.
    const candidates = await this.prisma.reservation.findMany({
      where: {
        status: ReservationStatus.CONFIRMED,
        checkOut: { lt: new Date() },
      },
      select: { id: true, listingId: true },
    });

    const { count } = await this.prisma.reservation.updateMany({
      where: {
        status: ReservationStatus.CONFIRMED,
        checkOut: { lt: new Date() },
      },
      data: { status: ReservationStatus.COMPLETED },
    });
    if (count > 0) {
      this.logger.log(`Completed ${count} finished stay(s).`);
    }

    // Announced for every candidate rather than only the rows this instance won. If another instance
    // completed one first, the extra notification is harmless — it prompts a re-read of data that is
    // already correct.
    for (const reservation of candidates) {
      await this.realtime.publishReservationChanged(
        reservation.listingId,
        reservation.id,
        ReservationStatus.COMPLETED,
      );
    }

    return count;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ReservationStatus } from '@no-overlap/db';
import { PrismaService } from 'src/prisma/prisma.service';
import { RealtimeGateway } from 'src/realtime/realtime.gateway';

/**
 * Background sweep that reclaims abandoned holds. A HELD reservation past its `hold_expires_at`
 * transitions to EXPIRED, which drops it from the exclusion constraint's active set and frees the
 * slot — no client action required.
 */
@Injectable()
export class ReservationExpiryService {
  private readonly logger = new Logger(ReservationExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Expire every hold whose TTL has passed. A single set-based UPDATE, so it is atomic and idempotent:
   * safe to run repeatedly and safe against a second instance running it concurrently.
   *
   * @returns the number of holds expired (used by tests; the scheduler ignores it).
   * @remarks The `@Interval` schedule is separate from this logic on purpose, so a test can drive the
   * sweep directly instead of waiting on the clock.
   */
  @Interval(30_000) // sweep cadence; tunable
  async sweepExpiredHolds(): Promise<number> {
    // Read the candidates first, only so their listings can be notified afterwards — the update below
    // still filters on status itself, so this read grants it no authority and reopens no race.
    const candidates = await this.prisma.reservation.findMany({
      where: {
        status: ReservationStatus.HELD,
        holdExpiresAt: { lt: new Date() },
      },
      select: { id: true, listingId: true },
    });

    const { count } = await this.prisma.reservation.updateMany({
      where: {
        status: ReservationStatus.HELD,
        holdExpiresAt: { lt: new Date() },
      },
      data: { status: ReservationStatus.EXPIRED },
    });
    if (count > 0) {
      this.logger.log(`Expired ${count} stale hold(s).`);
    }

    // Announced for every candidate rather than only the rows this instance won. If another instance
    // expired one first, the extra notification is harmless — it prompts a re-read of data that is
    // already correct, and under-notifying would leave a freed slot looking taken.
    for (const reservation of candidates) {
      await this.realtime.publishReservationChanged(
        reservation.listingId,
        reservation.id,
        ReservationStatus.EXPIRED,
      );
    }

    return count;
  }
}

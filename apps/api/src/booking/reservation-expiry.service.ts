import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ReservationStatus } from '@no-overlap/db';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Background sweep that reclaims abandoned holds. A HELD reservation past its `hold_expires_at`
 * transitions to EXPIRED, which drops it from the exclusion constraint's active set and frees the
 * slot — no client action required.
 */
@Injectable()
export class ReservationExpiryService {
  private readonly logger = new Logger(ReservationExpiryService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    return count;
  }
}

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CHARGE_QUEUE } from '@no-overlap/contracts';
import { Queue } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';

// The interval is the publish-latency floor; the batch bounds how much one pass locks at once.
const RELAY_INTERVAL_MS = 2_000;
const RELAY_BATCH_SIZE = 100;

// Shape of the raw SELECT. Columns come back snake_case — raw SQL, not Prisma's camelCase mapping.
interface UnpublishedOutboxRow {
  id: string;
  type: string;
  payload: unknown;
}

/**
 * Moves committed domain events out of the `outbox` table and onto the charge queue.
 *
 * The outbox exists to close the dual-write gap. A reservation lives in Postgres and a charge job
 * lives in Redis, and there is no transaction spanning both: publishing inside the booking
 * transaction risks charging a card for a hold that then rolls back, while publishing after it risks
 * a hold that is never charged. So the event is written to `outbox` in the *same* transaction as the
 * reservation — one atomic commit — and this relay forwards it afterwards. The event is published if
 * and only if the booking committed.
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CHARGE_QUEUE) private readonly chargeQueue: Queue,
  ) {}

  /** Scheduled trigger. Kept thin so the work below can be driven directly from a test. */
  @Interval(RELAY_INTERVAL_MS)
  async relayTick(): Promise<void> {
    try {
      await this.publishBatch();
    } catch (err) {
      // A failed pass leaves the rows unpublished; the next tick retries them. Never kill the timer.
      this.logger.error('Outbox relay pass failed', err as Error);
    }
  }

  /**
   * Claims one batch of unpublished outbox rows and publishes each to the charge queue.
   *
   * Correctness rests on two things:
   * - FOR UPDATE SKIP LOCKED: concurrent relays (or overlapping ticks) claim disjoint rows, so no
   *   row publishes twice at once and no relay blocks on another's batch.
   * - At-least-once, not exactly-once: if the process dies after publishing but before the rows are
   *   marked, they stay unpublished and re-publish next pass. Safe because the charge is idempotent
   *   downstream (the payment idempotency key), so a redelivery cannot double-charge.
   *
   * @returns the number of rows published this pass.
   */
  async publishBatch(): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      // Prisma can't express SKIP LOCKED, so the claim is raw SQL.
      const rows = await tx.$queryRaw<UnpublishedOutboxRow[]>`
        SELECT id, type, payload
        FROM outbox
        WHERE published_at IS NULL
        ORDER BY created_at
        LIMIT ${RELAY_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;

      if (rows.length === 0) return 0;

      // Publish first, mark second: a crash between them re-publishes (at-least-once), never drops.
      // addBulk is one round-trip, so the row locks are held only briefly. jobId = the outbox row id
      // gives BullMQ a best-effort dedupe on immediate redelivery; the real guarantee is downstream.
      await this.chargeQueue.addBulk(
        rows.map((row) => ({
          name: row.type,
          data: row.payload,
          opts: { jobId: row.id },
        })),
      );

      await tx.outbox.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { publishedAt: new Date() },
      });

      return rows.length;
    });
  }
}

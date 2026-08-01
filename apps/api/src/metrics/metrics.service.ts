import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { Counter, Gauge, Registry } from 'prom-client';
import {
  CHARGE_DLQ,
  CHARGE_QUEUE,
  REFUND_QUEUE,
  RESULT_QUEUE,
} from '@no-overlap/contracts';
import { PrismaService } from 'src/prisma/prisma.service';
import { REDIS_CLIENT } from 'src/redis/redis.provider';

/** The queues worth watching, in the order a booking travels through them. */
const WATCHED_QUEUES = [
  CHARGE_QUEUE,
  RESULT_QUEUE,
  REFUND_QUEUE,
  CHARGE_DLQ,
] as const;

/**
 * What the system can say about itself right now.
 *
 * Every metric here exists because something went wrong once and nothing exposed it. They answer
 * questions about the present moment — how deep is the backlog, is anything consuming, how often is
 * this firing — which is the kind of question logs answer badly, because reconstructing a current
 * value by reading history is the work metrics exist to remove.
 *
 * Values that live in Postgres or Redis are read when the endpoint is scraped rather than on a timer,
 * so an endpoint nobody calls costs nothing. The trade is that a scrape does real work; at any rate
 * anything would realistically poll this, that is cheaper than a timer running regardless.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  /**
   * Booking outcomes, by what the guest was told.
   *
   * The conflict share is contention made visible: it separates a quiet system from one where
   * everybody wants the same weekend, and no other signal distinguishes those.
   */
  private readonly attempts = new Counter({
    name: 'booking_attempts_total',
    help: 'Booking attempts by outcome',
    labelNames: ['outcome'] as const,
    registers: [this.registry],
  });

  /**
   * Holds retried after Postgres aborted them to break a deadlock.
   *
   * The one metric here that measures something otherwise unobservable. A retry that succeeds logs
   * nothing, so without this counter the retry working and the condition never arising look
   * identical from outside — and they call for very different responses.
   */
  private readonly deadlockRetries = new Counter({
    name: 'booking_deadlock_retries_total',
    help: 'Holds retried after a deadlock aborted the first attempt',
    registers: [this.registry],
  });

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    // The collect callbacks below are invoked by the registry with the gauge bound as `this`, so they
    // cannot be arrow functions — and therefore cannot reach the service's own `this`. These carry
    // the dependencies in instead.
    const prismaRef = this.prisma;
    const redisRef = this.redis;

    /**
     * Events written but not yet published.
     *
     * The seam's vital sign, and the reason this endpoint exists. Under load this climbed to eight
     * thousand while the booking endpoint posted its best latency of the run, because the relay
     * drains at a fixed rate and the endpoint does not care. A rising value here is the only warning
     * that confirmations are falling behind.
     */
    new Gauge({
      name: 'outbox_unpublished_rows',
      help: 'Domain events committed but not yet published to the queue',
      registers: [this.registry],
      collect: async function () {
        const rows = await prismaRef.outbox.count({
          where: { publishedAt: null },
        });
        this.set(rows);
      },
    });

    /**
     * Jobs waiting in each queue.
     *
     * Distinguishes "nothing is happening" from "nothing is consuming" — the two look identical in
     * logs, and a worker that had died once was found only by inspecting Redis by hand. A depth that
     * climbs and never falls means the consumer is gone.
     */
    new Gauge({
      name: 'queue_depth',
      help: 'Jobs waiting in a queue',
      labelNames: ['queue'] as const,
      registers: [this.registry],
      collect: async function () {
        for (const queue of WATCHED_QUEUES) {
          // BullMQ keeps waiting jobs in a list keyed by queue name. Read directly rather than
          // through a Queue instance so that observing a queue never joins it.
          const depth = await redisRef.llen(`bull:${queue}:wait`);
          this.set({ queue }, depth);
        }
      },
    });
  }

  /**
   * Records how a booking attempt resolved.
   *
   * Only the two outcomes that describe contention. A request refused for bad input or an unknown
   * listing says nothing about how busy the system is, and counting it here would dilute the ratio
   * that makes this metric worth reading.
   */
  recordAttempt(outcome: 'held' | 'conflict'): void {
    this.attempts.inc({ outcome });
  }

  /** Records that a hold was retried because a deadlock aborted its first attempt. */
  recordDeadlockRetry(): void {
    this.deadlockRetries.inc();
  }

  /** The current values, in the text format a scraper expects. */
  scrape(): Promise<string> {
    return this.registry.metrics();
  }
}

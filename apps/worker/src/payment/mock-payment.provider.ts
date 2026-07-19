import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.provider';

/**
 * The two answers a provider can give: the charge went through, or it was terminally declined.
 *
 * Both are final. A decline is an answer, not a malfunction — no amount of retrying turns it into a
 * success — so it comes back as a value. Only a fault throws; see {@link TransientPaymentError}.
 */
export type ChargeOutcome =
  | { status: 'succeeded'; providerRef: string }
  | { status: 'declined'; reason: string };

/**
 * A transient provider fault: the charge may yet succeed, so the job is retried, never compensated.
 *
 * Thrown rather than returned, and the asymmetry with {@link ChargeOutcome} is the point. A throw is
 * the signal the queue reads as "run this job again with backoff", while returning normally marks it
 * done. Encoding the retry/compensate decision in the control flow rather than in a status string
 * means no caller can forget to check which kind of failure it is holding.
 */
export class TransientPaymentError extends Error {}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stands in for a real payment gateway.
 *
 * The two branches that decide the saga — a transient fault that must be retried and a decline that
 * must be compensated — are rare and hard to provoke on demand against a real provider, so they are
 * driven from configuration here instead. Nothing downstream knows this is a mock: swapping in a
 * real gateway means reimplementing {@link charge} and leaving the queues, the retry policy, and the
 * compensation path untouched.
 */
@Injectable()
export class MockPaymentProvider {
  private readonly logger = new Logger(MockPaymentProvider.name);

  private readonly failureRate: number;
  private readonly transientRate: number;
  private readonly latencyMs: number;

  constructor(
    config: ConfigService<Env, true>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.failureRate = config.get('PAYMENT_FAILURE_RATE', { infer: true });
    this.transientRate = config.get('PAYMENT_TRANSIENT_RATE', { infer: true });
    this.latencyMs = config.get('PAYMENT_LATENCY_MS', { infer: true });
  }

  /**
   * Charges the card for a booking.
   *
   * Failure is configuration-driven, not incidental: at a rate of 0 a branch is never taken and at 1
   * it always is, so compensation and retry are reproducible in a test rather than waited for. The
   * transient check runs before the decline check, so with both rates at 1 the fault wins.
   *
   * The idempotency key doubles as the provider's own deduplication key: a charge already settled
   * under it is replayed from the ledger instead of taken again. That ledger lives in Redis rather
   * than memory so it outlives a restart of this process, which is the entire point — the case it
   * guards is a crash between taking the money and recording that we did. `providerRef` is derived
   * from the key for the same reason: one booking always yields one reference.
   *
   * @throws TransientPaymentError on a simulated provider fault. The caller must retry, not cancel:
   * the charge may still succeed, and releasing the hold would free a slot the customer is paying for.
   */
  async charge(
    idempotencyKey: string,
    amountCents: number,
  ): Promise<ChargeOutcome> {
    const ledgerKey = `mock-provider:charge:${idempotencyKey}`;

    // Already charged under this key: hand back the original outcome, don't take the money again.
    const prior = await this.redis.get(ledgerKey);
    if (prior) {
      this.logger.log(`Replaying prior charge for key ${idempotencyKey}`);
      return JSON.parse(prior) as ChargeOutcome;
    }

    this.logger.log(`Charging ${amountCents} cents (key ${idempotencyKey})`);
    if (this.latencyMs > 0) {
      await sleep(this.latencyMs);
    }

    // A blip is NOT an outcome — nothing is recorded, so a retry genuinely re-attempts the charge.
    if (Math.random() < this.transientRate) {
      throw new TransientPaymentError(
        'Payment provider temporarily unavailable',
      );
    }

    const outcome: ChargeOutcome =
      Math.random() < this.failureRate
        ? { status: 'declined', reason: 'Card declined' }
        : { status: 'succeeded', providerRef: `mock_${idempotencyKey}` };

    // Settled from here on: this key can never be charged again.
    await this.redis.set(ledgerKey, JSON.stringify(outcome));
    return outcome;
  }
}

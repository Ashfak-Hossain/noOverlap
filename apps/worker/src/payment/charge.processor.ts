import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  CHARGE_DLQ,
  bookingHeldSchema,
  CHARGE_QUEUE,
  RESULT_QUEUE,
} from '@no-overlap/contracts';
import { Job, Queue } from 'bullmq';
import { PaymentService } from './payment.service';

/**
 * Consumes BookingHeld and charges the card — the one step that must not run inside an HTTP request
 * or a database transaction, which is precisely why it lives in its own process.
 */
@Processor(CHARGE_QUEUE)
export class ChargeProcessor extends WorkerHost {
  private readonly logger = new Logger(ChargeProcessor.name);

  constructor(
    private readonly payments: PaymentService,
    @InjectQueue(RESULT_QUEUE) private readonly results: Queue,
    @InjectQueue(CHARGE_DLQ) private readonly deadLetters: Queue,
  ) {
    super();
  }

  /**
   * Charges one held booking and publishes the outcome for the API to settle the reservation against.
   *
   * @throws TransientPaymentError to tell the queue to retry the job with backoff. Any other throw is
   * read the same way, which is why a decline — where retrying is pointless — must return instead.
   * @remarks Delivery is at-least-once, so this can run more than once for the same booking. That
   * stays safe because {@link PaymentService.charge} is keyed on the idempotency key; the deterministic
   * `jobId` below additionally stops a redelivery from enqueueing a second result.
   */
  async process(job: Job): Promise<void> {
    // The trust boundary: this payload crossed a process boundary, so it is parsed, never assumed.
    const event = bookingHeldSchema.parse(job.data);

    // Idempotent: a redelivered message replays the original outcome instead of charging again.
    // A transient fault throws out of here, so BullMQ retries rather than releasing the booking.
    const result = await this.payments.charge(event);

    await this.results.add(result.type, result, {
      jobId: `${result.type}-${event.idempotencyKey}`,
    });
    this.logger.log(`${result.type} for reservation ${event.reservationId}`);
  }

  /**
   * Quarantines a job that has exhausted its retries.
   *
   * Fires on every failed attempt, so it must distinguish the last one — otherwise a job would be
   * dead-lettered on its first blip, before the retries it is entitled to.
   *
   * The reservation is deliberately NOT cancelled here. A charge that exhausted its retries has an
   * unknown outcome: the money may or may not have moved, and cancelling could release a slot the
   * customer paid for. Leaving it HELD lets the expiry sweep reclaim the slot on its own, while this
   * queue preserves the evidence for a human — which is the entire purpose of a dead letter.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined, err: Error): Promise<void> {
    if (!job) return;

    const allowed = job.opts.attempts ?? 1;
    if (job.attemptsMade < allowed) return; // retries remain; let them run

    await this.deadLetters.add('DeadLetter', {
      originalJobId: job.id,
      queue: CHARGE_QUEUE,
      data: job.data,
      failedReason: err.message,
      attemptsMade: job.attemptsMade,
    });
    this.logger.error(
      `Dead-lettered job ${job.id} after ${job.attemptsMade} attempts: ${err.message}`,
    );
  }
}

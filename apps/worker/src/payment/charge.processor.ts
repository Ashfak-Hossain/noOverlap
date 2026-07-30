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
import {
  context,
  propagation,
  trace,
  SpanStatusCode,
} from '@opentelemetry/api';

/**
 * Consumes BookingHeld and charges the card — the one step that must not run inside an HTTP request
 * or a database transaction, which is precisely why it lives in its own process.
 */
@Processor(CHARGE_QUEUE)
export class ChargeProcessor extends WorkerHost {
  private readonly logger = new Logger(ChargeProcessor.name);
  private readonly tracer = trace.getTracer('booking.charge');

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
  async process(job: Job<unknown>): Promise<void> {
    const event = bookingHeldSchema.parse(job.data);

    // Rebuild the context the booking was made in. With no traceContext — an older message — extract
    // returns the current context and the charge just starts its own trace instead of failing.
    const parentCtx = propagation.extract(
      context.active(),
      event.traceContext ?? {},
    );

    await context.with(parentCtx, () =>
      this.tracer.startActiveSpan('charge', async (span) => {
        try {
          const result = await this.payments.charge(event);

          // Injected from inside the charge span, so the API settles under this trace rather than
          // opening a third one. The result crosses a queue exactly as the booking did, and a queue
          // carries no context of its own — the same reason the hold wrote it into the outbox event.
          const carrier: Record<string, string> = {};
          propagation.inject(context.active(), carrier);

          await this.results.add(
            result.type,
            carrier.traceparent
              ? {
                  ...result,
                  traceContext: {
                    traceparent: carrier.traceparent,
                    tracestate: carrier.tracestate,
                  },
                }
              : result,
            { jobId: `${result.type}-${event.idempotencyKey}` },
          );
          this.logger.log(
            `${result.type} for reservation ${event.reservationId}`,
          );
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw err; // BullMQ still sees the failure and retries
        } finally {
          span.end();
        }
      }),
    );
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
  async onFailed(job: Job<unknown> | undefined, err: Error): Promise<void> {
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

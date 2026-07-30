import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  PAYMENT_SUCCEEDED,
  paymentResultSchema,
  REFUND_QUEUE,
  REFUND_REQUESTED,
  RefundRequested,
  RESULT_QUEUE,
} from '@no-overlap/contracts';
import { Job, Queue } from 'bullmq';
import { BookingService } from './booking.service';
import {
  context,
  propagation,
  trace,
  SpanStatusCode,
} from '@opentelemetry/api';

/**
 * Settles reservations against the payment results the worker publishes — the return half of the
 * async seam, and the only place a charge outcome is allowed to move the state machine.
 */
@Processor(RESULT_QUEUE)
export class PaymentResultProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentResultProcessor.name);
  private readonly tracer = trace.getTracer('booking.settlement');

  constructor(
    private readonly booking: BookingService,
    @InjectQueue(REFUND_QUEUE) private readonly refunds: Queue,
  ) {
    super();
  }

  /**
   * @remarks Returns normally for a stale or duplicate result instead of throwing: under
   * at-least-once delivery that is an expected message, and throwing would retry it forever. Only a
   * genuine fault propagates, because only a fault is worth retrying.
   */
  async process(job: Job<unknown>): Promise<void> {
    const result = paymentResultSchema.parse(job.data);
    const parentCtx = propagation.extract(
      context.active(),
      result.traceContext ?? {},
    );

    await context.with(parentCtx, () =>
      this.tracer.startActiveSpan('settle', async (span) => {
        try {
          const settlement =
            result.type === PAYMENT_SUCCEEDED
              ? await this.booking.applyPaymentSucceeded(result.reservationId)
              : await this.booking.applyPaymentFailed(result.reservationId);

          if (settlement.outcome === 'refund-required') {
            this.logger.warn(
              `Reservation ${result.reservationId} is ${settlement.status} but was charged; requesting refund`,
            );
            await this.refunds.add(
              REFUND_REQUESTED,
              {
                type: REFUND_REQUESTED,
                version: 1,
                reservationId: result.reservationId,
                idempotencyKey: result.idempotencyKey,
              } satisfies RefundRequested,
              { jobId: `${REFUND_REQUESTED}-${result.reservationId}` },
            );
            return;
          }

          this.logger.log(
            `${result.type} -> ${settlement.outcome} for reservation ${result.reservationId}`,
          );
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw err;
        } finally {
          span.end();
        }
      }),
    );
  }
}

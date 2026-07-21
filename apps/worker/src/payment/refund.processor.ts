import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { refundRequestedSchema, REFUND_QUEUE } from '@no-overlap/contracts';
import { Job } from 'bullmq';
import { PaymentService } from './payment.service';

/** Consumes refund requests from the API and settles them through the payment provider. */
@Processor(REFUND_QUEUE)
export class RefundProcessor extends WorkerHost {
  private readonly logger = new Logger(RefundProcessor.name);

  constructor(private readonly payments: PaymentService) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    const event = refundRequestedSchema.parse(job.data);
    await this.payments.refund(event);
    this.logger.log(`Refund settled for reservation ${event.reservationId}`);
  }
}

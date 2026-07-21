import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { RedisModule } from '../redis/redis.module';
import { ChargeProcessor } from './charge.processor';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaymentService } from './payment.service';
import { RefundProcessor } from './refund.processor';

/**
 * Payment module — the worker's one job: charge a held booking and publish the outcome.
 *
 * Nothing is exported. The module's entire surface is the pair of queues {@link ChargeProcessor}
 * binds, so this process and the API stay coupled through the shared event contract alone, never
 * through each other's internals. That is what allows the two to be deployed, scaled, and restarted
 * independently.
 */
@Module({
  // RedisModule supplies the client the provider keeps its charge ledger in.
  imports: [QueueModule, RedisModule],
  providers: [
    MockPaymentProvider,
    PaymentService,
    ChargeProcessor,
    RefundProcessor,
  ],
})
export class PaymentModule {}

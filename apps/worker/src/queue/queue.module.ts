import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  CHARGE_DLQ,
  CHARGE_QUEUE,
  REFUND_QUEUE,
  RESULT_QUEUE,
} from '@no-overlap/contracts';
import type { Env } from '../config/env.schema';

/**
 * Queue infrastructure — the Redis-backed transport this process shares with the API.
 *
 * The worker sits on both sides of it: it consumes {@link CHARGE_QUEUE} and produces onto
 * {@link RESULT_QUEUE}. Redis, not a direct call, is what decouples the charge from the HTTP request
 * that triggered it — the API can be down or mid-deploy while a charge is in flight, and the job
 * simply waits.
 */
@Module({
  imports: [
    // An async factory because the connection details only exist once env validation has run. One
    // Redis connection is established here and shared by both queues registered below.
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: {
          host: config.get('REDIS_HOST', { infer: true }),
          port: config.get('REDIS_PORT', { infer: true }),
          password: config.get('REDIS_PASSWORD', { infer: true }),
        },
      }),
    }),
    // CHARGE_QUEUE is consumed (the @Processor binds it); RESULT_QUEUE is produced.
    BullModule.registerQueue(
      { name: CHARGE_QUEUE },
      { name: RESULT_QUEUE },
      { name: CHARGE_DLQ },
      { name: REFUND_QUEUE },
    ),
  ],
  // Re-exported so an importing module can inject a queue without registering it a second time —
  // registering twice would give that module its own instance rather than this shared one.
  exports: [BullModule],
})
export class QueueModule {}

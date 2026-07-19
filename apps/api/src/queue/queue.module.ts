import { CHARGE_QUEUE } from '@no-overlap/contracts';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Env } from 'src/config/env.schema';

/**
 * Queue infrastructure — the Redis-backed transport the API shares with the out-of-process worker.
 *
 * Registers {@link CHARGE_QUEUE} on the producer side only: this process enqueues charge jobs, the
 * worker consumes them. Registration is what makes the queue injectable with `@InjectQueue`.
 */
@Module({
  imports: [
    // An async factory because the connection details only exist once env validation has run. One
    // Redis connection is established here and shared by every queue registered below.
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: {
          host: config.get('REDIS_HOST', { infer: true }),
          port: config.get('REDIS_PORT', { infer: true }),
        },
      }),
    }),
    BullModule.registerQueue({
      name: CHARGE_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1_000,
        },
      },
    }),
  ],
  // Re-exported so an importing module can inject the queue without registering it a second time —
  // registering twice would give that module its own producer rather than this shared one.
  exports: [BullModule],
})
export class QueueModule {}

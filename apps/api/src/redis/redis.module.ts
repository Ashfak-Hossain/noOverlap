import { Global, Module } from '@nestjs/common';
import { redisProvider } from './redis.provider';
import { RedisLifecycleService } from './redis-lifecycle.service';

/**
 * The shared Redis connection.
 *
 * `@Global()` because Redis is cross-cutting here rather than owned by any one context: the health
 * check pings it, the realtime gateway keeps its per-listing sequence in it, and the queues run on
 * it. Registering it once avoids each consumer opening a connection of its own.
 */
@Global()
@Module({
  providers: [redisProvider, RedisLifecycleService],
  exports: [redisProvider],
})
export class RedisModule {}

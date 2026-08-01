import { Module } from '@nestjs/common';
import { redisProvider } from './redis.provider';
import { RedisService } from './redis.service';
import { RedisLifecycleService } from './redis-lifecycle.service';

@Module({
  providers: [redisProvider, RedisService, RedisLifecycleService],
  exports: [redisProvider],
})
export class RedisModule {}

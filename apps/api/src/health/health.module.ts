import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { redisProvider } from './redis.provider';

@Module({
  controllers: [HealthController],
  providers: [redisProvider],
})
export class HealthModule {}

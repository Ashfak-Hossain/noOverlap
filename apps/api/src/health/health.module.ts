import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { postgresProvider } from './postgres.provider';
import { redisProvider } from './redis.provider';

@Module({
  controllers: [HealthController],
  providers: [postgresProvider, redisProvider],
})
export class HealthModule {}

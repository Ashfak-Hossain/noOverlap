import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.provider';

@Injectable()
export class RedisService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationBootstrap(): Promise<void> {
    const pong = await this.redis.ping();
    this.logger.log(`Worker ready — Redis connection: ${pong}`);
  }
}

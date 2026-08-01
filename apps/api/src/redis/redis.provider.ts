import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../config/env.schema';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService<Env, true>) =>
    new Redis({
      host: configService.get('REDIS_HOST', { infer: true }),
      port: configService.get('REDIS_PORT', { infer: true }),
      password: configService.get('REDIS_PASSWORD', { infer: true }),
    }),
};

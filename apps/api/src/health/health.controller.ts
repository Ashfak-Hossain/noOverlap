import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { Pool } from 'pg';
import type Redis from 'ioredis';
import { PG_POOL } from './postgres.provider';
import { REDIS_CLIENT } from './redis.provider';

type DepStatus = 'up' | 'down';

interface HealthResponse {
  status: 'ok' | 'error';
  db: DepStatus;
  redis: DepStatus;
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PG_POOL) private readonly pgPool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const [db, redis] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
    ]);
    const result: HealthResponse = {
      status: db === 'up' && redis === 'up' ? 'ok' : 'error',
      db,
      redis,
    };

    if (result.status === 'error') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  private async checkPostgres(): Promise<DepStatus> {
    try {
      await this.pgPool.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<DepStatus> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}

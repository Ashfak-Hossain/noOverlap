import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from './redis.provider';
import { SkipThrottle } from '@nestjs/throttler';

type DepStatus = 'up' | 'down';

interface HealthResponse {
  status: 'ok' | 'error';
  db: DepStatus;
  redis: DepStatus;
}

/**
 * Liveness/readiness probe: reports whether the API and its critical dependencies (Postgres, Redis)
 * are reachable. Orchestrators and load balancers poll it and route on the HTTP status code.
 *
 * Deliberately kept OUTSIDE the RFC 7807 error envelope: its `status: 'ok' | 'error'`
 * field would collide with problem+json's numeric `status`, and a probe has its own contract. It
 * sets the status via `@Res({ passthrough: true })` rather than throwing, so the global
 * {@link ProblemDetailsFilter} never rewrites the response.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Checks dependencies in parallel; returns 200 when all are up, 503 otherwise, so a degraded
   * instance is pulled from rotation. `passthrough: true` sets the status while Nest still
   * serializes the returned body — and, crucially, without throwing (which would hit the filter).
   */
  @Get()
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthResponse> {
    const [db, redis] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
    ]);
    const result: HealthResponse = {
      status: db === 'up' && redis === 'up' ? 'ok' : 'error',
      db,
      redis,
    };
    res.status(
      result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return result;
  }

  // A real round-trip (not merely "is the pool open") so the check also fails if Postgres is up but
  // rejecting queries. Errors are swallowed to 'down': a health probe must always answer, never
  // throw the very failure it exists to report. Same pattern for Redis below.
  private async checkPostgres(): Promise<DepStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
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

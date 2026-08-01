import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.provider';

/**
 * Closes the shared Redis connection when the process is asked to stop.
 *
 * Without this the process cannot exit on its own. An open socket keeps Node's event loop alive, so a
 * container told to stop sits until its grace period expires and is then killed — taking any
 * in-flight request or job with it, and losing the chance to finish cleanly. Prisma already closes
 * itself this way; Redis had nobody doing the same, because the client comes from a factory and a
 * plain object has no lifecycle for the framework to call.
 *
 * `quit` waits for pending commands and closes politely. `disconnect` is the fallback for a
 * connection already broken or unresponsive, where waiting politely would mean waiting forever —
 * shutting down slowly for the sake of tidiness is the failure this exists to prevent.
 */
@Injectable()
export class RedisLifecycleService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisLifecycleService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (err) {
      this.logger.warn(`Redis did not close cleanly: ${String(err)}`);
      this.redis.disconnect();
    }
  }
}

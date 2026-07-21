import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedRedisContainer } from '@testcontainers/redis';

/** Jest globalTeardown: stop and remove the containers started in globalSetup. */
export default async function globalTeardown(): Promise<void> {
  const container = (globalThis as Record<string, unknown>).__PG_CONTAINER__ as
    StartedPostgreSqlContainer | undefined;
  const redis = (globalThis as Record<string, unknown>).__REDIS_CONTAINER__ as
    StartedRedisContainer | undefined;
  await container?.stop();
  await redis?.stop();
}

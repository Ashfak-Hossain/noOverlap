import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { execSync } from 'node:child_process';

/**
 * Jest globalSetup: start one ephemeral Postgres and one ephemeral Redis for the whole integration
 * run, apply the real migrations, and export both connections via the environment.
 *
 * `prisma migrate deploy` runs the actual migration history — including the one that enables
 * `btree_gist` and adds the reservation exclusion constraint — so the container ends up
 * with a byte-for-byte production schema. The passed `DATABASE_URL` wins over the db package's `.env`
 * (dotenv does not override an already-set variable), so migrations target the container.
 *
 * Redis is required because Booking owns the outbox relay, which publishes to BullMQ. Starting a
 * container rather than pointing at a developer's local instance keeps the suite hermetic and gives
 * CI a real broker instead of an unreachable host.
 */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:16').start();
  const databaseUrl = container.getConnectionUri();

  execSync('pnpm --filter @no-overlap/db exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  const redis = await new RedisContainer('redis:8-alpine').start();

  // Exported to the (in-band) test process; the container refs are stashed for globalTeardown.
  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_HOST = redis.getHost();
  process.env.REDIS_PORT = String(redis.getMappedPort(6379));
  (globalThis as Record<string, unknown>).__PG_CONTAINER__ = container;
  (globalThis as Record<string, unknown>).__REDIS_CONTAINER__ = redis;
}

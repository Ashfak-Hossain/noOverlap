import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';

/**
 * Jest globalSetup: start one ephemeral Postgres for the whole integration run, apply the real
 * migrations to it, and export its URL via the environment.
 *
 * `prisma migrate deploy` runs the actual migration history — including the one that enables
 * `btree_gist` and adds the reservation exclusion constraint — so the container ends up
 * with a byte-for-byte production schema. The passed `DATABASE_URL` wins over the db package's `.env`
 * (dotenv does not override an already-set variable), so migrations target the container.
 */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:16').start();
  const databaseUrl = container.getConnectionUri();

  execSync('pnpm --filter @no-overlap/db exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  // Exported to the (in-band) test process; the container ref is stashed for globalTeardown.
  process.env.DATABASE_URL = databaseUrl;
  (globalThis as Record<string, unknown>).__PG_CONTAINER__ = container;
}

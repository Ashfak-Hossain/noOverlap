import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/** Jest globalTeardown: stop and remove the shared Postgres container started in globalSetup. */
export default async function globalTeardown(): Promise<void> {
  const container = (globalThis as Record<string, unknown>).__PG_CONTAINER__ as
    StartedPostgreSqlContainer | undefined;
  await container?.stop();
}

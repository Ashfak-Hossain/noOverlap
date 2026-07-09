import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@no-overlap/db';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * The application's single Prisma client, exposed as an injectable Nest provider.
 *
 * Extends {@link PrismaClient} so consumers inject one object that is both the ORM and a
 * lifecycle-managed provider. Registered globally by `PrismaModule`, so any module can inject it
 * without re-importing.
 *
 * @remarks Prisma 7 runs without the Rust query engine, so the client talks to Postgres through a
 * driver adapter ({@link PrismaPg}, backed by `pg`) rather than a bare connection string — see the
 * Prisma-7 notes in ADR-0002.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Read directly from process.env rather than ConfigService: a derived class cannot touch
    // `this` (or injected dependencies) before calling super(). The value is already guaranteed
    // present by the boot-time env validation (config/env.schema.ts); this check only narrows the
    // type to string and fails loudly if that invariant is ever violated.
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  /** Open the connection pool eagerly at boot so the first request never pays connection latency. */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Drain the pool on shutdown so in-flight queries finish and connections aren't leaked. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

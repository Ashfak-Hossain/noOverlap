import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../../src/config/env.schema';
import { CommonModule } from '../../src/common/common.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { IdentityModule } from '../../src/identity/identity.module';
import { ListingsModule } from '../../src/listings/listings.module';

/**
 * The application under integration test: the real feature modules (Identity, Listings) plus the
 * shared error envelope + validation (CommonModule) and Prisma. HealthModule (Redis) and the global
 * throttler are intentionally left out — they are orthogonal to the auth/RBAC/ownership behaviours
 * asserted here, and omitting them keeps the suite free of a Redis dependency and of rate limits
 * that would otherwise trip repeated logins.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    CommonModule,
    PrismaModule,
    IdentityModule,
    ListingsModule,
  ],
})
export class TestAppModule {}

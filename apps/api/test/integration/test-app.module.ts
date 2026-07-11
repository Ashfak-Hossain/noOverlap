import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../../src/config/env.schema';
import { CommonModule } from '../../src/common/common.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { IdentityModule } from '../../src/identity/identity.module';
import { ListingsModule } from '../../src/listings/listings.module';
import { BookingModule } from '../../src/booking/booking.module';

/**
 * The application under integration test: the real feature modules (Identity, Listings, Booking) plus
 * the shared error envelope + validation (CommonModule) and Prisma. HealthModule (Redis) and the
 * global throttler are intentionally left out — they are orthogonal to the behaviours asserted here,
 * and omitting them keeps the suite free of a Redis dependency and of rate limits that would trip the
 * concurrency storm. `ScheduleModule` is also omitted, so no background sweep runs during tests; the
 * expiry logic is driven directly via `sweepExpiredHolds()` for determinism.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    CommonModule,
    PrismaModule,
    IdentityModule,
    ListingsModule,
    BookingModule,
  ],
})
export class TestAppModule {}

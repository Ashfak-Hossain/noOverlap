import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../../src/config/env.schema';
import { CommonModule } from '../../src/common/common.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { RedisModule } from '../../src/redis/redis.module';
import { IdentityModule } from '../../src/identity/identity.module';
import { ListingsModule } from '../../src/listings/listings.module';
import { BookingModule } from '../../src/booking/booking.module';

/**
 * The application under integration test: the real feature modules (Identity, Listings, Booking) plus
 * the shared error envelope + validation (CommonModule) and Prisma. HealthModule and the global
 * throttler are intentionally left out — they are orthogonal to the behaviours asserted here, and
 * omitting the throttler keeps rate limits from tripping the concurrency storm.
 *
 * Booking pulls in the queue module, so this app does connect to Redis (globalSetup starts a
 * container for it). `ScheduleModule` is still omitted, so neither the expiry sweep nor the outbox
 * relay fires on a timer; both are driven directly from the tests, which is what makes the async
 * assertions deterministic instead of a race against a clock.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    CommonModule,
    PrismaModule,
    // Registered explicitly even though it is `@Global()`: global only means "visible everywhere once
    // registered", not "registered automatically". The realtime gateway that Booking now depends on
    // needs the shared client for its per-listing sequence.
    RedisModule,
    IdentityModule,
    ListingsModule,
    BookingModule,
  ],
})
export class TestAppModule {}

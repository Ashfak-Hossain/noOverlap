import { ListingsModule } from './listings/listings.module';
import { IdentityModule } from 'src/identity/identity.module';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from 'src/app.controller';
import { AppService } from 'src/app.service';
import { HealthModule } from 'src/health/health.module';
import { Env, validateEnv } from 'src/config/env.schema';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RedisModule } from 'src/redis/redis.module';
import { CommonModule } from 'src/common/common.module';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerProblemGuard } from './identity/guards/throttler-problem.guard';
import { BookingModule } from './booking/booking.module';
import { ReviewsModule } from './reviews/reviews.module';
import { MetricsModule } from './metrics/metrics.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Global default: 100 requests / 60s per client IP. Auth routes tighten this via @Throttle.
    // Read from config rather than fixed here, so a capacity measurement can raise the ceiling —
    // against the hardcoded limit a load run measures the throttler refusing traffic, not the system
    // serving it. The defaults are the production values; nothing changes unless the environment says.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => [
        {
          ttl: config.get('THROTTLE_TTL_MS', { infer: true }),
          limit: config.get('THROTTLE_LIMIT', { infer: true }),
        },
      ],
    }),
    ScheduleModule.forRoot(),
    CommonModule,
    PrismaModule,
    RedisModule,
    IdentityModule,
    ListingsModule,
    HealthModule,
    MetricsModule,
    BookingModule,
    ReviewsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerProblemGuard },
  ],
})
export class AppModule {}

import { ListingsModule } from './listings/listings.module';
import { IdentityModule } from 'src/identity/identity.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from 'src/app.controller';
import { AppService } from 'src/app.service';
import { HealthModule } from 'src/health/health.module';
import { validateEnv } from 'src/config/env.schema';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RedisModule } from 'src/redis/redis.module';
import { CommonModule } from 'src/common/common.module';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerProblemGuard } from './identity/guards/throttler-problem.guard';
import { BookingModule } from './booking/booking.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Global default: 100 requests / 60s per client IP. Auth routes tighten this via @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    CommonModule,
    PrismaModule,
    RedisModule,
    IdentityModule,
    ListingsModule,
    HealthModule,
    BookingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerProblemGuard },
  ],
})
export class AppModule {}

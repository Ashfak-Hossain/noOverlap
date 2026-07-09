import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Identity — users, authentication, and role-based access.
 *
 * `PrismaService` is injected without importing anything here because `PrismaModule` is `@Global`.
 * Login, refresh, and the JWT strategy join this module in 1.3.2–1.3.4.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
export class IdentityModule {}

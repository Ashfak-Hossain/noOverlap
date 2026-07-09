import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Provides the shared {@link PrismaService} to the whole application.
 *
 * `@Global()` because the database client is a cross-cutting singleton every feature module needs:
 * marking it global lets any module inject `PrismaService` without importing this module, avoiding
 * a `PrismaModule` entry in every module's `imports`. Register it once (in `AppModule`).
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

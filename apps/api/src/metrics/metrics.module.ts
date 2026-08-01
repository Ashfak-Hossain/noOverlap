import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/**
 * Operational metrics.
 *
 * Global because the things worth counting happen wherever the work happens — a booking outcome in the
 * booking context, a deadlock retry inside the claim — and threading a dependency through every module
 * that might one day record something would make measuring feel expensive. Counting should be the
 * cheap part.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}

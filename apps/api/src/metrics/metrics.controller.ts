import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

/**
 * The metrics scrape endpoint.
 *
 * Exempt from rate limiting for the same reason the health probe is: a limiter exists to protect the
 * service from callers, and something polling this on a schedule is not that. Being throttled would
 * make the endpoint stop answering exactly when traffic is high enough to be worth watching.
 *
 * Unauthenticated, matching the health probe. Nothing here is guest-scoped — the values are counts and
 * depths, not data — but it does describe the shape of internal traffic, so a public deployment should
 * keep it behind the proxy rather than open to the internet.
 *
 * Hidden from the API documentation: this is an operational surface, not part of the product's
 * contract, and listing it beside the booking routes would misrepresent both.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  scrape(): Promise<string> {
    return this.metrics.scrape();
  }
}

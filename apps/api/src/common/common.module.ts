import { Global, Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ProblemDetailsFilter } from './filters/problem-details.filter';
import { buildValidationException } from './validation';

/**
 * Shared/Core cross-cutting concerns, wired once and applied to every request (ADR-0009).
 *
 * Registered `@Global()` and imported once in `AppModule`. Using the `APP_FILTER` / `APP_PIPE`
 * provider tokens (rather than `app.useGlobalFilters()` in main.ts) registers them through the DI
 * container, so they can inject dependencies and are picked up by Nest's testing utilities.
 */
@Global()
@Module({
  providers: [
    // One global exception filter -> every error becomes an RFC 7807 body.
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    {
      // Global request validation. `whitelist` strips properties not on the DTO (guards against
      // mass-assignment); `transform` coerces payloads into typed DTO instances; `exceptionFactory`
      // routes failures through the shared error envelope (see buildValidationException).
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: buildValidationException,
      }),
    },
  ],
})
export class CommonModule {}

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { AppException } from '../errors/app.exception';
import { ERROR_CATALOG, problemTypeUri } from '../errors/error-catalog';
import type { ProblemDetails } from '../problem-details';

/**
 * The single global exception filter: it catches every error thrown anywhere in the request
 * pipeline and renders one consistent RFC 7807 body, so the frontend only ever handles one error
 * shape (ADR-0009). `@Catch()` with no argument means "catch everything", not a specific type.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    // Reuse an inbound x-request-id if a proxy/client set one (keeps a trace correlated across
    // hops); otherwise mint one.
    const instance =
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

    const problem = this.toProblem(exception, instance);

    // Only 5xx are error-logged: they are server faults worth a stack trace. 4xx are expected
    // client errors (bad input, auth) and would be pure noise at error level.
    if (problem.status >= 500) {
      this.logger.error(
        `${problem.status} ${problem.title} [${instance}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(problem.status);
    res.setHeader('Content-Type', 'application/problem+json');
    res.json(problem);
  }

  /** Maps any thrown value to a {@link ProblemDetails}, most-specific case first. */
  private toProblem(exception: unknown, instance: string): ProblemDetails {
    // Our domain errors — including validation, which buildValidationException turns into an
    // AppException so it rides this same path. Status/title/type all come from the catalog.
    if (exception instanceof AppException) {
      return {
        type: problemTypeUri(exception.code),
        title: exception.title,
        status: exception.status,
        detail: exception.detail,
        instance,
        errors: exception.errors,
      };
    }

    // Nest's own HttpExceptions (e.g. a router NotFoundException). No domain code, so per RFC 7807
    // we use the generic `about:blank` type with the HTTP reason as title. Nest's response body can
    // be a string or a { message, ... } object — normalize either into `detail`.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();
      const detail =
        typeof resp === 'string'
          ? resp
          : (resp as { message?: unknown }).message
            ? String((resp as { message?: unknown }).message)
            : exception.message;
      return {
        type: 'about:blank',
        title: exception.name,
        status,
        detail,
        instance,
      };
    }

    // Anything unmodeled is an unexpected server fault. Deliberately return the generic INTERNAL
    // problem with no `detail`: the real message/stack is logged above, never sent to the client,
    // so an internal failure can't leak implementation details.
    return {
      type: problemTypeUri('INTERNAL'),
      title: ERROR_CATALOG.INTERNAL.title,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      instance,
    };
  }
}

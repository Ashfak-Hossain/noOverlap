import { ERROR_CATALOG, type ErrorCode } from './error-catalog';

/** One invalid field in a validation failure; collected into the problem's `errors` member. */
export interface FieldError {
  field: string;
  message: string;
}

/**
 * The application's domain exception. A service throws `new AppException('EMAIL_ALREADY_EXISTS')`
 * and {@link ProblemDetailsFilter} renders it as the RFC 7807 response — status and title are taken
 * from {@link ERROR_CATALOG}, so a call site names only the code, never HTTP details.
 *
 * Extends the built-in `Error` so stack traces and `instanceof` work; the filter branches on
 * `instanceof AppException` to distinguish domain errors from unexpected ones.
 *
 * @param code   catalog key fixing the HTTP status + title
 * @param detail occurrence-specific explanation, safe to return to the client
 * @param errors per-field messages, set only for `VALIDATION_FAILED`
 */
export class AppException extends Error {
  readonly status: number;
  readonly title: string;

  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
    readonly errors?: FieldError[],
  ) {
    super(detail ?? ERROR_CATALOG[code].title);
    this.name = 'AppException';
    this.status = ERROR_CATALOG[code].status;
    this.title = ERROR_CATALOG[code].title;
  }
}

/**
 * The API's error contract. Every failure — validation, auth, conflict, or crash — comes back as one
 * `application/problem+json` body, so the client parses failures in exactly one place.
 */
export interface ProblemDetails {
  /** Problem-class URI. The last segment encodes the error code, e.g. `.../reservation-slot-taken`. */
  type: string;
  title: string;
  status: number;
  detail?: string;
  /** Correlation id for this occurrence — worth surfacing in a support/debug context. */
  instance: string;
  /** Per-field validation detail, present on a validation failure. */
  errors?: Array<{ field: string; message: string }>;
}

/**
 * The error codes the API can return, as the client cares about them.
 *
 * These mirror the server's catalog. They matter because some are not really "errors" to a user:
 * a taken slot is an outcome the booking flow renders as a branch, not a red banner.
 */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EMAIL_ALREADY_EXISTS'
  | 'RESERVATION_SLOT_TAKEN'
  | 'RATE_LIMITED'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_STATE_TRANSITION'
  | 'REVIEW_STAY_NOT_FINISHED'
  | 'REVIEW_ALREADY_EXISTS'
  | 'INTERNAL'
  | 'UNKNOWN';

/**
 * Recovers the error code from the problem type URI.
 *
 * The server encodes the code as the final kebab-case path segment rather than a separate field, so
 * the client reverses that transformation instead of inventing its own error taxonomy.
 */
export function codeFromType(type: string): ErrorCode {
  const slug = type.split('/').pop() ?? '';
  const code = slug.toUpperCase().replace(/-/g, '_');
  return code ? (code as ErrorCode) : 'UNKNOWN';
}

/** A failed API call, carrying the parsed problem body so callers can branch on the code. */
export class ApiError extends Error {
  readonly problem: ProblemDetails;
  readonly code: ErrorCode;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.problem = problem;
    this.code = codeFromType(problem.type);
  }

  get status(): number {
    return this.problem.status;
  }

  /** Field-level messages, keyed by field, for rendering errors against the inputs that caused them. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const { field, message } of this.problem.errors ?? []) {
      out[field] ??= message;
    }
    return out;
  }
}

/** Narrows an unknown caught value to an {@link ApiError} with a specific code. */
export function isApiError(err: unknown, code?: ErrorCode): err is ApiError {
  return err instanceof ApiError && (code === undefined || err.code === code);
}

/**
 * Single source of truth mapping every domain error code to its HTTP status and human title
 * (ADR-0009). Because status and title live here, services throw a code and controllers never build
 * ad-hoc error JSON — {@link ProblemDetailsFilter} renders the response.
 */

/** Base of the RFC 7807 `type` URI. It identifies a problem class; it need not resolve to a page. */
export const PROBLEM_BASE_URI = 'https://nooverlap.ashfak.dev/problems';

/**
 * Domain error code -> HTTP status + title. `as const` keeps keys and values as literal types,
 * which is what makes {@link ErrorCode} the exact union of codes and catches typos at call sites.
 */
export const ERROR_CATALOG = {
  VALIDATION_FAILED: { status: 400, title: 'Validation failed' },
  UNAUTHENTICATED: { status: 401, title: 'Authentication required' },
  FORBIDDEN: { status: 403, title: 'Forbidden' },
  NOT_FOUND: { status: 404, title: 'Resource not found' },
  EMAIL_ALREADY_EXISTS: { status: 409, title: 'Email already registered' },
  RESERVATION_SLOT_TAKEN: {
    status: 409,
    title: 'Reservation slot no longer available',
  },
  RATE_LIMITED: { status: 429, title: 'Too many requests' },
  INTERNAL: { status: 500, title: 'Internal server error' },
  INVALID_CREDENTIALS: { status: 401, title: 'Invalid credentials' },
  INVALID_STATE_TRANSITION: {
    status: 409,
    title: 'Reservation cannot change to that state',
  },
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOG;

/** Stable `type` URI for a code, e.g. `RESERVATION_SLOT_TAKEN` -> `.../reservation-slot-taken`. */
export function problemTypeUri(code: ErrorCode): string {
  return `${PROBLEM_BASE_URI}/${code.toLowerCase().replace(/_/g, '-')}`;
}

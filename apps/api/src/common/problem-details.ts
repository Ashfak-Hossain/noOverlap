/**
 * The `application/problem+json` response body (RFC 7807) — the single error shape the whole API
 * returns, so the frontend parses every failure the same way (ADR-0009). The first five members are
 * standard 7807; `errors` is a 7807 "extension member" we add to carry per-field validation detail.
 */
export interface ProblemDetails {
  /** Problem-class URI (see {@link problemTypeUri}); `about:blank` for generic HTTP errors. */
  type: string;
  title: string;
  status: number;
  detail?: string;
  /** Correlation id for this occurrence; ties the response back to logs and traces. */
  instance: string;
  errors?: Array<{ field: string; message: string }>;
}

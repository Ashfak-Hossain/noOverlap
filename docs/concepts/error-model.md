# The error model

Every way a request can fail returns the same shape. A validation error, a permission denial, a booking
conflict, and an unexpected crash all arrive at the client as one predictable JSON structure. That
consistency is not cosmetic. It lets the client handle failure in one place instead of guessing at a
different format per endpoint, and it gives the server a single choke point where it can decide what to
reveal and what to hide.

## The short version

Errors follow RFC 7807, the "problem details" standard, and are returned as `application/problem+json`.
A single catalog maps each domain error to its HTTP status and a human title, so a service throws a code
and never assembles error JSON by hand. One global exception filter renders every error, from any
source, into that shape. Server errors return a generic body while the real cause is logged, so internal
details never reach the client.

## One shape, RFC 7807

A problem-details response is a small object with a fixed set of members:

```json
{
  "type": "https://nooverlap.example/problems/reservation-slot-taken",
  "title": "Reservation slot no longer available",
  "status": 409,
  "detail": "The dates you selected were just booked by someone else.",
  "instance": "b44c455a-4ba1-4174-a061-ef52628e4644"
}
```

`type` identifies the class of problem and is stable, so a client can branch on it. `title` is a short
human summary. `status` mirrors the HTTP status. `detail` is specific to this occurrence. `instance`
carries a correlation id that ties the response to a log entry, so a support request can be traced to the
exact failure. Standardizing on this format means the client learns one structure and every endpoint
speaks it.

## A catalog, not ad-hoc JSON

The mapping from a domain error to its HTTP status and title lives in one place, a catalog keyed by error
code:

```
VALIDATION_FAILED        -> 400  Validation failed
UNAUTHENTICATED          -> 401  Authentication required
FORBIDDEN                -> 403  Forbidden
NOT_FOUND                -> 404  Resource not found
RESERVATION_SLOT_TAKEN   -> 409  Reservation slot no longer available
RATE_LIMITED             -> 429  Too many requests
INTERNAL                 -> 500  Internal server error
```

A service that hits a conflict throws `RESERVATION_SLOT_TAKEN` and nothing more. It does not know or care
that the code maps to a `409`, because the catalog decides that. Keeping status and title in one table
means an error's HTTP contract is defined once and cannot drift between the handlers that raise it.

## One filter renders everything

A global exception filter sits at the edge of the application and catches everything on the way out: the
domain errors a service throws, the validation failures the request-validation layer raises, the
framework's own exceptions, and anything unforeseen. It turns each into the problem-details shape. Because
this is the single exit for errors, no controller builds an error response, and the format cannot vary by
endpoint. Validation is a good example: a malformed request body produces a `400` in the same envelope as
every other error, listing what was wrong, without any per-endpoint code to make that happen.

## Not leaking internals

The filter draws a hard line at server errors. A `4xx` is the client's problem and can be described
plainly, because the detail is about their request. A `5xx` is the server's problem, and its real cause,
a stack trace, a failed query, the shape of an internal object, is exactly what an attacker probing for
weaknesses wants to see. So a `5xx` returns a generic body with a correlation id and nothing else, while
the full error is written to the server log. The person debugging can find everything by the correlation
id; the client learns only that something failed on the server.

## Related reading

- [access-control.md](access-control.md) — where the `401`, `403`, and `404` responses originate.
- [no-overlap.md](no-overlap.md) — the source of the `409` a booking conflict produces.

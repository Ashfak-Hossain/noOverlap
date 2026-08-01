# Glossary

The vocabulary used across the codebase and these docs, defined once. Terms are grouped by the area they belong to.

## Booking and concurrency

**Reservation** — a guest's claim on a listing for a date range. Moves through a lifecycle of statuses.

**Hold** — a reservation in the `HELD` status: a temporary claim on a slot, valid until its deadline,
created before payment so the dates are secured while the guest pays.

**Status** — where a reservation is in its lifecycle: `HELD`, `CONFIRMED`, `CANCELLED`, `EXPIRED`, or
`COMPLETED`. Only `HELD` and `CONFIRMED` occupy a slot.

**Active reservation** — one whose status is `HELD` or `CONFIRMED`, and which therefore blocks its dates.
Cancelled and expired reservations are inactive and block nothing.

**Exclusion constraint** — a PostgreSQL constraint that forbids two rows from both satisfying a relation.
Here it forbids two active reservations for the same listing whose date ranges overlap. See
[concepts/no-overlap.md](concepts/no-overlap.md).

**GiST index** — the index type that backs the exclusion constraint, able to answer range-overlap
queries. The `btree_gist` extension lets it also handle the equality test on the listing.

**`tstzrange`** — a PostgreSQL range of timestamps-with-time-zone. A reservation's occupied interval is
`tstzrange(check_in, check_out, '[)')`.

**Half-open range (`[)`)** — a range that includes its start and excludes its end. It makes a checkout
and the next check-in on the same day not overlap, so back-to-back stays are allowed.

**TOCTOU** — time-of-check to time-of-use, the race where a value is checked and then acted on, and it
changes in between. The bug that "check whether the slot is free, then book it" falls into under load.

**Hold TTL** — the lifetime of a hold, after which an unpaid reservation is expired by a background sweep
and its slot is released.

## The saga

**Saga** — a multi-step operation modeled as a sequence of steps, each with a compensating action that
reverses it, used when a single transaction cannot span the whole thing. The booking flow is a saga
because payment crosses an asynchronous boundary.

**Compensation** — the action that undoes a completed step. Cancelling a hold compensates for creating
it; the slot reopens because the exclusion constraint stops counting a cancelled row.

**Transition map** — the single definition of which status changes are legal. Every state change is
checked against it. See [concepts/booking-lifecycle.md](concepts/booking-lifecycle.md).

**Idempotency** — the property that performing an operation twice has the same effect as performing it
once. Required so a redelivered message cannot cause a second charge or a double confirmation.

## The async seam

**Outbox** — a table written in the same transaction as the change it announces, so an event is never
lost or emitted for a transaction that rolled back. The transactional outbox pattern.

**Relay** — the process that reads unpublished outbox rows and pushes them onto the queue, then marks
them published.

**At-least-once delivery** — the guarantee that a queued message is delivered one or more times, never
zero. Combined with idempotency, it is safe; on its own it can duplicate work.

**Dead-letter queue (DLQ)** — where a message goes after exhausting its retries, so a poisonous message
is set aside for inspection instead of looping forever or vanishing.

**Idempotency key** — a unique value attached to a charge so the payment provider, or the local record,
recognizes a repeat and returns the prior result instead of charging again.

## Identity and access

**Access token** — a short-lived signed JWT the client sends on each request. Verified statelessly by its
signature.

**Refresh token** — a long-lived, single-use credential used only to obtain new access tokens. Stored
hashed, rotated on every use, kept in an `HttpOnly` cookie.

**RS256** — the asymmetric signing algorithm for the access tokens: a private key signs, a public key
verifies. See [concepts/authentication.md](concepts/authentication.md).

**Rotation** — issuing a new refresh token and invalidating the old one on every refresh, which makes a
replayed token detectable.

**Reuse detection** — noticing that an already-rotated refresh token was presented again, which signals
theft and triggers revocation of the whole token family.

**Token family** — the chain of refresh tokens descended from a single login. Revoked as a unit when
reuse is detected.

**Argon2id** — the memory-hard password hashing algorithm used to store passwords.

**RBAC** — role-based access control: permitting a route by the caller's role, such as host or guest.

**Ownership scoping** — the instance-level check that a caller owns the specific resource they act on,
beyond merely having the right role.

## The web client

**Server state** — data the client holds that belongs to the server. Treated as a cache with a
lifetime, not as application state, because it can change without the browser being told.

**Query invalidation** — marking cached data stale after a write that would have changed it, so the
next read fetches rather than trusting what it has.

**Polling with a stopping condition** — re-reading a value on an interval only while it can still
change, and stopping once it reaches a state it cannot leave. See
[concepts/showing-async-work.md](concepts/showing-async-work.md).

**Optimistic update** — showing the result of an action before the server confirms it. Deliberately
not used for booking, where losing a slot is an ordinary outcome rather than a rare failure.

**Design token** — a named value for a colour, size, or shadow, defined once and referenced
everywhere, so both themes and any restyle are a change in one place.

## Realtime

**Room** — a named group of sockets. A client joins the room for each listing it is viewing, so a
change reaches the people looking at that property and nobody else.

**Fan-out** — delivering one event to every instance's sockets, not just those connected to the
process that raised it. Carried over Redis, without which the feature works in development and
half-fails behind a load balancer.

**Best-effort delivery** — no guarantee a message arrives. Chosen deliberately for change
notifications, where a loss costs a refresh rather than a booking. See
[concepts/realtime-updates.md](concepts/realtime-updates.md).

**Sequence number** — a value that increases per listing on every event, so a client receiving 43
after 41 knows one never arrived. Allocated in Redis, because a per-process counter would restart on
deploy and repeat numbers across instances.

**Gap detection** — noticing a missed event from a break in those numbers, and re-reading instead of
continuing from stale data. What makes best-effort delivery safe.

## Observability

**Span** — one unit of work with a start, an end, and a parent. **Trace** — the tree they form,
describing a single operation end to end.

**Trace context** — the small piece of data, a trace id and a parent span id, that lets a span in one
process claim a parent in another. It travels in the message, because a queue carries nothing of the
connection that produced it. See [concepts/realtime-updates.md](concepts/realtime-updates.md) for the
same idea applied to events, and the architecture page for how a booking stays one trace across the
seam.

**Auto-instrumentation** — a library that produces spans by patching HTTP, database and cache clients
as they are loaded. It has to load first: anything imported earlier is captured unpatched and produces
no spans at all.

**Counter / gauge** — a value that only increases, such as bookings attempted; and one that moves in
both directions, such as the depth of a queue. A counter answers "how often", a gauge answers "how
much, right now".

**Scrape** — a read of the metrics endpoint. Values held in the database and the cache are fetched at
that moment rather than on a timer, so an endpoint nobody reads costs nothing.

**Backlog depth** — events committed but not yet published. The seam's vital sign: it can climb into
the thousands while response times stay excellent, because the endpoint does not slow down when the
relay falls behind.

## Deployment

**Mutable tag** — an image tag that moves, such as `latest`. Convenient to follow and useless for
naming a version to return to, which is why every build is also published under the commit that
produced it.

**Immutable tag** — an image tag that always names the same build, here the commit sha. What makes a
rollback a matter of pinning rather than rebuilding.

**Migration job** — a container that applies pending schema changes and exits. Both services depend on
it exiting successfully, so a failed migration becomes a deploy that does not happen rather than a
system that half-changed.

**Same-origin** — serving the client and the API from one hostname. Required rather than tidy: the
refresh token is a cookie the browser returns only to the origin that set it.

**Catch-all route** — the proxy rule that claims any path the more specific rules did not. It is what
lets a client-side route survive a reload, and it is why a request to a missing API route returns the
front page instead of an error. See [architecture/operations.md](architecture/operations.md).

## Cross-cutting

**RFC 7807 / problem+json** — the standard error response shape (`type`, `title`, `status`, `detail`,
`instance`) used for every error. See [concepts/error-model.md](concepts/error-model.md).

**Correlation id** — an identifier attached to a request and carried through logs, the saga, and the
worker, so one operation can be traced end to end. Surfaced to clients in an error's `instance` field.

**Testcontainers** — the library that starts a real, disposable PostgreSQL in a container for the
integration tests. See [concepts/testing.md](concepts/testing.md).

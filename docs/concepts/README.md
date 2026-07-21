# Concepts

The ideas the system is built on, one per page. Each is written to be read on its own, and each starts
with a short summary before going into depth. Together they are the "how it works, and why it works that
way" of noOverlap.

- [no-overlap.md](no-overlap.md) — how two guests racing for the same slot resolve to exactly one
  winner, enforced by the database rather than by application code.
- [booking-lifecycle.md](booking-lifecycle.md) — the reservation as an explicit state machine: holds,
  confirmation, compensation, expiry, and why every transition is safe to repeat.
- [async-seam.md](async-seam.md) — how the intent to charge crosses a process boundary without ever
  being lost or acted on twice: the outbox, the relay, idempotency, retries, and compensation.
- [authentication.md](authentication.md) — password hashing, stateless access tokens, and refresh
  tokens that can be revoked the moment they are misused.
- [access-control.md](access-control.md) — the three checks behind every protected action: are you
  authenticated, do you have the role, and do you own the specific thing.
- [error-model.md](error-model.md) — one error shape for the whole API, and why that consistency is
  more than cosmetic.
- [testing.md](testing.md) — how the guarantees are proven, including the concurrency harness that
  fires a storm of bookings at a single slot.

The choices these pages describe are recorded as [decision records](../architecture/decisions/).

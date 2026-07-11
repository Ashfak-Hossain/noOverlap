# Testing the guarantees

A booking system's most important properties are the ones that only appear under concurrency and against
a real database. A test that mocks the database cannot catch a double-booking, because the thing that
prevents double-booking is a database constraint. So the tests that matter most here run against a real
PostgreSQL instance and, for the central claim, against real concurrency. This page explains what is
tested at which level and why.

## The short version

Domain logic is covered by fast unit tests. The behaviors that depend on the database, including the
no-overlap guarantee and the reservation lifecycle, are covered by integration tests that run against a
throwaway PostgreSQL started by Testcontainers, driven over HTTP with supertest. The headline claim,
that concurrent bookings resolve to exactly one winner, is proven by a bespoke harness that fires many
requests at once and checks the result both over HTTP and directly in the database.

## Why a real database

The exclusion constraint is database behavior. It is enforced by PostgreSQL on every write, and it does
not exist in application code at all. A mock repository, told to accept an insert, will accept it; it has
no way to reject an overlap, because rejecting overlaps is precisely the thing the real database does and
the mock does not. Testing this against a mock would test nothing. The constraint has to be exercised
against a real PostgreSQL with the real migrations applied, so the index, the extension it depends on, and
the constraint's predicate are all exactly as they ship.

Testcontainers makes that cheap. Each test run starts a disposable PostgreSQL in a container, applies the
migrations, runs the suite against it, and throws it away. The tests get a clean, real database every time
without a developer having to provision anything, and the same setup runs unchanged in continuous
integration.

## The layers

Unit tests cover logic that does not need a database: pricing arithmetic, the legality of a state
transition, validation rules. They are fast and run on every change.

Integration tests cover the layers the database is part of. They register users, create listings, place
holds, and drive the full lifecycle over HTTP, asserting the exact status codes and the resulting rows.
This is where authentication, access control, and the booking transitions are verified end to end against
real PostgreSQL.

The concurrency harness is its own thing, described below.

## The concurrency harness

Claims about behavior under load are only worth as much as their proof. The harness fires a batch of
identical booking requests at a single slot at the same time and then asserts the outcome at two levels:

```ts
const results = await Promise.all(
  Array.from({ length: 100 }, () => bookTheSameSlot()),
);

const created = results.filter((r) => r.status === 201).length;
const conflicts = results.filter((r) => r.status === 409).length;

expect(created).toBe(1);    // exactly one HTTP success
expect(conflicts).toBe(99); // everyone else was told the slot is taken

const active = await countActiveReservationsForListing();
expect(active).toBe(1);     // and the database agrees: no overlap exists
```

The two assertions check different things. The HTTP counts confirm the API behaved: one caller was told
yes, the rest were told no. The database count is the stronger claim, because the constraint makes any
other value impossible to write, not merely unlikely to occur. If the harness ever saw two active rows,
it would mean the guarantee had failed at its foundation. It does not, and the same harness scales to ten
thousand requests to show the property holds at load rather than only at small numbers.

This is a correctness test, not a performance test. It proves that no overlap can occur, which is a
different question from how fast bookings can be processed. Throughput and latency are measured
separately; keeping the two apart avoids confusing "it is correct under load" with "it is fast under
load."

## A lesson from the harness itself

Building the harness surfaced a worthwhile reminder: the test rig has to be correct before it can prove
anything about the system. An early version reported failures that looked like the booking logic breaking
under concurrency and were nothing of the sort. One was a race in how the test client bound its socket,
which produced connection resets. One was a missing module registration, which turned every request into a
`404` before it reached any booking code. Each looked like the same symptom, "the concurrency test is
red," and each had a different, unrelated cause. Isolating the real variable each time, rather than
trusting the surface symptom, is the actual skill on display.

## Related reading

- [no-overlap.md](no-overlap.md) — the guarantee this harness exists to prove.
- [booking-lifecycle.md](booking-lifecycle.md) — the transitions the integration tests exercise.

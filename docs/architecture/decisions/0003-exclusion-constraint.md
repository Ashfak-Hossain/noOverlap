# 0003. A GiST exclusion constraint for no-overlap

Status: Accepted

## Context

The defining requirement of the system is that a listing cannot be double-booked: two active
reservations for the same listing must never have overlapping date ranges, no matter how many requests
arrive at once. This is a correctness property under concurrency, which is exactly where application-level
approaches tend to fail.

## Decision

Enforce the rule with a PostgreSQL exclusion constraint on the `reservations` table, backed by a GiST
index over the listing id and the reservation's date range, scoped by a partial predicate to reservations
that are `HELD` or `CONFIRMED`. The application inserts a reservation and handles the constraint
violation that occurs when the slot is already taken; it never checks availability first. The full
mechanism is explained in [../../concepts/no-overlap.md](../../concepts/no-overlap.md).

## Consequences

Overlap is impossible to commit under any interleaving of concurrent requests, because the check and the
write are a single database operation. The application layer shrinks to an insert and a catch. Because
the constraint's predicate ignores cancelled and expired rows, releasing a slot is a status change rather
than a delete, which keeps history intact. The constraint depends on the `btree_gist` extension and, since
no ORM can express it, on a raw SQL migration (see [0002](0002-prisma-with-raw-sql.md)).

## Alternatives considered

Checking whether the slot is free and then inserting is the intuitive approach and is a textbook race:
two requests both see a free slot before either writes. Locking the listing row with `SELECT ... FOR
UPDATE` is correct but serializes all bookings for a listing even when their dates do not overlap.
Optimistic version columns work well when conflicts are rare but degrade under the exact contention this
system is built to handle.

## Trade-off

The invariant lives in the database rather than in application code, which some teams find less familiar
and which ties the design to PostgreSQL specifically. In exchange, the guarantee cannot be undermined by
an application bug, and it holds at the lowest level, on every write.

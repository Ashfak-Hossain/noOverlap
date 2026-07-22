# 0019. A booked listing is deactivated, never deleted

Status: Accepted

## Context

Deleting a listing was owner-scoped and worked. Building the host interface for it exposed what it
actually did.

Reservations referenced listings with a cascading delete, and payments and reviews cascade from
reservations. Deleting a listing therefore deleted every booking ever made on it, the payment records
for those bookings, and their reviews. Silently, in one statement, answering `204`.

A host removing a property they no longer rent is an ordinary action. Destroying a guest's confirmed,
paid booking as a side effect of it is not, and the guest would be left with no record that the stay
had ever existed. Reservations and payments are financial history.

A listing already had an `active` flag, and search already filtered on it. Nothing in the product
could set it.

## Decision

Reservations now reference listings with a restricting foreign key. The database refuses to delete a
listing while any reservation points at it, and the service turns that refusal into a `409`.

Deleting remains available for a listing nobody has booked. Withdrawing a booked listing from sale is
a different operation: setting `active` to false removes it from search and stops new bookings while
leaving everything already booked intact. The host tools offer both.

## Consequences

The guarantee is enforced by the database, so it holds for any caller — a direct API call, a script, a
future service — and not only for requests that go through the interface. A rule enforced by the
screen in front of you is not enforced.

The refusal is translated from the constraint rather than pre-checked with a count. A booking placed
between a check and the delete would slip past a count, and the database is already deciding this.
That is the same reasoning as the [exclusion constraint](0003-exclusion-constraint.md) for overlapping
stays and the unique email in [0011](0011-auth-tokens.md): let the database arbitrate, then translate
what it says.

The conflict is presented to the host as guidance toward pausing rather than as a failure, because it
is not one. The system is saying the other action is the right one.

A listing whose only bookings were cancelled or expired also cannot be deleted. Those rows are still
the record that someone booked, and separating history worth keeping from history worth discarding is
a judgement the system has no basis to make.

## Alternatives considered

Keeping the cascade and warning hard in the interface — fetching the booking count and making the host
confirm against it — needs no migration and leaves the host in full control. The guard exists only in
the client, so a direct request still erases a paid booking with no warning.

Checking for reservations in the service before deleting keeps it in application code and gives a
friendlier error, but it is a read followed by a write with a window between them, and a booking
placed in that window is deleted by a call that had already decided it was safe.

Offering no delete at all is the simplest and safest option and needs no migration. It leaves a
working endpoint unreachable from the product, and denies a host any way to remove a listing they
published by mistake.

Soft-deleting listings with a timestamp adds a second "not visible" state alongside `active`. Two
states for one idea is the kind of ambiguity that produces bugs later; `active` already says this.

## Trade-off

We accept that a listing can become permanently undeletable — one cancelled booking is enough — in
exchange for a guarantee that no booking or payment record can be destroyed by a host tidying up.
The alternative was silent data loss reported as success.

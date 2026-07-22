# 0017. A sweep completes stays that have ended

Status: Accepted

## Context

Reviews are restricted to guests whose stay actually happened and is over, so the system needs an
opinion on when a stay has ended.

The reservation lifecycle already included `COMPLETED`, and the transition map already permitted
`CONFIRMED → COMPLETED`. Nothing performed that transition. The status was unreachable: present in the
model, allowed by the guard, and held by no reservation that ever existed. A state machine with a
state nothing enters is not describing the system.

## Decision

A scheduled sweep moves `CONFIRMED` reservations whose check-out has passed to `COMPLETED`, mirroring
the expiry sweep that already reclaims abandoned holds. Both are described in
[../../concepts/booking-lifecycle.md](../../concepts/booking-lifecycle.md).

Review eligibility is then one status check — the reservation is `COMPLETED` and belongs to the caller
— instead of a status plus date arithmetic repeated wherever the question is asked.

## Consequences

`COMPLETED` becomes reachable, so the documented lifecycle is the one the system actually has.

The sweep is a single set-based `UPDATE`, which makes it atomic and idempotent: the status filter is
the guard, so a second run matches nothing and two instances running it at once cannot double-process
a row. That holds because completing is a pure status change with no side effect. If it ever gained
one — a payout, a notification — it would need the same row-claiming treatment as the
[outbox relay](0007-polling-relay.md).

Completion becomes another point that announces a change to whoever is watching the listing.

A reservation becomes `COMPLETED` shortly after its checkout rather than at the instant of it, bounded
by the sweep's interval. The only thing that depends on it is when the guest is offered the review
form.

## Alternatives considered

Deriving it on read — treating a reservation as past when it is `CONFIRMED` and its checkout has gone
by — needs no scheduler and no new code. It leaves `COMPLETED` permanently unreachable and spreads the
definition of "over" across every feature that needs it, where the definitions drift apart.

Completing lazily, when a reservation happens to be fetched, avoids a scheduler too. It changes state
as a side effect of a read, which is a surprise to anyone debugging it, and a reservation nobody looks
at is never completed — so eligibility would depend on whether someone opened a page.

## Trade-off

We accept another scheduled job, and completion that lags checkout by up to one interval, in exchange
for a lifecycle whose states are all reachable and one unambiguous answer to "is this stay over?" that
every feature shares.

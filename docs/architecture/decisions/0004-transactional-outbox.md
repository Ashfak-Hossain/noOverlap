# 0004. A transactional outbox for the async seam

Status: Accepted

## Context

When a reservation is held, the system has to tell the worker to charge the card. That message must not
be lost if the process dies immediately after the reservation commits, and it must not be sent for a
reservation whose transaction later rolled back. Writing the reservation and then publishing to the queue
as two separate steps has a failure window between them in either direction.

## Decision

Use the transactional outbox pattern. In the same database transaction that writes the `HELD`
reservation, write a row to an outbox table describing the work to perform. A separate relay reads
unpublished outbox rows, pushes them onto the queue, and marks them published. Because the reservation
and its outbox row share one transaction, they commit together or not at all.

## Consequences

There is no state where a reservation exists but its intent to charge was lost, and none where a charge
was queued for a reservation that never committed. Delivery from the outbox is at-least-once, so every
downstream step must be idempotent, which the payment flow is by design. The pattern requires an outbox
table and a relay process, and it introduces a short, bounded delay between the commit and the message
reaching the queue.

## Alternatives considered

Publishing to the queue directly after the commit is simpler but reintroduces the lost-message window a
crash at the wrong moment would expose. Publishing inside the transaction couples the database commit to
the broker being available and can send a message for a transaction that later aborts. Both fail the
core requirement that the intent is never lost and never phantom-sent.

## Trade-off

The system accepts extra write volume, the outbox row plus the relay's update, and eventual rather than
instantaneous delivery. In return, a booking's intent to charge survives any single process failure and
is never emitted for work that did not happen.

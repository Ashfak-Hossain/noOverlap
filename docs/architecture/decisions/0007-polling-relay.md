# 0007. A polling relay moves outbox rows to the queue

Status: Accepted

## Context

The transactional outbox records the intent to charge in the same transaction as the booking, but
something has to carry those rows to the queue the worker consumes. Two mechanisms are realistic.
A relay can poll the table for unpublished rows, or it can tail the database's replication log and
react to the writes as they happen.

The relay must also be safe to run more than once at a time, because the API it lives in can be scaled
to several instances, and two relays reading the same table must not publish the same event twice.

## Decision

Use a polling relay, running inside the API process on a short interval. Each pass claims a batch of
unpublished rows with `SELECT … FOR UPDATE SKIP LOCKED`, publishes them, and then marks them published,
all within one transaction.

`SKIP LOCKED` is what makes concurrency safe: a second relay steps over rows the first has locked and
takes different ones, so instances divide the work instead of duplicating or blocking on it.

Publishing happens before the rows are marked. If the process dies between the two, the rows stay
unpublished and are sent again on the next pass.

## Consequences

There is nothing to operate beyond the API itself: no replication slot, no plugin, no separate
deployable. Publish latency is bounded by the poll interval rather than being immediate, and most polls
find nothing.

Because publishing precedes marking, an event can be delivered more than once. Delivery is therefore
at-least-once, and every consumer downstream has to be idempotent. That obligation is met by the
payment idempotency key and by conditional state transitions.

Running the relay inside the API is not a permanent commitment. It reads only the outbox table and
writes only to the queue, so extracting it into its own process later is mechanical.

## Alternatives considered

Tailing the replication log with logical decoding removes polling entirely and reacts with lower
latency. It also introduces replication slots, a decoding plugin, and the monitoring that comes with
them, including the risk of a stalled consumer retaining write-ahead log segments until the disk fills.
That operational weight is disproportionate to the current scale, and it remains the upgrade path if
latency ever justifies it.

Marking rows as published before sending them was rejected outright. It would make delivery at-most-once,
where a crash in the gap loses the charge with nothing left to indicate it was ever owed.

## Trade-off

Polling accepts a small, tunable delay and some wasted queries in exchange for a mechanism that is
simple to build, easy to test, and requires no database operations expertise to run. The at-least-once
delivery it implies is a genuine cost, paid for with idempotency at every consumer.

# 0013. The booking saga as a state machine first

Status: Accepted

## Context

The booking flow is a multi-step operation that will eventually span an asynchronous boundary, because
payment runs in the worker. It has a natural home in a command-and-event framework with a saga
coordinating the steps. But while payment is still a synchronous, in-process step, that framework would
be reacting to events that never leave the process. The question is when to adopt it.

## Decision

Model the reservation lifecycle now as a plain in-process state machine: a single transition map is the
only authority for legal status changes, transitions are guarded and idempotent, and payment is a
synchronous call. Defer the command-and-event framework until the asynchronous seam is real and events
genuinely cross into the worker. Shape the transition map so that adopting the framework later is
mechanical. The lifecycle is described in [../../concepts/booking-lifecycle.md](../../concepts/booking-lifecycle.md).

## Consequences

The state machine, its compensation, and the concurrency proof are built and tested without event-bus
indirection while there is no external consumer to justify it. Idempotent transitions exist from the
start, so when delivery becomes at-least-once they are already safe. When the framework is introduced, the
transitions are re-expressed as commands and events without changing the shape of the machine.

## Alternatives considered

Adopting the framework immediately would demonstrate the target pattern sooner, at the cost of indirection
around events that have no real consumer yet and no benefit to correctness. Scattering status checks
across the code instead of a single transition map would remove the framework entirely but leave no one
place that defines which transitions are legal, which is how a state machine quietly becomes inconsistent.

## Trade-off

The full command-and-event pattern arrives in two steps rather than one, and is not on display until the
seam is asynchronous. In exchange, the system stays simpler while the seam is synchronous, and the
transition map keeps the later adoption a mechanical change.

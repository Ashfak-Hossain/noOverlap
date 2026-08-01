# Tracing a booking across a queue

A booking touches two processes, two queue crossings, and a database on both sides. When it is slow,
or when it silently does not finish, the useful question is not "which service is unhealthy" but "what
happened to *this* booking". A distributed trace answers that: one picture, ordered in time, of every
step one request set in motion.

![A single distributed trace of a booking, spanning the API and the worker](../architecture/images/booking-saga-trace.png)

Getting there is mostly free until the message hits the queue. Then it stops, and the reason it stops
is the interesting part of this page.

## What a trace is made of

A **span** is one unit of work with a start, an end, and a parent — a request handler, a query, a job.
Spans nest, and the tree they form is a **trace**. Every span carries the id of the trace it belongs to
and the id of its parent, and those two values are all that is needed to reassemble the tree from spans
recorded in different processes at different times.

Instrumentation libraries produce most spans without being asked. They patch the HTTP, PostgreSQL, and
Redis clients as those are loaded, so a request handler and the queries beneath it appear on their own.

Propagation across a network call is equally automatic, because HTTP has somewhere to put it. The
tracing library adds a header to the outgoing request, the receiving service reads that header, and the
work on the far side attaches to the caller's span. Two services, one trace, with no application code
involved.

## Why a queue breaks it

A queue has no such header, and more importantly no such moment. When the API writes an outbox row, the
request that wrote it has already returned. Seconds later a relay picks that row up in a context of its
own, and a worker consumes it in a third. There is no connection between the producer and the consumer
for a library to attach anything to. The chain is not broken by a bug; it is broken by the design that
makes the seam valuable in the first place.

So the context has to travel as data. Every message on this seam carries a `traceContext` field holding
the trace id and parent span id, in the standard textual format. The worker reads it and starts its
span as a child of a span that ended in another process minutes earlier.

That field was reserved when the seam was first built, before any tracing existed to put in it. Both
processes validate every message against a shared schema, so adding a required field later would have
been a breaking change to a contract two independently deployed things agree on. Reserving a nullable
field cost nothing and turned a migration into an implementation detail.

## The part that is easy to get wrong

Context is captured **in the request that makes the booking**, not in the relay that publishes it.

This looks like a detail and is the whole thing. The relay runs on a timer. When it wakes, the booking
request is long finished and the relay's own context has nothing to do with it. Injecting there would
parent the charge to a timer tick, and one booking would appear as two unrelated traces: a fast HTTP
request that seems to end at the database, and a mysterious charge with no cause. Both look fine
individually. Neither answers the question you opened the trace to ask.

The rule generalizes: capture the context where the *intent* is formed, not where the message happens
to be sent. The outbox row is written inside the booking transaction, so writing the context into that
row at the same moment is both correct and free.

The second trap is load order. Because the library patches clients as they are required, it has to run
before anything it instruments. An import that lands earlier gets the unpatched original and produces
no spans at all — not an error, not a warning, just a trace with a hole where the database should be.
In this codebase the instrumentation import is the first line of both entry points, and it looks
misplaced until you know why it is there.

## What the picture shows

Read left to right, the trace is the architecture.

The request opens a transaction, writes the reservation and its outbox row together, and commits — one
transaction, which is what makes it impossible to have a booking with no intent to charge. Then a gap.
That gap is the relay's polling interval, and it is real latency the outbox costs. It is worth seeing
rather than hiding: it is the price of never losing a charge, made visible.

Then `charge` appears under a different service name, because it is a different process. Beneath it are
the payment ledger writes that make the charge idempotent. Then `settle` crosses back to the API, moves
the reservation to confirmed, and notifies the guest's browser — still inside the same trace, minutes
after the request that started it returned.

A forced payment failure shows up the same way: the compensating path appears as its own spans under
the same trace, so a booking that ended cancelled explains itself as readily as one that succeeded.

## What it costs

Instrumentation is not free, and a trace of a system under load is partly a trace of the tracing. Every
figure published for this system was measured with tracing switched off, and saying so is part of the
measurement — a latency number is meaningless without the conditions that produced it.

The deployed system also runs without it, for a plainer reason: the backend needs more memory than the
instance has. So the trace above documents a local run. That is an honest limitation rather than a
hidden one, and it is recorded in
[../architecture/decisions/0023-deployment-shape.md](../architecture/decisions/0023-deployment-shape.md).

The decision to carry context in the message rather than reconstruct it is in
[../architecture/decisions/0008-trace-context-propagation.md](../architecture/decisions/0008-trace-context-propagation.md),
and the backend choice in
[../architecture/decisions/0020-tracing-backend.md](../architecture/decisions/0020-tracing-backend.md).
The seam this traces is described in [async-seam.md](async-seam.md).

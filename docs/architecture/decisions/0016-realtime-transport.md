# 0016. Socket.IO with a Redis adapter for realtime

Status: Accepted

## Context

A booking made in one browser should appear in another viewing the same listing, without a refresh.
The traffic that needs is one-directional: the server tells clients a reservation changed, and the
client acts by calling the API as it already does.

Two facts constrain the choice. The API can run as more than one instance, and a gateway only knows
the sockets connected to its own process — so a booking handled by one instance is invisible to
everyone connected to another unless something fans it out. That failure mode is quiet: it works
perfectly in development, where there is one instance, and half-fails in production. Redis is already
in the stack for the queue, so a pub/sub bus costs no new infrastructure.

## Decision

Use Socket.IO through the framework's gateway, with the Redis adapter for cross-instance fan-out.
Clients join a room per listing they are viewing, so a change reaches the people looking at that
property and nobody else.

Events are emitted directly rather than through the [transactional outbox](0004-transactional-outbox.md),
and each carries a sequence number that increases per listing. Delivery is best-effort by design; what
makes that safe is described in [../../concepts/realtime-updates.md](../../concepts/realtime-updates.md).

## Consequences

Rooms, reconnection with backoff, and heartbeats come from the library rather than being hand-built,
and adding an API instance needs no change to the gateway.

Correctness cannot rest on delivery, so it does not. A client treats an event as a prompt to re-read
from the API, never as the new state, which is what keeps a lost or duplicated message producing a
late screen rather than a wrong one. A client that detects a gap in the sequence, or that reconnects,
re-reads rather than trusting what it holds.

The sequence is allocated in Redis, not in memory. A per-process counter would restart on deploy and
repeat numbers across instances, which is precisely what would make a gap invisible.

## Alternatives considered

Server-sent events were the serious alternative and are a closer fit on paper: this traffic is
one-directional, SSE is plain HTTP, and the browser has `EventSource` built in with reconnection
included. It has no concept of rooms, so per-listing fan-out and cross-instance delivery would both
have to be written by hand — which is most of what the adapter and rooms already provide.

Polling alone already existed and still runs as the fallback. It cannot be the whole answer, because
the interval is a direct trade between how stale the screen is and how much load the API carries, and
neither end of that trade is good enough for two browsers side by side.

Putting these events through the outbox would make delivery durable. Durability buys nothing here: a
lost notification costs a refresh, not a booking, and the cost of a durable path is real.

## Trade-off

Socket.IO is bidirectional, which is more than this traffic needs, and it speaks its own protocol over
WebSocket — so the client ships the matching library rather than using the browser's built-in
`WebSocket`. We accept that weight in exchange for rooms and cross-instance fan-out that would
otherwise be ours to build and maintain.

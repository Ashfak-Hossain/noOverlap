# Realtime updates

A booking made in one browser shows up in another that is watching the same listing, without a refresh
and without polling for it. The interesting part is not the socket. It is that the whole feature is
built to be wrong-proof when the socket fails, which it will.

## Notifications, not data

An event says *something about this listing changed*. It does not say what the listing now looks like,
and no client writes its contents into a cache.

```json
{
  "type": "reservation.changed",
  "version": 1,
  "listingId": "…",
  "reservationId": "…",
  "status": "CONFIRMED",
  "seq": 42
}
```

Everything a client does with that is the same regardless of which status arrived: drop what it holds
and re-read from the API. That sounds wasteful, and it is the reason the feature is safe. A message
that is lost, duplicated, or delivered out of order produces a screen that is late, never one that is
wrong — and late is recoverable by the read that follows.

The moment a client trusts a pushed payload as the new truth, every delivery guarantee the transport
does not offer becomes a bug it can produce.

## Best-effort on purpose

These events do not go through the [transactional outbox](async-seam.md). That machinery exists so a
charge is never lost, and it costs a table, a relay, and a polling interval. A notification that can
be recovered by re-reading needs none of it: losing one costs a refresh, not a booking. Durability
that buys nothing is only cost.

So delivery is best-effort, and correctness rests somewhere else.

## Gap detection

Every event carries `seq`, a number that increases per listing. A client that saw 41 and then receives
43 knows one never arrived.

That number is allocated in Redis rather than in memory. A per-process counter would restart on deploy
and repeat numbers across instances — which is exactly what would make a gap invisible, in the one
mechanism whose entire job is making gaps visible.

Detection matters less for what it recovers than for what it rules out. Without it a dropped message
is silent, and silence is indistinguishable from nothing having happened. The client cannot tell a
quiet listing from a broken connection, and neither can the person looking at it.

## Reconnecting is not the same as working

Rooms do not survive a reconnect. The server-side socket that held them is gone, and its replacement
has joined nothing. A client that reconnects and does nothing else sits in a healthy-looking
connection that will never deliver another message.

So a client rejoins its rooms on every connect, and re-reads at the same time. Nothing that happened
while it was disconnected can be recovered from the sequence, because none of those events arrived to
carry a number — the gap is in the connection, not in the stream.

This is also why the connection state is shown when it is unhealthy and hidden when it is not. A page
whose updates have quietly stopped looks exactly like a page where nothing is happening.

## Rooms, and what they are not

A client subscribes to the listings it is looking at, so a booking reaches the people viewing that
property rather than everyone connected.

The stream is deliberately unauthenticated, because nothing on it is private: that a listing's
availability moved is the same thing anyone can see by reading the public listing. A reservation id
identifies the change, and reading that reservation still requires being its owner.

One consequence worth stating plainly: which rooms to join has to come from what the user owns, not
from what they have already seen. The host dashboard originally derived its rooms from the bookings it
had loaded, which meant a listing with no bookings was never watched — and the first booking on it,
the single event most worth watching arrive, was the one guaranteed to be missed.

## Polling did not go away

The reserve screen still polls while a reservation is unsettled, and stops the moment it settles. The
socket only shortens the wait.

That is the honest arrangement for a transport with no delivery guarantee. If realtime were the
mechanism rather than an accelerator, one lost event would leave a guest watching "held" forever. Both
paths do the same thing — re-read the reservation — so having both costs nothing but a little
duplicated work, and buys a screen that always settles.

## Related

- [The async seam](async-seam.md) — where durability is the requirement, and what that costs.
- [Showing async work](showing-async-work.md) — polling with a stopping condition, and why booking is
  never optimistic.
- [The booking lifecycle](booking-lifecycle.md) — the transitions these events announce.

# 0018. Reviews carry their listing

Status: Accepted

## Context

A review is written against a reservation. The reservation is the evidence the stay happened, and
being unique per review it is also what limits a guest to one review per booking — enforced by the
database rather than by a check the application could race past.

The read side asks a different question: what do people say about this listing, and what is it rated?
Reservations belong to the booking module, and modules here talk through published interfaces rather
than reading each other's tables (see [0001](0001-modular-monolith-and-worker.md)). Answering a
reviews question by joining through reservations would break that.

The write side has no such problem. Whether a reservation belongs to the caller is asked through the
booking module's service, which also keeps the not-yours-reads-as-missing rule defined in one place
instead of re-derived per caller.

## Decision

Store the listing on the review, written by the server from the reservation it just authorised and
never from the request. Reviews then answers both reads — the list and the rating — against its own
table with one index.

The average rating is computed on read with a single aggregate, not maintained as a column.

## Consequences

Reviews owns its read path: a listing's reviews and its rating are one indexed scan each, with no
dependency on the booking module for reading.

The column is duplicated data, so it needs a rule to stay true. It is set once at insert and never
updated, because a review cannot move to a different stay — there is no second writer to keep in step.
Taking it from the request instead would let a guest attach a genuine review to a property they never
stayed at, which is why the value comes from the authorised reservation.

Adding it required a migration against a table that could already hold rows. The generated migration
added the column `NOT NULL` with no default, which fails on any table that is not empty; it was
rewritten to add the column nullable, backfill it from each review's reservation, and only then make
it required. That distinction is invisible on an empty development database and total in production.

## Alternatives considered

Filtering through the relation needs no migration and is one query, but it reads the booking module's
table to answer a reviews question. Accepting it here would make the boundary rule advisory, which is
the same as not having it.

Asking the booking module for a listing's reservation ids and querying reviews by that list is
strictly boundary-clean and needs no migration. It is two round trips, and the list grows without
bound as a listing accumulates bookings, so the query gets slower the more successful the listing is.

Maintaining a stored average on the listing makes the read cheaper and creates a second copy of the
truth that every write must remember to update, and that drifts silently when something forgets. If
review volume ever makes the aggregate the expensive part of rendering a listing, the answer is a
column updated in the same transaction as the insert, not a cache that can go stale.

## Trade-off

We accept one duplicated column, and the discipline that it is written in exactly one place, in
exchange for a module that answers its own questions without reaching into another's tables or sending
an unbounded list of ids to do it. We also accept recomputing the average per request, which is a
single indexed aggregate at this size, rather than putting a correctness obligation on every write.

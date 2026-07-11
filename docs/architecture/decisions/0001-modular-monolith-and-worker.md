# 0001. A modular monolith with one extracted worker

Status: Accepted

## Context

The system has to serve HTTP requests, keep bookings correct under concurrency, and charge a payment
provider. Charging is the one operation that is slow, can fail, and must not run inside an HTTP request
or a database transaction. Everything else is ordinary request-response work over a single database.
The question is how many deployable pieces this should be.

## Decision

Build a modular monolith for the request path, and extract exactly one worker process for the payment
and notification flow. The monolith holds identity, listings, and booking as separate modules with
strict boundaries but a shared process and database. The worker consumes a queue and talks to the
payment provider on its own.

## Consequences

A booking and the record of its side effects commit in a single database transaction, which removes the
distributed-consistency problems that appear the moment those writes span services. Modules still expose
narrow interfaces and own their own tables, so the boundaries are real even though the deployment is
one unit. The worker introduces a genuine asynchronous boundary: a queue, a message contract, and
at-least-once delivery, on the one seam where that complexity is justified.

## Alternatives considered

A full set of microservices would allow each part to scale and deploy independently. At this scale that
independence is not needed, and it would be bought with network calls between former function calls,
eventual consistency in place of transactions, and a large operational surface. A single monolith with
no worker at all would be simpler still, but it would force a card charge to happen inside the request
or the transaction, which is exactly what must be avoided.

## Trade-off

The system is not independently scalable per component, and one module's resource use is not isolated
from another's. In return, the request path stays transactionally simple, and the one hard asynchronous
problem is contained to a single, well-defined boundary.

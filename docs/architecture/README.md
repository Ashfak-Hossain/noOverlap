# Architecture

noOverlap is a modular monolith with one worker process split off at a single seam. This document
explains that shape, why it was chosen over the alternatives, how a request travels from the client to
the database, and where the boundaries between modules sit. The choices summarized here are recorded in
full in the [decision records](decisions/).

## The short version

Almost everything runs in one NestJS application: identity, listings, and the booking logic. Keeping
them in one process means a booking and its side effects commit in a single database transaction, which
removes a large class of distributed-systems problems before they can start. One job is pulled out into
a separate worker: charging a payment provider. That work does not belong in an HTTP request or a
database transaction, and it is the one place where an asynchronous boundary earns its cost.

## Why a modular monolith

A booking at this scale does not need a fleet of microservices. Splitting the system into independently
deployed services would buy independent scaling and deployment that the project does not need yet, in
exchange for network calls between things that used to be function calls, eventual consistency where a
transaction used to suffice, and a great deal of operational surface. The monolith keeps the request
path simple: a command handler can open a transaction, write a reservation, and record an outbox entry,
and either all of it commits or none of it does.

The design still respects module boundaries as if the pieces might one day be separated. Each module
exposes a narrow service interface and owns its own tables. Nothing reaches across a boundary into
another module's data. That discipline is what would make an extraction mechanical if it were ever
warranted, without paying for it now.

```mermaid
flowchart TB
    Client[React client]

    subgraph Monolith[NestJS monolith]
        direction TB
        Identity[Identity<br/>users, auth, RBAC]
        Listings[Listings<br/>properties, availability]
        Booking[Booking<br/>reservations, the saga]
        Shared[Shared core<br/>error envelope, config, outbox]
    end

    DB[(PostgreSQL<br/>source of truth)]
    Redis[(Redis / BullMQ)]

    subgraph WorkerProc[Worker process]
        Payments[Payments]
        Notifications[Notifications]
    end

    Client -->|HTTP + JWT| Monolith
    Identity --- DB
    Listings --- DB
    Booking --- DB
    Booking -.outbox row.-> DB
    DB -.relay.-> Redis
    Redis -->|consume| WorkerProc
    Payments -->|charge result| DB
```

## The bounded contexts

| Module        | Owns                                                 | Notable machinery                                 |
| ------------- | ---------------------------------------------------- | ------------------------------------------------- |
| Identity      | users, password hashing, JWT access + refresh, roles | Passport strategy, guards, a `@Roles` decorator   |
| Listings      | properties, nightly pricing, availability windows    | owner-scoped CRUD                                 |
| Booking       | the reservation lifecycle, holds, the saga           | a state machine, the exclusion constraint         |
| Payments      | charging a mock provider (runs in the worker)        | idempotency keys, retry, a dead-letter queue      |
| Notifications | email and in-app messages (runs in the worker)       | queue consumer                                    |
| Shared core   | the error envelope, configuration, the outbox        | global filters and pipes, a dynamic config module |

Identity and Listings are supporting contexts. Booking is the core, and it is where the interesting
design lives.

## The request path

A typical write, placing a hold, travels through a fixed set of layers. The controller is the HTTP
boundary and does no thinking. The service holds the domain logic. Prisma is the data access layer. A
global exception filter turns any thrown domain error into a uniform response on the way out.

```mermaid
sequenceDiagram
    participant C as Client
    participant Ct as Controller
    participant Sv as Booking service
    participant DB as PostgreSQL
    participant F as Error filter
    C->>Ct: POST /reservations (+ JWT)
    Ct->>Ct: guard checks token and role
    Ct->>Sv: hold(guestId, dates)
    Sv->>DB: INSERT reservation (HELD)
    alt slot is free
        DB-->>Sv: row committed
        Sv-->>C: 201 Created
    else slot taken
        DB-->>Sv: exclusion violation
        Sv->>F: throw RESERVATION_SLOT_TAKEN
        F-->>C: 409 problem+json
    end
```

Two things are deliberate here. The caller's identity comes from the verified token, never from the
request body, so a client cannot act as someone else. And the service does not check availability before
inserting; it inserts and handles the database's rejection, which is what makes the operation race-free.
Both points are developed in [../concepts/no-overlap.md](../concepts/no-overlap.md) and
[../concepts/access-control.md](../concepts/access-control.md).

## The async seam

Charging a card is slow, can fail, and must never happen twice for one booking. Doing it inside the
booking transaction would hold a database transaction open across a network call to a third party;
doing it inside the HTTP request would make the guest wait on it and lose the work if the process
restarts. So the charge is handed to a worker over a queue.

The handoff uses a transactional outbox. In the same transaction that writes the `HELD` reservation, the
booking service writes a row to an outbox table describing the charge to perform. Because both writes
share one transaction, they commit together or not at all: there is no state where the reservation
exists but the intent to charge was lost, and none where a charge was queued for a booking that rolled
back. A relay reads unpublished outbox rows and pushes them onto the queue; the worker consumes them,
charges the provider with an idempotency key, and writes the result back. Delivery is at-least-once, and
idempotency is what makes that safe. This part of the system is being built; the decision behind it is
recorded in [decisions/0004-transactional-outbox.md](decisions/0004-transactional-outbox.md).

## Data model

The load-bearing tables are `users`, `listings`, `availability_blocks`, `reservations`, `payments`, and
`outbox`. A few conventions run throughout: money is stored as integer cents, never a floating-point
value, so arithmetic is exact; every timestamp is stored with its time zone; and response objects are
projections that select only the fields meant to leave the API, so an internal column cannot be
serialized to a client by accident. The vocabulary is collected in [../glossary.md](../glossary.md).

## Observability and deployment

Structured logs carry a correlation id from the HTTP request through the saga and across the queue into
the worker, so a single booking can be followed end to end. Traces span the asynchronous boundary, which
is where a picture explains more than prose. The system deploys as a set of containers: the API, the
worker, PostgreSQL, and Redis. These pieces are on the roadmap and will be documented as they land.

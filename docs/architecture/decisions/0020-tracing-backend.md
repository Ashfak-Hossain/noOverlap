# 0020. Jaeger as the tracing backend

Status: Accepted

## Context

A booking spans two processes joined by a table and a queue, and the single most useful thing that can
be said about that design is a picture of one booking crossing it. Producing that picture needs
somewhere to collect and view traces.

Both processes export OpenTelemetry over OTLP, which is vendor-neutral, so nothing in the application
code names a backend. The choice is about what runs alongside the other containers and what it costs
to stand up.

## Decision

Run Jaeger, in its all-in-one form, ingesting OTLP directly from both services. Traces are searched
and read in its own interface.

## Consequences

One container, added to the existing set, with no collector to configure and no separate storage to
provision. Producing the deliverable is: make a booking, open the interface, find the trace. Because
the export path is vendor-neutral, replacing this later changes the container definition and not a
line of application code.

The all-in-one image keeps traces in memory, so they do not survive a restart. That is right for this
use, where traces are captured to be looked at rather than retained, and it is the first thing that
would have to change in a deployment that needed history.

## Alternatives considered

Grafana Tempo with Grafana in front is the stronger production story, particularly if metrics later
land in the same place and traces and metrics can be read side by side. It costs more to stand up — a
Tempo configuration, a Grafana datasource — and its trace search leans on a query language or on
already knowing the trace id, where Jaeger lets you browse. For the same picture it is more moving
parts, and the unification it offers has nothing yet to unify with.

An OpenTelemetry Collector between the services and the backend is the shape this would take at scale:
applications export once, the collector fans out. With one backend and two services it is a hop that
buys nothing, and leaving it out keeps the set of running containers legible.

## Trade-off

We accept a backend that forgets everything on restart, and a topology further from production than a
collector-based one, in exchange for the least machinery between a booking and the image that explains
the architecture. Because the export path is standard, that trade is reversible cheaply.

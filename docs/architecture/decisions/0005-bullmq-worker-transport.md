# 0005. BullMQ on Redis as the worker transport

Status: Accepted

## Context

The monolith and the worker communicate over a queue: the relay puts charge jobs on it, and the worker
consumes them. The queue needs retries with backoff for transient failures and a place to put messages
that fail repeatedly, so a poisonous message does not loop forever or vanish. The system already runs
Redis for caching and the realtime layer.

## Decision

Use BullMQ, backed by Redis, as the transport between the monolith and the worker. It provides job
queues with retry, exponential backoff, and a dead-letter destination, and it runs on the Redis instance
already in the stack.

## Consequences

No new infrastructure is introduced; the queue lives on Redis, which is already operated and monitored.
The reliability features the payment flow needs, retry with backoff and a dead-letter queue, come from
the library rather than being hand-built. The worker's contract with the monolith is a BullMQ job
payload, validated on both ends.

## Alternatives considered

A dedicated message broker such as RabbitMQ or a log like Kafka offers richer delivery semantics and
stronger ordering and durability guarantees. Those guarantees are not required here, and either would add
a new system to run and reason about. A NestJS transport over a different protocol was also possible but
would trade the batteries-included retry and dead-letter handling for more wiring.

## Trade-off

Redis-backed queues are less durable and feature-rich than a purpose-built broker, and the queue shares
an instance with other Redis uses. For this workload that is an acceptable ceiling, and it is bought
with zero added infrastructure and reliability features that work out of the box.

# 0008. Trace context travels with the message

Status: Accepted

## Context

A booking starts as an HTTP request and finishes in a different process some seconds later, after a
queue hop. Tracing tools stitch a request together by passing a trace identifier down the call chain,
but a queue breaks that chain: the worker picks up a job with no memory of what caused it. Without
help, the booking shows up as two unrelated fragments — a request that ends at a database write, and a
charge that appears from nowhere.

The message contract is shared between the API and the worker and is validated on both ends, so adding
a field to it later means changing both sides in step. That makes the shape worth settling before the
contract is depended upon rather than after.

## Decision

Carry W3C Trace Context with the message. The event schema includes an optional `traceContext` field
holding `traceparent` and, when present, `tracestate`. The producer captures the current trace context
when it writes the event, and the worker extracts it and starts its own span as a child, so the charge
appears under the trace that caused it.

The field is reserved in the contract now and populated when tracing is instrumented. It is optional
precisely so it can be left empty until then: a placeholder value would be a fabricated trace id, which
is worse than none.

## Consequences

The message contract carries a small field that is not yet read. In exchange, adding tracing later is
an additive change to producers and consumers rather than a breaking change to a schema that both sides
validate against.

Because the same identifier is available on both sides of the queue, logs from the API and the worker
can be correlated for a single booking even before a tracing backend is in place.

## Alternatives considered

Letting each process trace independently needs no coordination at all, and produces exactly the
disconnected fragments described above. The most interesting part of the system — what happens after
the request returns — would be the part no trace covers.

Using the queue's own job identifier as the correlator would tie the two sides together loosely, but it
is not a trace context: it carries no sampling decision and no parent span, so tools cannot assemble a
single trace from it.

Adding the field later, only when tracing is built, avoids carrying an unused field. It also means a
coordinated change to a validated contract across two deployables, for the sake of a few bytes.

## Trade-off

An unused field sits in the contract until tracing lands. That is a small, deliberate cost paid to keep
the change additive, on a schema that two independently deployed processes both validate.

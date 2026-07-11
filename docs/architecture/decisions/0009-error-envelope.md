# 0009. One error envelope, RFC 7807

Status: Accepted

## Context

An API fails in many ways: invalid input, a missing resource, a permission denial, a booking conflict, an
unexpected crash. If each endpoint reports failure in its own shape, the client has to handle a different
format per route, and the server has no single place to decide what a failure should reveal. Both are
sources of bugs and of accidental information disclosure.

## Decision

Return every error as an RFC 7807 `problem+json` document, with the same members throughout: a `type`
identifying the class of problem, a `title`, the `status`, a `detail`, and an `instance` correlation id.
A central catalog maps each domain error code to its status and title, and a single global exception
filter renders every error, from any source, into that shape. The design is described in
[../../concepts/error-model.md](../../concepts/error-model.md).

## Consequences

The client learns one error structure and can branch on the stable `type`. Services throw a domain code
and never assemble error JSON, because the catalog decides the status and the filter builds the response.
The single filter is also the one place to enforce that a server error returns a generic body while the
real cause is logged, so internals never leak. Validation failures pass through the same envelope with no
per-endpoint code.

## Alternatives considered

Ad-hoc error shapes per endpoint are the default if nothing is decided, and they produce exactly the
inconsistency and leakage this avoids. A custom in-house error format would also work but would reinvent
a standard that clients and tools already understand; adopting RFC 7807 gets that interoperability for
free.

## Trade-off

Every error path is routed through one filter and one catalog, which is a small amount of upfront
structure and indirection. In exchange, failure is uniform for the client and controlled in one place on
the server.

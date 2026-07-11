# 0012. Testcontainers for integration tests

Status: Accepted

## Context

The behaviors that matter most in this system depend on PostgreSQL itself. The no-overlap guarantee is a
database constraint; the booking transitions are database writes. A test that mocks the database cannot
exercise any of this, because the thing being tested is precisely what the mock does not do. The tests
that prove the guarantees have to run against a real database.

## Decision

Run the integration suite against a real, disposable PostgreSQL started by Testcontainers. Each run boots
a container, applies the actual migrations, runs the tests over HTTP against it, and discards it. The same
setup runs locally and in continuous integration. How the layers are tested is described in
[../../concepts/testing.md](../../concepts/testing.md).

## Consequences

The tests exercise the exact constraint, index, extension, and migrations that ship, so a test passing
means the real database accepts or rejects what it should. Developers get a clean database on every run
without provisioning anything, and continuous integration runs the identical suite. The suite depends on
a container runtime being available and is slower than pure unit tests.

## Alternatives considered

Mocking the repository is fast but proves nothing about the constraint, since a mock cannot reject an
overlap. A shared, long-lived test database avoids container startup but leaks state between runs and
between developers, and drifts from the migrations over time. A managed database service in continuous
integration would work but ties the tests to that environment rather than reproducing locally.

## Trade-off

The integration suite needs Docker and runs slower than unit tests. In return, the tests that guard the
system's core properties run against the real database behavior those properties depend on, rather than a
stand-in that cannot fail the way production would.

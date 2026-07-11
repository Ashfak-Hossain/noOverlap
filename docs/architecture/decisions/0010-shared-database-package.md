# 0010. The database schema and client in a shared package

Status: Accepted

## Context

Both the API and the worker read and write the same database. If each owned its own copy of the schema
definition and the generated client, the two copies could drift, and a schema change would have to be
applied and regenerated in two places, with nothing catching a mismatch until runtime.

## Decision

Put the database schema, its migrations, and the generated client in a single workspace package that both
the API and the worker depend on. There is one definition of the tables and one client, imported wherever
the database is touched.

## Consequences

A schema change happens once, in one package, and both runtimes pick up the regenerated client through
their dependency on it. The two processes cannot disagree about the shape of the data. Migrations have a
single home, and the build graph knows that the API and the worker depend on the database package being
built first.

## Alternatives considered

Each service defining its own schema would allow them to evolve separately, which is a feature in a
system where services own disjoint data, and a liability here where they share one database. Duplicating
the generated client without a shared source would reintroduce exactly the drift this prevents.

## Trade-off

The API and the worker are coupled to a shared package and to each other's view of the database, so a
schema change touches both by construction. That coupling is intentional: it is what keeps them from
silently disagreeing.

# 0002. Prisma, with raw SQL for the exclusion constraint

Status: Accepted

## Context

The application needs a way to read and write the database that is productive and type-safe, and it also
needs a piece of schema no ORM can express: the exclusion constraint that prevents double-booking (see
[0003](0003-exclusion-constraint.md)). These two needs pull in different directions. An ORM optimizes
for the common case; the constraint is an uncommon case the ORM does not model.

## Decision

Use Prisma for everyday reads, writes, and migrations, and add the exclusion constraint through a raw
SQL migration applied alongside Prisma's generated migrations. Prisma owns the schema it can describe;
the one thing it cannot describe is hand-written and lives beside the rest.

## Consequences

Day-to-day data access gets a typed client and a clear migration workflow. The exclusion constraint is
defined in plain SQL, so it can be exactly what PostgreSQL needs, including the `btree_gist` extension
and the partial predicate. The migration history therefore has two kinds of entries, generated and
hand-written, and both are applied in order as part of the normal migration step.

## Alternatives considered

A different ORM with tighter support for raw constraints and locking, such as TypeORM, would keep more
of the schema inside one tool. It was not chosen because the rest of Prisma's experience is preferable
and the constraint is a single, well-contained exception. Writing all data access in raw SQL would give
total control at the cost of the type safety and migration tooling that make the common path fast and
safe.

## Trade-off

The schema has two sources of truth for migrations rather than one, and a contributor has to know that
the constraint is not in the Prisma schema file. That small amount of friction buys a good developer
experience everywhere the ORM is capable and full control exactly where it is not.

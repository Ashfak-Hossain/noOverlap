# 0006. A monorepo with Turborepo and pnpm

Status: Accepted

## Context

The project has more than one deployable, the API and the worker, and they share things: the database
schema and client, and the message contracts that cross the queue between them. Those shared pieces have
to stay in sync, or a change on one side silently breaks the other. How the code is organized across
repositories determines how that sync is enforced.

## Decision

Keep everything in one repository, managed with Turborepo and pnpm workspaces. The API and the worker are
workspace packages, and the shared database client and contracts are their own packages that both depend
on. Turborepo runs builds, lints, and tests across the workspace with caching.

## Consequences

The API and the worker import the same definition of the data and the same message types, so their views
cannot drift; a breaking change surfaces at build time in one place. A single install and a single task
runner cover the whole project, and continuous integration runs one pipeline. The repository is larger
and its tooling slightly more involved than a single-package project.

## Alternatives considered

Separate repositories per deployable would isolate the pieces and their release cycles. The cost is that
the shared schema and contracts would have to be versioned and published across repository boundaries,
turning an import into a release process and making a mismatch a runtime surprise rather than a build
error. The isolation is not worth that friction at this size.

## Trade-off

A monorepo couples the pieces' tooling and history and needs a workspace-aware build to stay fast. In
return, the shared contract between the API and the worker is a single import that cannot fall out of
sync.

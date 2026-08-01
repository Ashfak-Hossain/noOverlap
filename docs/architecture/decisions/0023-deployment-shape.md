# 0023. A managed host, with images built elsewhere

Status: Accepted

## Context

The deployment target is one instance with a single core and two gigabytes of memory, running a
self-hosted panel that already provides a reverse proxy, certificate issuance, and managed PostgreSQL
and Redis.

Four forces shaped the arrangement, and they pull against each other.

The instance is small. Two gigabytes runs the application comfortably and does not also run the
toolchain that produces it. A build compiling four images competes for memory with the database it is
deploying next to, at the moment that database can least afford it.

Stateful services need backups and a lifecycle that a Compose file in a repository does not give them.
A `postgres` service with a named volume is one careless command away from being gone, and nothing in
this repository would have taken a backup of it.

The refresh token is an httpOnly cookie, which a browser returns only to the origin that set it. The
client and the API therefore cannot live on separate hostnames without either abandoning that cookie or
building a cross-origin arrangement to work around it. This is a constraint rather than a preference.

And tracing is expensive to host. The tracing backend measured over a gigabyte of resident memory, more
than half the instance. An exporter left configured with nothing collecting is worse than useless: it
retries failed sends indefinitely instead of quietly giving up.

Against all of that sits one thing worth protecting. The deployable shape of a system should be
readable from its repository, not reconstructed from a control panel's forms.

## Decision

The production Compose file contains exactly the four things rebuilt from source: the API, the worker,
a migration job, and the compiled client. PostgreSQL and Redis stay under the panel's management and
are reached through the environment. The stack joins the panel's existing network rather than creating
one, so the proxy can route to it.

Images are built by the pipeline on every push to the default branch and published under two tags —
`latest`, which the deployment follows, and the commit sha, which is what a rollback names. The tag is
a variable in the Compose file, so pinning to an earlier build is a one-line operation. Nothing is
compiled on the host.

Migrations run as a service that runs to completion, with both application services depending on its
successful exit. It uses a separate image, because applying a migration needs schema tooling that the
runtime images deliberately do not carry.

The client and the API share one origin, routed by path priority: the realtime path first, then `/api`
with the prefix stripped, then the client as a catch-all.

Tracing is disabled in production. The trace that documents the architecture was captured locally.

## Consequences

A deploy is a push. The build runs where memory is free and the instance only pulls, so deploying costs
the running system almost nothing.

Rollback is pinning a tag, which is possible only because every build is published under an immutable
one. It does not extend across a destructive migration, and that limit belongs wherever rollback is
documented rather than being discovered during an incident.

A failed migration becomes a deploy that does not happen: the job exits non-zero, the dependent
services never start, and the previous containers keep serving. That failure mode falls out of the
dependency condition rather than from anything defensive in the application.

The repository no longer describes the whole system. Two containers are configured elsewhere and their
connection details live only in the panel. Reproducing this deployment needs both halves, which is the
real cost of the arrangement.

Same-origin routing has a sharp edge. The client's rule is a catch-all, so when the API container is
not running its routing labels are absent and requests to `/api` fall through and return the client's
HTML with a 200. The symptom looks nothing like its cause, which is why
[operations.md](../operations.md) names it explicitly.

Production produces no traces. A latency question there has to be answered from metrics or logs.

## Alternatives considered

Putting PostgreSQL and Redis in the same Compose file would let the repository describe the entire
system, and a fresh machine would reach a working state from a single file. It gives up managed backups
and leaves the durable data one careless command from deletion, buying a completeness that matters to a
reader rather than to the running system. The data is the part that cannot be rebuilt from git; the
containers are the part that can.

Building on the host means fewer moving parts, no registry, and an artifact that provably matches the
checkout. On two gigabytes shared with a database, it also means a memory spike during every deploy,
with the database as the thing that gets starved.

Separate hostnames for the client and the API is the conventional split and makes the routing rules
trivial. It breaks the refresh cookie, and the workaround's failure mode is users being silently signed
out whenever they reload. That is a poor trade for avoiding three routing rules.

A managed platform would remove the operational surface entirely, along with the part of this project
that demonstrates understanding it. A persistent process plus a worker plus Redis is also the expensive
quadrant of most of their pricing.

Running the tracing backend in production would give live traces, which are far more useful than a
captured one. It does not fit in the memory available, so the honest options were a larger instance or
no tracing.

## Trade-off

We accept that the repository describes only the part of the system it builds, in exchange for managed
durability on the part that cannot be rebuilt from source.

We accept a registry and a pipeline between commit and deploy, in exchange for never compiling on an
instance too small to do it safely. A deploy now waits on a build, and a green build that failed to
publish would leave the deployment quietly running the previous version.

And we accept no production tracing, which means the strongest observability artifact in these docs
describes a local run rather than the live system.

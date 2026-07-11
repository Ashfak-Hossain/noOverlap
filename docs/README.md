# Documentation

This is the reference for noOverlap: how the system is built, the ideas it rests on, and the reasons
behind the choices that shaped it. Each page stands on its own and opens with a short summary, so you
can skim for the shape of a thing or read down for the depth.

If you are new here, the [root README](../README.md) is the fastest way to understand what the project
is and see the one guarantee it is built around.

## Where to start

Read in whatever order suits you; this is the path that builds up cleanly.

1. [architecture/](architecture/) — the shape of the system: the modular monolith, the request path,
   and the seam where a worker is split off.
2. [concepts/no-overlap.md](concepts/no-overlap.md) — the core idea, double-booking prevention, and why
   the obvious approaches fail.
3. [concepts/](concepts/) — the rest of the ideas behind the system, one topic per page.
4. [architecture/decisions/](architecture/decisions/) — the record of significant choices and the
   trade-off each one accepts.

## Map

| Area                                       | What it holds                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| [architecture/](architecture/)             | the system shape, the request-to-database path, and the decision records   |
| [concepts/](concepts/)                     | the learning core: no-overlap, the booking lifecycle, auth, access control, the error model, testing |
| [architecture/decisions/](architecture/decisions/) | Architecture Decision Records: what was chosen, why, and what it cost |
| [glossary.md](glossary.md)                 | the vocabulary in one place                                                |

## How these docs are maintained

The documentation moves with the code rather than trailing it. When a part of the system is built, the
page that explains it is written or updated in the same stretch of work, and every significant decision
is recorded as it is made. The aim is that a reader can always trust the docs to describe what actually
exists.

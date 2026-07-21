# Decision records

The significant, hard-to-reverse choices behind noOverlap, one per record. Each states the problem, the
decision, what the decision makes easier or harder, the alternatives considered, and the cost knowingly
accepted. A record that only listed upsides would be hiding the engineering.

These records are append-only. Once a decision is accepted it is not edited away; if it is ever
reversed, a new record supersedes it and says why. That history is the point: the reasoning stays
readable long after the choice was made.

| Record                                      | Decision                                               | Status   |
| ------------------------------------------- | ------------------------------------------------------ | -------- |
| [0001](0001-modular-monolith-and-worker.md) | A modular monolith with one extracted worker           | Accepted |
| [0002](0002-prisma-with-raw-sql.md)         | Prisma, with raw SQL for the exclusion constraint      | Accepted |
| [0003](0003-exclusion-constraint.md)        | A GiST exclusion constraint for no-overlap             | Accepted |
| [0004](0004-transactional-outbox.md)        | A transactional outbox for the async seam              | Accepted |
| [0005](0005-bullmq-worker-transport.md)     | BullMQ on Redis as the worker transport                | Accepted |
| [0006](0006-monorepo.md)                    | A monorepo with Turborepo and pnpm                     | Accepted |
| [0007](0007-polling-relay.md)               | A polling relay moves outbox rows to the queue         | Accepted |
| [0008](0008-trace-context-propagation.md)   | Trace context travels with the message                 | Accepted |
| [0009](0009-error-envelope.md)              | One error envelope, RFC 7807                           | Accepted |
| [0010](0010-shared-database-package.md)     | The database schema and client in a shared package     | Accepted |
| [0011](0011-auth-tokens.md)                 | RS256 access tokens, rotating refresh tokens, Argon2id | Accepted |
| [0012](0012-testcontainers.md)              | Testcontainers for integration tests                   | Accepted |
| [0013](0013-saga-state-machine-first.md)    | The booking saga as a state machine first              | Accepted |
| [0014](0014-frontend-stack.md)              | Tailwind and React Router for the web client           | Accepted |
| [0015](0015-client-token-handling.md)       | The access token lives in memory                       | Accepted |

Numbers are assigned when a decision is taken and never reused, so the sequence reflects the order the
questions actually arose. Records for parts of the system not yet built are written when that work
lands, rather than speculatively ahead of it.

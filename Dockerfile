# syntax=docker/dockerfile:1
#
# Runtime image for either Node service. The API and the worker share a lockfile, a database package
# and a message contract, and differ only in which entry point they run — so they are built from one
# file rather than two that would agree today and drift by degrees.
#
#   docker build --build-arg APP=api    -t nooverlap-api .
#   docker build --build-arg APP=worker -t nooverlap-worker .
#
# The context is the repository root because a pnpm workspace cannot be installed from inside one of
# its packages: the lockfile and the sibling packages it links to live above.

ARG NODE_VERSION=26-slim
# Kept in step with the `packageManager` field by hand. Node no longer ships corepack, which used to
# read that field and fetch the matching version on its own, so the version is pinned here instead —
# installing whatever is latest would let the image's dependency resolution drift from the lockfile's.
ARG PNPM_VERSION=11.15.1

# Debian rather than Alpine: Prisma's engines are linked against glibc, and the musl builds need extra
# handling that buys nothing here.
FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
RUN npm install --global --no-fund --no-audit pnpm@${PNPM_VERSION}
WORKDIR /repo

# ---------------------------------------------------------------------------
# Dependencies. Only the manifests are copied first, so this layer is reused on
# every build where dependencies have not changed — which is most of them.
# ---------------------------------------------------------------------------
FROM base AS deps
# Generating the Prisma client reads the schema and never opens a connection, but the config resolves
# the connection string eagerly and fails without one. This placeholder satisfies that and nothing
# else: it is a build argument, so it is confined to this stage and never reaches the runtime image,
# where the real value arrives from the environment.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
# A build has no terminal, and pnpm refuses to clear a modules directory without one unless told it is
# running unattended. Declared here rather than in the shared base so it stays out of the final image.
ENV CI=true
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
# The database package generates its client on install, so its schema has to be present before the
# install runs rather than arriving later with the rest of the source.
COPY packages/db/prisma packages/db/prisma
COPY packages/db/prisma.config.ts packages/db/
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Build. The filter builds this service and everything it depends on, and
# nothing else — the web client has no business in either image.
# ---------------------------------------------------------------------------
FROM deps AS build
ARG APP
# Same placeholder, same reason: the build regenerates the client, and the reinstall below would too.
# Build arguments do not cross stage boundaries, so it is restated rather than inherited.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY . .
RUN pnpm turbo run build --filter=${APP}...

# ---------------------------------------------------------------------------
# Migrator. Applies pending migrations and exits, which is a job rather than a
# service — run once per deployment, before anything serves traffic.
#
# Built from the unpruned tree on purpose: applying a migration needs the Prisma
# CLI, which is a development dependency and is therefore absent from the
# runtime image below. Keeping the two separate means the images that run
# continuously carry no tooling capable of altering the schema.
# ---------------------------------------------------------------------------
FROM build AS migrate
WORKDIR /repo/packages/db
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# Prune. Re-resolve without development dependencies, leaving the compiled
# output in place: what remains is the same tree minus every compiler, linter
# and test runner used to produce it.
#
# Install scripts are skipped because they have already run. The database
# package generates its client on install using the Prisma CLI — so letting the
# scripts run here would invoke a tool this very command has just removed.
# ---------------------------------------------------------------------------
FROM build AS prune
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# ---------------------------------------------------------------------------
# Runtime.
# ---------------------------------------------------------------------------
FROM base AS runtime
ARG APP
ENV NODE_ENV=production
# A named user rather than root: a process that only needs to read its own code and open a socket has
# no reason to be able to write to the image.
RUN useradd --system --create-home --shell /usr/sbin/nologin nooverlap
COPY --from=prune --chown=nooverlap:nooverlap /repo /repo
USER nooverlap
# The working directory carries the service identity, which keeps the command below identical for both
# and in exec form — so the process is the container's first process and receives its stop signal
# directly, rather than through a shell that would swallow it and defeat graceful shutdown.
WORKDIR /repo/apps/${APP}
CMD ["node", "dist/main.js"]

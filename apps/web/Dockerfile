# syntax=docker/dockerfile:1
#
# The web client: compiled to static files and served by nginx. Built from the repository root, like
# the services, because the client shares the workspace's lockfile and its realtime contract.
#
#   docker build -f apps/web/Dockerfile -t nooverlap-web .

ARG NODE_VERSION=26-slim
ARG PNPM_VERSION=11.15.1

FROM node:${NODE_VERSION} AS build
ARG PNPM_VERSION
RUN npm install --global --no-fund --no-audit pnpm@${PNPM_VERSION}
ENV CI=true
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/db/prisma packages/db/prisma
COPY packages/db/prisma.config.ts packages/db/
# The database package generates a client on install and its config wants a connection string, though
# nothing here will ever connect. The client does not depend on that package, but the install covers
# the whole workspace, so the placeholder is still needed to get through it.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm turbo run build --filter=web...

# ---------------------------------------------------------------------------
# Serve. Static files only — no Node at runtime, which is why this image is a
# tenth the size of the service images.
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80

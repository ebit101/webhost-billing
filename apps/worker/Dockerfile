# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.22.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --filter @webhost-billing/worker... --frozen-lockfile

COPY . .
RUN pnpm build:packages \
  && pnpm --filter @webhost-billing/worker build \
  && pnpm --filter @webhost-billing/worker deploy --legacy --prod /opt/worker

FROM node:24-bookworm-slim AS worker

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 10001 app \
  && useradd --uid 10001 --gid app --create-home --home-dir /home/app app
COPY --from=builder --chown=app:app /opt/worker/ ./
COPY --chown=app:app deploy/production/app-entrypoint.sh /usr/local/bin/app-entrypoint

USER 10001:10001
ENTRYPOINT ["/usr/local/bin/app-entrypoint"]
CMD ["node", "dist/main.js"]

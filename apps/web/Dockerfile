# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS builder

ARG NEXT_PUBLIC_API_URL
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --filter @webhost-billing/web... --frozen-lockfile

COPY . .
RUN pnpm --filter @webhost-billing/config build \
  && pnpm --filter @webhost-billing/shared build \
  && pnpm --filter @webhost-billing/web build

FROM node:24-bookworm-slim AS web

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app/apps/web

RUN groupadd --gid 10001 app \
  && useradd --uid 10001 --gid app --create-home --home-dir /home/app app
COPY --from=builder --chown=app:app /workspace/apps/web/.next/standalone/ /app/
COPY --from=builder --chown=app:app /workspace/apps/web/.next/static/ ./.next/static/
COPY --from=builder --chown=app:app /workspace/apps/web/public/ ./public/

USER 10001:10001
EXPOSE 3000
CMD ["node", "server.js"]

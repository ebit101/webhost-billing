# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS builder

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_BRAND_NAME
ARG NEXT_PUBLIC_BRAND_LOGO_PATH
ARG NEXT_PUBLIC_BRAND_LOGO_WIDTH
ARG NEXT_PUBLIC_BRAND_LOGO_HEIGHT
ARG NEXT_PUBLIC_BRAND_TAGLINE
ARG NEXT_PUBLIC_BRAND_CONTACT_EMAIL
ARG NEXT_PUBLIC_BRAND_CONTACT_PHONE
ARG NEXT_PUBLIC_BRAND_CONTACT_ADDRESS
ARG NEXT_PUBLIC_BRAND_WEBSITE
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BRAND_NAME=$NEXT_PUBLIC_BRAND_NAME
ENV NEXT_PUBLIC_BRAND_LOGO_PATH=$NEXT_PUBLIC_BRAND_LOGO_PATH
ENV NEXT_PUBLIC_BRAND_LOGO_WIDTH=$NEXT_PUBLIC_BRAND_LOGO_WIDTH
ENV NEXT_PUBLIC_BRAND_LOGO_HEIGHT=$NEXT_PUBLIC_BRAND_LOGO_HEIGHT
ENV NEXT_PUBLIC_BRAND_TAGLINE=$NEXT_PUBLIC_BRAND_TAGLINE
ENV NEXT_PUBLIC_BRAND_CONTACT_EMAIL=$NEXT_PUBLIC_BRAND_CONTACT_EMAIL
ENV NEXT_PUBLIC_BRAND_CONTACT_PHONE=$NEXT_PUBLIC_BRAND_CONTACT_PHONE
ENV NEXT_PUBLIC_BRAND_CONTACT_ADDRESS=$NEXT_PUBLIC_BRAND_CONTACT_ADDRESS
ENV NEXT_PUBLIC_BRAND_WEBSITE=$NEXT_PUBLIC_BRAND_WEBSITE
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ ./patches/
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

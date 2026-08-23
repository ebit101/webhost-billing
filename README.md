# Webhost Billing

Webhost Billing is a private billing and hosting-service management application for a single web-hosting business. It focuses on customer accounts, products, orders, invoices, payments, hosting provisioning, renewals, and support without reproducing the worldwide feature set of WHMCS.

## Architecture

```text
apps/api       NestJS REST API
apps/web       Next.js App Router frontend
apps/worker    NestJS worker application context
packages/config
packages/shared
```

The workspace uses Node.js 24 LTS, pnpm, TypeScript, PostgreSQL, Prisma, Redis, and BullMQ.

## Requirements

- Node.js 24 LTS and pnpm 11.22, or Docker
- Git

## Install and validate

```bash
corepack enable
corepack prepare pnpm@11.22.0 --activate
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Never commit populated `.env` files. Copy `.env.example` only when local configuration is needed.

Start the local PostgreSQL and Redis services with:

```bash
cp .env.example .env
docker compose up --detach --wait postgres redis
```

See `docs/DEVELOPMENT.md` for setup, health checks, connectivity, shutdown, and safe reset procedures.

## Project documentation

- `HOSTING_BILLING_SYSTEM_PLAN.md` — product requirements and architecture
- `CODEX_DEVELOPMENT_COMMANDS.md` — ordered development commands
- `docs/DECISIONS.md` — durable architecture decisions
- `docs/DEVELOPMENT.md` — local infrastructure and application setup
- `docs/PROGRESS.md` — command-by-command implementation reports

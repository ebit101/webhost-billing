# Webhost Billing

Webhost Billing is a private billing and hosting-service management application for a single web-hosting business. It focuses on customer accounts, products, orders, invoices, payments, hosting provisioning, renewals, and support without reproducing the worldwide feature set of WHMCS.

## Architecture

```text
apps/api       NestJS REST API
apps/web       Next.js App Router frontend
apps/worker    NestJS worker application context
               and dedicated scheduler entry point
packages/config
packages/database
packages/queue
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
pnpm --filter @webhost-billing/web exec playwright install chromium
pnpm test:e2e
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
- `docs/API_CONTRACTS.md` — shared runtime contracts, money serialization, and API errors
- `docs/AUTHENTICATION.md` — authentication flows, cookies, CSRF, authorization, and sessions
- `docs/SECURITY_HARDENING.md` — Command 24 controls, verification evidence, residual risks, and production checklist
- `docs/CRITICAL_BUSINESS_INVARIANTS.md` — Command 25 invariant matrix, focused test command, and failure interpretation
- `docs/END_TO_END_TESTING.md` — isolated Playwright lifecycle, test-data boundaries, failure artifacts, and local execution
- `docs/OBSERVABILITY.md` — structured logging, correlation, health/readiness, operational metrics, and administrator alert policy
- `docs/BACKUP_AND_RECOVERY.md` — encrypted PostgreSQL backups, isolated restores, migration recovery, secrets recovery, and disaster checklist
- `docs/PRODUCTION_DEPLOYMENT.md` — production Compose/Nginx topology, HTTPS, secrets, storage, migration, deployment, and rollback runbooks
- `docs/CUSTOMER_MANAGEMENT.md` — customer API, authorization, account-access rules, and interfaces
- `docs/PRODUCTS_AND_PRICING.md` — product lifecycle, versioned prices, public catalogue, and selection flow
- `docs/ORDER_CREATION.md` — authoritative checkout, idempotency, snapshots, numbering, and order states
- `docs/INVOICES.md` — calculation rules, drafts, issued history, identity snapshots, states, printing, and PDF downloads
- `docs/MANUAL_PAYMENTS.md` — manual proof, review, settlement, concurrency, refunds, and reversals
- `docs/PAYMENT_GATEWAYS.md` — bKash/SSLCOMMERZ sandbox setup, gateway contracts, callbacks, reconciliation, replay protection, and outbox handoff
- `docs/SERVICES.md` — service creation, snapshots, lifecycle, authorization, and administrator/customer workflows
- `docs/HOSTING_PANELS.md` — real cPanel/WHM API-token setup, encrypted credentials, operation safety, manual verification, and separate UK2Group scope
- `docs/BACKGROUND_JOBS.md` — BullMQ queues, transactional outbox dispatch, retries, failure visibility, and worker shutdown
- `docs/EMAIL_NOTIFICATIONS.md` — queued SMTP delivery, templates, preview files, retries, secret boundaries, and operations
- `docs/RENEWAL_AUTOMATION.md` — renewal policy, scheduler locking, invoice/reminder lifecycle, and safe cPanel suspension/reactivation
- `docs/SUPPORT_TICKETS.md` — customer/admin ticket workflows, ownership, plain-text policy, audit, and reply emails
- `docs/DASHBOARDS_AND_REPORTS.md` — live metric definitions, business-date periods, audited CSV exports, and report safety
- `docs/DATABASE.md` — schema, migration, deletion, and seed-data decisions
- `docs/DEVELOPMENT.md` — local infrastructure and application setup
- `docs/FRONTEND_DESIGN_SYSTEM.md` — application shells, design tokens, responsive behavior, and UI components
- `docs/PROGRESS.md` — command-by-command implementation reports

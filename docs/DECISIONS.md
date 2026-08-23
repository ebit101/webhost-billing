# Webhost Billing Architecture Decisions

This document records durable technical and product decisions. New decisions should be appended and existing decisions superseded explicitly rather than silently rewritten.

## ADR-001 — TypeScript Modular Monorepo

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Use a pnpm TypeScript monorepo containing a NestJS REST API, Next.js App Router frontend, NestJS/BullMQ worker and scheduler processes, and shared packages.
- **Reason:** TypeScript is the preferred implementation language. A monorepo allows shared types and validation while keeping deployment boundaries explicit.
- **Consequence:** The frontend and API remain separate applications, but the backend remains a modular monolith rather than a microservice system.

## ADR-002 — PostgreSQL, Prisma, Redis, and BullMQ

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Use PostgreSQL as the system of record, Prisma as the database toolkit, Redis for queues, and BullMQ for background processing.
- **Reason:** The application needs transactions, constraints, safe concurrency, scheduled work, and observable retry behavior.
- **Consequence:** Local development and deployment require PostgreSQL and Redis. The cPanel server's MariaDB instance will not be used by this application.

## ADR-003 — Integer Money and Immutable Financial History

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Store monetary amounts in integer minor units and preserve immutable issued invoice and payment history.
- **Reason:** Floating-point calculations and rewritten financial history are unsafe for billing.
- **Consequence:** API serialization must safely handle large integers, and corrections use refund or reversal transactions.

## ADR-004 — Explicit Business State Separation

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Orders, invoices, payments, provisioning attempts, and hosting services have separate state machines.
- **Reason:** Payment settlement and external provisioning can succeed or fail independently.
- **Consequence:** Workflows must coordinate states without collapsing them into a single generic status.

## ADR-005 — Adapter-Based External Integrations

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Payment, hosting-panel, and email integrations use internal provider-neutral contracts. Fake adapters are implemented before real providers.
- **Reason:** External services need safe testing, normalized errors, and replaceable implementations.
- **Consequence:** Provider-specific behavior stays behind adapters and contract tests.

## ADR-006 — Development and Production Separation

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** The existing AlmaLinux cPanel/WHM server may run an isolated Docker Compose development or staging environment. Production should use separate infrastructure.
- **Reason:** The billing system will hold financial data and WHM provisioning authority. Hosting it on the same machine it controls increases compromise and availability risk.
- **Consequence:** Development containers use unique networks and volumes. PostgreSQL and Redis are not publicly exposed. Production deployment is deferred to a separate VPS or equivalent environment.

## ADR-007 — Command-Gated Development

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Follow `CODEX_DEVELOPMENT_COMMANDS.md` sequentially, update the progress report after every command, and request user authorization before starting the next command.
- **Reason:** The application contains high-risk financial and provisioning workflows and benefits from reviewable checkpoints.
- **Consequence:** No later command starts automatically, even when the previous command succeeds.

## ADR-008 — Canonical GitHub Delivery

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** `https://github.com/ebit101/webhost-billing.git` is the canonical repository. Every completed and validated development command is committed and pushed to `origin/main`.
- **Reason:** The user requires the GitHub main branch to stay synchronized with command-level development progress.
- **Consequence:** Each command ends with remote reconciliation, a focused commit, and a non-force push. Failing or incomplete work is not pushed as a completed command.

## ADR-009 — Command 1 Toolchain Baseline

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Use Node.js 24 LTS, pnpm 11.22, TypeScript 5.9, NestJS 11, Next.js 16 App Router, ESLint 9, Prettier 3, Jest for Nest applications, and Zod for runtime environment validation.
- **Reason:** Node.js 24 is the current LTS baseline and satisfies the supported runtime requirements of the selected NestJS and Next.js versions. Pinned package-manager and lockfile versions make local, container, and CI installs reproducible.
- **Consequence:** Developers use Node.js 24 or the supplied development Dockerfiles. Toolchain upgrades require an explicit dependency review and validation pass.

## Open Decisions

The following decisions are intentionally unresolved and must be selected before their related implementation commands:

1. Exact production payment gateway and sandbox account.
2. Exact cPanel/WHM API authentication method and dedicated development account/server.
3. SMTP delivery provider for staging and production.
4. Whether domain registration belongs in the MVP; the current default is no registrar automation.
5. Business identity, invoice numbering, currency precision, VAT/tax rules, reminder schedule, suspension grace period, cancellation policy, and refund policy.
6. Whether partial payments are enabled; the safe initial default is disabled.
7. Production VPS/provider and backup destination.

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

## ADR-010 — Isolated Local Infrastructure

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Run PostgreSQL 18.6 and Redis 8.10 in the dedicated `webhost-billing-dev` Docker Compose project, using named volumes, health checks, password authentication, and host ports bound only to `127.0.0.1`. Defer local SMTP capture until email functionality is implemented.
- **Reason:** The cPanel development server already hosts unrelated services. A named Compose project, private bridge network, unique volumes, and loopback-only ports isolate development data and avoid exposing infrastructure publicly.
- **Consequence:** Developers must create an ignored `.env` file before starting infrastructure. PostgreSQL uses its PostgreSQL 18 volume layout at `/var/lib/postgresql`; application services validate their database, Redis, and secret settings at startup.

## ADR-011 — Initial Relational Schema and Prisma Package

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Place the database schema, migrations, generated-client boundary, fictional seed, and structural verifier in `packages/database`. Use Prisma ORM 7.9.1 with the PostgreSQL driver adapter. Use UUID keys, PostgreSQL `TIMESTAMPTZ(3)`, `BIGINT` minor-unit money, explicit state enums, restrictive foreign keys, immutable historical snapshots, and customized migration SQL for checks and a partial unique price index.
- **Reason:** Billing and provisioning workflows require database-enforced identity, monetary, state, idempotency, history, and relationship invariants. A dedicated workspace package gives the API and worker one database boundary without splitting the modular monolith.
- **Consequence:** Generated Prisma Client code is recreated during build and remains outside Git. Only users, customers, products, product prices, and servers have soft-deletion timestamps; financial, payment-event, email, activity, automation, support, and outbox records have no deletion marker and must not be normally hard-deleted. Migration SQL must be reviewed before application because some PostgreSQL constraints are not represented by Prisma Schema Language.

## ADR-012 — Runtime-Validated API Contracts and Stable Errors

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision:** Keep shared boundary schemas and their inferred types in `@webhost-billing/shared`, using Zod for runtime validation. Serialize `bigint` minor-unit money as canonical decimal strings. Use consistent success and error envelopes and a global NestJS exception filter with stable error codes and generic server-failure messages.
- **Reason:** Static types disappear at runtime, JSON cannot safely represent database-sized integers, and raw framework or provider errors can expose secrets and implementation details.
- **Consequence:** Untrusted boundary data must be parsed with a runtime schema. Clients branch on stable error codes rather than messages. Expected client errors use `ApplicationException`; original exception bodies, database failures, credentials, stack traces, and provider responses are never returned to clients.

## ADR-013 — Database-Backed Cookie Sessions and Opaque Action Tokens

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision:** Authenticate with Argon2id passwords and revocable, database-backed opaque sessions carried only by secure HttpOnly cookies. Protect unsafe requests with a signed double-submit CSRF token, enforce authentication by default, apply role and ownership guards at the API boundary, and use Redis-backed rate limits for login and reset flows. Store only SHA-256 token hashes for lookup; retain reset and verification token material only as AES-256-GCM ciphertext for pending outbox delivery.
- **Reason:** The private billing application needs immediate session revocation, server-authoritative roles and ownership, browser CSRF protection, credential-stuffing resistance, and safe single-use email actions without exposing durable bearer tokens to JavaScript or persistence logs.
- **Consequence:** PostgreSQL and Redis are required for authentication. Public registration creates customers only; administrators require a trusted provisioning process. Production must use HTTPS, an exact CORS origin, unique independent secrets, and shared rate-limit storage. Email delivery remains a future outbox consumer and must decrypt action tokens only at the delivery boundary.

## ADR-014 — Three-Surface Responsive Interface System

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision:** Organize the Next.js interface into public/store, customer-portal, and administrator route-group shells. Share a slate/cyan design-token system and accessible primitives for buttons, navigation, tables, statuses, feedback states, confirmation, and notifications while allowing the public surface to be more expressive and the operational workspaces to be denser.
- **Reason:** Customers, prospective customers, and the hosting owner have different tasks, but maintaining three unrelated component systems would create inconsistency and unnecessary maintenance for a small private product.
- **Consequence:** Future feature commands compose the shared shell and primitives rather than introducing new navigation or one-off state patterns. Command 6 module pages contain fictional layout previews only; API authorization remains the security boundary. Important client interactions are tested with Vitest and React Testing Library, and all UI work must retain descriptive page titles, visible focus, reduced-motion support, and sensible small-screen behavior.

## ADR-015 — Customer Access Is Separate From Email Verification

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision:** Keep customer business status, user access status, and email verification as separate facts. Administrator deactivation sets the customer to `INACTIVE`, disables the user, and revokes sessions. Administrator activation restores a verified user to `ACTIVE` but leaves an unverified user `PENDING_VERIFICATION`.
- **Reason:** Account access is an administrator policy decision, while email verification proves control of an address. Treating activation as verification would weaken the authentication boundary and make audit history ambiguous.
- **Consequence:** Administrator-created customers use the verification outbox flow. Customer detail exposes both customer and account status. Administrator mutations are audited atomically, and audit metadata contains field names/state only rather than submitted personal values.

## Open Decisions

The following decisions are intentionally unresolved and must be selected before their related implementation commands:

1. Exact production payment gateway and sandbox account.
2. Exact cPanel/WHM API authentication method and dedicated development account/server.
3. SMTP delivery provider for staging and production.
4. Whether domain registration belongs in the MVP; the current default is no registrar automation.
5. Business identity, invoice numbering, currency precision, VAT/tax rules, reminder schedule, suspension grace period, cancellation policy, and refund policy.
6. Whether partial payments are enabled; the safe initial default is disabled.
7. Production VPS/provider and backup destination.

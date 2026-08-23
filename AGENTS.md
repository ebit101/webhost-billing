# Webhost Billing Project Instructions

## Product Scope

- This repository contains **Webhost Billing**, a private billing and service-management application for one web-hosting business.
- Build only the features required by `HOSTING_BILLING_SYSTEM_PLAN.md` and the currently authorized command in `CODEX_DEVELOPMENT_COMMANDS.md`.
- Keep the product intentionally smaller than WHMCS. Do not introduce multi-tenant reseller, marketplace, affiliate, multi-currency, or worldwide tax functionality unless explicitly authorized.

## Architecture

- Use a pnpm TypeScript monorepo.
- `apps/api`: NestJS REST API.
- `apps/web`: Next.js App Router frontend for the store, customer portal, and administrator interface.
- `apps/worker`: NestJS application context with BullMQ workers and the dedicated scheduler process.
- `packages/shared`: shared runtime schemas, types, constants, and safe serialization helpers.
- `packages/config`: shared linting, TypeScript, and build configuration.
- Use PostgreSQL with Prisma.
- Use Redis with BullMQ.
- Keep the backend a modular monolith. Do not split business modules into independently deployed microservices.
- Access payment gateways, hosting panels, and email delivery through provider-neutral interfaces.

## Business and Data Rules

- Store money as integer minor units. Never use JavaScript floating-point arithmetic for financial calculations.
- Serialize monetary integers as strings at JSON boundaries where required for safe interoperability.
- Store database timestamps in UTC and convert them only for presentation.
- Keep order, invoice, payment, provisioning, and service states separate.
- Snapshot descriptions, prices, customer billing identity, and business billing identity needed for historical invoices.
- Issued invoices, payments, refunds, reversals, audit records, and gateway events must not be hard-deleted during normal operation.
- Treat refunds and reversals as new financial transactions; never rewrite the original payment.
- Payment callbacks must be authenticated and idempotent; process them only after signature, merchant, amount, currency, invoice, and replay validation.
- Make callbacks, scheduled jobs, and retryable external operations idempotent.
- A browser redirect is never proof of payment.
- A paid invoice is never proof of successful hosting provisioning.
- Permanent hosting termination requires explicit administrator confirmation and must not be automatically scheduled in the initial release.

## Security

- Use strict TypeScript. Avoid unsafe `any`; narrow unknown external data through runtime validation.
- Use secure HttpOnly cookie-based sessions rather than persistent browser tokens.
- Enforce role authorization and resource ownership at the service/API layer.
- Encrypt integration credentials at rest and redact secrets from logs, errors, job payloads, and API responses.
- Never commit credentials, production data, `.env` files, database dumps, private keys, or real customer information.
- Use fake providers in development and automated tests until a real sandbox integration is explicitly authorized.
- Require confirmation before external, destructive, production, or costly actions.

## Quality and Change Discipline

- Read this file, `HOSTING_BILLING_SYSTEM_PLAN.md`, `docs/DECISIONS.md`, and `docs/PROGRESS.md` before beginning a development command.
- Preserve unrelated existing work.
- Add or update tests with every business-rule change.
- Run validation proportional to the change. Do not claim a check passed unless it was executed successfully.
- Record unresolved failures and constraints honestly.
- Keep generated and dependency artifacts out of Git unless the project explicitly requires them.

## Command Tracking

- Execute only the command currently authorized by the user.
- The canonical Git remote is `https://github.com/ebit101/webhost-billing.git` and the delivery branch is `main`.
- After a command passes its required validation, update its report, create a focused commit, reconcile with the remote without force-pushing, and push the completed command to `origin/main`.
- Never force-push, rewrite published history, or push failing/unverified command work.
- After every command, update `docs/PROGRESS.md` with:
  - command number and title;
  - status and date;
  - implemented scope;
  - files changed;
  - validation performed and results;
  - decisions made;
  - unresolved questions, risks, and blockers;
  - exact recommended next command.
- Stop after completing and reporting each command. Ask the user for authorization before starting the next command.

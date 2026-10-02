# Webhost Billing Development Progress

## Status Summary

- **Current command:** Phase Review — Review Commands 67–70 and define the next bounded command
- **Current status:** Completed and delivered to GitHub `main`
- **Last updated:** 2026-10-03
- **Next command:** Command 71 — Reopen the contributor on-ramp with a fourth starter-issue set
- **Next command authorized:** No

## Command Reports

### Command 0 — Define Permanent Project Rules

- **Status:** Completed
- **Date:** 2026-08-23

#### Scope completed

- Inspected the initial workspace and product plan.
- Established durable repository instructions in `AGENTS.md`.
- Recorded accepted architecture, data-safety, integration, environment, and workflow decisions.
- Established this progress tracker and the command-by-command reporting format.
- Reconciled the product plan with the selected NestJS/Next.js TypeScript architecture.
- Confirmed that application scaffolding is intentionally deferred to Command 1.

#### Files changed

- `AGENTS.md` — created
- `docs/DECISIONS.md` — created
- `docs/PROGRESS.md` — created
- `HOSTING_BILLING_SYSTEM_PLAN.md` — technical architecture corrected to the approved TypeScript stack

#### Validation

- Confirmed the workspace initially contained only the product plan and command playbook.
- Reviewed the product requirements and Command 0 instructions.
- Verified that the durable rules cover every mandatory constraint listed in Command 0.
- Verified that no application source, dependencies, database, or infrastructure were created during this command.

#### Decisions made

- NestJS/Next.js replaces the earlier Laravel suggestion.
- PostgreSQL/Prisma and Redis/BullMQ are the selected persistence and job stack.
- The cPanel server is approved for isolated development/staging only; production remains separate.
- Development proceeds one authorized command at a time.

#### Open questions and risks

- Payment provider, SMTP provider, production WHM authentication details, tax policy, billing policy, and production infrastructure remain unresolved.
- The workspace is not currently a Git repository. Command 1 should initialize Git unless the project will be attached to an existing remote repository first.
- The current cPanel server has no host Node.js installation; Command 1 can use Corepack/Node installation or a containerized toolchain.
- The server has no swap, which may affect large dependency installs or Next.js builds under memory pressure.

#### Recommended next command

Run **Command 1 — Create the Monorepo** after explicit user authorization.

### Command 1 — Create the Monorepo

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-23

#### Scope completed

- Initialized Git and connected the workspace to the canonical GitHub repository at `https://github.com/ebit101/webhost-billing.git`.
- Reconciled the existing remote `main` history without rewriting it.
- Created a pnpm TypeScript monorepo containing:
  - `apps/api` — strict NestJS REST API scaffold;
  - `apps/web` — Next.js App Router, React, Tailwind CSS, and ESLint scaffold;
  - `apps/worker` — non-HTTP NestJS application-context scaffold;
  - `packages/config` — shared TypeScript presets and Zod environment parsing;
  - `packages/shared` — shared project constants and future cross-application contracts.
- Added root scripts for development, formatting, linting, typechecking, testing, and production builds.
- Added a reproducible pnpm lockfile and explicitly allowlisted the required `unrs-resolver` native build script.
- Added repository-wide formatting, Git, Docker, secret, build-output, test-output, database-dump, and dependency ignore rules.
- Added a safe `.env.example` containing placeholders only.
- Added development Dockerfiles for the API, web application, and worker.
- Added project setup and architecture documentation to `README.md`.
- Recorded the canonical GitHub delivery rule in `AGENTS.md` and `docs/DECISIONS.md`.

#### Files changed

- Root workspace: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.json`
- Repository policy: `.gitignore`, `.dockerignore`, `.prettierignore`, `.prettierrc.json`, `.env.example`
- API scaffold: `apps/api/**`
- Web scaffold: `apps/web/**`
- Worker scaffold: `apps/worker/**`
- Shared packages: `packages/config/**`, `packages/shared/**`
- Documentation: `README.md`, `AGENTS.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Dependency installation from the frozen pnpm lockfile: passed.
- pnpm supply-chain policy verification: passed for 896 lockfile entries.
- Prettier formatting check: passed.
- ESLint for API, worker, and web applications: passed with unsafe explicit `any`, floating promises, and unsafe arguments treated as errors in Nest applications.
- Strict TypeScript checks for all five workspace projects: passed.
- API Jest suite: 1 test passed.
- Worker Jest suite: 1 test passed.
- NestJS API production build: passed.
- NestJS worker production build: passed.
- Next.js production build and static route generation: passed.
- API development Docker image build: passed.
- Web development Docker image build: passed.
- Worker development Docker image build: passed.
- `git diff --check`: passed.
- Local Git commit: created on `main`.
- Dedicated GitHub deploy-key authentication: passed.
- GitHub `origin/main` delivery: passed without force-pushing.

#### Decisions made

- Node.js 24 LTS and pnpm 11.22 are the pinned runtime/package-manager baseline.
- Jest remains the NestJS test runner; frontend test tooling will be introduced when frontend behavior is implemented.
- Zod validates runtime environment variables.
- The worker is a NestJS application context rather than an HTTP server.
- GitHub `main` is updated only after a command passes validation; force-push is prohibited.

#### Open questions and risks

- PostgreSQL, Redis, and local SMTP services are intentionally deferred to Command 2.
- Prisma is intentionally deferred to Command 3 with the database schema.
- Payment provider, SMTP provider, production WHM credentials, tax rules, billing policies, and production hosting remain unresolved.
- pnpm reports deprecated transitive packages from current scaffolding dependencies; no direct vulnerable or failing dependency was identified during Command 1 validation.
- The development server still has no swap; concurrent image builds and future Next.js builds should be monitored for memory pressure.
- The dedicated GitHub deploy key is repository-specific and must remain protected on the development server.

#### Recommended next command

Run **Command 2 — Add Local Infrastructure** after explicit user authorization.

### Command 2 — Add Local Infrastructure

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-23

#### Scope completed

- Added an isolated Docker Compose development project containing PostgreSQL 18.6 and Redis 8.10.
- Added persistent named volumes, a private bridge network, service health checks, password authentication, restart behavior, bounded container logs, and `no-new-privileges` security options.
- Bound PostgreSQL and Redis host ports to `127.0.0.1` so they are not exposed on the cPanel server's public interfaces.
- Added safe placeholder configuration to `.env.example` and created an ignored local `.env` for this development environment without committing its values.
- Added shared Zod validation for API, worker, and web runtime settings, including PostgreSQL/Redis URL protocols and minimum secret lengths.
- Configured the API, worker, and Next.js applications to load the repository environment and validate their settings before startup.
- Added root infrastructure commands and ensured local application startup builds shared packages first.
- Updated all development Dockerfiles to build shared workspace packages before starting applications.
- Added local setup, connectivity, application startup, migration status, shutdown, troubleshooting, and destructive-reset documentation.
- Kept local SMTP capture optional and deferred it until the email-notification implementation requires it.

#### Files changed

- Infrastructure and environment: `compose.yaml`, `.env.example`, `.prettierignore`, `package.json`
- Runtime configuration: `packages/config/src/env.ts`, `packages/config/src/index.ts`, `pnpm-lock.yaml`
- API: `apps/api/src/main.ts`, `apps/api/src/environment.spec.ts`, `apps/api/Dockerfile.dev`
- Worker: `apps/worker/src/main.ts`, `apps/worker/Dockerfile.dev`
- Web: `apps/web/next.config.ts`, `apps/web/package.json`, `apps/web/Dockerfile.dev`
- Documentation: `README.md`, `docs/DEVELOPMENT.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- `docker compose config --quiet`: passed without printing interpolated secrets.
- PostgreSQL 18.6 and Redis 8.10 image pulls: passed.
- `docker compose up --detach --wait postgres redis`: passed; both services reported healthy.
- PostgreSQL `pg_isready`: passed and accepted connections.
- Authenticated Redis `PING`: passed with `PONG`.
- Container inspection confirmed PostgreSQL publishes only `127.0.0.1:5432`, Redis publishes only `127.0.0.1:6379`, and both use their intended named volumes.
- Frozen-lockfile dependency installation and pnpm supply-chain policy verification: passed.
- Prettier formatting check: passed.
- ESLint for API, worker, and web: passed.
- Strict TypeScript checks for all workspace projects: passed.
- API Jest suites: 2 suites and 5 tests passed, including environment validation.
- Worker Jest suite: 1 test passed.
- NestJS API, NestJS worker, and Next.js production builds: passed.
- API, web, and worker development Docker image builds: passed.
- Runtime smoke tests: the API returned `Hello World!`, the web application served HTML, and the worker application context initialized successfully using the validated local environment.

#### Decisions made

- PostgreSQL 18 uses the image's version-aware `/var/lib/postgresql` data layout.
- Infrastructure has a dedicated `webhost-billing-dev` Compose identity, named network, and named volumes to avoid collision with cPanel or existing containers.
- Local database and Redis ports remain accessible only from the development host's loopback interface.
- Local SMTP capture is unnecessary until an email-producing feature exists.
- Prisma schema creation and executable migration commands remain correctly deferred to Command 3.

#### Open questions and risks

- The ignored local `.env` values are development-only and must be replaced with separately managed secrets in staging and production.
- The infrastructure remains running for development; `docker compose down` removes its containers while retaining data, and `docker compose down --volumes` is intentionally destructive.
- Payment provider, SMTP delivery provider, production WHM credentials, tax rules, billing policies, and production hosting remain unresolved.
- The development server has no swap; future dependency and image builds should continue to be monitored for memory pressure.

#### Recommended next command

Run **Command 3 — Design the Database Schema** after explicit user authorization.

### Command 3 — Design the Database Schema

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-23

#### Scope completed

- Added the `@webhost-billing/database` workspace package using Prisma ORM 7.9.1, Prisma Client, the PostgreSQL driver adapter, and `pg`.
- Implemented all 20 required models: users, customers, administrator profiles, products and prices, orders and items, services and servers, invoices and items, payments and events, tickets and messages, email logs, activity logs, automation runs, settings, and outbox events.
- Added explicit enums for identity, customer, product, order, service, server, invoice, payment, payment-event, ticket, email, automation, setting, and outbox states.
- Used UUID primary keys, PostgreSQL `TIMESTAMPTZ(3)` timestamps, `BIGINT` monetary fields, uppercase ISO-style currency codes, unique business numbers, and restrictive foreign keys.
- Added immutable product, pricing, provisioning, customer, business, address, tax, description, and service-period snapshots where financial history requires them.
- Added unique payment/provider event identifiers and idempotency keys for payment, payment-event, automation, and outbox retry safety.
- Limited soft deletion to users, customers, products, product prices, and servers; financial, support, audit, notification, automation, and outbox history has no deletion marker.
- Created and applied the initial migration with customized PostgreSQL checks for currency/country formats, money totals, valid ranges, payment adjustment relationships, positive counters, JSON snapshot shape, and one active price per product/period/currency.
- Added an idempotent fictional development seed covering every model and using only reserved `.test` identities and hostnames.
- Added a database verifier for table coverage, UUID identifiers, money types, timezone-safe timestamps, restrictive foreign keys, custom constraints, the partial unique index, and representative seeded relationships.
- Added root database commands, Prisma-generated-code ignore rules, OpenSSL support in development images, and database workflow documentation.

#### Files changed

- Database package: `packages/database/package.json`, `packages/database/tsconfig.json`, `packages/database/tsconfig.build.json`, `packages/database/prisma.config.ts`, `packages/database/src/**`
- Prisma schema and data: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/**`, `packages/database/prisma/seed.ts`, `packages/database/prisma/verify.ts`
- Workspace and dependencies: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- Generated-artifact policy: `.gitignore`, `.dockerignore`, `.prettierignore`
- Development images: `apps/api/Dockerfile.dev`, `apps/web/Dockerfile.dev`, `apps/worker/Dockerfile.dev`
- Documentation: `README.md`, `docs/DATABASE.md`, `docs/DEVELOPMENT.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Frozen-lockfile dependency installation and pnpm supply-chain verification: passed for 1,054 lockfile entries.
- Prisma lifecycle scripts were explicitly limited to approved `prisma`, `@prisma/engines`, and `esbuild` packages.
- `prisma format`: passed.
- `prisma validate`: passed.
- Prisma Client 7.9.1 generation: passed.
- Initial migration creation and application to the isolated PostgreSQL database: passed.
- A subsequent `prisma migrate dev` reported no schema change, pending migration, or drift.
- `prisma migrate status`: passed; the database is up to date with one migration.
- Fictional development seed: passed on the first run and on repeated runs, confirming idempotency.
- Database structural and seed verifier: passed.
- Prettier formatting: passed.
- ESLint for API, worker, and web: passed.
- Strict TypeScript checks for all six code workspace projects, including the generated Prisma client, seed, verifier, and config: passed.
- API Jest suites: 2 suites and 5 tests passed.
- Worker Jest suite: 1 test passed.
- Database package, NestJS API, NestJS worker, and Next.js production builds: passed.
- API, web, and worker development Docker image builds with generated Prisma Client and OpenSSL support: passed.

#### Decisions made

- Prisma ORM 7.9.1 is the pinned stable baseline; Prisma 8 remains a release candidate and was not selected.
- The generated Prisma Client is build output and remains outside Git.
- Database checks and the partial unique price index live in reviewed migration SQL because Prisma Schema Language cannot represent all required PostgreSQL invariants.
- All foreign keys use `ON DELETE RESTRICT`; application workflows must change state or append corrective financial records instead of cascading deletion.
- Refunds and reversals are positive adjustment payments linked to an original charge.
- Settings and provisioning JSON are non-secret; server credential storage is reserved for encrypted ciphertext only.
- Seed users intentionally have no password and cannot authenticate before Command 5 implements authentication.

#### Open questions and risks

- Invoice numbering format, tax policy, partial-payment policy, and final billing periods remain business configuration decisions; the schema supports them without choosing policy values.
- Prisma migrations containing custom SQL require manual review and must not be replaced by `prisma db push`.
- `BIGINT` money requires decimal-string serialization at JSON boundaries; Command 4 will add the shared contract and serializer.
- Database access is not yet wired into NestJS feature modules; it will be introduced when those modules are implemented.
- Payment provider, SMTP delivery provider, production WHM credentials, and production hosting remain unresolved.

#### Recommended next command

Run **Command 4 — Add Shared Contracts and Errors** after explicit user authorization.

### Command 4 — Add Shared Contracts and Errors

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-24

#### Scope completed

- Converted `@webhost-billing/shared` into a separately buildable and tested package of reusable runtime contracts and inferred TypeScript types.
- Added strict Zod schemas for money, currency codes, pagination, API success responses, API errors, authenticated administrator/customer identity, roles, and separate order, invoice, payment, service, and ticket states.
- Added lossless `bigint` money serialization as canonical decimal strings, parsing back to `bigint`, and PostgreSQL `BIGINT` range validation.
- Added bounded pagination input coercion, pagination metadata validation, and success/paginated-response construction helpers.
- Defined stable API error codes, field-level validation issues, and a strictly validated error envelope.
- Added `ApplicationException` for expected client-facing failures and registered `ApiExceptionFilter` globally through NestJS `APP_FILTER`.
- Mapped framework and unknown failures to safe public responses while discarding original exception bodies, messages, stack traces, database details, credentials, and provider responses.
- Changed the API root response to use the shared success envelope and added end-to-end coverage for the globally formatted 404 response.
- Documented contract usage, money representation, response formats, error codes, and the exception boundary.

#### Files changed

- Shared contracts and tests: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/tsconfig.build.json`, `packages/shared/src/index.ts`, `packages/shared/src/contracts/**`, `packages/shared/test/contracts.spec.ts`
- API exception boundary: `apps/api/src/common/errors/application.exception.ts`, `apps/api/src/common/errors/api-exception.filter.ts`, `apps/api/src/common/errors/api-exception.filter.spec.ts`, `apps/api/src/app.module.ts`
- API envelope coverage: `apps/api/src/app.controller.ts`, `apps/api/src/app.controller.spec.ts`, `apps/api/test/app.e2e-spec.ts`
- Dependencies: `pnpm-lock.yaml`
- Documentation: `README.md`, `docs/API_CONTRACTS.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Frozen-lockfile dependency installation: passed; pnpm supply-chain policy verification remained valid for 1,054 lockfile entries.
- Prettier formatting check: passed.
- Prisma schema validation: passed.
- ESLint for API, worker, and web: passed.
- Strict TypeScript checks for all six code workspace projects: passed.
- Shared contract tests: 2 suites and 7 tests passed, covering lossless money serialization, invalid and out-of-range amounts, currency validation, identities, state vocabulary, pagination, and response envelopes.
- API Jest tests: 3 suites and 9 tests passed, including safe formatting of expected, framework, provider, and unknown errors.
- Worker Jest tests: 1 suite and 1 test passed.
- API end-to-end tests: 1 suite and 2 tests passed, including global 404 error formatting.
- Database structural/seed verification: passed; migration status confirmed the database is up to date with one migration.
- Database package, shared packages, NestJS API, NestJS worker, and Next.js production builds: passed.
- API, web, and worker development Docker image builds: passed.
- Containerized API runtime smoke test: the root route returned the shared success envelope and a missing route returned the stable `RESOURCE_NOT_FOUND` envelope.
- `git diff --check`: passed.

#### Decisions made

- Zod is the runtime-validation library for shared application-boundary contracts.
- API monetary amounts are canonical non-negative decimal strings at JSON boundaries and `bigint` internally; refunds and reversals remain separate positive transactions.
- Shared states intentionally match the initial Prisma state vocabulary but remain transport contracts rather than generated database-client types.
- Success responses use `{ success: true, data }`; failures use `{ success: false, error: { code, message, issues? } }`.
- Clients branch on stable error codes, never human-readable messages.
- Only expected 4xx `ApplicationException` details may reach a client. Framework, 5xx, and unknown exception details are replaced with generic public definitions, and server-error logs do not interpolate the original exception.

#### Open questions and risks

- Currency precision and the initially supported currency list remain business-policy decisions; the shared schema currently enforces only an uppercase three-letter code and database-sized minor-unit amount.
- Shared state contracts and Prisma enums must be changed together when a future authorized command introduces a state transition.
- Future controllers, sessions, jobs, and provider adapters must parse untrusted data with the applicable runtime schema; importing a TypeScript type alone is insufficient.
- Authentication, authorization guards, ownership checks, and session enforcement are intentionally deferred to Command 5.
- Payment provider, SMTP delivery provider, production WHM credentials, tax rules, billing policies, and production hosting remain unresolved.

#### Recommended next command

Run **Command 5 — Implement Authentication** after explicit user authorization.

### Command 5 — Implement Authentication

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-24

#### Scope completed

- Added a NestJS authentication module backed by PostgreSQL and Redis, with authentication required by default and explicit public-route metadata.
- Implemented customer email/password registration, pending-verification accounts, single-use email verification, login, current-session logout, logout-all, session listing, and individual session revocation.
- Implemented generic password-reset requests and atomic single-use reset confirmation; completing a reset revokes every existing user session.
- Added Argon2id password hashing, 256-bit opaque tokens, SHA-256 database token lookup, AES-256-GCM protection for pending email action-token delivery, and transactional security flows.
- Added secure HttpOnly cookie sessions, production `Secure` and `__Host-` cookie behavior, `SameSite=Lax`, exact-origin credentialed CORS, signed double-submit CSRF protection, and no browser token persistence.
- Added Redis-backed fixed-window rate limits for login and password-reset flows with keyed fingerprints, environment namespaces, and fail-closed behavior.
- Added administrator/customer role guards and customer-resource ownership guards, including administrator bypass and audit records for denied access.
- Added immutable security audit events for registration, verification, successful/failed login, reset request/completion, logout, logout-all, session revocation, and authorization denial.
- Added `AuthSession`, `PasswordResetToken`, and `EmailVerificationToken` models, reviewed migrations, database hash/time checks, and structural verification coverage.
- Added shared Zod authentication requests, identities, session responses, email normalization, password policy, and stable authentication error codes.
- Added Next.js pages for registration, login, forgot/reset password, email verification, and a basic authenticated account/session view. Browser mutations automatically obtain and return a CSRF token and always use credentialed requests.
- Added provider-ready outbox events for verification and reset email. Outbox payloads contain only the recipient, purpose, and token-record identifier; raw tokens remain encrypted outside the payload.
- Added authentication architecture, operations, security, endpoint, configuration, and testing documentation.

#### Files changed

- API authentication and infrastructure: `apps/api/src/modules/auth/**`, `apps/api/src/infrastructure/**`, `apps/api/src/common/http/**`, `apps/api/src/common/validation/**`, `apps/api/src/app.module.ts`, `apps/api/src/app.controller.ts`, `apps/api/src/main.ts`
- API tests and dependencies: `apps/api/test/auth.e2e-spec.ts`, `apps/api/test/setup-environment.ts`, `apps/api/test/jest-e2e.json`, `apps/api/package.json`
- Web authentication UI: `apps/web/src/app/{login,register,forgot-password,reset-password,verify-email,account}/**`, `apps/web/src/components/auth/**`, `apps/web/src/lib/auth-api.ts`, `apps/web/src/app/page.tsx`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`
- Shared contracts/configuration: `packages/shared/src/contracts/authentication.ts`, `packages/shared/src/contracts/errors.ts`, `packages/shared/src/index.ts`, `packages/shared/test/contracts.spec.ts`, `packages/config/src/env.ts`, `.env.example`
- Database: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260823202643_add_authentication/**`, `packages/database/prisma/migrations/20260823202805_add_auth_token_delivery_ciphertext/**`, `packages/database/prisma/migrations/20260823203000_authentication_constraints/**`, `packages/database/prisma/verify.ts`
- Workspace/dependencies: `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- Documentation: `README.md`, `docs/AUTHENTICATION.md`, `docs/DATABASE.md`, `docs/DEVELOPMENT.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Frozen-lockfile dependency installation: passed; pnpm supply-chain policy verification passed for 1,068 entries.
- Argon2 native lifecycle installation: passed in clean development-image builds.
- Prettier formatting check and `git diff --check`: passed.
- ESLint for API, worker, and web: passed.
- Strict TypeScript checks for all six code workspace projects: passed.
- Shared contract tests: 2 suites and 9 tests passed.
- API Jest tests: 4 suites and 13 tests passed, including Argon2, CSRF signing/tamper rejection, token encryption/tamper rejection, rate-limit enforcement, and stable failures.
- Worker Jest tests: 1 suite and 1 test passed.
- API end-to-end tests: 2 suites and 8 tests passed against local PostgreSQL and Redis. Authentication coverage includes registration, verification, reused-token rejection, login, generic invalid credentials, role denial, cross-customer denial, expired reset tokens, single-use reset, session revocation, logout-all, and administrator authorization.
- Prisma schema validation: passed; migration status confirmed all four migrations are applied with no pending migration.
- Database structural/seed verifier: passed for 23 application tables, UUID identifiers, timezone-safe timestamps, authentication constraints, existing money invariants, restrictive foreign keys, and fictional seed relationships.
- Database, shared packages, NestJS API, NestJS worker, and Next.js production builds: passed; Next.js generated all eight application routes.
- API, web, and worker Command 5 development Docker image builds: passed.
- Containerized runtime smoke tests: the API initialized database, Redis, global guards, and every authentication route and returned a CSRF response; the web application served `/login` successfully.

#### Decisions made

- Authentication uses revocable database-backed opaque sessions in HttpOnly cookies; long-lived bearer tokens are not exposed to browser JavaScript or stored in browser persistence.
- Unsafe requests use a signed double-submit CSRF cookie/header design, with exact-origin credentialed CORS as an additional browser boundary.
- Customer registration cannot assign an administrator role. Administrator creation is a separate trusted operational responsibility.
- Action-token records retain only a lookup hash plus encrypted pending delivery material. Consuming or superseding a token replaces its ciphertext while preserving the historical row.
- Authentication and authorization are default-deny. Resource ownership is derived from the server-authenticated identity, with an explicit administrator bypass.
- Redis rate-limit failure returns a stable service-unavailable response instead of silently removing brute-force protection.
- Email-verification and password-reset delivery use the existing transactional outbox boundary; the email worker/provider remains outside Command 5.

#### Open questions and risks

- Verification and password-reset emails are not yet delivered because no SMTP provider or email worker has been authorized. The records and encrypted delivery boundary are ready, but real customers cannot complete email actions until that consumer exists.
- A trusted administrator bootstrap/provisioning runbook or command is still required before deployment. Public registration deliberately cannot create an administrator, and fictional seed users remain non-authenticating.
- Production requires HTTPS, exact `WEB_ORIGIN`, distinct high-entropy session/encryption secrets, a shared protected Redis instance, migration deployment, and an explicit secret-rotation procedure.
- Rate limits currently use the direct Express request address; deployment behind a reverse proxy must configure and validate trusted proxy handling before relying on forwarded client addresses.
- The authentication pages passed lint, typecheck, production build, and runtime smoke validation. A frontend interaction-test framework is still not present and should be introduced when the reusable application layouts and form components mature.
- Payment provider, SMTP delivery provider, production WHM credentials, tax rules, billing policies, and production hosting remain unresolved.

#### Recommended next command

Run **Command 6 — Build the Application Layouts** after explicit user authorization.

### Command 6 — Build the Application Layouts

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-24

#### Scope completed

- Reorganized the Next.js application into public/store, customer-portal, and administrator route-group shells without changing their intended public URLs.
- Built a polished public storefront with sticky desktop/mobile navigation, responsive hero, fictional hosting-plan cards, plan comparison table, trust messaging, support callout, and business footer.
- Built a calm customer-portal workspace with responsive off-canvas navigation, header search, account controls, summary metrics, fictional service table, invoice callout, support empty state, and preview pages for services, invoices, support, and profile/security.
- Built a denser administrator workspace with responsive off-canvas navigation, header search, operational metrics, recent billing table, revenue visualization, audit activity, and preview pages for every planned administrator navigation area.
- Added shared brand, icon, button, page-header, metric-card, generic data-table, status-badge, empty/loading/error-state, confirmation-dialog, toast, public-navigation, footer, and workspace-shell components.
- Added accessible interaction behavior including skip navigation, visible focus, descriptive page metadata, `aria-current`, disclosure state, mobile body-scroll locking, Escape dismissal, focus movement/restoration, dialog focus containment, live notification announcements, and reduced-motion handling.
- Restyled the authentication pages to use the shared visual system and changed successful login routing to the appropriate customer or administrator workspace according to the server-returned role.
- Added global loading and error boundaries that communicate state safely and provide explicit recovery.
- Added Vitest, jsdom, React Testing Library, and `user-event` as the frontend component-testing baseline.
- Added focused interaction tests for mobile navigation, selection, Escape dismissal, focus restoration, confirmation and focus containment, toast announcement/dismissal, table captions, and status rendering.
- Kept every dashboard identity, domain, reference, metric, price, and chart value fictional; placeholder module routes implement layout only and make no business-data writes.
- Documented route organization, design tokens, shared components, responsive behavior, accessibility expectations, fictional-data boundaries, and frontend testing.

#### Files changed

- Store shell and pages: `apps/web/src/app/(store)/**`
- Customer shell and previews: `apps/web/src/app/(portal)/**`
- Administrator shell and previews: `apps/web/src/app/(admin)/**`
- Root states and design tokens: `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/app/loading.tsx`, `apps/web/src/app/error.tsx`
- Shared layout and dashboard components: `apps/web/src/components/layout/**`, `apps/web/src/components/dashboard/**`
- Shared UI primitives and tests: `apps/web/src/components/ui/**`
- Authentication visual integration: `apps/web/src/app/{login,register,forgot-password,reset-password,verify-email,account}/**`, `apps/web/src/components/auth/**`
- Frontend test configuration and dependencies: `apps/web/vitest.config.mts`, `apps/web/vitest.setup.ts`, `apps/web/package.json`, `pnpm-lock.yaml`
- Documentation: `README.md`, `docs/FRONTEND_DESIGN_SYSTEM.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Frozen-lockfile dependency installation: passed; pnpm supply-chain policy verification passed for 1,175 entries.
- Prettier formatting check and `git diff --check`: passed.
- ESLint for API, worker, and web: passed without warnings.
- Strict TypeScript checks for all six code workspace projects: passed, including generated Next.js route types.
- Complete unit/contract/component suite: 9 shared-contract tests, 13 API tests, 1 worker test, and 6 web interaction tests passed (29 total).
- Frontend component tests: 2 suites and 6 tests passed with jsdom and real user-event interactions.
- Database, shared packages, NestJS API, NestJS worker, and Next.js production builds: passed.
- Next.js production generation: passed for 23 public application routes plus the framework not-found route; 21 routes are static and 2 token-query routes render dynamically.
- Rendered-route smoke audit: representative public, plan, login, portal, portal-module, administrator, and administrator-module routes all returned HTTP 200 with descriptive titles.
- Command 6 web development Docker image: passed from a clean dependency layer, including lockfile policy verification and shared-package generation.
- Containerized image smoke test: `/`, `/portal`, and `/admin` each returned HTTP 200 with the expected distinct page title.

#### Decisions made

- Route groups own the three application shells while public URLs remain `/`, `/hosting`, `/portal/**`, and `/admin/**`.
- Public pages use more expressive typography and spacing; customer and administrator workspaces share one maintainable navigation/header system with different information density.
- Cyan/teal is the primary brand/action color, slate is the neutral foundation, and emerald/amber/red/blue tones have consistent status meaning.
- Tables retain semantic markup and scroll horizontally on narrow screens instead of collapsing important billing columns.
- Confirmation and notification patterns are global primitives rather than feature-specific implementations.
- Placeholder module screens clearly identify themselves as fictional layout previews so later commands can replace them without suggesting a completed workflow.
- API authorization remains the security boundary. A visible administrator or customer route is not proof of role or ownership, and future data loaders must call protected API endpoints.

#### Open questions and risks

- Portal and administrator dashboard values are fictional and not connected to API data. Each later business-module command must replace only its authorized preview content.
- The shell search and notification controls are visual placeholders; query behavior and persisted notifications have not been authorized.
- Next.js pages currently render fictional shells without a server-side route redirect when no session exists. This exposes no private data, but real module pages must add authenticated loading/redirect behavior while retaining API authorization.
- Automated tests cover keyboard-critical interactions and semantic output, but a full browser accessibility audit and cross-browser visual-regression suite are still future hardening work.
- Business branding, logo asset, final public copy, real hosting plans, prices, and supported currency remain owner decisions; current marketing data is explicitly fictional.
- Payment provider, SMTP delivery provider, production WHM credentials, tax rules, billing policies, and production hosting remain unresolved.

#### Recommended next command

Run **Command 7 — Implement Customer Management** after explicit user authorization.

### Command 7 — Implement Customer Management

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-24

#### Scope completed

- Added shared, runtime-validated contracts for customer creation, profile and billing edits, access changes, password changes, paginated search/filter input, summaries, detailed linked records, statuses, and lossless monetary responses.
- Added a NestJS `CustomerModule` with administrator customer creation, paginated search across number/name/company/email, customer-status filtering, owned/admin detail reads, profile editing, administrator billing editing, account access activation/deactivation, and customer password changes.
- Reused the secure registration boundary for administrator-created customers so passwords remain Argon2id hashed and email verification is queued through the encrypted-token transactional outbox flow.
- Kept customer status, account access, and email verification separate. Deactivation disables the user and revokes sessions; activation cannot mark an unverified address as verified.
- Returned total counts and the ten most recent orders, services, invoices, payments, and tickets from customer detail, with all money serialized as decimal-string minor units.
- Applied administrator role checks to directory, creation, billing, and access routes, and combined role plus exact customer-ID ownership checks for shared profile/detail and customer-only password routes.
- Recorded administrator creation/profile/billing/access mutations in `ActivityLog`; creation audit is in the registration transaction, and edit metadata contains changed field names rather than submitted personal values.
- Replaced the administrator customer preview with responsive search, filtering, pagination, customer creation, customer details, profile/billing editing, explicit access confirmation, status indicators, and linked-history summaries.
- Replaced the portal profile preview with authenticated owned-profile loading, permitted contact/address editing, and current-password-confirmed password change followed by session-ending sign-in redirection.
- Added customer-management unit, API integration, and frontend tests and durable module documentation.

#### Files changed

- Shared contracts: `packages/shared/src/contracts/customers.ts`, `packages/shared/src/index.ts`
- Customer API: `apps/api/src/modules/customers/**`, `apps/api/src/app.module.ts`
- Authentication reuse/export: `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/modules/auth/services/auth.service.ts`
- API integration tests: `apps/api/test/customers.e2e-spec.ts`
- Administrator interface: `apps/web/src/app/(admin)/admin/customers/**`, `apps/web/src/components/customers/admin-customer-manager.tsx`, `apps/web/src/components/customers/admin-customer-detail.tsx`
- Customer self-service: `apps/web/src/app/(portal)/portal/profile/page.tsx`, `apps/web/src/components/customers/customer-profile.tsx`
- Shared frontend support/tests: `apps/web/src/components/customers/customer-fields.tsx`, `apps/web/src/components/customers/customer-management.test.tsx`, `apps/web/src/components/ui/icon.tsx`, `apps/web/src/lib/auth-api.ts`
- Documentation: `README.md`, `docs/CUSTOMER_MANAGEMENT.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Prettier formatting check and `git diff --check`: passed.
- ESLint for API, worker, and web: passed without warnings.
- Strict TypeScript checks for all six code workspace projects: passed, including generated Next.js route types.
- Complete non-integration test suite: 9 shared-contract tests, 15 API tests, 1 worker test, and 8 frontend tests passed (33 total).
- Customer unit tests: 2 passed, covering activation behavior for verified and unverified accounts.
- API end-to-end suite: 3 suites and 10 tests passed against local PostgreSQL and Redis. Customer coverage includes administrator creation/search/filter/detail/profile/billing/access workflows, atomic audit records, verification preservation, role denial, ownership denial, self-profile editing, password change, and session revocation.
- Frontend suite: 3 files and 8 tests passed, including administrator customer results/detail navigation and authenticated customer-profile loading.
- Database, shared packages, NestJS API, NestJS worker, and Next.js production builds: passed.
- Next.js production generation: passed for 24 application routes plus the framework not-found route; the new `/admin/customers/[customerId]` route renders dynamically.
- Prisma emitted its known OpenSSL detection warning in the generic validation container, but client generation, database-backed integration tests, and all builds completed successfully.

#### Decisions made

- Administrator-created customers start in `PENDING_VERIFICATION`; administrator activation is not evidence of email ownership.
- Access deactivation uses customer `INACTIVE` plus user `DISABLED` and revokes active sessions. `SUSPENDED` remains available for later service/billing policy rather than being overloaded for manual account deactivation.
- Customers may edit name, company, phone, and address fields. Email identity, customer number, status, and tax identifier remain outside customer self-service.
- Email changes are intentionally excluded because a safe change requires a dedicated re-verification workflow; no administrator action silently changes authentication identity in this command.
- Customer detail returns bounded recent previews with total counts; later order, service, invoice, payment, and ticket commands own full history views.
- Password changes revoke all sessions and require a fresh sign-in.

#### Open questions and risks

- Verification emails still require the future SMTP/outbox consumer. Administrator-created customers cannot sign in until their queued verification action is delivered and completed.
- There is no resend-verification administrator action yet; that belongs with email delivery/account lifecycle hardening rather than bypassing verification.
- Customer email-change and administrator password-reset initiation are intentionally absent until dedicated verified-identity flows are authorized.
- The dashboard shell still shows fictional identity/search/notification content from Command 6; customer module pages themselves use protected API data.
- Full linked-record navigation will be completed by Commands 9–14 as those business modules become real.
- Payment provider, SMTP delivery provider, production WHM credentials, tax rules, billing policies, and production hosting remain unresolved.

#### Recommended next command

Run **Command 8 — Implement Products and Pricing** after explicit user authorization.

### Command 8 — Implement Products and Pricing

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-24

#### Scope completed

- Extended the product schema with explicit public visibility, nonnegative display ordering, hosting-panel package identifier, and storage/website/email/bandwidth display features.
- Added and applied a reviewed PostgreSQL migration with a display-order check and public-catalogue lookup index; updated fictional seed data and the structural verifier for the new invariants.
- Added shared Zod contracts for supported monthly, quarterly, and annual periods; product create/edit/status boundaries; versioned prices; administrator product responses; and privacy-limited public catalogue responses.
- Added a NestJS `ProductModule` with protected administrator create/list/detail/edit/status/price workflows and a public active-catalogue endpoint.
- Required complete provisioning/display metadata and at least one supported active price before activation, and prevented edits from making an active product incomplete. Drafts remain private regardless of their visibility flag.
- Implemented append-only price versioning: redefining a product/period/currency retires the previous active row with a validity end and creates a new active row with lossless minor-unit money.
- Implemented non-destructive archival that removes storefront visibility while preserving products, prices, and historical foreign-key references.
- Recorded administrator product creation, edits, lifecycle transitions, and pricing actions in `ActivityLog` without storing package identifiers or monetary values in audit metadata.
- Replaced the administrator product preview with product creation, selection, editing, catalogue ordering, visibility, package mapping, feature configuration, activation/draft/archive controls, new-price definition, and retained price history.
- Replaced fictional storefront product cards on `/` and `/hosting` with API-backed active public products, period and currency comparison, exact configured features, lossless currency-aware display, and product/price selection carried into registration for Command 9 checkout.
- Added shared-contract, product-rule unit, API integration, and frontend interaction tests plus durable product/pricing documentation.

#### Files changed

- Database schema/migration/seed/verifier: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260824213000_add_product_catalog_fields/migration.sql`, `packages/database/prisma/seed.ts`, `packages/database/prisma/verify.ts`
- Shared contracts/tests: `packages/shared/src/contracts/products.ts`, `packages/shared/src/contracts/states.ts`, `packages/shared/src/index.ts`, `packages/shared/test/contracts.spec.ts`
- Product API and unit tests: `apps/api/src/modules/products/**`, `apps/api/src/app.module.ts`
- API integration tests: `apps/api/test/products.e2e-spec.ts`
- Administrator interface: `apps/web/src/app/(admin)/admin/products/page.tsx`, `apps/web/src/components/products/admin-product-manager.tsx`
- Public catalogue: `apps/web/src/app/(store)/page.tsx`, `apps/web/src/app/(store)/hosting/page.tsx`, `apps/web/src/components/products/public-product-catalog.tsx`
- Frontend support/tests: `apps/web/src/lib/auth-api.ts`, `apps/web/src/components/products/product-management.test.tsx`
- Documentation: `README.md`, `docs/DATABASE.md`, `docs/PRODUCTS_AND_PRICING.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Prettier formatting check and `git diff --check`: passed.
- ESLint for API, worker, and web: passed without warnings.
- Strict TypeScript checks for all six code workspace projects: passed, including generated Prisma and Next.js route types.
- Complete non-integration suite: 10 shared-contract tests, 17 API tests, 1 worker test, and 10 frontend tests passed (38 total).
- Product rule tests: 2 passed, covering incomplete-product activation denial and complete-product readiness.
- API end-to-end suite: 4 suites and 13 tests passed against local PostgreSQL and Redis. Product coverage includes draft privacy, incomplete activation denial, editing/ordering, price retirement/versioning, active public browsing, package-identifier privacy, customer role denial, archival, history preservation, and administrator audits.
- Frontend suite: 4 files and 10 tests passed, including administrator provisioning/pricing controls, public annual/monthly comparison, exact checkout selection links, and comparison-table semantics.
- Prisma schema validation, migration application/status, fictional seed, and structural database verifier: passed; all five migrations are applied with no pending migration.
- Database, shared packages, NestJS API, NestJS worker, and Next.js production builds: passed for 24 application routes plus the framework not-found route.
- Prisma emitted its known OpenSSL detection warning in the generic Node validation container, but client generation, migration, seed, verifier, database-backed integration tests, and builds completed successfully.

#### Decisions made

- New products always begin as drafts. Public visibility is a separate merchandising flag and cannot expose a draft or archived product.
- Activation requires the hosting package identifier, every authorized display feature, and an active monthly, quarterly, or annual price.
- Only monthly, quarterly, and annual sale periods are supported by this application even though the original database vocabulary reserves additional periods for possible future use.
- Product repricing is append-only by period and currency. Retired prices remain visible to administrators and available to historical order references.
- Archival changes status and forces public visibility off; neither product nor price rows are deleted.
- Hosting package identifiers are provider-neutral non-secret configuration and are excluded from public responses. Actual cPanel credentials remain encrypted server-integration data.
- Storefront selection uses product and price IDs as navigation context only. Command 9 must reload and validate both records server-side before calculating or creating an order.
- Currency display derives ISO currency fraction digits through `Intl.NumberFormat` while calculations and API values remain integer/string minor units.

#### Open questions and risks

- Command 9 has not yet implemented checkout or order creation, so the registration query parameters preserve selection but do not create an order.
- Supported business currencies are not yet constrained by a business setting; the API currently accepts uppercase three-letter currency codes per price.
- The existing database validity-window fields are enforced on public reads and price replacement, but administrators do not yet have a future-price scheduling interface.
- Product package identifiers are not checked against a real cPanel server until the provisioning integration command is authorized.
- Product copy and limits are administrator-entered display values; operational provisioning limits must later be verified against the configured hosting package.
- Payment provider, SMTP delivery provider, production WHM credentials, tax rules, billing policies, and production hosting remain unresolved.

#### Recommended next command

Run **Command 9 — Implement Order Creation** after explicit user authorization.

### Command 9 — Implement Order Creation

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-24

#### Scope completed

- Added a unique order submission key and applied a safe migration that backfills existing orders before making the field required, bringing the database to six migrations.
- Added shared runtime contracts for normalized bare domains, customer/admin creation requests, paginated order queries, state updates, lossless order/item/invoice responses, and duplicate-result indicators.
- Added a NestJS `OrderModule` with authenticated customer checkout, administrator order creation, customer-owned history, administrator listing/search, protected detail, and explicit administrator state transitions.
- Revalidated active customer/account, matching active product and price, public visibility for customer checkout, price validity windows, hosting package readiness, normalized domain, and monetary range on the server.
- Calculated recurring, setup, and total amounts only from database values; strict request schemas reject browser-supplied totals or other unrecognized fields.
- Created the order, immutable item/provisioning snapshots, issued unpaid invoice, separate recurring/setup invoice lines, identity snapshots, and activity audit atomically.
- Added collision-resistant `ORD-YYYYMMDD-<64-bit hex>` and `INV-YYYYMMDD-<64-bit hex>` identifiers while retaining database uniqueness and UUID relationships.
- Added database-enforced duplicate submission protection that returns the original order/invoice for a matching retry and rejects submission-key reuse with different selections.
- Kept payment authoritative: new orders are `AWAITING_PAYMENT`, direct administrator `PAID` updates are rejected, and rejecting/cancelling an unpaid order cancels its initial invoice in the same transaction.
- Replaced the administrator order preview with protected order creation, operational listing, totals, state badges, and safe reject/cancel actions.
- Added customer checkout and owned-order history pages, portal navigation, checkout success summary, and direct public-catalogue selection links.
- Corrected a pre-existing nondeterministic CSRF tampering assertion discovered by full-suite validation so it always changes the token under test.
- Added order rule, API integration, and frontend interaction tests plus durable order-creation documentation.

#### Files changed

- Database schema/migration/seed: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260824224500_add_order_submission_key/migration.sql`, `packages/database/prisma/seed.ts`
- Shared order contracts: `packages/shared/src/contracts/orders.ts`, `packages/shared/src/index.ts`
- Order API and unit tests: `apps/api/src/modules/orders/**`, `apps/api/src/app.module.ts`
- API integration tests: `apps/api/test/orders.e2e-spec.ts`
- Customer checkout/history: `apps/web/src/app/(portal)/portal/checkout/page.tsx`, `apps/web/src/app/(portal)/portal/orders/page.tsx`, `apps/web/src/components/orders/customer-checkout.tsx`, `apps/web/src/components/orders/customer-order-list.tsx`
- Administrator orders: `apps/web/src/app/(admin)/admin/orders/page.tsx`, `apps/web/src/components/orders/admin-order-manager.tsx`
- Catalogue/navigation/frontend tests: `apps/web/src/components/products/public-product-catalog.tsx`, `apps/web/src/components/products/product-management.test.tsx`, `apps/web/src/app/(portal)/portal/layout.tsx`, `apps/web/src/components/orders/order-management.test.tsx`, `apps/web/src/components/orders/order-ui.tsx`
- Deterministic existing security test: `apps/api/src/modules/auth/services/auth-security.spec.ts`
- Documentation: `README.md`, `docs/DATABASE.md`, `docs/ORDER_CREATION.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Prisma schema validation, six-migration application/status, fictional seed, and structural database verifier: passed against the isolated PostgreSQL service.
- Prettier formatting check, `git diff --check`, and ESLint for API, worker, and web: passed without warnings.
- Strict TypeScript checks for all six code workspace projects: passed, including generated Prisma and Next.js route types.
- Complete non-integration suite: 10 shared-contract tests, 19 API tests, 1 worker test, and 12 frontend tests passed (42 total).
- Order rule tests: 2 passed for collision-resistant number formatting and permitted/forbidden state transitions.
- API end-to-end suite: 5 suites and 17 tests passed against local PostgreSQL and Redis. Order coverage includes normal atomic customer checkout, server totals, historical snapshots, invalid products, archived prices, browser-total rejection, duplicate submissions, ownership/role denial, administrator creation, invoice cancellation, paid-state protection, listing, and audit records.
- Frontend suite: 5 files and 12 tests passed, including authoritative checkout payloads, idempotency keys, order success output, administrator state controls, and updated catalogue checkout links.
- Database, shared packages, NestJS API, NestJS worker, and Next.js production builds: passed; Next.js generated 26 application routes plus the framework not-found route, including dynamic checkout search parameters.

#### Decisions made

- Customer checkout derives the customer ID only from the authenticated session. Administrator creation may select an active customer.
- Customer checkout requires an active, public product; administrators may order an active hidden product for offline/private sales, but cannot use draft, archived, retired, expired, or future prices.
- The UUID submission key is stable across client retries. Matching reuse returns the original result; different input with the same key is a conflict.
- Order subtotal stores recurring price, setup total stores the one-time fee, and invoice lines itemize both while the invoice subtotal/total includes both.
- New-order invoices are issued unpaid and due immediately. Payment collection and manual-payment approval remain later commands.
- The initial invoice snapshots `business.identity` when configured and otherwise uses the minimal application name; Command 10 must add the owner-configurable legal business identity and finalized invoice policy.
- Direct order payment transitions are reserved for verified payment processing. A browser redirect or administrator status patch cannot prove payment.

#### Open questions and risks

- Legal business identity, finalized invoice numbering policy, tax calculation, due-date policy, and invoice presentation belong to Command 10; current initial invoices use collision-resistant provisional numbers, zero tax/discount, immediate due dates, and the minimal configured/fallback identity snapshot.
- Checkout currently supports one hosting product per order, matching the personal-hosting MVP; multi-item carts and quantity controls are intentionally absent.
- Domain validation covers normalized ASCII hostnames, including punycode labels, but domain registration, availability lookup, IDN Unicode conversion, and registrar automation are outside scope.
- Payment, payment callbacks, manual-payment approval, service creation, provisioning, email delivery, and renewal automation remain unimplemented and must preserve the separate state boundaries.
- The portal and administrator shell identity/search/notification content remains fictional from Command 6; order module data itself comes from protected APIs.
- The PostgreSQL driver emits a known pg@9 deprecation warning during E2E teardown/query concurrency; all tests pass, but the adapter should be rechecked when upgrading `pg`.

#### Recommended next command

Run **Command 10 — Implement Invoices** after explicit user authorization.

### Command 10 — Implement Invoices

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-25

#### Scope completed

- Extended invoices with database-unique submission keys and invoice-level credit totals, safely backfilled existing rows, and replaced the balance constraint with `total - credit - paid` plus a settlement-limit constraint.
- Updated order-generated and fictional seed invoices for required idempotency keys and deterministic per-invoice line positions; updated structural verification for the nine-migration schema, credit money column, settlement constraint, and line ordering invariant.
- Added shared runtime contracts for business identity, billing address snapshots, invoice lines, draft creation/editing, safe actions, listing/filtering, full invoice documents, and idempotent creation results.
- Added checked integer-only calculation rules for item multiplication, discounts, taxes, invoice aggregation, credits, payments, and balances, with explicit PostgreSQL `BIGINT` overflow detection.
- Added a NestJS `InvoiceModule` with administrator business identity settings, idempotent standalone draft creation, concurrency-guarded draft replacement and state actions, issuance, overdue marking, cancellation, administrator search/filtering, customer-owned lists, and protected details.
- Preserved order-created invoices as already-issued unpaid documents while enabling editable administrator drafts with custom historical line descriptions, prices, discounts, taxes, credits, service periods, currency, and due dates.
- Added stable `INV-YYYYMMDD-<64-bit hex>` numbers, deterministic invoice-line positions, and moved shared order/invoice number generation into a common API identifier utility.
- Snapshotted customer billing identity, address, tax identity, and configured business identity. Later customer/setting edits do not rewrite existing invoice documents.
- Enforced cancellation rules: only drafts and unpaid/overdue invoices without received payments may be cancelled; paid invoices require later refund/reversal workflows; issued invoices have no deletion route.
- Reserved `PAID`, `PARTIALLY_REFUNDED`, and `REFUNDED` financial transitions for verified Command 11 transactions while fully supporting their response/display states.
- Coordinated cancellation of an initial invoice with a still-pending order and recorded invoice plus order audit events transactionally.
- Replaced administrator and customer invoice previews with live protected lists, business identity settings, multi-line draft creation, draft editing, detail documents, state actions, balances, and due dates.
- Added a focused customer printable route with historical business/customer identities, itemized lines, totals, credits, payments, balance, status, and browser print control.
- Added extensive calculation, state-transition, API integration, authorization, historical snapshot, idempotency, cancellation, non-deletion, overdue, zero-value, large-value, and frontend tests.

#### Files changed

- Database schema/migrations/seed/verifier: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260825090000_add_invoice_credit_and_submission_key/migration.sql`, `packages/database/prisma/migrations/20260825193000_preserve_invoice_item_order/migration.sql`, `packages/database/prisma/migrations/20260825194500_remove_redundant_invoice_item_index/migration.sql`, `packages/database/prisma/seed.ts`, `packages/database/prisma/verify.ts`
- Shared contracts: `packages/shared/src/contracts/invoices.ts`, `packages/shared/src/index.ts`
- Common numbering and order integration: `apps/api/src/common/identifiers/business-number.ts`, `apps/api/src/modules/orders/order.service.ts`, `apps/api/src/modules/orders/order.service.spec.ts`
- Invoice API and calculation/state tests: `apps/api/src/modules/invoices/**`, `apps/api/src/app.module.ts`
- API integration tests: `apps/api/test/invoices.e2e-spec.ts`
- Administrator interfaces: `apps/web/src/app/(admin)/admin/invoices/**`, `apps/web/src/components/invoices/admin-invoice-manager.tsx`, `apps/web/src/components/invoices/invoice-draft-editor.tsx`
- Customer and printable interfaces: `apps/web/src/app/(portal)/portal/invoices/**`, `apps/web/src/app/invoices/[invoiceId]/print/page.tsx`, `apps/web/src/components/invoices/customer-invoice-list.tsx`, `apps/web/src/components/invoices/invoice-detail.tsx`, `apps/web/src/components/invoices/invoice-document.tsx`, `apps/web/src/components/invoices/invoice-ui.tsx`
- Frontend tests: `apps/web/src/components/invoices/invoice-management.test.tsx`
- Documentation: `README.md`, `docs/DATABASE.md`, `docs/INVOICES.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Prisma schema validation, nine-migration application/status, fictional seed, and structural database verifier: passed against isolated PostgreSQL.
- Prettier formatting check, `git diff --check`, and ESLint for API, worker, and web: passed without warnings.
- Strict TypeScript checks for all six code workspace projects: passed, including generated Prisma and Next.js route types.
- Complete non-integration suite: 10 shared-contract tests, 29 API tests, 1 worker test, and 15 frontend tests passed (55 total).
- Invoice calculation/state suite: 10 passed, covering full aggregation, zero values, exact `BIGINT` maximum, overflow, excessive discount/credit, issuance, zero-balance settlement, overdue eligibility, cancellation, and paid-history protection.
- API end-to-end suite: 6 suites and 22 tests passed against local PostgreSQL and Redis. Invoice coverage includes identity settings, idempotent draft creation, exact calculations, draft replacement, issuance immutability, historical snapshots, customer ownership, role denial, cancellation, non-deletion, zero-value settlement, overdue transition, invalid credit denial, and audit records.
- Frontend suite: 6 files and 15 tests passed, including customer lists, historical documents, exact balances, print behavior, and administrator draft/identity controls.
- Database, shared packages, NestJS API, NestJS worker, and Next.js production builds: passed; Next.js generated 29 application routes plus the framework not-found route, including administrator/customer invoice details and the printable route.

#### Decisions made

- Administrator-created invoices start as drafts; order invoices remain issued/unpaid at atomic order creation.
- Invoice calculations use only checked `bigint` minor-unit arithmetic. Browsers submit item inputs, never calculated invoice totals.
- Invoice total remains the billed amount before credit/payment settlement; balance subtracts both invoice credit and verified paid amount.
- Credit is editable only while the invoice is a draft and becomes immutable at issuance. Future credit/refund transaction policy remains Command 11 work.
- Zero-balance or fully credited drafts become paid when issued without fabricating a payment amount; positive-balance drafts become unpaid.
- Issued invoice lines, due date, currency, and identity snapshots cannot be edited or deleted. Cancellation is a status/timestamp transition.
- Direct paid/refunded status actions are not exposed. Those states require verified financial transactions in the next command.
- Business identity is owner-configurable through the invoice interface and snapshots only into future documents.
- Invoice items have immutable positive line positions once issued, preserving the administrator's input order in details and printed documents.
- Submission-key retries compare normalized dates and ordered line content exactly; reordered or otherwise changed requests conflict instead of silently reusing a different document.

#### Open questions and risks

- The owner must enter final legal business identity, supported operating currency, and any real VAT/tax registration values before production invoices are issued.
- Tax amounts are explicit administrator-entered minor units in this release; automatic tax-rate calculation is intentionally absent until the business tax policy is defined.
- Credit is an invoice-level settlement snapshot, not yet a separate credit ledger transaction. Command 11 must define how manual payments, credits, refunds, and reversals update settlement aggregates atomically.
- Automatic overdue marking, renewal invoices, reminders, and suspension remain later automation commands; this command provides a guarded manual overdue transition.
- Printable invoices use the browser print dialog rather than server-generated PDF storage. A PDF renderer can be added only if a durable PDF requirement arises.
- The PostgreSQL driver emits a known pg@9 deprecation warning during E2E activity; all database tests pass, but the adapter should be reviewed when upgrading `pg`.

#### Recommended next command

Run **Command 11 — Implement Manual Payments** after explicit user authorization.

### Command 11 — Implement Manual Payments

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-25

#### Scope completed

- Extended manual payments with controlled method, structured proof metadata, reviewer identity, review timestamp, and database checks aligning pending/succeeded/failed records with their review and verification history.
- Added shared strict runtime contracts for customer submissions, administrator-recorded receipts, review actions, append-only adjustments, payment policy, ledger filtering, lossless payment responses, and the business-facing pending/verified/rejected/refunded/reversed states.
- Added a NestJS `PaymentModule` with administrator policy management, immediately verified administrator receipts, customer-owned pending submissions, protected lists/details, administrator verification/rejection, and idempotent refunds/reversals.
- Derived payment currency and invoice/customer ownership server-side. Customer proof accepts only controlled text fields and intentionally has no file, URL, attachment, binary, card, secret, or raw-provider-payload field.
- Made partial payments explicitly configurable through the audited `billing.manual-payments` setting and disabled them by default. The rule is rechecked when a pending payment is verified.
- Applied verified charges under an invoice row lock in one database transaction, conditionally consumed each pending payment once, recalculated invoice paid/balance values, transitioned fully settled invoices to paid, and marked linked awaiting-payment orders paid without changing service state.
- Serialized different payments for the same invoice to prevent concurrent overpayment and handled verified manual references plus UUID submission keys idempotently.
- Preserved every verified original charge. Refunds and reversals append positive-valued linked adjustment rows, enforce the remaining adjustable amount, reduce net paid value, and transition invoices to partially refunded or refunded without deleting or rewriting history.
- Added administrator/security audit records for policy changes, customer submissions, administrator receipts, reviews, linked paid orders, refunds, and reversals without placing internal reference hashes or secrets in responses.
- Replaced the administrator payment preview with a live payment ledger, verified receipt form, pending review actions, explicit partial-payment policy, and refund/reversal entry.
- Added a customer manual-reference form and invoice-scoped payment history to protected customer invoice details, including clear warnings against submitting credentials or financial secrets.
- Added contract, integration, authorization, idempotency, concurrency, adjustment, database, and responsive-interface tests plus dedicated manual-payment documentation.

#### Files changed

- Database schema/migrations/seed/verifier: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260825210000_add_manual_payment_review_metadata/migration.sql`, `packages/database/prisma/migrations/20260825211500_require_manual_payment_reference/migration.sql`, `packages/database/prisma/seed.ts`, `packages/database/prisma/verify.ts`
- Shared contracts/tests: `packages/shared/src/contracts/payments.ts`, `packages/shared/src/index.ts`, `packages/shared/test/contracts.spec.ts`
- Payment API and application registration: `apps/api/src/modules/payments/**`, `apps/api/src/app.module.ts`
- API integration and concurrency tests: `apps/api/test/payments.e2e-spec.ts`
- Administrator interface: `apps/web/src/app/(admin)/admin/payments/page.tsx`, `apps/web/src/components/payments/admin-payment-manager.tsx`, `apps/web/src/components/payments/payment-ui.ts`
- Customer interface: `apps/web/src/components/payments/customer-manual-payment.tsx`, `apps/web/src/components/invoices/invoice-detail.tsx`
- Frontend tests: `apps/web/src/components/payments/payment-management.test.tsx`
- Documentation: `README.md`, `docs/DATABASE.md`, `docs/INVOICES.md`, `docs/MANUAL_PAYMENTS.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Prisma schema validation, eleven-migration application/status, fictional seed, and structural database verifier: passed against isolated PostgreSQL.
- Prettier formatting check, `git diff --check`, and ESLint for API, worker, and web: passed without warnings.
- Strict TypeScript checks for all six code workspace projects: passed, including generated Prisma and Next.js route types.
- Complete non-integration suite: 11 shared-contract tests, 29 API tests, 1 worker test, and 17 frontend tests passed (58 total).
- Manual-payment API suite: 6 passed for owned pending/idempotent submission, disabled partial rejection, concurrent single application, rejection without settlement, explicitly enabled partial payments, concurrent overpayment prevention, append-only refunds/reversals, immutable originals, protected output, and administrator audits.
- Complete API end-to-end suite: 7 suites and 28 tests passed against local PostgreSQL and Redis.
- Frontend suite: 7 files and 17 tests passed, including administrator ledger/review/policy controls and structured customer proof submission without file fields.
- Database, shared packages, NestJS API, NestJS worker, and Next.js production builds: passed; Next.js generated 29 application routes plus the framework not-found route.

#### Decisions made

- The existing provider-neutral database kind/status vocabulary remains stable; the manual-payment API derives the business-facing pending, verified, rejected, refunded, and reversed states.
- Customer submissions are untrusted pending references. Only an administrator review or authenticated administrator-recorded receipt can establish a verified manual payment.
- Partial payments default to disabled and require an explicit audited setting. Both submission and verification enforce the current policy and balance.
- All charge and adjustment amounts are canonical integer minor-unit strings at JSON boundaries and PostgreSQL `BIGINT` internally. Currency always comes from the invoice.
- Invoice row locking is the concurrency boundary for all settlement changes. Conditional pending-state mutation additionally prevents the same payment from being applied twice.
- Verified references receive an internal normalized SHA-256 identifier for uniqueness; the hash is never returned. Rejected pending references remain immutable but do not reserve the verified-reference identifier.
- Refund and reversal amounts are stored as positive append-only adjustment transactions. The original charge and its proof remain unchanged.
- A fully paid initial order may move from awaiting payment to paid in the settlement transaction. Refunds/reversals do not automatically regress orders or alter hosting services.
- Manual proof is structured text only. File proof can be designed later only with explicit storage, malware-scanning, content-type, size, authorization, retention, and download controls.

#### Open questions and risks

- The owner must define the accepted bank/mobile methods, customer-facing payment instructions, daily reconciliation process, and who is authorized to verify each method before production use.
- Partial payments remain disabled unless the owner deliberately enables them. Enabling them affects future submissions and pending-payment reviews immediately.
- Free-text payer names and notes should contain only the minimum necessary evidence; administrators must not ask customers for passwords, PINs, card data, one-time codes, or account secrets.
- Refund/reversal eligibility and any service/order consequences require the owner's final refund policy. This command intentionally makes no automatic service change.
- Payment-received email/outbox work and service provisioning/reactivation remain later commands and must not roll back recorded settlement if those side effects fail.
- Real provider sessions, signed callbacks, replay protection, merchant verification, and gateway reconciliation belong to Command 12 and later provider commands.
- The PostgreSQL driver emits a known pg@9 deprecation warning during E2E activity; all database tests pass, but the adapter should be reviewed when upgrading `pg`.

#### Recommended next command

Run **Command 12 — Create the Payment Adapter** after explicit user authorization.

### Command 12 — Create the Payment Adapter

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-25

#### Scope completed

- Added strict shared contracts for payment-session requests/results, normalized provider events, webhook acknowledgements, and a stable payment-webhook rejection error.
- Added a provider-neutral `PaymentGateway` interface covering idempotent session creation, exact-raw-body signature verification, event normalization, transaction-status lookup, transaction-ID extraction, and an optional refund operation.
- Implemented `FakePaymentGateway` for development and automated tests with deterministic sessions, domain-separated HMAC-SHA256 signatures, normalized fake events, status fixtures, and optional fake refunds.
- Restricted the fake provider to development/test environments and added a provider registry that rejects unknown or production fake gateways.
- Added protected customer/administrator session creation with ownership enforcement, full current invoice balance derived server-side, UUID retry protection, pending gateway payments, provider session references, and audit history.
- Enabled NestJS raw-body capture and added a narrowly scoped CSRF exemption for authenticated provider callbacks while retaining Redis-backed source rate limiting and a 256 KiB body limit.
- Added a callback pipeline that verifies signatures before parsing, validates merchant/payment/invoice/amount/currency/status/transaction identity, hashes the exact payload, and records unique normalized provider events without storing raw payloads or signatures.
- Added invoice-row locking and one financial transaction for payment finalization, event processing, invoice settlement, linked awaiting-payment order transition, machine audit records, and a durable outbox handoff.
- Made exact event replays idempotent, rejected reused event IDs with different bytes, rejected duplicate provider transactions, and serialized simultaneous deliveries so settlement occurs once.
- Recorded provider-declared failures without changing invoice balances and stored pending notifications as ignored. Slow email, provisioning, renewal, and reactivation effects remain outside the webhook request.
- Added focused interface/adapter tests, comprehensive API integration and concurrency tests, durable gateway documentation, and the raw-body callback architecture decision.

#### Files changed

- Shared contracts/tests: `packages/shared/src/contracts/payment-gateways.ts`, `packages/shared/src/contracts/errors.ts`, `packages/shared/src/index.ts`, `packages/shared/test/contracts.spec.ts`
- Provider-neutral gateway and fake adapter: `apps/api/src/modules/payment-gateways/payment-gateway.interface.ts`, `apps/api/src/modules/payment-gateways/fake-payment.gateway.ts`, `apps/api/src/modules/payment-gateways/payment-gateway.registry.ts`
- Gateway API and processing pipeline: `apps/api/src/modules/payment-gateways/payment-gateway.controller.ts`, `apps/api/src/modules/payment-gateways/payment-gateway.service.ts`, `apps/api/src/modules/payment-gateways/payment-gateway.module.ts`, `apps/api/src/app.module.ts`
- Exact raw-body and callback security: `apps/api/src/main.ts`, `apps/api/src/modules/auth/decorators/skip-csrf.decorator.ts`, `apps/api/src/modules/auth/decorators/rate-limit.decorator.ts`, `apps/api/src/modules/auth/guards/csrf.guard.ts`
- Adapter and API tests: `apps/api/src/modules/payment-gateways/fake-payment.gateway.spec.ts`, `apps/api/test/payment-gateways.e2e-spec.ts`
- Documentation: `README.md`, `docs/DATABASE.md`, `docs/MANUAL_PAYMENTS.md`, `docs/PAYMENT_GATEWAYS.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Prisma schema validation, eleven-migration status, idempotent fictional seed, and structural database verifier: passed against the isolated PostgreSQL service; no schema migration was required because the provider-neutral payment/event/outbox tables and uniqueness constraints already existed.
- Prettier formatting check, `git diff --check`, and ESLint for API, worker, and web: passed without warnings.
- Strict TypeScript checks for all six code workspace projects: passed, including generated Prisma and Next.js route types.
- Complete non-integration suite: 12 shared-contract tests, 33 API tests, 1 worker test, and 17 frontend tests passed (63 total).
- Fake gateway unit suite: 4 passed for deterministic session idempotency, exact-byte signature validation, event normalization/transaction extraction, transaction query, and optional refund behavior.
- Gateway API suite: 10 passed for session ownership/idempotency, verified settlement, exact replay, exact-body tampering, wrong merchant/amount/currency/invoice, duplicate transactions, concurrent delivery, provider failure, event audit state, and outbox uniqueness.
- Complete API end-to-end suite: 8 suites and 38 tests passed against local PostgreSQL and Redis.
- Database, shared packages, NestJS API, NestJS worker, and Next.js production builds: passed with `NODE_ENV=production`; Next.js generated 29 application routes plus the framework not-found route.
- The first aggregate build inherited the development environment from `.env`, which caused a Next.js development/production React mismatch during prerendering. Re-running the production build with the correct `NODE_ENV=production` passed; no source change was needed.

#### Decisions made

- Gateway checkout attempts are persisted as pending full-balance charges. A session response or browser redirect never changes payment or invoice state.
- The invoice row remains the concurrency boundary. A successful callback must still equal both the stored session amount and current invoice balance, so a stale session cannot overpay an invoice changed by another payment.
- Signature verification uses the exact raw request bytes before parsing. Only a SHA-256 payload hash and strict normalized fields are retained; raw provider payloads and signatures are discarded.
- Public webhook routes explicitly skip browser CSRF because they use provider authentication, but keep bounded payloads and Redis-backed source throttling.
- Validly signed mismatches are retained as failed immutable provider events for reconciliation without financial mutation. Invalid signatures and malformed untrusted payloads are not persisted as financial events.
- Financial callback work completes synchronously and atomically; slow/retryable follow-up work receives an outbox event and cannot roll back settlement.
- The fake adapter derives a domain-separated test/development signing key from existing non-production secret material and is unavailable in production. A real gateway must receive independent validated secrets in Command 13.

#### Open questions and risks

- The production payment provider and sandbox account remain unselected. Endpoint behavior, signature rules, credentials, reconciliation semantics, timeouts, and retry policy must come from that provider's current official documentation in Command 13.
- The fake checkout URL is intentionally a development placeholder; no customer-facing fake checkout page or browser-success settlement endpoint was added.
- Outbox consumption, payment emails, provisioning, service renewal/reactivation, and administrator reconciliation interfaces remain later work. Their failure must never alter the verified financial record.
- Pending sessions do not yet have an automated expiry/cleanup workflow. They retain auditable pending state and can be addressed with provider reconciliation/automation after the real provider contract is known.
- The PostgreSQL driver continues to emit its known pg@9 concurrency deprecation warning during E2E activity, and the minimal Node validation container emits Prisma OpenSSL auto-detection warnings. All database, concurrency, and build checks passed.

#### Recommended next command

Run **Command 13 — Integrate the Real Payment Provider** after the production provider is selected and explicit user authorization is given. Do not use production credentials or make a real charge.

### Command 13 — Integrate the Real Payment Provider

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-25

#### Scope completed

- Implemented sandbox-only bKash Tokenized Checkout and SSLCOMMERZ Hosted Checkout adapters using their current official API contracts while preserving the development/test fake gateway.
- Added runtime-validated enable flags, the official bKash sandbox host restriction, complete-credential requirements, a public API callback origin, and a bounded 1–30 second provider timeout. Both real adapters remain disabled by default.
- Added a provider HTTP boundary that rejects redirects, parses responses as unknown data, validates all provider responses with strict runtime schemas, applies bounded retries only to safe token/read operations, and emits fixed redacted failures without response bodies, URLs, credentials, tokens, or secrets.
- Added lossless BDT major/minor conversion using strings and `bigint`; no JavaScript floating-point money calculation is used. SSLCOMMERZ enforces its documented sandbox amount range.
- Implemented bKash grant-token caching, checkout creation, browser callback handling, authenticated server-side execute, and payment-status query fallback after an uncertain execute response. Browser callback values alone can never settle an invoice.
- Implemented SSLCOMMERZ v4 session creation, exact raw form-body IPN parsing, authoritative Order Validation API verification, transaction/validation/payment/invoice/amount/currency matching, high-risk holding, and Merchant Transaction ID reconciliation. Browser success/fail/cancel returns navigate only and cannot settle an invoice.
- Extended the shared gateway boundary for asynchronous provider verification, sandbox descriptors, customer billing snapshots, completion of redirect-based sessions, and normalized query timestamps/failures.
- Persisted checkout URL/expiry metadata for exact idempotent session replay and added an atomic external-session claim so simultaneous retries cannot create duplicate provider sessions. Uncertain creation outcomes remain pending for reconciliation instead of being blindly retried.
- Added enabled gateway discovery, administrator-only safe failure listing and reconciliation, and reuse of the Command 12 merchant/payment/invoice/amount/currency/transaction/replay checks plus invoice-locked settlement for provider callbacks and queries.
- Added customer invoice checkout choices for enabled bKash/SSLCOMMERZ sandboxes, retained the existing cash/bank-deposit review form, and added an administrator gateway attention queue that exposes only fixed safe failure information.
- Added mocked provider-contract, money-conversion, configuration, redaction-contract, and frontend tests plus official sandbox setup, callback, retry, reconciliation, and security documentation. No provider network call, production credential, or real/sandbox charge was used during automated validation.

#### Files changed

- Runtime configuration: `.env.example`, `packages/config/src/env.ts`, `apps/api/src/environment.spec.ts`
- Database and migration: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260825220000_add_gateway_session_metadata/migration.sql`
- Shared gateway contracts/tests: `packages/shared/src/contracts/payment-gateways.ts`, `packages/shared/test/contracts.spec.ts`
- Provider HTTP/security/money boundary: `apps/api/src/modules/payment-gateways/payment-http.client.ts`, `payment-provider.error.ts`, `payment-money.ts`, `payment-money.spec.ts`
- Real adapters and mocked contracts: `apps/api/src/modules/payment-gateways/bkash-payment.gateway.ts`, `bkash-payment.gateway.spec.ts`, `sslcommerz-payment.gateway.ts`, `sslcommerz-payment.gateway.spec.ts`
- Gateway application/API changes: `apps/api/src/modules/payment-gateways/payment-gateway.interface.ts`, `payment-gateway.registry.ts`, `payment-gateway.module.ts`, `payment-gateway.service.ts`, `payment-gateway.controller.ts`, `fake-payment.gateway.ts`, `fake-payment.gateway.spec.ts`, `apps/api/src/modules/auth/decorators/rate-limit.decorator.ts`
- Customer and administrator interfaces/tests: `apps/web/src/components/payments/customer-gateway-payment.tsx`, `gateway-failure-panel.tsx`, `admin-payment-manager.tsx`, `apps/web/src/components/invoices/invoice-detail.tsx`, `apps/web/src/components/payments/payment-management.test.tsx`
- Documentation: `README.md`, `docs/PAYMENT_GATEWAYS.md`, `docs/DATABASE.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Current official provider documentation reviewed for bKash grant/create/execute/query Tokenized Checkout and SSLCOMMERZ v4 create/IPN/Order Validation/Merchant Transaction validation behavior.
- Prisma schema formatting/validation, twelve-migration deployment/status, and the additive gateway-session metadata migration: passed against local isolated PostgreSQL. No existing financial row was rewritten or removed.
- Prettier repository formatting check, `git diff --check`, and ESLint for API, worker, and web: passed without warnings.
- Strict TypeScript checks for all six code workspace projects: passed, including generated Prisma and Next.js route types.
- Complete non-integration suite: 13 shared-contract tests, 46 API tests, 1 worker test, and 18 frontend tests passed (78 total).
- Mocked real-provider suites: 9 adapter tests plus 2 money tests passed for exact sandbox endpoints/payloads, no-retry mutations, uncertain-result classification, token caching, execute/query fallback, authoritative SSLCOMMERZ validation, mismatch/high-risk holding, status normalization, and lossless conversion.
- Complete API end-to-end suite: 8 suites and 38 tests passed against local PostgreSQL and Redis, including the existing gateway settlement/replay/concurrency coverage.
- Database, shared packages, NestJS API, NestJS worker, and Next.js production builds: passed with `NODE_ENV=production`; Next.js generated 28 application routes including the framework not-found route.

#### Decisions made

- bKash and SSLCOMMERZ are independent adapters because their payment-proof contracts differ. No generic or invented signature algorithm is used.
- bKash callback status triggers authenticated execute/query; it is never proof. SSLCOMMERZ settlement requires the official Order Validation API even when an IPN contains signature fields.
- Real-provider support is sandbox-only, disabled by default, BDT-only, and restricted to documented sandbox hosts/endpoints. Production enablement is a separate explicitly authorized security and go-live task.
- External mutations are not automatically retried after an uncertain result. Token grant retries once; status/validation queries retry at most twice for network or provider `5xx` failures.
- Provider checkout metadata is private idempotency state. It is returned only to the authorized payer and omitted from administrator failures, logs, audit metadata, provider events, and documentation examples.
- High-risk SSLCOMMERZ transactions remain pending for review. They never settle invoices automatically or invite an unsafe automatic retry.
- Cash/bank deposits remain the administrator-reviewed manual-payment flow from Command 11; they are not sent to either online provider.
- Provider payment success may mark an invoice/order paid but remains independent from hosting provisioning success.

#### Open questions and risks

- Sandbox merchant credentials have not been supplied or placed in the repository, so both adapters remain disabled and no manual sandbox checkout was performed. The owner must obtain provider-issued sandbox credentials and authorize a later deliberate end-to-end sandbox acceptance run.
- Provider callbacks require an externally reachable HTTPS `API_PUBLIC_ORIGIN`. A secure development hostname/tunnel and provider dashboard callback allowlisting must be prepared before manual sandbox acceptance.
- Production account approval, live endpoints, credential storage/rotation, provider-side allowlists, go-live checklist, financial reconciliation ownership, refund operations, and production monitoring remain explicitly outside this command.
- bKash/SSLCOMMERZ API contracts can change; re-check official documentation and rerun mocked plus manual sandbox acceptance before any version/endpoint or production change.
- Pending session expiry/cleanup and recurring automated reconciliation remain later automation work; uncertain attempts are currently retained for explicit administrator reconciliation.
- The PostgreSQL driver continues to emit its known pg@9 concurrency deprecation warning during E2E activity, and the minimal Node validation container emits Prisma OpenSSL auto-detection warnings. All migration, database, test, type, lint, and build checks passed.

#### Recommended next command

Run **Command 14 — Implement Services** after explicit user authorization.

### Command 14 — Implement Services

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-25

#### Scope completed

- Added strict shared contracts for safe server summaries, complete hosting-service responses, administrator list filters, paid-order fulfilment options, idempotent creation results, and state-specific transition evidence.
- Expanded the service schema with a required product-price reference, server, product name/description/provisioning snapshots, start and next-due dates, external account identity, separate suspension/provisioning-failure/cancellation/termination evidence, and the terminating administrator identity.
- Added a safe additive migration that backfills existing services, refuses incomplete historical data, enforces restrictive relationships, and applies database checks for due dates, active account identity, and state-specific evidence.
- Implemented UTC calendar-period calculation with month-end clamping for monthly, quarterly, and annual renewal dates.
- Added administrator service creation from eligible `PAID` or `PROCESSING` order items only. The order item is the idempotency boundary, and row locks on both the order item and selected server protect duplicate creation and capacity decisions.
- Kept payment, order fulfilment, and hosting state separate: creation produces a `PENDING` service and moves a paid order to `PROCESSING`; no paid invoice, redirect, or service creation marks provisioning successful.
- Implemented the validated lifecycle `PENDING` → `PROVISIONING` → `ACTIVE`, failure/retry and pre-activation cancellation paths, active suspension/reactivation, and confirmed terminal termination. Activation requires external account identity, exceptional states require reasons, and termination requires the exact `TERMINATE` confirmation.
- Completed a processing order only when every order item has an `ACTIVE` service. Pending, failed, suspended, cancelled, and terminated records never satisfy that fulfilment test.
- Added administrator inventory/fulfilment controls and customer-owned service list/detail pages with status, server, account identity, historical product/price information, renewal data, and safe operational reasons.
- Enforced administrator-only creation/transitions plus customer resource ownership, safe server serialization, atomic activity logs, and immutable service records.
- Added transition/date unit coverage, complete service API integration and ownership tests, frontend interaction tests, database verifier coverage, durable service documentation, and an architecture decision.

#### Files changed

- Database and migration: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260825230000_complete_service_management/migration.sql`, `packages/database/prisma/seed.ts`, `packages/database/prisma/verify.ts`
- Shared service contracts/tests: `packages/shared/src/contracts/services.ts`, `packages/shared/src/index.ts`, `packages/shared/test/contracts.spec.ts`
- Service API and tests: `apps/api/src/modules/services/service-period.ts`, `service.controller.ts`, `service.module.ts`, `service.service.ts`, `service.service.spec.ts`, `apps/api/test/services.e2e-spec.ts`, `apps/api/src/app.module.ts`
- Historical customer detail: `apps/api/src/modules/customers/customer.service.ts`
- Administrator/customer interfaces and tests: `apps/web/src/components/services/admin-service-manager.tsx`, `customer-service-list.tsx`, `customer-service-detail.tsx`, `service-ui.tsx`, `service-management.test.tsx`, `apps/web/src/app/(admin)/admin/services/page.tsx`, `apps/web/src/app/(portal)/portal/services/page.tsx`, `apps/web/src/app/(portal)/portal/services/[serviceId]/page.tsx`
- Documentation: `README.md`, `docs/SERVICES.md`, `docs/DATABASE.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Prisma schema formatting/validation, thirteen-migration deploy/status, idempotent fictional seed, and structural verifier: passed against isolated PostgreSQL, including all new service evidence constraints and snapshot relationships.
- Prettier repository formatting check, `git diff --check`, and ESLint for API, worker, and web: passed without warnings.
- Strict TypeScript checks for all six code workspace projects: passed, including generated Prisma and Next.js route types.
- Complete non-integration suite: 14 shared-contract tests, 48 API tests, 1 worker test, and 21 frontend tests passed (84 total).
- Service API suite: 4 passed for paid-order-only/idempotent creation, provisioning/activation/suspension/termination evidence, failure/retry/cancellation metadata, ownership, administrator authorization, and paid-order independence.
- Complete API end-to-end suite: 9 suites and 42 tests passed against local PostgreSQL and Redis.
- Database, shared packages, NestJS API, NestJS worker, and Next.js production builds: passed with `NODE_ENV=production`; the route table includes the new dynamic customer service detail page.

#### Decisions made

- A service is an operational record created from a historical paid order item, not a side effect or alias of invoice settlement.
- Product-price identity, product text, provisioning configuration, domain, billing period, money, and dates are snapshotted so catalogue changes cannot rewrite existing services.
- Order-item locking and uniqueness make fulfilment idempotent. Server-row locking serializes configured capacity checks across different order items.
- An active service must contain its real external account identity. State-specific reasons and timestamps are required in both application validation and PostgreSQL checks.
- Cancellation is terminal before activation; termination is terminal after activation and stores reason, time, and administrator identity. Permanent termination is never scheduled automatically.
- Command 14 records manual operational outcomes and performs no hosting-panel request. External account creation and consistency handling remain behind the provider-neutral adapter authorized by Command 15.

#### Open questions and risks

- cPanel/WHM versus DirectAdmin, credential/authentication method, dedicated development server identity, and test account/package remain intentionally unresolved until the real adapter command. Command 15 uses a fake adapter only.
- Service next-due dates are initial historical facts. Renewal invoice generation, due-date advancement, automatic suspension, and reactivation are later automation commands and must retain independent financial/operational evidence.
- The current administrator interface operates on the first 100 services and eligible order items; server-side pagination/filter controls can be expanded if the private inventory grows beyond that operating size.
- No server reassignment, domain change, package change, password change, login URL, or external account mutation is performed yet; those operations require the hosting-panel boundary and audit/idempotency rules from Command 15.
- The PostgreSQL driver continues to emit its known pg@9 concurrency deprecation warning during E2E activity, and the minimal Node validation container emits Prisma OpenSSL auto-detection warnings. All migration, database, concurrency, test, type, lint, and build checks passed.

#### Recommended next command

Run **Command 15 — Create the Hosting-Panel Adapter** after explicit user authorization. Use `FakeHostingPanel` only; do not contact the cPanel development server or use panel credentials in this command.

### Command 15 — Create the Hosting-Panel Adapter

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-25

#### Scope completed

- Added a provider-neutral `HostingPanel` interface covering connection testing, idempotent account creation, account lookup, suspension, unsuspension, package/password changes, ephemeral login URLs, and termination.
- Implemented `FakeHostingPanel` with the `fake-panel` adapter key for development/tests only, including deterministic account identity, restart-safe reconstruction of fictional persisted accounts, duplicate provisioning protection, normalized account state, temporary login links, controlled failure injection, and no network access.
- Added a fixed five-second timeout boundary and safe `TEMPORARY`, `PERMANENT`, and `INCONSISTENT` provider errors. Unknown errors are replaced with redacted messages; read timeouts may be retried, while uncertain mutation timeouts require reconciliation.
- Added strict shared runtime contracts for hosting actions, account/result state, operation history, retries, confirmation, password strength, safe server summaries, pagination, and HTTPS-only login URLs.
- Added the durable `HostingPanelOperation` model with adapter/action snapshots, keyed request fingerprints, global submission idempotency, attempt/retry linkage, normalized failure evidence, safe JSON metadata, and UTC execution timestamps.
- Added database constraints aligning operation scope/status/error/retry evidence, prohibiting invalid fingerprints/self-retries, requiring JSON objects, and enforcing one linear retry child per attempt.
- Implemented administrator orchestration that serializes service operations, blocks concurrent work, moves provisioning to `PROVISIONING`, activates only after a matching provider account, completes fully active orders, and updates suspension/reactivation/termination state only after validated provider success.
- Made matching requests replay-safe and conflicting submission-key reuse fail. No operation retries automatically; safely temporary failures allow a deliberate linear manual retry chain capped at five attempts. Passwords must be re-entered and termination must be reconfirmed.
- Held domain/account/state mismatches and uncertain mutations in `INCONSISTENT` without inviting retry. Provider failure never changes financial history, and failed provisioning remains separate from payment/order settlement.
- Added administrator connection tests, account tools, durable operation history, retry/reconciliation controls, and adapter-backed service lifecycle actions. Added ownership-protected customer generation of short-lived control-panel login URLs.
- Persisted atomic start/success/failure activity logs with safe identifiers/classification only. Passwords, credentials, raw provider responses, and login URLs are excluded from database rows, logs, errors, and API operation history.
- Recorded cPanel/WHM as the only selected hosting-panel provider and UK2Group as a separate future domain-registrar provider. Updated Command 16 to cPanel/WHM only and documented that registrar models, credentials, APIs, and workflows require separate authorization.
- Added shared validation, fake adapter, timeout/redaction, UI, database, and complete API integration coverage. No cPanel/WHM or UK2Group request was made, and no screenshot value was copied.

#### Files changed

- Architecture/provider plan: `HOSTING_BILLING_SYSTEM_PLAN.md`, `CODEX_DEVELOPMENT_COMMANDS.md`
- Database and migrations: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260825234000_add_hosting_panel_operations/migration.sql`, `packages/database/prisma/migrations/20260825235000_bound_hosting_operation_retries/migration.sql`, `packages/database/prisma/verify.ts`
- Shared contracts/tests: `packages/shared/src/contracts/hosting-panels.ts`, `packages/shared/src/index.ts`, `packages/shared/test/contracts.spec.ts`
- Hosting-panel boundary/orchestration: `apps/api/src/modules/hosting-panels/hosting-panel.interface.ts`, `hosting-panel.error.ts`, `fake-hosting-panel.ts`, `hosting-panel.registry.ts`, `hosting-panel.service.ts`, `hosting-panel.controller.ts`, `hosting-panel.module.ts`, `apps/api/src/app.module.ts`
- API tests: `apps/api/src/modules/hosting-panels/fake-hosting-panel.spec.ts`, `apps/api/test/hosting-panels.e2e-spec.ts`
- Administrator/customer interfaces and tests: `apps/web/src/components/services/admin-hosting-operation-manager.tsx`, `admin-service-manager.tsx`, `customer-service-detail.tsx`, `service-management.test.tsx`, `apps/web/src/app/(admin)/admin/services/page.tsx`
- Documentation: `README.md`, `docs/HOSTING_PANELS.md`, `docs/SERVICES.md`, `docs/DATABASE.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Prisma schema formatting/validation, fifteen-migration deploy/status, idempotent fictional seed, and structural database verifier: passed against isolated PostgreSQL, including hosting-operation status/evidence constraints and bounded retry uniqueness.
- Prettier repository formatting check, `git diff --check`, and ESLint for API, worker, and web: passed without warnings.
- Strict TypeScript checks for all six code workspace projects: passed, including generated Prisma and Next.js route types.
- Complete non-integration suite: 15 shared-contract tests, 56 API tests, 1 worker test, and 23 frontend tests passed (95 total).
- Fake hosting-panel suite: 8 passed for the full capability contract, duplicate provisioning, conflicting domains, temporary/permanent/inconsistent failures, read-versus-mutation timeouts, and unknown-error redaction.
- Hosting-panel API suite: 4 passed for connection testing, idempotent provisioning, submission misuse, service/order activation, account query/package/password operations, secret non-persistence, suspension/reactivation, owned login URLs, confirmed termination, temporary failure/manual retry/replay bounds, inconsistency hold, authorization, and safe history.
- Complete API end-to-end suite: 10 suites and 46 tests passed against local PostgreSQL and Redis.
- Database, shared packages, NestJS API, NestJS worker, and Next.js production builds: passed with `NODE_ENV=production`.

#### Decisions made

- cPanel/WHM is the only hosting-panel target. Command 15 uses the provider-neutral contract and fake implementation; real `cpanel-whm` behavior belongs exclusively to Command 16.
- UK2Group is a registrar, not a hosting-panel adapter. It must use separate domain models, credential encryption context, settings, authorization, idempotency, operation history, and provider documentation in a future separately authorized command.
- Every hosting attempt is durable and append-only. The operation row, not a browser response or transient log, is the retry/reconciliation record.
- Request fingerprints use HMAC with existing secret material so even a password-bearing request cannot create a useful offline password hash. Persisted request metadata contains only `REDACTED` for password input.
- External mutations never retry automatically. A provider-declared temporary failure may be retried manually; timeout/unknown/mismatched results stay held until reconciliation.
- Only successful, identity- and state-matched provider results change service state. Financial state remains independent.
- Temporary login URLs must use HTTPS, are returned only to the requesting authorized user, and are never persisted.

#### Open questions and risks

- Command 16 must select the exact cPanel/WHM authentication mechanism, credential rotation/versioning approach, API token scope, development-server hostname/account, package mapping, and manual acceptance targets from current official documentation.
- No real cPanel credential is configured and no connection or mutation was attempted. Even after a real adapter is coded with mocks, development-server mutations require a dedicated test account/package and explicit authorization.
- UK2Group's exact current API product/brand, official documentation, sandbox/test endpoint, reseller authorization, contact ownership, TLD set, registration/renewal/transfer behavior, domain pricing, and required database model remain unresolved. The supplied screenshot is context only, not an API contract.
- `RUNNING` operations abandoned by an application crash need a later worker/reconciliation recovery policy. Command 17 introduces queues and observable failed-job handling; it must not blindly retry uncertain mutations.
- Fake account reconstruction supports fictional persisted services after an application restart, but the fake provider remains in-memory and is not a production consistency simulation.
- The PostgreSQL driver continues to emit its known pg@9 concurrency deprecation warning during E2E activity, and the minimal Node validation container emits Prisma OpenSSL auto-detection warnings. All migration, database, concurrency, test, type, lint, and build checks passed.

#### Recommended next command

Run **Command 16 — Integrate the Real Hosting Panel** after explicit authorization. Implement cPanel/WHM only, consult current official documentation, use mocked provider tests, configure no plaintext credential, and make no external mutation until the dedicated development account/package and manual test scope are explicitly approved.

### Command 16 — Integrate the Real cPanel/WHM Hosting Panel

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-25

#### Scope completed

- Implemented the real `cpanel-whm` hosting adapter against documented WHM API 1 functions for connection testing, account creation/status, suspension, unsuspension, package/password changes, temporary cPanel sessions, and account removal.
- Added a hardened HTTPS client restricted to fully qualified hostnames and secure WHM ports `2087`/`443`, WHM API-token authorization, rejected redirects, bounded timeouts and response bodies, strict response parsing, and redacted normalized failures.
- Added deterministic 16-character service-derived cPanel usernames, username/domain preflight checks, exact-account idempotency, generated-password account creation, and post-operation `accountsummary` verification for every mutation.
- Classified mutation transport, timeout, provider `5xx`, malformed-response, and failed-verification uncertainty as `INCONSISTENT`, preventing unsafe automatic/manual replay until reconciliation.
- Added AES-256-GCM token encryption with server-ID authenticated context and the versioned `cpanel-token-v1` key context. Plaintext tokens exist only during administrator submission and provider-call construction and are excluded from APIs, audit metadata, operation history, tests, and documentation.
- Added an administrator-only, confirmation-protected cPanel server configuration endpoint and interface for hostname, secure port, WHM username, and one-time API-token entry/rotation. The interface clears the token after successful encrypted storage.
- Added database constraints requiring complete credential ciphertext/key-version pairs and complete TLS/port/username/credential configuration for every `cpanel-whm` server. Migrated the obsolete fictional `fake-cpanel` adapter key to `fake-panel`.
- Kept `FakeHostingPanel` available only outside production and wired `cpanel-whm` through the existing provider-neutral registry without changing service/payment/order separation.
- Added shared contract, cipher, HTTP boundary, real adapter, interface, authorization, encryption/non-disclosure, database, and full E2E coverage.
- Documented the official WHM endpoints, required least-privilege ACLs, credential lifecycle, error/reconciliation rules, and an approval-gated manual development-server acceptance checklist.
- Made no cPanel/WHM network request, configured no credential, and performed no live account mutation. UK2Group registrar integration remains completely separate and unchanged.

#### Files changed

- Configuration/contracts: `.env.example`, `packages/config/src/env.ts`, `packages/shared/src/contracts/hosting-panels.ts`, `packages/shared/test/contracts.spec.ts`
- Encrypted credentials and WHM boundary: `apps/api/src/modules/hosting-panels/cpanel-credential-cipher.ts`, `cpanel-whm-http.client.ts`, `cpanel-whm.hosting-panel.ts`, and their unit specifications
- Hosting orchestration/API wiring: `apps/api/src/modules/hosting-panels/hosting-panel.controller.ts`, `hosting-panel.module.ts`, `hosting-panel.registry.ts`, `hosting-panel.service.ts`
- Existing environment fixtures: bKash, SSLCOMMERZ, and fake payment-gateway unit specifications
- Database: `packages/database/prisma/migrations/20260826001500_secure_cpanel_server_configuration/migration.sql`, `packages/database/prisma/seed.ts`, `packages/database/prisma/verify.ts`
- API/UI acceptance: `apps/api/test/hosting-panels.e2e-spec.ts`, `apps/web/src/components/services/admin-hosting-operation-manager.tsx`, `service-management.test.tsx`
- Documentation: `README.md`, `docs/HOSTING_PANELS.md`, `docs/DATABASE.md`, `docs/SERVICES.md`, `docs/DEVELOPMENT.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Reviewed current official cPanel documentation for WHM API-token authentication, WHM API 1 account/session functions, secure ports, and ACL requirements. No third-party API contract was invented.
- Prisma schema formatting/validation, sixteen-migration deploy/status, idempotent fictional seed, and structural database verifier: passed against isolated PostgreSQL, including the new encrypted-credential and cPanel configuration constraints.
- Prettier repository formatting check, `git diff --check`, and ESLint for API, worker, and web: passed without warnings.
- Strict TypeScript checks for all six code workspace projects: passed, including generated Prisma and Next.js route types.
- Complete non-integration suite: 15 shared-contract tests, 69 API tests, 1 worker test, and 24 frontend tests passed (109 total).
- cPanel-focused unit suite: 13 passed for credential encryption/tamper and server binding, HTTP authentication/timeout/response safety, exact WHM functions/parameters, idempotent creation/conflict handling, mutation verification, temporary login validation, termination reconciliation, and malformed/rejected responses.
- Hosting-panel API suite: 5 passed, including administrator-only encrypted configuration, token non-disclosure, audit evidence, fake-provider operations, retries, inconsistency holds, ownership, and termination confirmation.
- Complete API end-to-end suite: 10 suites and 47 tests passed against local PostgreSQL and Redis.
- Database, config/shared packages, NestJS API, NestJS worker, and Next.js production builds: passed with `NODE_ENV=production`; all 28 Next.js routes generated successfully.
- Verified the diff contains no credential, private key, real customer data, generated database artifact, or copied UK2Group screenshot value.

#### Decisions made

- WHM API tokens are the only supported cPanel authentication mechanism; passwords and access hashes are deliberately unsupported.
- The adapter uses certificate-validated HTTPS on port `2087` or `443`, refuses redirects, and never provides a TLS-disable option.
- A dedicated, restricted reseller/token is preferred. The documented complete capability set requires the relevant account-list/create/suspend/upgrade/password/session/removal ACLs; unnecessary operations should be withheld instead of granting `all`.
- Existing exact username/domain/package identity makes provisioning idempotent. Any identity conflict or uncertain mutation result is an explicit reconciliation condition.
- cPanel may generate the initial password; the application neither requests nor stores it. Password changes remain one-time input and are never persisted.
- Temporary login URLs must be HTTPS, contain no URL credentials, and match the configured WHM hostname. They remain ephemeral and are never stored.
- Credential rotation is explicit administrator re-entry under the current key version and produces only safe audit evidence.
- UK2Group is a registrar integration and must have separate domain models, credentials, provider contract, and explicit command authorization.

#### Open questions and risks

- No real WHM credential, hostname, outbound-IP allowlist, disposable package/account/domain, or mutation window has been approved. The owner must define and authorize those exact targets before even the documented manual acceptance sequence is run.
- `create-user-session`, password, and account-removal ACLs are high risk. cPanel notes that user-session creation can bypass token restrictions; omit these privileges and accept safely disabled related features if they are not operationally necessary.
- Losing or changing `CREDENTIAL_ENCRYPTION_KEY` without a backup/rotation plan makes stored tokens unreadable. A formal production key-management and rotation runbook remains required.
- cPanel versions and reseller ACL behavior can differ. Re-check current official documentation and run the approval-gated disposable-account checklist before staging or production enablement.
- Mutation uncertainty is intentionally not retryable. Administrator reconciliation workflow/monitoring and abandoned `RUNNING` operation recovery remain later automation work.
- UK2Group API selection, credentials, sandbox/test behavior, TLD/contact policies, and domain lifecycle data remain unresolved and outside this command.
- The PostgreSQL driver continues to emit its known pg@9 concurrency deprecation warning during E2E activity, and the minimal Node validation container emits Prisma OpenSSL auto-detection warnings. All migration, database, test, type, lint, and build checks passed.

#### Recommended next command

Run **Command 17 — Add Redis, Queues, and Workers** after explicit user authorization. Preserve the rule that uncertain external mutations are never blindly retried by a queue.

### Command 17 — Add Redis, Queues, and Workers

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-26

#### Scope completed

- Added the reusable `@webhost-billing/queue` package with BullMQ 6, explicit ioredis connectivity, environment-isolated prefixes, producer fail-fast behavior, worker reconnect behavior, deterministic IDs, retained failures, and graceful queue/worker shutdown.
- Defined strict shared contracts for seven queues: email, hosting provisioning, suspension, unsuspension, hosting-status reconciliation, payment reconciliation, and renewal-invoice generation.
- Established per-queue bounded retry policies with exponential backoff. Hosting mutations have one automatic attempt; email, read-only reconciliation, and database-idempotent renewal work have small bounded retry budgets.
- Added a reference-only versioned job envelope containing outbox/aggregate/correlation identifiers and safe failure classification only. Full outbox JSON, recipients, tokens, passwords, provider data, raw requests, and credentials are not copied into Redis.
- Implemented a shared processor boundary that validates every job, supports cancellation, emits structured correlation logs, classifies failures as `TEMPORARY`, `PERMANENT`, or `INCONSISTENT`, and uses BullMQ `UnrecoverableError` to stop retrying permanent/uncertain work.
- Implemented the Nest worker infrastructure with runtime-validated environment, Prisma and BullMQ lifecycles, and a continuously polling transactional-outbox dispatcher.
- Added PostgreSQL `FOR UPDATE SKIP LOCKED` batch claiming, stale-lease recovery, bounded publication backoff, safe fixed failure codes, and deterministic publication deduplication. Outbox rows become `PUBLISHED` only after BullMQ accepts the job; unsupported or exhausted events remain durably `FAILED`.
- Configured local Redis AOF with `appendfsync always` so acknowledged queue writes use durable local persistence before outbox publication is considered complete.
- Added administrator-only queue/outbox failure visibility, confirmed manual retry actions, CSRF/role enforcement, safe serialization, and retry audit records. Permanent, inconsistent, malformed, or unroutable work cannot be retried through the interface.
- Replaced the Automation placeholder with a responsive operational failure screen that clearly separates safely retryable jobs from reconciliation/route-repair conditions.
- Added real Redis/PostgreSQL integration coverage for deduplication, reference-only payloads, bounded retry, unrecoverable failure, retained inspection, outbox publication, unsupported routing, and graceful lifecycle behavior.
- Kept SMTP delivery, renewal scheduling/business rules, and hosting mutation consumers outside this command. Their jobs can be published/retained, but consumers are registered only when their later feature commands implement the actual handlers.

#### Files changed

- Queue package and lockfile: `packages/queue/**`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, root/app package scripts and dependencies
- Shared/config boundaries: `packages/shared/src/contracts/background-jobs.ts`, `packages/shared/src/index.ts`, `packages/shared/test/contracts.spec.ts`, `packages/config/src/env.ts`, `.env.example`
- Worker runtime/tests: `apps/worker/src/infrastructure/**`, `apps/worker/src/outbox/**`, `apps/worker/src/app.module.ts`, `apps/worker/src/main.ts`, `apps/worker/package.json`, `apps/worker/README.md`
- Administrator API/tests: `apps/api/src/modules/background-jobs/**`, `apps/api/src/app.module.ts`, `apps/api/test/background-jobs.e2e-spec.ts`, API package/environment fixtures
- Administrator interface/tests: `apps/web/src/components/automation/**`, `apps/web/src/app/(admin)/admin/automation/page.tsx`
- Infrastructure/documentation: `compose.yaml`, `README.md`, `docs/BACKGROUND_JOBS.md`, `docs/API_CONTRACTS.md`, `docs/DATABASE.md`, `docs/DEVELOPMENT.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Reviewed current official BullMQ documentation for custom job IDs, exponential retries, unrecoverable errors, producer/worker connection behavior, retained failed jobs, and graceful shutdown.
- Frozen pnpm install and supply-chain policy check passed for all eight workspace projects. Optional `msgpackr-extract` native building remains explicitly disabled; BullMQ's required ioredis peer is pinned directly.
- Docker Compose configuration passed with loopback-only PostgreSQL/Redis and Redis AOF `appendfsync always`; both running services remained healthy throughout validation.
- Prisma schema validation, sixteen-migration status, idempotent fictional seed, and structural verifier passed. No migration was required because the existing durable outbox/automation schema already supports Command 17.
- Prettier repository check, `git diff --check`, and API/worker/web ESLint passed without errors.
- Strict TypeScript checks passed for all seven code workspace projects, including the new queue package, generated Prisma, and Next.js route types.
- Complete non-E2E suite: 16 shared-contract tests, 69 API tests, 25 frontend tests, 3 queue integration tests, and 3 worker/integration tests passed (116 total).
- Queue/worker integration tests passed against real Redis/PostgreSQL for deterministic deduplication, reference-only data, temporary retry then success, permanent failure stopping at one attempt, retained failure inspection, outbox lease/publication state, unsupported-event failure, and lifecycle closure.
- Complete API end-to-end suite: 11 suites and 48 tests passed, including administrator/customer authorization, safe failure output, confirmed outbox retry, and atomic audit evidence.
- Config, database, shared, queue, NestJS API, NestJS worker, and Next.js production builds passed with `NODE_ENV=production`; Next.js generated all 28 routes.
- Secret audit confirmed no `.env`, credential, raw outbox payload, private key, production/customer data, or provider secret was added.

#### Decisions made

- PostgreSQL outbox rows—not direct Redis calls—are the only durable handoff from committed business transactions.
- BullMQ job IDs are deterministic `outbox-<uuid>` references. A crash after queue acceptance but before database acknowledgement republishes the same ID rather than duplicating work.
- Redis is a durable queue backend, not an evictable cache. Environment prefixes are mandatory and production requires durable persistence, no eviction, restricted access, monitoring, and tested recovery.
- Hosting provisioning/suspension/unsuspension are mutation queues and never retry automatically. Future handlers must classify ambiguous outcomes as inconsistent and require reconciliation.
- Outbox `PUBLISHED` means Redis accepted the job, not that its business handler succeeded. Every future handler must be independently idempotent and persist its real business outcome.
- Failed BullMQ jobs remain in Redis for inspection; failed outbox publications remain in PostgreSQL. The administrator receives safe normalized facts only.
- Queue consumer modules are opt-in. The worker does not consume email, renewal, payment, or hosting work until the relevant authorized command supplies and tests a real handler.

#### Open questions and risks

- SMTP provider/settings and email rendering/delivery remain Command 18. Existing authentication email jobs will wait in the email queue until that consumer is implemented.
- Renewal schedules, billing policy, grace periods, automatic suspension/reactivation rules, and distributed schedule locks remain Command 19 and later automation work.
- Payment and hosting reconciliation handlers remain unimplemented. They must use authenticated/read-only proof and must never convert an unknown external mutation into a blind retry.
- Production Redis topology, persistence/backup destination, memory/no-eviction policy, alerting, recovery objectives, and failover testing remain deployment decisions. Redis data loss after accepted publication requires an operational recovery/replay plan.
- The administrator screen intentionally shows retained failures, not a complete queue dashboard. Waiting/active/delayed metrics and alert delivery can be added when production operations are configured.
- Queue job success/failure business records must be added by each later handler (for example `EmailLog` or `AutomationRun`); BullMQ state alone is not the financial/service source of truth.
- The PostgreSQL driver continues to emit its known pg@9 concurrency deprecation warning during parallel E2E tests, and the minimal Node validation container emits Prisma OpenSSL auto-detection/experimental VM warnings. All database, queue, test, lint, type, and build checks passed.

#### Recommended next command

Run **Command 18 — Implement Email Notifications** after explicit user authorization. Register only the email consumer, decrypt authentication action tokens at the trusted delivery boundary, and ensure SMTP failure cannot roll back business transactions.

### Command 18 — Implement Email Notifications

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-25

#### Scope completed

- Implemented the real `emails` BullMQ consumer with a provider-neutral adapter boundary, configurable concurrency, graceful shutdown, bounded retries, safe structured failure classification, and no coupling between SMTP success and the originating business transaction.
- Added SMTP delivery through Nodemailer with certificate validation, TLS 1.2 minimum, required STARTTLS/implicit TLS policy, bounded connection/socket timeouts, optional paired authentication, disabled URL/file content access, and no redirect/browser proof assumptions.
- Added a zero-network development preview adapter that writes RFC `.eml` messages to a private `0700` directory as `0600` SHA-256-named files. No external email was sent and no real SMTP credential was configured.
- Created exactly twelve responsive, business-branded HTML templates with plain-text fallbacks for verification, reset, order received/approved, payment received, invoice created, renewal reminder, overdue notice, service provisioned/suspended/reactivated, and ticket reply.
- Added typed template models, centralized escaping of every untrusted value, header line-break rejection, UTC date presentation, and direct integer-minor-unit money formatting without JavaScript floating-point arithmetic.
- Added strict versioned email-event contracts and routed all twelve event types through reference-only BullMQ payloads. Authentication action tokens remain encrypted in PostgreSQL and are decrypted only inside the trusted worker immediately before rendering.
- Added atomic outbox producers for order creation/approval, initial or issued invoices, overdue transitions, verified manual/gateway payments, and verified/manual service activation, suspension, and reactivation. Email failure cannot roll back those committed workflows.
- Added an idempotent one-event/one-`EmailLog` boundary and append-only numbered `EmailAttempt` records. Successful delivery is terminal; retries use a deterministic outbox-based `Message-ID`; raw bodies, tokens, SMTP responses, credentials, and exception messages are never persisted in the delivery audit.
- Classified pre-submission SMTP connectivity failures as temporary, provider rejection as permanent, and a lost outcome during `DATA` or abandoned `SENDING` state as inconsistent. Uncertain delivery is never blindly resent.
- Added an administrator-only `GET /email-notifications` endpoint and responsive `/admin/email` page for the latest safe delivery/attempt history. Customer access is denied and sensitive/internal fields are excluded. Retired historical template identifiers remain displayable without expanding the active twelve-template catalog.
- Added full shared-contract, worker unit/integration, real PostgreSQL delivery, admin authorization/non-disclosure, and frontend coverage. Renewal-reminder and ticket-reply producers correctly remain deferred to Commands 19 and 20.

#### Files changed

- Dependencies/configuration: `.env.example`, `apps/worker/package.json`, `pnpm-lock.yaml`, `packages/config/src/env.ts`
- Shared queue/email contracts: `packages/shared/src/contracts/email-notifications.ts`, `background-jobs.ts`, `packages/shared/src/index.ts`, `packages/shared/test/contracts.spec.ts`
- Durable data: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260826013000_add_email_delivery_attempts/migration.sql`, `packages/database/prisma/seed.ts`, `packages/database/prisma/verify.ts`
- Worker implementation/tests: `apps/worker/src/email/**`, `apps/worker/src/app.module.ts`
- Business event producers: authentication, orders, invoices, manual payments, payment gateways, services, and hosting-panel services under `apps/api/src/modules/**`
- Administrator API/tests: `apps/api/src/modules/email-notifications/**`, `apps/api/src/app.module.ts`, `apps/api/test/email-notifications.e2e-spec.ts`
- Administrator interface/tests: `apps/web/src/app/(admin)/admin/email/page.tsx`, `apps/web/src/components/email/**`, administrator layout navigation
- Documentation: `README.md`, `docs/EMAIL_NOTIFICATIONS.md`, `docs/BACKGROUND_JOBS.md`, `docs/API_CONTRACTS.md`, `docs/DATABASE.md`, `docs/DEVELOPMENT.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Reviewed current official Nodemailer SMTP and stream-transport documentation and pinned Nodemailer 9.0.5 with its matching type package. No unsupported SMTP behavior or third-party preview server was introduced.
- Frozen pnpm dependency install, repository Prettier check, `git diff --check`, API/worker/web ESLint, and strict TypeScript checks for all seven code workspace projects passed.
- Prisma formatting/validation/client generation, seventeen-migration deploy/status, idempotent fictional seed, and structural database verification passed against local PostgreSQL.
- Shared-contract suite passed 17 tests; worker suite passed 20 tests across five suites, including all templates, escaping, SMTP classification, private preview files, token-boundary resolution, retries, deterministic idempotency, and real PostgreSQL attempt evidence.
- Frontend suite passed 26 tests across ten files. Complete API end-to-end validation passed 49 tests across twelve suites, including administrator/customer authorization and sensitive-field exclusion.
- Complete repository non-E2E tests, production builds for config/database/shared/queue/API/worker/web, Docker Compose validation/health checks, and a source/secret audit passed. No `.env`, preview message, credential, private key, real customer data, or provider response was added.
- `pnpm audit --prod` reported one high advisory in the existing Prisma configuration-tooling chain: Prisma 7.9.1 currently pins vulnerable `deepmerge-ts` 7.1.5 while the patched release is major version 8. No Nodemailer advisory was reported; an unverified transitive major override was not forced into this command.

#### Decisions made

- PostgreSQL remains the delivery source of truth and Redis remains reference-only. The worker reloads and validates durable event/entity records rather than trusting job data.
- Preview files replace a network SMTP capture dependency in local development. Their directory/file modes and non-identifying names reduce accidental exposure, but the files are still private data and must not be served or committed.
- Production cannot start the worker with preview transport, HTTP billing links, or unencrypted SMTP. Authentication settings must be paired and all SMTP certificates remain verified.
- A deterministic `Message-ID` plus terminal successful log prevents ordinary duplicates. SMTP's acknowledgement gap is handled conservatively as inconsistent; it is not treated as a safe automatic retry.
- Historical delivery entries may retain old template identifiers, while only the twelve Command 18 template identifiers can be used for new email events.
- Renewal and ticket templates/routes are ready, but event production stays within their separately authorized Commands 19 and 20.

#### Open questions and risks

- The production/staging SMTP provider, verified sender domain, hostname/port, credentials, sending limits, IP policy, SPF, DKIM, DMARC, bounce handling, alerting, and credential-rotation procedure remain operational decisions. No live provider acceptance test has been authorized.
- SMTP provides no universal exactly-once delivery. A crash or transport loss after provider acceptance is deliberately held as inconsistent and requires provider/log investigation rather than blind resend.
- `.eml` preview files may contain customer information and active verification/reset links. Operators must use an access-restricted non-web directory and apply an appropriate local retention policy.
- Command 19 must create renewal reminders idempotently with scheduler locking and controllable-clock coverage. Command 20 must emit ticket-reply events only for the correct customer-visible reply.
- Bounce/complaint ingestion, suppression lists, localization, bulk marketing, analytics, and multi-provider failover are intentionally outside this private minimal product.
- Production dependency audit remains non-clean because of `GHSA-ggr8-5vv4-36mx` in Prisma's `deepmerge-ts` configuration dependency. Monitor Prisma for a compatible patched release and retest before production; the affected path is tooling/configuration rather than the email adapter added here.
- The PostgreSQL driver continues to emit its known pg@9 concurrency deprecation warning during E2E activity, and Node emits the existing Jest experimental VM warning. All migration, database, test, lint, type, and build checks passed.

#### Recommended next command

Run **Command 19 — Implement Renewal Automation** only after explicit user authorization. Preserve transactional outbox delivery, database idempotency/locking, controllable time in tests, and the rule that no initial-release workflow automatically terminates hosting.

### Command 19 — Implement Renewal Automation

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-25

#### Scope completed

- Added a strict administrator-configurable renewal policy for enablement, 1–90 invoice lead days, up to ten unique reminder offsets, 0–60 grace days, and a validated IANA business timezone. Defaults are 14 days, reminders at 7/3/1 days, a 3-day grace period, and `Asia/Dhaka`.
- Added a dedicated non-HTTP Nest scheduler entry point. It derives one daily business-date key, obtains a PostgreSQL transaction advisory lock, records a `RUNNING` or disabled `SKIPPED` `AutomationRun`, and atomically inserts a reference-only renewal outbox request. Daily uniqueness remains a second scheduler-instance barrier.
- Implemented the `renewal-invoice-generation` worker consumer with controllable time, business-date comparisons, delayed threshold catch-up, UTC month-clamped monthly/quarterly/annual periods, and per-action result/failure counts.
- Added idempotent renewal invoice creation with immutable customer/business/price descriptions and period snapshots. A partial unique database index prevents billing the same service period twice even under concurrent processing.
- Added unique renewal reminders, overdue transitions/notices, and grace-period hosting suspension requests. Scheduled database work receives three bounded retries and safe repeated runs; partial/final failures remain visible in `AutomationRun`.
- Added verified full-payment renewal events for manual and gateway settlement only when the invoice has complete service-period lines. The worker advances `nextDueAt` to the paid period end and requests reactivation only when the service's `suspensionInvoiceId` matches that exact paid invoice.
- Implemented the real worker-side cPanel/WHM suspension/reactivation boundary using the existing server-bound encrypted token format, certificate-validated WHM API 1, strict configured ports/identity, and post-mutation `accountsummary` verification. Fake-panel development remains zero-network.
- Persisted human and automated hosting attempts separately. Hosting mutations have one automatic queue attempt; explicit safe temporary retries append attempt evidence up to three, while abandoned/risky/unknown outcomes become non-retryable `INCONSISTENT` records.
- Preserved manual suspension semantics by clearing automation invoice linkage on manual state changes. Payment therefore cannot reactivate an unrelated/manual suspension.
- Added administrator-only renewal policy and latest-run endpoints, audit logging, CSRF enforcement, and a responsive Automation screen for editing policy and viewing safe run results alongside retained queue/outbox failures.
- Added no automatic termination route, event, scheduler action, or worker handler.

#### Files changed

- Durable schema/migration/verification: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260826023000_add_renewal_automation/migration.sql`, `packages/database/prisma/verify.ts`
- Shared/config contracts: `packages/shared/src/contracts/renewal-automation.ts`, background-job/hosting contracts and exports/tests, `packages/config/src/env.ts`, `.env.example`
- Scheduler and worker implementation/tests: `apps/worker/src/scheduler-main.ts`, `apps/worker/src/scheduler.module.ts`, `apps/worker/src/renewal/**`, worker module/scripts
- Payment/service integration: manual and gateway payment services, service and hosting-panel state services under `apps/api/src/modules/**`
- Administrator API/tests: `apps/api/src/modules/renewal-automation/**`, `apps/api/test/renewal-automation.e2e-spec.ts`, API module registration
- Administrator interface/tests: `apps/web/src/components/automation/**`, shared authenticated mutation helper, hosting-operation fixture
- Documentation: `README.md`, `docs/RENEWAL_AUTOMATION.md`, `docs/BACKGROUND_JOBS.md`, `docs/API_CONTRACTS.md`, `docs/DEVELOPMENT.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Prisma formatting, validation, client generation, eighteen-migration deploy/status, and structural/fictional-seed verification passed against local PostgreSQL. The new requester XOR check, suspension-invoice relationship, and partial unique service-period index are present.
- Docker Compose configuration passed; local PostgreSQL and Redis remained healthy. Command 19 integration artifacts were cleaned, with zero residual command users, runs, or renewal invoices.
- Repository Prettier check, `git diff --check`, API/worker/web ESLint, and strict TypeScript checks for all seven code workspace projects passed without warnings/errors.
- Shared contracts passed 18 tests; queue infrastructure passed 3 real-Redis tests; API unit suite passed 69 tests; worker suite passed 26 tests across eight suites; frontend passed 26 tests across ten files. Complete API E2E passed 50 tests across thirteen suites. Total validated tests: 192.
- Controllable-clock and real-PostgreSQL coverage passed for Dhaka midnight boundaries, month-end and leap-year period calculation, delayed reminders/overdue execution, concurrent duplicate schedulers, duplicate jobs/invoices, bounded retry evidence, suspension, verified-payment due advancement, matching-invoice unsuspension, and absence of termination events.
- Config/database/shared/queue packages and NestJS API/worker production builds passed. Both worker and scheduler entry files were emitted. An isolated Next.js webpack production build passed and generated all 29 application routes without interrupting the running development UI.
- No real WHM mutation, payment, email, or other external-provider action was executed. Tests used fictional records and the zero-network fake hosting panel.

#### Decisions made

- Business dates control invoice/reminder/grace thresholds, while all stored instants and invoice periods remain UTC. Calendar-day math is explicit and tested at timezone/month boundaries.
- The dedicated scheduler owns schedule creation; ordinary worker scaling does not multiply it. Advisory locking plus unique daily run/event keys protects accidental multiple instances.
- Invoice-line service/start/end uniqueness is the financial duplicate barrier. Outbox keys independently deduplicate reminders and hosting requests.
- Automated suspension stores its cause invoice. Only a fully paid matching invoice can request automatic unsuspension; manual suspensions remain administrator-owned.
- cPanel state is changed locally only after the remote account identity and target state are verified. Any provider acknowledgement gap is reconciliation work, not a blind retry.
- Initial-release renewal automation intentionally excludes termination, cancellation, late fees, multi-currency, tax expansion, and domain renewal.

#### Open questions and risks

- Confirm the real business policy values (invoice lead, reminder offsets, grace period, and timezone) in the administrator Automation screen before starting the scheduler in a customer environment.
- Run exactly one scheduler process per environment. Production process supervision, health/readiness, alerting, and deployment wiring remain Commands 27 and 29.
- Real cPanel automated suspension/reactivation was not invoked because no destructive external test window was authorized. Before enabling against customer accounts, use a disposable sandbox account and confirm token privileges, outbound allowlisting, suspension reason behavior, and reconciliation steps.
- A cPanel timeout or lost verification after a mutation remains deliberately inconsistent and requires panel/account inspection. Automatic termination remains forbidden.
- The PostgreSQL driver still emits its known pg@9 concurrent-query deprecation warning in some E2E flows, and Jest emits the existing experimental VM warning. All checks passed.
- The existing Prisma tooling-chain `deepmerge-ts` advisory reported in Command 18 remains unchanged; Command 19 added no dependency.

#### Recommended next command

Run **Command 20 — Implement Support Tickets** only after explicit user authorization. Keep ticket ownership, administrator assignment/state changes, customer-visible replies, audit history, and email events separate from renewal automation.

### Command 20 — Implement Support Tickets

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-25

#### Scope completed

- Implemented strict shared contracts for plain-text ticket creation, replies, list filters, details, assignment, priority, status controls, setup options, and the existing four-state vocabulary.
- Added customer ticket creation with authenticated customer identity, optional owned-service validation, `NORMAL` initial priority, `OPEN` initial state, human-readable `TKT` numbering, and exact retry idempotency through client-generated ticket UUIDs.
- Added append-only customer and administrator replies with message-UUID idempotency. Customer replies move tickets to `WAITING_FOR_STAFF`; administrator replies move them to `WAITING_FOR_CUSTOMER`; closed tickets reject replies until an administrator reopens them.
- Added service-layer ownership enforcement for customer lists, detail, and replies. URL UUID changes cannot expose or mutate another customer's conversation, and request bodies cannot select a customer identity.
- Added the administrator support queue with server-backed search, status, priority, service/customer, assignee, and unassigned filters; active-administrator assignment; priority changes; all four explicit statuses; reopen/close controls; and threaded replies.
- Added transactionally consistent activity records for ticket creation, customer/admin replies, and every administrator assignment, priority, or status update. Audit metadata contains safe IDs and before/after states, never message bodies.
- Added ticket-creation/reply rate limits through the existing Redis-backed guard and retained global session, role, and CSRF enforcement.
- Added one durable `EMAIL_TICKET_REPLY` outbox event for each later reply. Administrator replies notify the customer; customer replies notify the assigned active administrator or fall back deterministically to the oldest active administrator. Missing staff leaves a visible permanent email failure without rolling back the reply.
- Replaced both support placeholders with responsive customer and administrator interfaces for creation, service context, filters, queue management, conversation history, reply workflows, closed-state guidance, and feedback states.
- Kept attachments out of the initial release. Strict schemas reject additional/file-shaped fields, plain-text contracts reject HTML angle brackets and control characters, React renders text without HTML injection, and the email layer independently escapes persisted text.
- Added focused support documentation covering routes, ownership, state rules, idempotency, audit, notification routing, interfaces, and the future security requirements for any separately authorized attachment feature.

#### Files changed

- Shared contracts/tests: `packages/shared/src/contracts/tickets.ts`, `packages/shared/src/index.ts`, `packages/shared/test/contracts.spec.ts`
- Ticket API/tests: `apps/api/src/modules/tickets/**`, `apps/api/src/app.module.ts`, `apps/api/src/common/identifiers/business-number.ts`, `apps/api/src/modules/auth/decorators/rate-limit.decorator.ts`, `apps/api/test/tickets.e2e-spec.ts`
- Reply-email resolution/tests: `apps/worker/src/email/email-message.resolver.ts`, `apps/worker/src/email/ticket-email-resolution.integration.spec.ts`
- Administrator/customer interfaces/tests: `apps/web/src/components/support/**`, `apps/web/src/app/(admin)/admin/support/page.tsx`, `apps/web/src/app/(portal)/portal/support/page.tsx`
- Documentation: `README.md`, `docs/SUPPORT_TICKETS.md`, `docs/API_CONTRACTS.md`, `docs/DATABASE.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Repository Prettier check, `git diff --check`, API/worker/web ESLint, and strict TypeScript checks for all seven code workspace projects passed without warnings or errors.
- Shared contracts passed 19 tests; queue infrastructure passed 3 real-Redis tests; API unit suites passed 69 tests; worker suites passed 27 tests; frontend passed 29 tests; and complete API end-to-end validation passed 55 tests across fourteen suites. Total validated tests: 202.
- Command 20 API coverage passed against real PostgreSQL and Redis for exact create/reply retries, owned and foreign service association, cross-customer denial, strict markup/attachment rejection, customer/admin reply state changes, all administrator controls and filters, durable outbox events, closed-ticket enforcement, and body-free audit evidence.
- Worker integration coverage passed against real PostgreSQL for opposite-party recipient resolution, assigned administrator delivery, administrator fallback behavior boundary, portal/admin links, ticket linkage, and independent HTML escaping.
- Prisma formatting, validation, client generation, eighteen-migration status, structural database verification, Docker Compose validation, and PostgreSQL/Redis health checks passed. No schema migration was needed because the Command 3 ticket models already represented the authorized scope.
- Config/database/shared/queue packages and NestJS API/worker production builds passed. An isolated-output Next.js webpack production build passed and generated all 29 application routes, including both support surfaces, without replacing the running development build output.
- A source/secret scan passed. Tests used reserved `.test` identities and fake hosting records; no real email, WHM, payment, domain, file-storage, or other external-provider action was executed.

#### Decisions made

- Support remains one simple queue rather than a multi-department help desk. Departments, SLAs, canned responses, satisfaction surveys, knowledge bases, and staff permission matrices remain outside the MVP.
- Ticket and message IDs double as client submission keys, while `TKT` numbers remain human-facing. This supplies database-enforced exact retry behavior without another schema field or migration.
- The initial message opens a ticket but is not treated as a reply email. Every subsequent append gets exactly one message-keyed email outbox event.
- Customer follow-ups notify the assigned active administrator; an unassigned/inactive ticket falls back to the oldest active administrator so a one-owner business still receives the request. Administrator replies always notify the owning customer.
- Attachments are deliberately absent. Adding them later requires private object storage, authenticated downloads, filename normalization, signature/MIME validation, allowlisted types, size/count limits, malware scanning, retention, and audit design under separate authorization.
- Ticket status remains independent from service and billing state. Closing a ticket cannot suspend, terminate, cancel, pay, or otherwise mutate a hosting/financial record.

#### Open questions and risks

- Confirm whether the deterministic oldest-active-administrator fallback matches the production staffing workflow. A later staff-permission command may replace it with a configured support recipient or assignment policy.
- If no active administrator exists, a customer reply is still committed but the email becomes a permanent visible delivery failure. Queue monitoring and at least one active administrator are operational requirements.
- The production SMTP provider and its bounce/complaint operations remain unresolved from Command 18; ticket notifications currently use the existing preview/SMTP adapter configuration.
- Attachments are unavailable by design. Customers must use plain text and must not paste passwords, API keys, recovery codes, or other secrets into support conversations.
- Ticket retention/redaction, SLA reporting, escalation rules, departments, and fine-grained staff permissions are intentionally outside the minimal release and would need explicit business policy before implementation.
- The PostgreSQL driver continues to emit its known pg@9 concurrent-query deprecation warning in some E2E flows, and Jest emits the existing experimental VM warning. All checks passed.

#### Recommended next command

Run **Command 21 — Implement Settings and Secrets** only after explicit user authorization. Keep ordinary typed business settings separate from encrypted provider secrets, preserve current integration-specific credential boundaries, and audit administrator changes without exposing values.

### Command 21 — Implement Settings and Secrets

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-25

#### Scope completed

- Added strict shared contracts and defaults for business identity, one operating currency, IANA business timezone, sequential invoice prefix/next-number/padding, renewal lead/reminder/grace policy, mandatory manual termination confirmation, manual-payment instructions and partial-payment policy, email branding/sender identity, active payment gateway, and active hosting-panel adapter.
- Replaced the administrator Settings placeholder with a responsive settings workspace covering business/invoice identity, renewals and service safety, payments and hosting adapters, email branding, masked credential status, bKash/SSLCOMMERZ write-only credential replacement, and a link to per-server WHM token management.
- Added an administrator-only `/settings` API that reads safe defaults, validates and transactionally writes the complete ordinary settings document, keeps the business and renewal timezones aligned, rejects online gateway activation without complete credentials and a credential-free HTTPS callback origin, and audits setting keys/adapter choices without credential values.
- Added a separate `integration_credentials` table and migration for bKash/SSLCOMMERZ bundles. Credential writes require complete provider-specific schemas plus exact `REPLACE_CREDENTIALS` confirmation and use deployment-key-derived, provider-bound AES-256-GCM authenticated encryption.
- Kept cPanel/WHM tokens encrypted per server and SMTP authentication deployment-managed. Settings responses contain only configured state, masked identifiers, key-format version, update time, and management location; neither decrypted values nor ciphertext is serialized.
- Made stored payment credential bundles take precedence over the existing deployment-environment fallback. bKash cached access tokens are tied to the credential revision, inactive configured providers remain available for callbacks/reconciliation, and only the active configured gateway is offered for new checkout sessions.
- Applied the active hosting-panel adapter to new-service setup/server selection while preserving each existing service's server adapter for lifecycle operations. Development/test environments retain the zero-network fake-panel default until an explicit setting exists; production defaults to cPanel/WHM.
- Replaced random future invoice presentation numbers with configurable sequential allocation. API order/manual-invoice and worker renewal-invoice creation lock one PostgreSQL setting row, allocate and increment within the invoice transaction, and retain the existing unique invoice constraint and idempotent submission keys.
- Added a customer-safe manual-payment-instructions endpoint and displayed its validated text on customer invoices. Partial-payment enforcement remains server-side.
- Made the email worker reload validated brand color/name and sender/reply-to identity from ordinary settings for each resolved queued message; SMTP connection/authentication secrets remain outside the settings table.
- Added provider-credential and master-key rotation/recovery documentation, including the initial release's deliberate single-key maintenance procedure and required re-entry of all payment/WHM credentials after master-key replacement.

#### Files changed

- Shared contracts/tests: `packages/shared/src/contracts/settings.ts`, `packages/shared/src/index.ts`, `packages/shared/test/settings.spec.ts`
- Schema/migration: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260826043000_add_integration_credentials/migration.sql`
- Settings API/security/tests: `apps/api/src/modules/settings/**`, `apps/api/src/app.module.ts`, `apps/api/test/settings.e2e-spec.ts`
- Invoice allocation: `apps/api/src/common/identifiers/invoice-number.ts`, invoice/order services and E2E assertion, `apps/worker/src/renewal/invoice-number.ts`, renewal processor
- Payment-provider/settings integration: payment-gateway adapters/registry/service/module/controller and adapter tests, manual-payment service/controller
- Hosting/renewal alignment: service module/service adapter filtering, renewal-automation service and E2E cleanup
- Email rendering and customer instructions: worker email resolver/types/adapter/tests, customer manual-payment component and frontend tests
- Administrator interface/tests: `apps/web/src/components/settings/**`, `apps/web/src/app/(admin)/admin/settings/page.tsx`
- Documentation: `docs/SETTINGS_AND_SECRETS.md`, `docs/PAYMENT_GATEWAYS.md`, `docs/EMAIL_NOTIFICATIONS.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Repository Prettier check, `git diff --check`, API/worker/web ESLint, and strict TypeScript checks for config/database/shared/queue/API/worker/web passed without warnings or errors.
- Prisma formatting, schema validation, client generation, nineteen-migration deployment/status, and local PostgreSQL schema currency passed. Docker Compose configuration passed and PostgreSQL/Redis remained healthy.
- Shared contracts passed 21 tests; queue infrastructure passed 3 real-Redis tests; API unit suites passed 71 tests; worker suites passed 27 tests; frontend passed 30 tests; complete API end-to-end validation passed 57 tests across fifteen suites. Total validated tests: 209.
- E2E coverage passed against real PostgreSQL/Redis for admin/customer authorization, strict ordinary settings, timezone alignment, complete credential validation, encrypted-at-rest replacement, ciphertext/plaintext response exclusion, masked status, safe audit metadata, sequential invoices, existing gateway callbacks, renewal behavior, cPanel operations, payments, services, and support.
- Command 21 test cleanup was verified with zero residual reserved users or credentials.
- Config/database/shared/queue packages and NestJS API/worker production builds passed. Next.js 16.3.2 production build passed and generated all 29 application routes, including `/admin/settings`.
- The root `pnpm build` wrapper attempted a package-manager dependency status check and stopped at pnpm's no-TTY modules-purge prompt in the long-lived Node container. It changed no source/dependencies; every underlying pinned package/framework production builder was then run directly and passed.
- A source/secret scan found only documented `.env.example` placeholders and explicit fictional test secrets used to prove ciphertext/redaction. No `.env`, real credential, private key, customer data, raw provider response, email preview, or external-provider action was added or executed.

#### Decisions made

- Ordinary typed configuration and encrypted integration credentials have separate tables, APIs, response shapes, audit metadata, and rotation procedures.
- cPanel credentials remain server-specific and SMTP credentials remain deployment-specific; duplicating either into the global payment credential vault would weaken their existing scopes.
- Database-encrypted payment credentials override deployment fallbacks. Provider activation is separate from credential existence so credentials can be rotated while manual payments remain active.
- Active gateway selection controls new sessions only; authenticated callbacks and reconciliation for an inactive but configured provider remain available for already-started transactions.
- Active hosting adapter controls server choices for new services. Existing services continue using their assigned server adapter, preventing a global setting change from redirecting established lifecycle operations.
- Sequential invoice numbers are financial presentation identifiers allocated under a database lock. Submission UUIDs remain the retry/idempotency identity.
- Business and renewal timezones are one policy. The renewal screen updates business localization, and the settings overview normalizes legacy drift to the business timezone.
- Permanent termination remains fixed to explicit administrator confirmation and is never automated. The settings screen exposes the policy but cannot weaken it.
- Master encryption-key rotation is planned maintenance in the initial release, not an implicit dual-key migration. Operators must retain rollback access and re-enter every encrypted payment/WHM credential under the new key.

#### Open questions and risks

- Enter the real private-business identity, operating currency, invoice prefix/start number, manual-payment instructions, sender addresses, renewal reminders, grace period, and adapter choices before customer use.
- No real bKash, SSLCOMMERZ, cPanel, SMTP, or production secret was used. Sandbox/provider connection acceptance, callback reachability, token privileges, and credential revocation must be verified in separately authorized operational windows.
- A configured status proves that ciphertext exists, not that the current deployment key or upstream credential is valid. Provider/WHM connection tests and the documented recovery path remain required after restoration or key rotation.
- The application supports one encryption master key at a time. Losing the matching key makes restored ciphertext unreadable; rotation requires maintenance and complete credential re-entry.
- Operating currency is now explicit configuration, but historical products, prices, orders, invoices, and services retain their snapshotted currencies. This command intentionally does not rewrite financial history or add currency conversion.
- The existing PostgreSQL driver pg@9 concurrent-query deprecation warning and Jest experimental VM warning remain visible in some E2E runs; all validation passed.
- The existing Prisma tooling-chain `deepmerge-ts` advisory from Command 18 was not changed by this command; no dependency was added.

#### Recommended next command

Run **Command 22 — Complete Dashboards and Reports** only after explicit user authorization. Use real database aggregates, integer-minor-unit arithmetic, the configured business timezone/currency, administrator authorization, and actionable operational metrics without exposing credentials or customer-sensitive detail.

### Command 22 — Complete Dashboards and Reports

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-25

#### Scope completed

- Replaced the fictional administrator dashboard with a live PostgreSQL-backed operational view and strict shared request/response contracts.
- Added inclusive business-date period filtering in the configured IANA timezone, month-to-date defaults, a 366-day maximum, explicit response freshness, and a complete daily net-revenue series.
- Calculated collected revenue only from successful verified payment transactions: charges add while append-only refunds and reversals subtract. Failed, pending, and cancelled payments are excluded without rewriting original charges.
- Calculated outstanding and overdue balances only from configured-currency `UNPAID`/`OVERDUE` invoice balances, excluding draft, cancelled, paid, and refunded invoices.
- Added current actionable counts for active/suspended services, non-terminal orders, non-closed tickets, plus selected-period failed/partly successful automation runs.
- Added safe recent auditable activity with actor, action, entity, and occurrence time while deliberately excluding arbitrary metadata, IP hashes, bodies, provider data, and secrets.
- Added administrator-only, CSRF-protected CSV exports for customers, invoices, payments, and services. Invoice/payment exports follow the selected period; customer/service exports are current snapshots.
- Made every CSV creation auditable with resource, row count, period, currency, and timezone only. Added a 10,000-row rejection limit, UTF-8 BOM, consistent quoting, exact `BIGINT` serialization, formula-injection neutralization, cache prevention, and sensitive-field exclusions.
- Added a responsive dashboard with eight metric cards, period controls, an accessible daily net-revenue chart, four report downloads, load/retry/error states, and recent activity.
- Corrected the structural database verifier's carried-forward expected-table list to include Command 21's already-migrated `integration_credentials` table.
- Added focused documentation defining source, grain, time scope, freshness, exclusions, routes, CSV safety, and intentionally unsupported analytics scope.

#### Files changed

- Shared contracts/tests: `packages/shared/src/contracts/dashboard-reports.ts`, `packages/shared/src/index.ts`, `packages/shared/test/contracts.spec.ts`
- Dashboard/report API/tests: `apps/api/src/modules/dashboard-reports/**`, `apps/api/src/app.module.ts`, `apps/api/test/dashboard-reports.e2e-spec.ts`
- Administrator interface/tests: `apps/web/src/components/dashboard/admin-dashboard.tsx`, `apps/web/src/components/dashboard/admin-dashboard.test.tsx`, `apps/web/src/app/(admin)/admin/page.tsx`, `apps/web/src/lib/auth-api.ts`, `apps/web/src/components/orders/order-ui.tsx`
- Database verifier: `packages/database/prisma/verify.ts`
- Documentation: `README.md`, `docs/DASHBOARDS_AND_REPORTS.md`, `docs/API_CONTRACTS.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Repository Prettier check, `git diff --check`, API/worker/web ESLint, and strict TypeScript checks for config/database/shared/queue/API/worker/web passed without warnings or errors.
- Shared contracts passed 22 tests; queue infrastructure passed 3 real-Redis tests; API unit suites passed 76 tests; worker suites passed 27 tests; frontend passed 31 tests; and complete API end-to-end validation passed 59 tests across sixteen suites. Total validated tests: 218.
- Command 22 E2E coverage passed against real PostgreSQL/Redis for administrator/customer authorization, typed real dashboard responses, business-date series completeness, CSRF protection, CSV delivery, spreadsheet-formula neutralization, sensitive-field exclusion, and export audit creation.
- Focused unit coverage passed for charge-minus-refund-minus-reversal arithmetic, selected-period query state, signed daily revenue, Dhaka boundaries, daylight-saving transitions, reversed/overlong period rejection, exact large-integer CSV output, and formula neutralization.
- Prisma formatting, schema validation, client generation, nineteen-migration status, structural database verification, Docker Compose validation, and PostgreSQL/Redis health checks passed. No schema migration was needed because existing financial, workflow, activity, and automation models represented the authorized scope.
- Shared/database/queue package builds, NestJS API/worker production builds, and an isolated-output Next.js 16.3.2 webpack production build passed. The web build generated all 29 application routes, including the completed `/admin` dashboard, without replacing the running development output.
- Reserved Command 22 E2E users and export audit fixtures were verified at zero after cleanup. A source/private-key scan passed. No real customer data, credential, payment, email, WHM, registrar, or other external-provider action was used or executed.

#### Decisions made

- Collected revenue is transaction-sourced net cash movement, not invoice total or browser redirect state. It uses successful rows at `verifiedAt`; refunds and reversals remain separate negative contributions.
- Money balances and revenue use only the configured operating currency. The dashboard performs no historical currency mixing or exchange-rate conversion.
- Revenue and failed-automation counts use the selected period. Outstanding balances and workflow queue counts are current point-in-time metrics so a date-filter change cannot misrepresent current work.
- Pending orders means every non-terminal operational state: `PENDING`, `AWAITING_PAYMENT`, `PAID`, and `PROCESSING`.
- Recent activity is intentionally metadata-free. The dashboard is an overview, not a raw audit-log or sensitive event-payload browser.
- CSV export creation is a state-changing audited operation and therefore uses administrator-only `POST` plus CSRF rather than an unaudited download `GET`.
- Customers/services export current records; invoices/payments use creation timestamps within the selected business-date period. CSV values remain raw minor units with an adjacent currency column for lossless reconciliation.
- The product remains intentionally small: no general report builder, forecasting, scheduled email reports, tax report engine, analytics warehouse, multi-currency consolidation, or BI integration was added.

#### Open questions and risks

- Historical records in a currency other than the currently configured operating currency are intentionally excluded from money totals. A currency change requires separate reconciliation rather than conversion.
- The 10,000-row CSV safety ceiling is appropriate for the current private business. Growth beyond it will require a separately designed asynchronous/batched export flow with protected storage and expiry.
- CSV files contain administrator-authorized business/customer data and should be stored, shared, and deleted according to a documented retention policy. Spreadsheet formula protection does not replace endpoint authorization or secure file handling.
- Failed automation runs have no resolved/acknowledged state in the current schema, so the actionable card is explicitly limited to the selected period. A later incident workflow could add acknowledgement without rewriting run history.
- The existing PostgreSQL driver pg@9 concurrent-query deprecation warning and Jest experimental VM warning remain visible in some E2E runs; all checks passed.
- The existing Prisma tooling-chain `deepmerge-ts` advisory from Command 18 remains unchanged; Command 22 added no dependency.

#### Recommended next command

Run **Command 23 — Add PDF Invoices** only after explicit user authorization. Generate PDFs from immutable invoice snapshots, keep download authorization role/ownership-bound, avoid remote assets, and verify the rendered financial values against the existing invoice contract.

### Command 23 — Add PDF Invoices

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-26

#### Scope completed

- Added an API-side PDF invoice renderer using pinned PDFKit and embedded pinned Noto Sans Bengali Latin/Bengali font subsets. Rendering is self-contained, uses no remote assets, and supports mixed English/Bengali billing text.
- Generated A4 documents from the existing ownership-checked serialized invoice: public invoice/order numbers, status, created/issued/due dates, snapshotted business/customer identities, item quantities and service periods, discounts, tax, invoice total, credits, paid amount, and balance due.
- Kept all calculations lossless by formatting serialized integer minor units directly. BDT values consistently render with two decimal places and grouped whole units.
- Made generation deterministic for an identical invoice state by removing clock, randomness, remote input, and database identifiers from the renderer and deriving PDF metadata dates from persisted invoice timestamps.
- Added wrapped long billing/item text, alternating item rows, table headings repeated after page breaks, totals, payment summary, and visible numbered footers for printable single- and multi-page output.
- Added administrator/owning-customer `GET /invoices/:invoiceId/pdf` access through the existing service-layer ownership check. Editable drafts return `422`; foreign customers return `403` before rendering.
- Returned a sanitized attachment filename with `application/pdf`, exact content length, `private, no-store`, and `nosniff` response headers. The PDF contains no invoice, order, customer, or item database UUIDs, credentials, provider payloads, or other internal identifiers.
- Added a responsive Download PDF action to issued administrator and customer invoice detail screens, including progress/error feedback and cookie-authenticated file retrieval. Draft and print-only views do not show the action.
- Added focused unit, API end-to-end, and frontend interaction coverage for deterministic bytes, pagination, draft rejection, response safety, customer ownership, administrator access, and browser download behavior.
- Updated invoice/API documentation and recorded the deterministic authorized-snapshot decision.

#### Files changed

- PDF renderer/tests and dependencies: `apps/api/src/modules/invoices/invoice-pdf.service.ts`, `apps/api/src/modules/invoices/invoice-pdf.service.spec.ts`, `apps/api/package.json`, `pnpm-lock.yaml`
- Protected API delivery/tests: `apps/api/src/modules/invoices/invoice.controller.ts`, `apps/api/src/modules/invoices/invoice.module.ts`, `apps/api/test/invoices.e2e-spec.ts`
- Administrator/customer download interface/tests: `apps/web/src/components/invoices/invoice-detail.tsx`, `apps/web/src/components/invoices/invoice-management.test.tsx`, `apps/web/src/lib/auth-api.ts`
- Documentation: `README.md`, `docs/INVOICES.md`, `docs/API_CONTRACTS.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Repository Prettier checks and `git diff --check` passed. ESLint passed for every Command 23 API/web source and test file.
- Strict TypeScript checks passed for config, database, shared, queue, API, worker, and web workspaces.
- Shared contracts passed 22 tests; queue infrastructure passed 3 real-Redis tests; API unit suites passed 78 tests; worker suites passed 27 tests; frontend passed 32 tests; and complete API end-to-end validation passed 59 tests across sixteen suites. Total validated tests: 221.
- PDF unit coverage produced byte-identical buffers twice for the same mixed Bengali/Latin BDT invoice, verified the PDF 1.7 header, excluded internal UUIDs, paginated a 70-line document, and rejected drafts.
- Invoice E2E coverage passed against real PostgreSQL/Redis for draft rejection, administrator delivery, owner delivery, byte-identical admin/customer output, required download headers, internal-ID exclusion, and foreign-customer denial.
- A fictional one-page BDT sample was generated through the production renderer, rasterized at 144 DPI to 1191 × 1684 PNG, and visually inspected. Billing identities wrapped correctly; Bengali/Latin text, item values, totals, payment status, divider, and `Page 1 of 1` footer were legible and aligned. The first visual pass exposed an out-of-bounds footer, which was corrected and re-verified.
- Config/database/shared/queue packages and NestJS API/worker production builds passed. An isolated-output Next.js 16.3.2 webpack production build passed and generated all 29 application routes without replacing the running development output.
- Docker Compose configuration passed and local PostgreSQL/Redis remained healthy. The source/private-key marker scan passed, and no generated sample, `.env`, real identity, credential, customer data, payment, email, WHM, registrar, or other external-provider artifact/action was committed or executed.

#### Decisions made

- PDFs exist only after issuance because draft identity, line, date, and credit fields remain editable and are not stable billing artifacts.
- The renderer consumes the exact serialized invoice already returned after role/ownership authorization rather than querying separately. This keeps API and PDF financial values aligned and prevents a second authorization path.
- Issued identity and item snapshots remain immutable. Append-only payment/refund transactions legitimately change status, paid amount, and balance, so a later download reflects the current authorized invoice state; identical states remain byte-identical.
- PDF generation remains synchronous in the modular-monolith API for the bounded private-business invoice size. Background PDF storage, templates, signatures, archival object storage, and batch generation remain outside the MVP.
- Local embedded font assets provide repeatable offline rendering and Bengali support. Logos and remote images are intentionally absent so asset availability cannot change output bytes or create SSRF/privacy risk.
- The download is an authenticated non-mutating `GET`, while the existing ownership service remains the object-level authorization boundary. The raw PDF response is not wrapped in the JSON success envelope; errors remain standard JSON.

#### Open questions and risks

- Confirm the real business identity, tax wording, and whether a logo or legally required footer is needed before production invoice use. Any logo must be a reviewed local immutable asset, not a remote URL.
- PDF generation buffers one bounded invoice in API memory. This is appropriate for the current private system; unusually large invoices or bulk export would require separately authorized queue/storage/retention design.
- Customers can save downloaded PDFs outside application controls. Operational retention, sharing, and deletion policy still needs to be documented for production.
- Repository-wide ESLint still reports 14 carried-forward findings in unchanged Command 22 dashboard files (`csv.ts`, `dashboard-period.ts`, and `dashboard-report.service.spec.ts`). All Command 23 files are lint-clean; these unrelated findings were not silently modified under this command.
- `pnpm audit --prod` continues to report the known high-severity `deepmerge-ts <8.0.0` advisory through the Prisma configuration toolchain. The newly added PDF/font dependency path introduced no additional audit finding. Dependency remediation belongs in the authorized Command 24 hardening pass and must preserve Prisma compatibility.
- Prisma generation in the generic validation container continues to emit its existing OpenSSL-detection warning, and some E2E suites emit the known pg@9 concurrent-query deprecation and Jest experimental-VM warnings. Builds and tests passed.

#### Recommended next command

Run **Command 24 — Harden Security** only after explicit user authorization. Begin with the known dependency and lint baselines, then verify authentication/session, CSRF, ownership/IDOR, input/output, provider callback/replay, SSRF/redirect, credential/logging, headers/CORS, rate-limit, two-factor, and audit protections with regression tests.

### Command 24 — Harden Security

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-26

#### Scope completed

- Completed an evidence-backed repository security review across authentication/session handling, CSRF, authorization/ownership/IDOR, input validation, SQL injection, stored/reflected XSS, rate limits, payment callbacks/replay, SSRF, redirects, file handling, credential encryption, logging, dependency advisories, headers/CORS, administrator MFA, and audit coverage.
- Added administrator RFC 6238 TOTP enrollment and login with password-confirmed setup, purpose-derived AES-256-GCM secret encryption, five-minute hashed/source-bound challenges, atomic accepted-time-step replay prevention, ten keyed-hash single-use recovery codes, recovery rotation, disable reauthentication, safe status UI, and session revocation/audit rules.
- Added one-hour idle session expiry, automatic idle/MFA-required revocation evidence, registration/email-verification/MFA limits, origin and Fetch Metadata CSRF checks, constant-time cookie/header comparison, loopback-only reverse-proxy trust, exact CORS methods/headers, and production origin/secret validation.
- Added Helmet API headers and non-cacheable API responses. Added Next.js CSP, referrer, clickjacking, MIME, permissions, opener, and production HSTS headers using the installed Next.js 16 documentation.
- Pinned provider-returned bKash and SSLCOMMERZ checkout redirects to credential-free HTTPS sandbox hosts. Hardened cPanel login URLs to the configured host, HTTPS, and approved ports, and added public-address-only DNS preflight before WHM fetches.
- Confirmed strict runtime request contracts, service-layer role/ownership checks, Prisma/parameterized database access, React/email escaping, CSV formula protection, and absence of upload endpoints. Retained the strict no-attachment boundary for tickets/manual proof.
- Remediated the known high-severity Prisma-tooling `deepmerge-ts` advisory with a tested workspace override to `8.0.0`; `pnpm audit --prod` now reports no known vulnerabilities. Added pinned Helmet 8.3.0.
- Cleared the fourteen carried-forward Command 22 ESLint findings and the newly surfaced dashboard React effect finding without changing financial/report semantics.
- Added two committed migrations for MFA storage and database-enforced token/hash/time/replay constraints, updated structural verification, and wrote the security control/residual-risk/production checklist.

#### Files changed

- Authentication/MFA API and tests: `apps/api/src/modules/auth/**`, `apps/api/test/auth.e2e-spec.ts`, `apps/api/src/environment.spec.ts`
- API/web transport hardening: `apps/api/src/main.ts`, `apps/web/next.config.ts`, `packages/config/src/env.ts`
- Administrator MFA interface/tests: `apps/web/src/components/auth/**`, `apps/web/src/components/dashboard/admin-dashboard.tsx`, `apps/web/src/components/dashboard/admin-dashboard.test.tsx`
- Payment/cPanel boundaries and tests: `apps/api/src/modules/payment-gateways/**`, `apps/api/src/modules/hosting-panels/**`, `packages/shared/src/contracts/hosting-panels.ts`
- Shared contracts/errors: `packages/shared/src/contracts/authentication.ts`, `packages/shared/src/contracts/errors.ts`
- Database schema/migrations/verifier: `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20260826090000_add_admin_two_factor/migration.sql`, `packages/database/prisma/migrations/20260826093000_harden_admin_two_factor_constraints/migration.sql`, `packages/database/prisma/verify.ts`
- Dependency/lint remediation: `apps/api/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/api/src/modules/dashboard-reports/**`
- Documentation: `README.md`, `docs/SECURITY_HARDENING.md`, `docs/AUTHENTICATION.md`, `docs/API_CONTRACTS.md`, `docs/DATABASE.md`, `docs/HOSTING_PANELS.md`, `docs/PAYMENT_GATEWAYS.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Repository Prettier, `git diff --check`, API/worker/web ESLint, strict TypeScript across every code workspace, and config/database/shared/queue/API/worker/web production builds passed.
- Workspace unit/component validation passed 169 tests: shared contracts 22, queue/Redis 3, API 84, worker 27, and frontend 33. Complete PostgreSQL/Redis API E2E validation passed 61 tests across sixteen suites. Total validated tests: 230.
- Security regression coverage passed for encrypted MFA secrets, TOTP clock window, challenge/recovery replay, password-to-MFA login, foreign-origin/fetch-metadata CSRF rejection, generic credentials, role/ownership denial, unsafe bKash/SSLCOMMERZ redirects, unsafe cPanel protocol/host/address resolution, password/token encryption, webhook invariants, and file-shaped/markup rejection.
- Twenty-one migrations deployed successfully. Prisma format/schema/client generation, database structural/custom-constraint/fictional-seed verification, Docker Compose validation, and PostgreSQL/Redis health passed.
- `pnpm audit --prod` passed with no known vulnerabilities after the override. Helmet contains no transitive runtime dependencies beyond its pinned package.
- The security review source scans found no unsafe raw Prisma queries, `dangerouslySetInnerHTML`, upload/multipart handlers, committed `.env`, private key, real credential/customer data, or raw provider action. No bKash, SSLCOMMERZ, cPanel, SMTP, domain registrar, or production external action was executed.

#### Decisions made

- Administrator MFA is a deliberate enrollment feature rather than an automatic migration-time lockout. Production administrators must enroll before public exposure; password reset does not remove MFA.
- TOTP uses the broadly compatible RFC 6238 SHA-1/six-digit/30-second profile with one clock step on either side. Accepted time steps and recovery codes are consumed atomically to prevent replay.
- Recovery codes are replaceable security material and are the sole intentional database cascade below an MFA credential; financial, operational, audit, and session history retain restrictive deletion behavior.
- Static Next.js pages retain framework-required inline script/style CSP allowances, while all third-party scripts, object/frame embedding, foreign forms/base URLs, and unconfigured network destinations remain blocked.
- cPanel DNS preflight rejects any mixed/private resolution before fetch. Network egress allowlisting remains mandatory because application-layer DNS validation alone cannot eliminate rebinding.
- Provider browser redirects are untrusted output and must match pinned sandbox HTTPS destinations. They still never constitute payment proof.

#### Open questions and risks

- Enroll every real administrator in MFA and store recovery codes offline. The application does not yet impose an organization-wide mandatory-enrollment deadline or hardware/WebAuthn factor.
- Production reverse-proxy forwarding/header replacement, TLS/HSTS rollout, database/Redis isolation, egress firewall rules, managed secret storage, backup restoration, and security monitoring require an operational deployment review.
- The static CSP includes `'unsafe-inline'` for current Next.js compatibility. Moving to nonce-based dynamic rendering or stable hash/SRI policy would trade static optimization for a stricter script boundary and needs separate performance/deployment validation.
- DNS can change after cPanel preflight. Restrict API/worker egress to the approved WHM/provider hosts or IP ranges and use token IP restrictions.
- No upload feature exists. Any future attachment/logo/import feature requires a separate threat model and private scanning/storage pipeline.
- Real payment sandbox callbacks, cPanel connectivity, SMTP, UK2Group registrar behavior, and production credentials remain operationally unverified because this command intentionally executed no external provider action.
- PostgreSQL E2E runs still emit the known pg@9 concurrent-query deprecation warning, and Jest worker/E2E runs emit the existing experimental VM warning. All tests passed.

#### Recommended next command

Run **Command 25 — Test Critical Business Invariants** only after explicit user authorization. Add the dedicated invariant matrix and concurrency/failure tests without weakening the Command 24 security boundaries or invoking real providers.

### Command 25 — Test Critical Business Invariants

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-26

#### Scope completed

- Added one root `pnpm test:invariants` command that builds shared packages and composes the authoritative shared-contract, integer-money, PostgreSQL/Redis API integration, and renewal-worker tests for all thirteen required business invariants.
- Added a durable invariant matrix mapping each guarantee to its application/database enforcement and named focused regression evidence, plus failure-triage guidance that forbids weakening concurrency, ownership, destructive-confirmation, or provider-proof assertions.
- Added direct payment-gateway coverage proving that an SSLCOMMERZ browser success return only redirects: the invoice remains unpaid, the checkout payment remains pending, and no payment event is created without authenticated provider proof.
- Added a supported-repricing regression proving an existing order and its issued invoice retain their snapshotted recurring/setup amounts and line totals after a new active catalogue price is appended.
- Added an explicit paid-invoice/successful-payment fixture followed by provisioning failure, proving the service can remain `PROVISION_FAILED` without rewriting the paid financial states.
- Strengthened hosting provisioning from a sequential replay check to simultaneous duplicate account-creation submissions plus a later replay; one durable operation/account performs the work.
- Added an explicit customer attempt to permanently terminate a service with otherwise valid input and confirmation; the role boundary returns `403` before the administrator-only destructive operation.
- Reused the owning module's real integration fixtures for duplicate webhook settlement, concurrent overpayment prevention, renewal scheduler/lifecycle replay, append-only refunds/reversals, foreign-customer denial, confirmation parsing, bounded retry classification, and lossless integer money instead of creating a competing all-in-one fixture.

#### Files changed

- Focused suite command: `package.json`
- Payment proof/replay tests: `apps/api/test/payment-gateways.e2e-spec.ts`
- Historical pricing tests: `apps/api/test/orders.e2e-spec.ts`
- Payment/provisioning state-separation tests: `apps/api/test/services.e2e-spec.ts`
- Provisioning concurrency and termination-authorization tests: `apps/api/test/hosting-panels.e2e-spec.ts`
- Invariant evidence and decision records: `docs/CRITICAL_BUSINESS_INVARIANTS.md`, `docs/DECISIONS.md`, `README.md`, `docs/PROGRESS.md`

#### Validation

- The final 72-test focused invariant suite passed twice consecutively with identical test counts and no intermittent failure: 22 shared contract tests, 12 API integer-money unit tests, 36 selected PostgreSQL/Redis API integration tests, and 2 renewal worker integration tests per run. Earlier development runs of the same focused layers also passed while the coverage was being strengthened.
- Complete workspace unit/contract/component/integration validation passed 169 tests: shared contracts 22, queue/Redis 3, API unit 84, worker 27, and frontend 33.
- Complete API end-to-end validation passed 63 tests across sixteen suites against the isolated PostgreSQL and Redis services. Total unique repository tests validated by the full suites: 232; the focused invariant run intentionally overlaps this total.
- Repository Prettier, `git diff --check`, API/worker/web ESLint, and strict TypeScript checks for every code workspace passed.
- Config/database/shared/queue packages, NestJS API/worker, and Next.js 16 production builds passed. Next.js generated all 29 application routes.
- Prisma formatting/schema/client generation, all 21 migration status checks, database structural/custom-constraint/fictional-seed verification, Docker Compose validation, and healthy loopback-only PostgreSQL/Redis services passed.
- `pnpm audit --prod` passed with no known vulnerabilities. No schema/dependency change, real credential, production data, or bKash, SSLCOMMERZ, SMTP, cPanel/WHM, UK2Group, or other external-provider action was introduced or executed.
- One initial full-E2E shell invocation included an unnecessary `--` separator, causing Jest to treat `--runInBand` as a path and exit with “No tests found.” The documented invocation was then run correctly and all 63 E2E tests passed; this was an invocation error rather than a test failure.

#### Decisions made

- Critical invariants are a composed release gate, not a duplicated monolithic test file. Each scenario remains beside the module that owns its realistic fixtures, while one root command and evidence matrix make the cross-module guarantees discoverable and runnable together.
- Concurrency and retry invariants require PostgreSQL-backed tests. Unit mocks alone cannot prove invoice row locks, unique event/operation keys, advisory scheduler locking, or persisted retry evidence.
- Browser navigation and financial proof remain distinct test concepts. A success-labelled return URL is explicitly tested as non-financial state.
- Real provider access is unnecessary and unsafe for this regression gate. Fake adapters exercise idempotency and failure classification deterministically; separately authorized sandbox acceptance remains operational work.

#### Open questions and risks

- Automated tests use fake providers and fictional `.test` identities. Real bKash/SSLCOMMERZ sandbox callbacks, cPanel connectivity, SMTP delivery, and future UK2Group behavior still need separate approved acceptance exercises with dedicated credentials and disposable resources.
- The focused suite requires the ignored local test environment plus healthy PostgreSQL and Redis. CI must provision isolated equivalents and run `pnpm test:invariants` as a required check before merge/deployment.
- PostgreSQL E2E concurrency still emits the known pg@9 concurrent-query deprecation warning, and Jest worker/E2E runs emit the existing experimental VM warning. Assertions and exit statuses passed; dependency/runtime upgrades must rerun the focused suite repeatedly.
- These tests provide strong executable regression evidence but do not replace production database isolation, backups/restoration, provider reconciliation monitoring, egress restrictions, or incident procedures.
- Full real-browser workflow coverage is intentionally reserved for authorized Command 26 and should consume only isolated fictional test data and fake providers.

#### Recommended next command

Run **Command 26 — Add End-to-End Tests** only after explicit user authorization. Add deterministic, isolated Playwright coverage for the twelve listed customer/administrator workflows, capture traces or screenshots on failure, and keep payment/provisioning/termination proof boundaries intact.

### Post-Command 25 — Protect administrator and customer workspace routes

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-26

#### Scope completed

- Added a narrowly matched Next.js Proxy that redirects requests without a recognized session cookie before route rendering, plus a server-side authorization layer that validates any presented cookie with the API before rendering `/admin/**` or `/portal/**`.
- Anonymous, missing-cookie, expired-session, and rejected-session requests redirect to `/login`. Authenticated users who open the other role's workspace redirect to their correct workspace.
- Forwarded only the recognized development or production session cookie, disabled authentication fetch caching, validated the API response with the shared runtime schema, and failed closed on unavailable or malformed authentication responses.
- Replaced fictional hard-coded shell identities with the authenticated account email and role-appropriate detail.

#### Files changed

- Pre-render and server authorization regression tests: `apps/web/src/proxy.ts`, `apps/web/src/proxy.test.ts`, `apps/web/src/lib/server-auth.ts`, `apps/web/src/lib/server-auth.test.ts`
- Protected route layouts: `apps/web/src/app/(admin)/admin/layout.tsx`, `apps/web/src/app/(portal)/portal/layout.tsx`
- Authentication and progress records: `docs/AUTHENTICATION.md`, `docs/PROGRESS.md`

#### Validation

- All 45 frontend tests passed across sixteen files, including six pre-render Proxy cases and six server-authorization cases for missing cookies, invalid sessions, permitted roles, cross-role redirects, and invalid API responses.
- Frontend ESLint and strict TypeScript passed. Prettier and `git diff --check` passed.
- The Next.js 16.3.2 production build passed and classified all administrator and customer workspace routes as dynamic server-rendered routes.
- The production-mode build used a fictional HTTPS API origin because the cPanel development URL is intentionally plain HTTP and production configuration correctly rejects it.
- The corrected development image was deployed at `my.speedhost.bd:3000`. Live anonymous smoke tests returned `200` for `/login` and `307` to `/login` for `/admin`, `/admin/customers`, `/portal`, and `/portal/invoices`; the API returned `401` for anonymous `/auth/me`. PostgreSQL and Redis remained healthy.

#### Decisions made

- The secure API remains the authorization authority. The lightweight Proxy prevents anonymous route rendering, and the Next.js server guard prevents invalid or wrong-role sessions from rendering a workspace shell, while every data request and mutation still requires API role and ownership checks.
- Session verification is request-time and uncached. A browser cannot obtain an administrator or customer shell merely by entering its URL.
- Wrong-role users are sent to their own workspace rather than shown another role's shell or a misleading login prompt.

#### Open questions and risks

- The current cPanel development deployment uses plain HTTP. Before production exposure, deploy the web and API behind reviewed HTTPS reverse-proxy origins so production secure cookies and HSTS operate correctly.
- Two stopped stateless web containers and their immutable images are retained temporarily for deployment rollback. They contain no database or Redis state and can be removed during a separately authorized cleanup.

#### Recommended next command

Run **Command 26 — Add End-to-End Tests** only after explicit user authorization. Include real-browser anonymous and cross-role navigation cases alongside the already planned workflows.

### Command 26 — Add End-to-End Tests

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-26

#### Scope completed

- Added a pinned Playwright 1.62.1 Chromium suite and root `pnpm test:e2e` release command with one sequential lifecycle, isolated API/web ports, a dedicated Next.js output directory, and trace/screenshot/video retention on failure.
- Added safe environment preparation that accepts only loopback PostgreSQL, drops and recreates only the exact `command26_e2e` schema, deploys all 21 migrations, and seeds a fictional administrator, customer journey, active monthly product/price, fake hosting server, and fake provider selection.
- Covered anonymous and cross-role route protection plus all twelve authorized workflows: plan browsing; registration, verification, and login; order creation; signed fake payment; administrator approval; fake-panel provisioning; active-service visibility; renewal invoice generation; overdue suspension; payment-linked unsuspension; customer ticket/administrator reply; and exact-confirmation manual termination.
- Executed the real renewal and hosting automation services at controlled business instants through a separate test runner while keeping browser assertions, cookie authentication, CSRF, API authorization, database state, and fake-provider proof in the same lifecycle.
- Corrected PostgreSQL adapter schema routing so Prisma runtime queries honor the URL `schema` parameter just as migrations do; the isolated browser schema no longer reads or writes the ordinary `public` application schema.
- Added the missing paid-order administrator approval action and regression coverage so the UI can deliberately move a paid order into `PROCESSING` before fulfilment.
- Fixed two registration defects found by the real browser: empty optional inputs are now omitted from the strict request, and the form element is captured before the asynchronous mutation so successful registration can safely reset it. Added component regression coverage.
- Made the existing API integration bootstrap pin localhost web/API origins so operator deployment values cannot alter deterministic redirect assertions.

#### Files changed

- Playwright environment, fixtures, database/automation helpers, lifecycle, configuration, and scripts: `apps/web/e2e/**`, `apps/web/playwright.config.ts`, `apps/web/package.json`, `package.json`, `pnpm-lock.yaml`
- Test/build output isolation: `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/vitest.config.mts`, `apps/web/eslint.config.mjs`, `.gitignore`, `.dockerignore`
- Runtime schema selection: `packages/database/src/client.ts`
- Registration and approval fixes/tests: `apps/web/src/components/auth/register-form.tsx`, `apps/web/src/components/auth/register-form.test.tsx`, `apps/web/src/components/orders/admin-order-manager.tsx`, `apps/web/src/components/orders/order-management.test.tsx`
- Existing API E2E origin isolation: `apps/api/test/setup-environment.ts`
- Documentation and decisions: `README.md`, `docs/END_TO_END_TESTING.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- The final root `pnpm test:e2e` run rebuilt required packages/worker, recreated and migrated the isolated schema, started isolated API/Next.js servers, and passed the complete Chromium lifecycle in 47.5 seconds. A prior clean full lifecycle also passed in 52.7 seconds after implementation fixes.
- All 183 workspace unit/contract/component/integration tests passed: shared 22, queue/Redis 3, API 84, worker 27, and frontend 47 across seventeen files. Complete API PostgreSQL/Redis E2E passed 63 tests across sixteen suites. Total unique validated repository tests: 247 including the Playwright lifecycle.
- The focused 72-test critical-invariant release gate passed: 22 contracts, 12 integer-money unit tests, 36 selected API integration tests, and 2 renewal worker integration tests.
- Repository Prettier, `git diff --check`, API/worker/web ESLint, and strict TypeScript for every code workspace including E2E helpers passed.
- Config/database/shared/queue packages, NestJS API/worker, and the isolated-output Next.js 16.3.2 production build passed; all 29 application routes were generated.
- Prisma format/validation/generation, all 21 public-schema migration status checks, structural/custom-constraint/fictional-seed verification, Docker Compose validation, and healthy loopback PostgreSQL/Redis passed.
- `pnpm audit --prod` reported no known vulnerabilities. No real credential, production/customer data, live payment, SMTP, cPanel/WHM, UK2Group, or other external-provider action was used.
- One validation run of the existing API E2E suite initially inherited the development `my.speedhost.bd` web origin and failed its localhost redirect assertion; the test bootstrap was isolated from operator origins and the complete 63-test suite then passed. This was an environment leak, not a business-state failure.

#### Decisions made

- One ordered lifecycle is the correct initial browser release gate because each later workflow must consume the exact order, invoice, service, suspension, and ticket created earlier. Parallelism and sharding would require separately designed independent fixtures.
- Financial proof remains an authenticated raw signed fake callback, never a browser redirect. Payment, order approval, service creation, provisioning, and service state remain separate assertions.
- Worker-owned automation runs through the production service implementations, but from a subprocess loading compiled worker output so Playwright does not transform NestJS decorator sources.
- Failure artifacts are local and ignored by Git. Successful runs do not retain screenshots/videos/traces, limiting noise and test-data exposure.
- Test keys and credentials are fixed fictional values confined to the isolated suite; real sandbox/live provider credentials are neither needed nor allowed.

#### Open questions and risks

- The browser gate currently covers desktop Chromium only. Firefox, WebKit, mobile viewports, accessibility scanning, and visual regression baselines require separately authorized scope and additional execution time.
- Developers and CI must provide healthy loopback PostgreSQL/Redis and install the pinned Playwright Chromium runtime. CI still needs a required-check workflow and artifact-retention policy.
- The isolated schema is recreated at the beginning of every run and contains fictional data only; it is retained after a run for failure investigation. It never targets or resets `public`.
- Next.js reports its existing smooth-scroll route-transition advisory, Node reports `NO_COLOR`/experimental-VM warnings, and PostgreSQL integration activity reports the known pg@9 concurrent-query deprecation. Exit statuses and assertions pass; review the driver warning during a future dependency upgrade.
- Real bKash/SSLCOMMERZ callbacks, cPanel/WHM connectivity, SMTP, and future UK2Group behavior remain separate explicitly approved acceptance work.

#### Recommended next command

Run **Command 27 — Add Observability and Health Checks** only after explicit user authorization. Add structured redacted logs, request/job/payment correlation, dependency readiness, queue/failure visibility, automation history, provider failure metrics, and an administrator alert policy without exposing secrets or sensitive payloads.

### Command 27 — Add Observability and Health Checks

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-26

#### Scope completed

- Added newline-delimited structured JSON logging for the API, worker, and scheduler with service/environment/event fields and recursive fail-safe secret redaction.
- Added UUID request correlation through `X-Request-ID`, safe request completion telemetry without queries or inputs, and AsyncLocalStorage-backed job correlation across the complete BullMQ handler lifecycle.
- Added safe payment processing records containing provider event identifiers, result state, and duplicate/replay status without webhook bodies, signatures, gateway responses, or credentials.
- Added public dependency-free `GET /health` liveness and bounded `GET /ready` PostgreSQL/Redis readiness; readiness returns `503` without exposing infrastructure details when a dependency is down.
- Added administrator-only `GET /observability/overview` with per-queue backlog/failed counts, failed outbox totals, running/recent/failed automation evidence, and 24-hour payment, cPanel, and email provider failure/inconsistent metrics.
- Extended the existing administrator automation page with operational KPI cards, per-queue backlog visibility, and provider failure summaries while preserving the safe retained-failure/retry controls and automation history.
- Documented correlation, endpoint semantics, log exclusions, retained-failure interpretation, investigation order, and explicit wake-the-administrator/business-hours alert thresholds.

#### Files changed

- Shared contracts, correlation context, structured logger, and redaction tests: `packages/shared/src/contracts/observability.ts`, `packages/shared/src/observability.ts`, `packages/shared/src/index.ts`, `packages/shared/test/observability.spec.ts`
- BullMQ metrics and handler-scoped correlation: `packages/queue/src/background-queue.catalog.ts`, `packages/queue/src/background-worker.ts`
- API health/readiness/metrics and request telemetry: `apps/api/src/modules/observability/**`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/src/common/errors/api-exception.filter.ts`, `apps/api/src/modules/background-jobs/background-job.module.ts`
- Safe payment event telemetry: `apps/api/src/modules/payment-gateways/payment-gateway.service.ts`
- Worker and scheduler logger bootstrap: `apps/worker/src/main.ts`, `apps/worker/src/scheduler-main.ts`
- Administrator operations UI and tests: `apps/web/src/components/automation/automation-manager.tsx`, `apps/web/src/components/automation/automation-manager.test.tsx`
- Integration tests and operator documentation: `apps/api/test/app.e2e-spec.ts`, `apps/api/test/background-jobs.e2e-spec.ts`, `docs/OBSERVABILITY.md`, `docs/DECISIONS.md`, `README.md`, `docs/PROGRESS.md`

#### Validation

- Repository Prettier, `git diff --check`, API/worker/web ESLint, and strict TypeScript checks for every code workspace passed. The first root typecheck inherited the operator's production/plain-HTTP web origin and correctly rejected it; the complete check passed with the intended test environment, and the production build passed with fictional HTTPS origins.
- All 189 workspace unit/contract/component/integration tests passed: shared 25, queue/Redis 3, API 87, worker 27, and frontend 47. The complete API PostgreSQL/Redis E2E suite passed 65 tests across sixteen suites, including health/readiness, UUID response correlation, administrator metrics, and customer denial.
- The 75-test focused critical-invariant gate passed: 25 contracts, 12 integer-money unit tests, 36 selected API integration tests, and 2 renewal worker integration tests. The complete sequential Playwright Chromium hosting lifecycle also passed.
- Config/database/shared/queue packages, NestJS API/worker, and the Next.js 16.3.2 production build passed; all 29 routes were generated with fictional HTTPS production origins. The final payment-failure metric query refinement passed API typecheck, its focused unit suite, and the two affected API E2E suites.
- Prisma formatting/validation/generation, all 21 migration status checks, structural/custom-constraint/fictional-seed verification, Docker Compose validation, and healthy loopback-only PostgreSQL/Redis services passed. `pnpm audit --prod` reported no known vulnerabilities.
- No real credentials, customer data, production infrastructure, payment/SMTP/cPanel/UK2Group provider call, or destructive external action was used.

#### Decisions made

- Liveness answers whether the API process can serve HTTP; readiness answers whether PostgreSQL and Redis are usable. A dependency outage must not leak a URL or exception through the public endpoint.
- Logs carry identifiers and safe state only. Redaction is defense in depth; bodies, headers, cookies, credentials, proof, and provider responses remain prohibited at the call site.
- Retained failed-job totals are evidence rather than a promise that a current incident remains active. External mutation uncertainty requires authenticated read-only reconciliation and never authorizes blind retry.
- Operational metrics use durable application evidence and a bounded 24-hour window. Third-party paging integration is deferred until an alert destination and production deployment are explicitly authorized.

#### Open questions and risks

- Command 29 deployment must configure process/readiness monitors, log collection/retention/access, reverse-proxy filtering/rate limits for public health routes, and the alert delivery destination.
- In-process JSON output and redaction reduce exposure but do not replace host-level access controls, encrypted log transport/storage, retention limits, or incident-response procedures.
- Provider failure totals are polling snapshots rather than Prometheus counters. They are intentionally sufficient for the private initial deployment; higher-volume time-series monitoring remains future scope.
- PostgreSQL and Redis readiness proves connectivity, not capacity, replication, backup integrity, or recovery. Those controls begin in Command 28.

#### Recommended next command

Run **Command 28 — Prepare Backups and Recovery** only after explicit user authorization. Create encrypted PostgreSQL backup/restore procedures, verify a fictional local backup in an isolated database, document configuration-secret recovery, migration recovery, rollback decisions, and the disaster-recovery checklist without touching production data.

### Command 28 — Prepare Backups and Recovery

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-26

#### Scope completed

- Added PostgreSQL custom-format backup tooling that streams directly from the matching PostgreSQL 18 Compose client into OpenPGP symmetric AES-256 encryption without writing a plaintext dump.
- Added mandatory explicit source database selection, protected passphrase-file validation, private output permissions, atomic backup publication, SHA-256 transport checks, encrypted archive integrity/parse checks, and validation that all 30 application/migration tables are present.
- Added safe metadata sidecars containing backup time, source database, PostgreSQL client, application commit, completed migration count, encryption format, and encrypted-file checksum without credentials or connection strings.
- Added isolated restore tooling that accepts only a new `webhost_billing_restore_*` database, requires target-specific confirmation, refuses replacement, restores in one transaction without ownership/privileges, removes only its newly created target on failure, and never overwrites the active database.
- Added restored-database checks for schema/migration presence, critical relationship orphans, financial arithmetic, and important row totals, plus source/restore comparison across all 30 table counts and complete successful migration history.
- Added a guarded fictional recovery drill that recreates only two fixed Command 28 databases, deploys 21 migrations, loads/verifies reserved `.test` data, creates/verifies an encrypted backup, proves corrupted ciphertext is rejected, restores and compares it, verifies migration recovery, and removes the temporary databases, key, and artifact on exit.
- Documented the initial RPO/RTO and retention baseline, off-site/immutable/key-separation requirements, backup/restore commands, historical application-secret recovery, PostgreSQL role recreation, forward-only migration recovery, rollback/cutover choices, Redis/outbox reconciliation, and the complete disaster-recovery checklist.

#### Files changed

- Backup, verification, restore, comparison, and fictional drill tooling: `scripts/backups/common.sh`, `scripts/backups/create-postgres-backup.sh`, `scripts/backups/verify-postgres-backup.sh`, `scripts/backups/restore-postgres-backup.sh`, `scripts/backups/verify-restored-database.sh`, `scripts/backups/compare-postgres-databases.sh`, `scripts/backups/test-recovery-drill.sh`
- Root commands and artifact exclusions: `package.json`, `.gitignore`, `.dockerignore`
- Recovery policy and architecture records: `docs/BACKUP_AND_RECOVERY.md`, `docs/DATABASE.md`, `docs/DECISIONS.md`, `README.md`, `docs/PROGRESS.md`

#### Validation

- The final clean `pnpm backup:test-recovery` drill passed. It migrated and seeded a separate fictional source, verified the seed, accepted the authentic encrypted backup, rejected a deliberately truncated/corrupted encrypted copy, restored into the allowlisted isolated target, and matched all 30 table counts and all 21 completed migrations.
- Restored evidence was `tables=30`, `migrations=21`, `users=2`, `customers=1`, `orders=1`, `invoices=1`, `payments=1`, `services=1`, `orphans=0`, and `financial_violations=0`. Prisma reported no pending restored migration, and the full schema/fictional relationship verifier passed after restoration.
- The final drill cleanup left neither fixed Command 28 database nor its temporary passphrase/backup artifact. A separate negative check confirmed that the restore command rejects a non-allowlisted ordinary database name before reading an archive.
- Bash syntax validation passed for all seven scripts. Repository Prettier, `git diff --check`, API/worker/web ESLint, and strict TypeScript checks for every code workspace passed.
- All 189 workspace unit/contract/component/integration tests passed: shared 25, queue/Redis 3, API 87, worker 27, and frontend 47. No application business behavior changed, so the unchanged API/Playwright E2E suites were not rerun for this scripts-and-runbook command.
- Config/database/shared/queue packages, NestJS API/worker, and the Next.js 16.3.2 production build passed with fictional HTTPS origins; all 29 routes were generated.
- Prisma formatting/validation/generation, all 21 ordinary development migration status checks, structural/custom-constraint/fictional-seed verification, Docker Compose validation, and healthy loopback PostgreSQL/Redis services passed. `pnpm audit --prod` reported no known vulnerabilities.
- No production/customer data, real credential, external provider, active application database mutation, or production backup destination was accessed. The first development drill stopped on an overly broad order-item arithmetic assertion and automatically cleaned up both isolated databases; the corrected final drills then passed completely.

#### Decisions made

- A backup is accepted only after checksum, GPG integrity/decryption, PostgreSQL archive parsing, and complete required-table checks; a successful dump command alone is insufficient.
- Restores are always additive into a new isolated database. The active and failed databases remain untouched for rollback and forensic review until an owner-approved connection cutover.
- Database migrations remain forward-only. Compatible application rollback may reuse an additive schema; incompatible or data-changing rollback requires a verified pre-migration restore into a new database instead of an improvised down migration.
- The PostgreSQL dump carries encrypted application credential state but not the encryption key, deployment secrets, global roles, Redis, images, or source. Those must be recovered independently from protected infrastructure/configuration sources.
- Published outbox rows and external payment/hosting/email effects cannot be blindly replayed after Redis loss. Recovery uses durable evidence plus authenticated read-only provider reconciliation before safe retry controls are enabled.

#### Open questions and risks

- The off-site immutable backup provider, secret manager, scheduler, alert delivery, legal retention/deletion policy, production PostgreSQL/WAL option, and Redis snapshot/AOF destination remain deployment decisions.
- The six-hour RPO, four-hour RTO, and proposed retention schedule are an initial minimum and require owner/provider approval plus a timed staging-hardware drill before launch.
- Symmetric GPG recovery depends on the separately stored high-entropy passphrase. Losing that passphrase loses the backup; storing it beside the dump defeats the isolation model.
- Losing the historical `CREDENTIAL_ENCRYPTION_KEY` makes restored payment/WHM credential bundles, administrator TOTP secrets, and pending encrypted action tokens unreadable. Key escrow/rotation testing is a production launch requirement.
- Logical dumps do not provide point-in-time recovery and these scripts deliberately exclude PostgreSQL global roles. Production must recreate least-privilege roles and add managed physical/WAL recovery if the accepted RPO requires it.

#### Recommended next command

Run **Command 29 — Prepare Production Deployment** only after explicit user authorization. Add non-root production images, API/web/worker/scheduler services, PostgreSQL/Redis configuration, health checks, graceful shutdown, reviewed migration execution, persistent storage guidance, Nginx/HTTPS/security limits, secret injection, log rotation, and deployment/rollback checklists; build locally and do not deploy externally.

### Command 29 — Prepare Production Deployment

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-26

#### Scope completed

- Added multi-stage Node.js 24 production images for the NestJS API, standalone Next.js web application, BullMQ worker/dedicated scheduler, and an isolated Prisma migration tool, plus a non-root Nginx image. All five final images declare explicit unprivileged users and exclude development/build artifacts from runtime layers.
- Added a production Docker Compose topology with PostgreSQL 18.6, authenticated Redis 8.10 AOF/no-eviction persistence, API, web, worker, exactly one scheduler, reviewed one-shot migration profile, Nginx, health checks, bounded stop grace periods, read-only filesystems, bounded tmpfs, dropped capabilities, `no-new-privileges`, private service networks, and explicit edge/provider-egress networks.
- Added allowlisted file-secret loading without value logging; kept provider credentials in the existing encrypted database settings path; documented root-only secret-directory permissions, local Compose bind-mount constraints, independent key escrow, and external secret-manager migration.
- Added split billing/API HTTPS-host routing, unknown-host rejection, HTTP-to-HTTPS redirects, TLS 1.2/1.3, secure response headers, sanitized proxy/request-ID headers, exact one-hop API proxy trust, 1 MiB body limits, conservative timeouts, JSON access logs, and Docker log rotation.
- Enabled API SIGINT/SIGTERM shutdown hooks and fixed the dedicated renewal scheduler so its referenced interval keeps the scheduler process alive until an explicit shutdown. Added regression coverage for that process-lifecycle guarantee.
- Added durable production guidance for DNS/TLS/ACME, SMTP, firewalling, cPanel port conflicts, immutable image tags/digests, manual forward-only migrations, persistent PostgreSQL/Redis storage, encrypted backups, monitoring, graceful maintenance, deployment checks, compatible code rollback, isolated database restore, and uncertain-provider reconciliation.
- Added root production commands for config validation, all-image builds, reviewed migration execution, startup with health waiting, and volume-preserving shutdown. No production/staging host, registry, provider, DNS, certificate authority, or real credential was touched.

#### Files changed

- Production images and context: `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/worker/Dockerfile`, `deploy/production/migration/Dockerfile`, `.dockerignore`
- Compose, secrets, PostgreSQL/Redis, Nginx, and example configuration: `deploy/production/compose.production.yaml`, `deploy/production/app-entrypoint.sh`, `deploy/production/.env.example`, `deploy/production/redis/*`, `deploy/production/nginx/*`
- Proxy trust, shutdown, standalone output, scheduler lifecycle, and tests: `packages/config/src/env.ts`, `apps/api/src/main.ts`, `apps/api/src/environment.spec.ts`, `apps/api/src/modules/payment-gateways/*.spec.ts`, `apps/web/next.config.ts`, `apps/worker/src/renewal/renewal-scheduler.service.ts`, `apps/worker/src/renewal/renewal-scheduler-lifecycle.spec.ts`
- Commands and operator/architecture records: `package.json`, `docs/PRODUCTION_DEPLOYMENT.md`, `docs/DECISIONS.md`, `README.md`, `docs/PROGRESS.md`

#### Validation

- Repository Prettier, `git diff --check`, API/worker/web ESLint, and strict TypeScript checks for every code workspace passed.
- All 191 workspace unit/contract/component/integration tests passed: shared 25, queue/Redis 3, API 88, worker 28, and frontend 47. The new proxy-bound validation and referenced scheduler-timer regression passed.
- Every final production image built locally from the corrected clean context: API 198,031,064 bytes, web 93,348,207 bytes, worker 190,530,191 bytes, migration 191,437,236 bytes, and Nginx 27,392,972 bytes. Image inspection reported API/web/worker/migration UID/GID `10001:10001` and Nginx user `nginx`; the migration image successfully loaded Prisma 7.9.1 and all migration files as UID 10001.
- An isolated fictional production smoke stack created fresh named volumes, started PostgreSQL/Redis, and applied all 21 migrations through the one-shot non-root migration image. API `/health` and `/ready`, web `/login`, every Compose health check, separate-host self-signed HTTPS routing, known-host HTTP 308 redirect, security headers, and the 1 MiB Nginx limit (`413` for a 1.1 MB request) passed.
- The corrected worker and dedicated scheduler remained healthy with zero restarts through seven five-second lifecycle checks. SIGTERM stops completed within the configured timeout without forced kills; Nginx exited 0 and Node/tini containers reported the expected signal exit 143. The isolated containers, networks, volumes, certificate, and fictional secrets were removed after the smoke run.
- Production Compose rendering, Bash/POSIX shell syntax for all entry points, migration-tool contents, image user metadata, and no-host-published API/web/PostgreSQL/Redis ports were verified. `pnpm audit --prod` reported no known vulnerabilities.
- Initial local build/smoke attempts exposed and then resolved pnpm workspace deploy mode, OpenSSL availability, build-context size, non-root Compose file permissions, read-only Nginx temp paths, edge/egress network routing, and the unreferenced scheduler interval. The final complete checks passed after each correction.

#### Decisions made

- Use two HTTPS origins on one Nginx edge—billing UI and API—because the existing security schemas intentionally permit origins without path prefixes. The web build embeds the API origin and must be rebuilt if that hostname changes.
- Keep migrations manual, reviewed, and forward-only. API startup never performs schema mutation; incompatible rollback uses a verified isolated pre-migration restore/cutover rather than a down migration.
- Keep authoritative PostgreSQL and durable BullMQ Redis volumes separate; Redis uses AOF every second and `noeviction`, but neither named volume is treated as backup. PostgreSQL retains the Command 28 encrypted/off-site backup boundary.
- Separate internal application networks from an edge network needed for published 80/443 and an egress network needed for SMTP/payment/cPanel traffic. No service other than Nginx publishes a host port; production firewalls should restrict outbound provider destinations.
- Local Compose file secrets use container-readable files inside a root-only non-traversable directory because bind-mounted `0400` root files cannot be read by non-root containers. A secret driver with UID/mode mapping should use container-owner `0400` instead.
- Prefer a dedicated VPS. A side-by-side cPanel host deployment needs a separate authorization/review because Apache/cPanel normally owns ports 80/443 and Docker resource/firewall/update behavior can conflict.

#### Open questions and risks

- Production VPS/provider, host capacity, registry/signing/scanning, DNS names, trusted certificate/ACME renewal, SMTP provider, firewall/egress allowlists, monitoring/alert destination, centralized log retention, and off-site immutable backup destination still require owner approval.
- The initial Compose database/cache are single-host services without high availability or point-in-time recovery. A managed replacement needs TLS, least privilege, supported-version compatibility, tested backups/PITR, Redis persistence, and `noeviction` behavior.
- Docker Compose file secrets are protected bind mounts rather than a complete secret manager. Host root/Docker access remains privileged, and historical encryption-key escrow/rotation must be tested before launch.
- Real bKash/SSLCommerz, SMTP, cPanel/WHM, and future UK2Group acceptance still require separately authorized credentialed staging checks. No browser redirect, container health, or paid invoice proves provider settlement/provisioning.
- Command 30 must complete the full release audit, empty-database migration test, backup/restore verification, browser E2E, manual workflow inspection, and launch recommendation before any staging or production deployment.

#### Recommended next command

Run **Command 30 — Conduct the Release Audit** only after explicit user authorization. Compare the complete plan to implementation; rerun formatting, lint, typecheck, unit/integration/E2E, production builds, Prisma/empty-database migrations, dependency audit, and backup recovery; inspect primary workflows; fix local release blockers; and create `docs/RELEASE_CHECKLIST.md` without deploying.

### Command 30 — Conduct the Release Audit

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-08-26

#### Scope completed

- Compared every requirement in `HOSTING_BILLING_SYSTEM_PLAN.md` with the implemented administrator, customer, automation, data, integration, architecture, security, billing-policy, MVP-acceptance, and operational-safety boundaries.
- Created `docs/RELEASE_CHECKLIST.md` with a requirement-by-requirement status matrix, complete validation evidence, missing requirements, known defects and coverage gaps, security/operational risks, credentialed provider tests, deployment/rollback steps, and the launch recommendation.
- Verified the complete local release gate against fictional data and fake/mocked providers, including all workspace tests, critical invariants, the full API E2E suite, sequential Chromium lifecycle, production images, Prisma/schema/migrations, dependency audit, and encrypted recovery drill.
- Captured a correctly prepared Playwright trace and manually inspected the primary desktop administrator/customer route flow, status presentation, feedback, role redirects, provisioning lifecycle, support conversation, and destructive termination treatment.
- Recorded the release decision in ADR-038: local readiness permits an explicitly authorized staging step but does not authorize production. No external deployment, real provider request, live credential use, DNS/TLS mutation, registry push, or production/customer data access occurred.
- Found no release-blocking local integrity, authorization, financial-state, migration, recovery, build, or primary-workflow defect. Documented non-critical plan gaps and operational blockers instead of expanding the product during the release audit.

#### Files changed

- Release audit and operator checklist: `docs/RELEASE_CHECKLIST.md`
- Release decision: `docs/DECISIONS.md`
- Command tracking: `docs/PROGRESS.md`

#### Validation

- Repository Prettier, `git diff --check`, API/worker/web ESLint, and strict TypeScript checks for every code workspace passed.
- All **191** workspace unit/contract/component/integration tests passed: shared 25, queue 3, API 88, worker 28, and frontend 47.
- The **75-test** critical-invariant gate passed: contracts 25, money/API unit 12, selected API integration 36, and renewal worker 2.
- The complete API PostgreSQL/Redis E2E suite passed **65 tests across 16 suites**.
- The sequential Chromium hosting lifecycle passed all fourteen release-critical workflow steps. A second correctly prepared trace run also passed and supplied the manual desktop workflow evidence.
- API, web, worker, migration, and Nginx production images built successfully. Image inspection reported API/web/worker/migration UID/GID `10001:10001` and Nginx user `nginx`; production Compose rendered successfully from the non-secret example configuration.
- Prisma formatting, validation, generation, current migration status, and structural/fictional-seed verification passed. The recovery drill applied all **21 migrations** to an empty isolated database.
- `pnpm audit --prod` reported **no known vulnerabilities**.
- The encrypted recovery drill passed: authentic backup accepted, deliberately corrupted ciphertext rejected, restored evidence reported 30 tables, 21 migrations, no relationship or financial violations, source/restored table counts matched, and temporary databases/key/artifact were removed.
- The first recovery-drill attempt was refused because its explicit fictional-reset confirmation was intentionally absent. A containerized retry then stopped because its fresh GPG home did not exist. The final run supplied the exact confirmation and a private GPG home and passed; neither attempt touched the active database.
- One optional browser trace-capture attempt invoked Playwright without its schema-reset pre-step and correctly failed on an existing fictional email. The normal browser release command had already passed; the trace run was repeated with the required preparation and passed. This was an invocation error, not a product regression.
- Expected non-failing diagnostics remain: Jest experimental VM modules, a `pg` concurrent-query deprecation warning relevant to a future `pg` 9 upgrade, and Next.js's smooth-scroll route-transition hint.

#### Decisions made

- The complete local evidence is sufficient to classify the codebase as a staging candidate, not a production release.
- Dashboard recent payments, a full paginated activity-log interface, and direct external administrator alert delivery are real plan gaps but are not local financial/integrity blockers; they must be accepted or completed before production approval.
- Provider mocks prove internal contracts and failure handling only. bKash, SSLCOMMERZ, SMTP, and cPanel/WHM remain credentialed staging gates; UK2Group stays a later separately authorized registrar project.
- No broad feature work or speculative WHMCS scope belongs in a release audit. Final tax/VAT, cancellation/refund, branding, order-approval, alerting, hosting, backup, and provider choices remain explicit owner/operations decisions.

#### Open questions and risks

- Staging host identity, cPanel/Apache port/resource compatibility, DNS/TLS, externally managed secrets, SMTP, monitoring/alert recipient, centralized logs, and immutable off-site backups require owner approval.
- Real provider acceptance must use sandbox/development identities, disposable records, least-privilege credentials, exact target review, and separate authorization for destructive cPanel termination.
- Production remains single-host without HA/PITR. Historical encryption-key escrow, image registry scanning/signing/digest pinning, clock monitoring, and a timed staging-hardware restore are launch requirements.
- Final business identity, tax/VAT position, cancellation/refund policy, manual-payment evidence criteria, renewal/grace values, and the documented minor plan gaps require owner acceptance or remediation.
- Browser coverage is Chromium desktop for the critical lifecycle; mobile, other engines, MFA/settings/PDF/manual-payment browser paths and credentialed providers rely on lower-layer tests until expanded.

#### Recommended next command

Run **Command 31 — Deploy to Staging** only after explicit user authorization and after the exact staging target, externally supplied non-placeholder secrets, backup/rollback ownership, DNS/TLS plan, and allowed fake/sandbox provider mode are confirmed. Do not deploy to production.

### Command 31 — Deploy to Staging

- **Status:** Completed on staging and delivered to GitHub `main`
- **Date:** 2026-08-26

#### Scope completed

- Confirmed `my.speedhost.bd` resolves to the newly supplied server at `46.250.239.221`, authenticated it with a repository-specific Ed25519 deployment key and pinned host key, and verified the target is an Ubuntu 24.04 shared staging host rather than an authorized production target.
- Inventoried the host before mutation: Docker/Compose and host Nginx were already installed; Nodewatch Pilot, RemotePilot production, and the RemotePilot RustDesk test stack were live. Preserved all unrelated containers, networks, ports, Nginx sites, files, and firewall behavior.
- Installed the application under the isolated `/srv/webhost-billing-staging` root with a `current` release symlink, root-only secrets and login records, project-prefixed containers/networks/volumes, loopback web/API ports `19500`/`19600`, and no published PostgreSQL, Redis, Mailpit, worker, or scheduler ports.
- Streamed the five previously audited application images and pinned PostgreSQL, Redis, and Mailpit images to the host. No source build, registry login, broad image cleanup, Docker prune, or global service restart occurred on the shared server.
- Added a scoped host Nginx site for `my.speedhost.bd`, retained an encrypted pre-change Nginx archive, obtained a hostname-specific Let's Encrypt certificate, and activated HTTPS only after `nginx -t` succeeded. The edge uses exact path routing to API/web loopback listeners, a 1 MiB body limit, authentication rate limiting, HSTS/security headers, and HTTP-to-HTTPS redirect.
- Applied all 21 Prisma migrations exactly once to a fresh staging database, seeded fictional release data, and bootstrapped separate random administrator/customer passwords into protected root-only files. Fixed the fictional invoice snapshot to include explicit nullable address line 2 so detail and PDF serialization match the runtime schema.
- Started one API, web, worker, scheduler, PostgreSQL, Redis, and TLS-required Mailpit container. Real bKash, SSLCOMMERZ, cPanel/WHM, and UK2Group credentials were not supplied or used; their production-capable adapters remain disabled.
- Created `docs/STAGING_DEPLOYMENT.md` with the shared-host guardrails, protected paths, scoped inspection/start/stop commands, migration boundary, certificate-renewal step, rollback process, provider posture, and backup limitation.

#### Files changed

- Staging Compose, environment example, Nginx templates, fictional-user bootstrap, end-to-end staging smoke, and offline fake-provider smoke: `deploy/staging/*`
- Fictional seed invoice snapshot compatibility: `packages/database/prisma/seed.ts`
- Local credential-file exclusion: `.gitignore`
- Staging runbook, architecture decision, and command tracking: `docs/STAGING_DEPLOYMENT.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- Staging and production Compose files rendered together successfully. All three staging CommonJS scripts passed Node syntax checks, the fictional seed passed strict TypeScript validation, repository formatting checks for changed code/config passed, and `git diff --check` passed.
- All seven `webhost-billing-staging` containers are healthy with zero restarts, PostgreSQL and Redis readiness are `UP`, and exactly one scheduler process is running. Container resources and volumes are scoped to the staging project.
- Public HTTP `/login` redirects to HTTPS; HTTPS `/login`, `/health`, and `/ready` pass. The Let's Encrypt certificate matches `my.speedhost.bd`; security headers are present once; a 1.1 MiB authentication body is rejected with `413`.
- The credentialed smoke passed administrator and customer login, administrator dashboard, customer portal, administrator dashboard/customer APIs, customer denial of the administrator customer list (`403`), invoice detail/PDF, support tickets, payment adapter listing, hosting operations, password-reset queueing, logout, and post-logout denial.
- The fake payment and fake hosting-panel adapter contracts passed in an offline container. Credentialed bKash, SSLCOMMERZ, and cPanel checks correctly remained disabled without secrets; no external provider mutation was attempted.
- TLS-required Mailpit received the fictional customer's password-reset email. The transactional outbox, failed outbox, and failed email counts were zero, and recent staging logs contained no fatal-pattern matches.
- An encrypted PostgreSQL custom-format backup passed SHA-256, OpenPGP integrity, archive-structure, required-table, PostgreSQL 18.6, and 21-migration verification. The artifact and its separate passphrase are protected on the staging host.
- After deployment, every previously running unrelated container remained healthy with its original uptime, host Nginx validation passed, and both `https://nodewatch.speedhost.bd` and `https://remotepilot.speedhost.bd` returned HTTP 200. No unrelated service was restarted.

#### Decisions made

- Use the host's existing Nginx as the shared public edge and use one same-origin hostname with an explicit API route allowlist. The application containers never bind public addresses.
- Treat this as a narrowly approved staging exception on a shared host, not a change to the dedicated-VPS production recommendation. All lifecycle commands must remain Compose-project-scoped.
- Use fictional accounts and the local TLS-required Mailpit sandbox until real SMTP/provider credentials and exact mutation boundaries receive separate authorization.
- Keep forward-only migrations manual. Roll back application releases only when schema-compatible; otherwise restore a verified pre-migration backup into a separate database before a deliberate cutover.

#### Open questions and risks

- bKash and SSLCOMMERZ sandbox credentials, a cPanel development token/package/account, and real SMTP remain unconfigured. UK2Group remains a later separately authorized registrar integration. Fake contracts do not prove provider acceptance.
- The verified encrypted backup and passphrase currently reside on the same host. There is no approved immutable off-site destination, centralized log retention, alert destination, HA, PITR, or host-level resource reservation; these remain production blockers.
- Staging shares CPU, memory, Docker, and host Nginx with important applications. Capacity is currently adequate, but future deployment must repeat the inventory/isolation checks and must never use global restart/prune/firewall actions.
- Certbot renews the host certificate automatically, but Mailpit consumes a protected copy. Its copy and only the Mailpit/worker/scheduler services must be refreshed after certificate renewal.
- Production business identity, tax/VAT, cancellation/refund policy, renewal/grace values, operational owners, credential escrow/rotation, image registry/signing, monitoring, and final launch acceptance are unresolved.

#### Recommended next command

Run **Command 32 — Prepare the Production Launch** only after explicit user authorization. Prepare and review the production runbook and remaining gates, but do not mutate production or reuse staging credentials.

### Command 32 — Prepare the Production Launch

- **Status:** Completed and delivered to GitHub `main`; production remains `NO-GO`
- **Date:** 2026-08-26

#### Scope completed

- Audited the current release, staging report, production topology, security, backup/recovery, observability, email, payment, cPanel, renewal, settings, and accepted decision boundaries against every Command 32 launch gate.
- Created `docs/PRODUCTION_LAUNCH_RUNBOOK.md` with a launch control state, non-negotiable safety boundaries, named owner roles, evidence-based gate matrix, limited manual-first provider choices, mandatory approval/launch records, exact commands, eight deployment phases, checkpoints, immediate stop conditions, scoped rollback matrix, and final acceptance record.
- Kept production at `NO-GO`. No production server, SSH identity, registry, DNS, certificate, firewall, database, secret manager, backup destination, alert destination, SMTP provider, payment account, WHM account, or real customer record was accessed or changed.
- Classified the ready, partial, and blocked gates honestly. Migration tooling and manual termination controls are ready; production target, off-site restore, secrets/escrow, DNS/TLS, communication, SMTP, monitoring, business policy, provider acceptance, supply-chain delivery, first-renewal impact, and assigned rollback authority remain incomplete.
- Defined a safer manual-first option: keep `manual` as the active payment gateway and leave all WHM server tokens unconfigured. Online bKash/SSLCOMMERZ production use remains blocked because the current adapters are sandbox-only; automated cPanel remains blocked until credentialed disposable-account acceptance passes. UK2Group remains outside this launch.
- Added a one-time production administrator bootstrap utility. It requires exact confirmation, a protected newline-free password file, validated email/display fields, and an empty administrator boundary; hashes with the application Argon2id profile under a database advisory lock, creates one active super-administrator, appends safe audit evidence, and refuses an existing administrator/email or concurrent bootstrap.
- Sequenced production startup so API/web/edge start without worker or scheduler. Business/sender settings and SMTP are reviewed before one worker starts; renewal policy/eligible services are reviewed before exactly one scheduler starts. Automatic termination remains absent.

#### Files changed

- Final production launch gates, commands, records, stop conditions, and rollback procedure: `docs/PRODUCTION_LAUNCH_RUNBOOK.md`
- One-time first-administrator utility: `deploy/production/bootstrap-admin.cjs`
- Production/authentication cross-references: `docs/PRODUCTION_DEPLOYMENT.md`, `docs/AUTHENTICATION.md`
- Launch and bootstrap decision: `docs/DECISIONS.md`
- Command tracking: `docs/PROGRESS.md`

#### Validation

- Production Compose rendered from a temporary non-secret environment and temporary empty secret files. Only Nginx had public ports, API gateway environment fallbacks remained disabled, and the dedicated scheduler command remained distinct.
- The bootstrap utility passed Node syntax validation and ran against an exact isolated `command32_bootstrap_test` PostgreSQL schema after all 21 migrations. It created exactly one administrator, one super-admin profile, and one `PRODUCTION_ADMIN_BOOTSTRAPPED` audit event; a second invocation failed with the intended existing-administrator refusal. The test schema and one-time password artifacts were removed.
- The focused renewal lifecycle and scheduler invariant suites passed two tests. Evidence includes one daily scheduler request across concurrent/replayed runs and zero termination events in the overdue lifecycle.
- The staging environment remained healthy during the read-only review: API liveness and PostgreSQL/Redis readiness passed, all seven staging containers were running, exactly one scheduler existed, and the encrypted staging-backup SHA-256 sidecar verified.
- Changed JavaScript/Markdown files passed Prettier, the staged script passed syntax checking in the audited production API image, and `git diff --check` passed. No credential/private-key marker or protected environment artifact entered the change set.

#### Decisions made

- A complete runbook is not launch approval. Every placeholder and owner/evidence line must be completed, and production deployment requires a new explicit authorization after the `NO-GO` gates are closed.
- Prefer a dedicated production host. The Command 31 shared server remains staging and its secrets, volumes, ports, queue names, passwords and certificate material must never be reused.
- Permit a consciously reduced manual-first launch only when the owner signs the limitation. Selecting the cPanel adapter name without any configured WHM token gives the application no panel authority; operators must not invoke hosting operations in that mode.
- Create only the first administrator through a refusal-based tool rather than the public registration route, the fictional seed, or an idempotent privileged upsert. Remove its temporary password file and enroll administrator TOTP before exposure.
- Keep migrations forward-only and manual. Compatible code rollback can select a prior digest; incompatible schema/data recovery restores the verified pre-migration backup into a separate database before an explicit cutover.

#### Open questions and risks

- No production target, public billing/API hostname, production SSH host key, registry, image signing/scanner, secret manager, immutable off-site backup destination, SMTP provider, monitoring/log platform, or alert recipient has been selected.
- The staging backup is valid same-host rollback evidence, not an off-site production backup. A timed isolated restore on production-like hardware and measured RPO/RTO remain mandatory.
- bKash and SSLCOMMERZ are sandbox-only and have not passed credentialed sandbox acceptance. Production endpoints/live credentials require separately authorized implementation/review. cPanel has not passed the documented credentialed development-server sequence.
- Final business identity, BDT/tax/VAT position, invoice numbering, order/manual-payment evidence policy, cancellation/refund/retention rules, first renewal date, lead/reminder/grace values, and suspension supervision need owner decisions.
- The documented product gaps remain: no dedicated recent-payments dashboard card, no full paginated activity-log page, and no direct external administrator alert delivery. Owner acceptance or remediation is required before final go/no-go.
- Single-host PostgreSQL/Redis has no HA/PITR by default. Redis recovery, WAL/managed database choice, log retention, clock/capacity monitoring, historical key escrow, credential rotation, and provider uncertainty procedures need assigned operational owners.

#### Recommended next command

Do not execute a production mutation yet. After every `BLOCKED` gate in `docs/PRODUCTION_LAUNCH_RUNBOOK.md` has evidence and the owner explicitly authorizes the exact target/release, use the canonical continuation command: **“Execute the approved production launch runbook exactly as documented.”** Stop immediately on any listed mismatch, failed check, or rollback condition.

## Planning Update — Remaining Codex Command Catalogue

- **Status:** Completed and delivered to GitHub `main`; no numbered command executed
- **Date:** 2026-08-26

#### Scope completed

- Extended `CODEX_DEVELOPMENT_COMMANDS.md` with copy-ready Commands 33–48 for business policy, production infrastructure, secret management, off-site recovery, DNS/TLS, SMTP, monitoring, optional credentialed providers, immutable images, final audit, production launch, observation, first renewal, and operational handover.
- Added explicit manual-first skip paths for bKash, SSLCOMMERZ, and cPanel. A skipped provider command requires owner acceptance plus evidence that credentials/authority remain absent.
- Added optional post-launch Commands 49–53 for UK2Group discovery/implementation/test acceptance, accepted interface/alerting gaps, and one bounded resilience/browser-coverage improvement at a time.
- Preserved command-level authorization boundaries: no command automatically authorizes its successor, credential handling, provider mutation, production mutation, destructive cPanel termination, DNS changes, or paid infrastructure.

#### Files changed

- Remaining copy-ready command catalogue: `CODEX_DEVELOPMENT_COMMANDS.md`
- Planning record: `docs/PROGRESS.md`

#### Validation

- Confirmed continuous unique numbering from Command 33 through Command 53, command titles, fenced copy-ready prompts, explicit stop/report/update/push boundaries, provider skip conditions, and production authorization gates.
- Prettier and `git diff --check` passed for the changed Markdown files. No credential, private key, environment file, customer data, external mutation, production connection, or provider call was used.

#### Decisions made

- Keep production-readiness work sequential through Command 39. Commands 40–42 may be skipped only through documented manual-first decisions; Command 43 then resumes the common release path.
- Command 45 is the sole production-deployment command and is unusable until placeholders are replaced, Command 44 returns `GO`, and the user explicitly authorizes the exact target/release/window.
- Keep UK2Group after the initial launch as a separate registrar project, not a cPanel hosting module. Optional quality/resilience work remains bounded and evidence-driven.

#### Open questions and risks

- The owner still needs to supply the business decisions for Command 33 and the exact dedicated production target/cost approval for Command 34.
- Payment and cPanel skip/run choices determine whether Commands 40–42 are executed before the immutable release command.
- Optional Commands 49–53 are not launch prerequisites unless the owner explicitly changes the production acceptance scope.

#### Recommended next command

Run **Command 33 — Finalize Business and Launch Policies** only after explicit user authorization and provision of the owner-approved non-secret business decisions. Do not include credentials in the prompt.

### Command 33 — Finalize Business and Launch Policies

- **Status:** Completed and delivered to GitHub `main`; deferred values remain production blockers
- **Date:** 2026-08-26

#### Scope completed

- Reviewed the product plan, settings/secrets model, release audit, production launch
  runbook, current safe application defaults, architecture decisions, and prior progress for
  existing owner-approved values.
- Created `docs/PRODUCTION_BUSINESS_POLICIES.md` as a non-secret approval worksheet that
  separates confirmed product scope, non-production code defaults, engineering constraints,
  and owner decisions.
- Recorded every unresolved legal identity, tax/VAT, invoicing, billing-period,
  payment-evidence, order-approval, cancellation/refund, retention, renewal, provider-mode,
  operational-contact, and interface-gap decision as a launch blocker.
- Linked the production business/legal gate to the policy record. No application default,
  production setting, provider credential, external system, or production host was changed.
- Recorded the owner's `ALL` instruction as approval of every clearly proposed safe default:
  BDT; `INV`/6/1001 invoice numbering; generic manual-payment wording; disabled partial
  payments; 14-day/7-3-1/3-day renewal policy in Asia/Dhaka; the proposed backup retention;
  and manual-first payment and hosting launch modes.
- Updated the launch matrix to show both provider modes selected as manual-first and the
  first-renewal gate as partial. Credentials/WHM authority remain absent requirements, not
  completed provider evidence.
- Recorded the owner's decision to keep unresolved fields configurable and complete them
  later. Added an exact configuration/control-location matrix covering administrator
  settings, Products/Pricing, provider authority, policy/runbook records, deployment
  lifecycle controls, and separately authorized feature gaps.

#### Files changed

- Owner policy, approved defaults, deferred values, and configuration-location record:
  `docs/PRODUCTION_BUSINESS_POLICIES.md`
- Production business/legal launch-gate reference: `docs/PRODUCTION_LAUNCH_RUNBOOK.md`
- In-progress command tracking: `docs/PROGRESS.md`

#### Validation

- The three changed Markdown files passed the repository's installed Prettier 3 check, and
  `git diff --check` passed. The initial package-manager shim invocation was unavailable from
  the shell path and then refused a non-interactive dependency-directory refresh, so the
  existing pinned Prettier binary was invoked directly without installing or changing
  dependencies.
- No code/schema/default change exists, so application tests are not yet required for this
  draft.

#### Decisions made

- The product name `Webhost Billing` is not evidence of the owner's legal business name.
- Existing `BDT`, `Asia/Dhaka`, `INV-001001`, 14/7-3-1/3 renewal values, disabled partial
  payments, manual gateway, generic manual-payment instructions, proposed backup retention,
  and manual-first provider modes are now owner-approved policy values. They already match
  safe defaults, so no code change is required.
- Command 33 cannot change defaults, close launch gates, or authorize Command 34 based only
  on inferred geography, staging configuration, or code defaults.
- `ALL` applies only to rows containing a concrete proposed/default value. It does not supply
  a legal identity, tax opinion, policy wording, contact, date, owner name, evidence rule, or
  interface-gap acceptance that was never proposed.
- Existing runtime controls remain the configuration boundary for business identity,
  localization, invoice numbering, manual payments, renewal policy, provider selection, and
  product billing periods. Policy/legal wording, retention, contacts, first-run evidence,
  and gap acceptance remain document/operations controlled; this command does not invent a
  policy CMS or claim absent UI fields exist.

#### Open questions and risks

- Every row marked `UNRESOLVED` in `docs/PRODUCTION_BUSINESS_POLICIES.md` requires the
  owner's explicit value or acceptance. Legal and tax answers must come from the owner and,
  where appropriate, qualified local advice.
- Until approval is recorded, production remains `NO-GO`; production workers/scheduler and
  real payment/cPanel authority must remain disabled.
- A deferred value is still a final-audit blocker. Completing Command 33 and starting later
  infrastructure-readiness commands does not permit production invoices, live customers,
  provider authority, scheduler startup, or production launch.

#### Recommended next command

Run **Command 34 — Select and Audit Production Infrastructure** only after explicit user
authorization. It may prepare a dedicated target and evidence, but production launch remains
blocked until every deferred Command 33 value and every other launch gate is resolved.

### Command 34 — Select and Audit Production Infrastructure

- **Status:** Completed and delivered to GitHub `main`; selected shared target remains `NO-GO`
- **Date:** 2026-08-26

#### Scope completed

- Recorded the owner's explicit choice to use the existing `my.speedhost.bd` server for a
  personal, low-traffic deployment instead of a separate VM/VPS, and selected one same-origin
  web/API hostname.
- Reused only the existing application-specific staging audit key with the independently
  pinned ED25519 host key to perform a read-only audit of `46.250.239.221`. Did not accept a
  new host key, use a password, expose private key material, or create production access.
- Inventoried target identity, KVM virtualization, Ubuntu support, CPU, memory, swap, disk,
  inodes, filesystem/encryption visibility, time sync, Docker/Compose, containers, networks,
  volumes, listeners, host/Docker firewall posture, SSH policy, patch state, failed units,
  certificates, backup artifacts, application health, and unrelated workloads.
- Created `docs/PRODUCTION_INFRASTRUCTURE_AUDIT.md` with the owner-selected exception,
  target inventory, capacity evidence, same-origin topology, inbound/outbound firewall plan,
  isolation limits, backup/recovery state, blockers, and explicit no-mutation boundary.
- Updated the launch matrix to show `BLOCKED — SHARED EXCEPTION` for target identity and
  `PARTIAL — SAME ORIGIN SELECTED` for DNS/TLS. Added ADR-041 without silently waiving the
  final evidence gates.

#### Files changed

- Production target audit, capacity/firewall plan, and blocking evidence:
  `docs/PRODUCTION_INFRASTRUCTURE_AUDIT.md`
- Shared-host and same-origin launch-gate updates: `docs/PRODUCTION_LAUNCH_RUNBOOK.md`
- Owner-selected bounded architecture exception: `docs/DECISIONS.md`
- Command report: `docs/PROGRESS.md`

#### Validation

- Strict SSH host-key checking matched the pinned fingerprint; the forward address remained
  `46.250.239.221`. Every remote command was read-only. No package, user, key, firewall,
  DNS, TLS, Nginx, service, Docker, file, volume, database, backup, or application mutation
  was attempted.
- Ubuntu 24.04.4, six vCPUs, 11.68 GiB RAM, synchronized time, Docker 29.6.2, Compose 5.3.1,
  valid Nginx configuration, seven healthy Webhost Billing containers, API liveness,
  PostgreSQL/Redis readiness, public app health, and a valid `my.speedhost.bd` certificate
  were observed.
- The changed Markdown files passed the installed Prettier 3 check and `git diff --check`.
  The staged change set was scanned for private-key/credential markers before commit.

#### Decisions made

- Observed capacity is adequate for the stated personal low-traffic use, but capacity does
  not prove security or resilience. The owner-selected shared-host exception replaces the
  separate-VPS preference for this bounded deployment only.
- Keep `my.speedhost.bd` as one same-origin web/API edge. No DNS or Nginx change occurs in
  Command 34; the current deployment remains fictional staging release `b2b2d61`.
- A completed audit can return `NO-GO`. The current server must not be promoted merely by
  renaming staging or introducing real records/secrets.

#### Open questions and risks

- Exact provider account/server ID, region, plan, monthly cost/cap, provider encryption,
  snapshot/recovery controls, and named infrastructure/rollback/security/recovery/incident
  owners are unresolved. PTR/RDAP evidence is not a substitute for the owner's contract.
- The host runs 20 containers plus shared Nginx, databases, Node processes, and public
  RustDesk/other listeners. UFW is inactive, INPUT accepts traffic, effective SSH permits
  root/password/X11/TCP-forwarding access, and a provider firewall was not evidenced.
- Root disk is 71% used, no swap exists, no production container resource reservations were
  proven, and 43 packages including Docker/MongoDB are pending. Two network/cloud-init units
  are failed and Docker live-restore is disabled.
- The only Webhost Billing backup is encrypted but same-host and one-time. No scheduled
  off-site immutable backup, provider snapshot evidence, or timed production-like restore
  exists.
- A new production-only deployment key, hardened administrative boundary, IPv4/IPv6
  firewall, monitored resource thresholds, patch window, off-site recovery, and same-origin
  production topology review remain blocking. No production secret or real customer data
  should be placed on the target yet.

#### Recommended next command

Do not start Command 35 on the blocked target yet. First explicitly authorize a bounded
**Command 34 Remediation — Harden the Selected Shared Host**, with named infrastructure and
rollback owners, provider/plan/cost evidence, approved maintenance window, provider-console
recovery, exact existing-port ownership, backup checkpoint, and permission for scoped
SSH/firewall/swap/patch/resource-limit changes. It must preserve every unrelated application
and stop on any failed preflight.

### Command 34 Remediation — Harden the Selected Shared Host

- **Status:** Blocked safely after read-only preflight; no host mutation performed
- **Date:** 2026-08-26

#### Scope completed

- Accepted the owner's explicit authorization for bounded shared-host hardening and re-read
  the architecture, launch, audit, and command boundaries.
- Reconfirmed the exact pinned target using the existing staging audit key, then inventoried
  current identity/capacity, TCP/UDP listeners, owning processes/directories, Docker network
  modes and Compose projects, Nginx upstreams, SSH effective policy/key fingerprints,
  firewall state, updates, failed units, storage layout, backup timers, DNS, and all Webhost
  Billing/unrelated container health.
- Created `docs/PRODUCTION_INFRASTRUCTURE_REMEDIATION.md` with the exact preserve/approve port
  matrix, nine required owner inputs, phased SSH/firewall/capacity/patch procedure, rollback
  checks, and stop conditions.
- Stopped before every mutation because no exact maintenance window, provider-console
  recovery, named infrastructure/rollback owner, operator source policy, root-key ownership,
  or unrelated-port decision was supplied.

#### Files changed

- Shared-host preflight, approval matrix, staged procedure, rollback boundaries and stop
  conditions: `docs/PRODUCTION_INFRASTRUCTURE_REMEDIATION.md`
- Audit cross-reference/current blocked status: `docs/PRODUCTION_INFRASTRUCTURE_AUDIT.md`
- Command report: `docs/PROGRESS.md`

#### Validation

- Strict pinned-host-key SSH validation passed. `my.speedhost.bd` still resolved to the audited
  IPv4, time was synchronized, and the target remained KVM Ubuntu with 11 GiB RAM.
- Root disk use increased from the prior 71% observation to 72%; 111 GiB remained. No swap
  exists, 43 packages remain pending, Docker live restore is disabled, and the same two
  network/cloud-init units remain failed.
- UFW remains inactive; IPv4/IPv6 INPUT defaults remain ACCEPT. Effective SSH still permits
  root/password/key login, X11 and TCP forwarding, with 12 root public keys.
- Exact public ownership includes host Nginx on TCP 80/443, SSH on 22, unrelated Node
  services on TCP 3101/4180, and host-network RustDesk on TCP 21115–21119 plus UDP 21116 and
  a currently dynamic UDP port. Webhost Billing ports 19500/19600 remain loopback only.
- All seven Webhost Billing staging containers and 13 unrelated containers remained running;
  no container, service, Nginx configuration, firewall, SSH setting, package, file, key,
  swap, database, volume, network, DNS, TLS or application setting was changed.

#### Decisions made

- Authorization to harden does not identify which unrelated listeners may be closed or supply
  a safe SSH allowlist. Firewall default-deny and password/root-SSH changes must not be
  guessed on a shared production host.
- A provider-console/rescue test and a second independently verified key-based session are
  mandatory before SSH hardening. A timed firewall rollback guard and independent rollback
  confirmation are mandatory before changing INPUT policy.
- Docker live-restore, swap, patch and reboot changes affect the whole host and require an
  all-application checkpoint/window, not merely Webhost Billing authorization.
- The intended final-server designation remains recorded, but production stays `NO-GO` and
  fictional staging remains unchanged.

#### Open questions and risks

- The exact provider account/server ID, region, plan, monthly cost/cap, account MFA,
  snapshot/rescue controls and tested console operator remain unprovided.
- Infrastructure/rollback owners, emergency custodian, maintenance window, SSH source policy,
  root-key ownership/expiry, public-port decisions, swap/resource allocation, patch/reboot
  approval and independent checkpoint are required before mutation.
- The host currently has no inbound default-deny boundary, permits password root access, and
  exposes unrelated services outside Nginx. These remain real risks, but changing them
  without ownership evidence creates a higher immediate lockout/outage risk.

#### Recommended next command

Resume **Command 34 Remediation — Apply Approved Shared-Host Hardening** only after completing
the nine non-secret approvals in `docs/PRODUCTION_INFRASTRUCTURE_REMEDIATION.md`. Do not
resume Command 35 or create production secrets until the operator/recovery boundary passes.

### Command 35 — Establish Production Secret Management

- **Status:** Blocked before mutation; production prerequisites and custody approvals missing
- **Date:** 2026-08-26

#### Scope completed

- Reconciled the authorized command with the canonical command list. Command 35 establishes
  production secret management; it does not promote, relabel, or deploy the application.
- Recorded the owner's clarification that the existing shared host is the intended final
  physical production server. This target-purpose decision does not waive the unresolved
  Command 34 hardening, recovery, resource, provider, cost, and ownership findings.
- Performed a read-only preflight through the existing staging-only SSH identity and pinned
  host-key file. Confirmed that no `/srv/webhost-billing-production` root, production-named
  Webhost Billing container, or production-named Webhost Billing volume exists.
- Inspected only access-boundary metadata for the current fictional staging deployment. No
  secret value, password, key, recovery code, provider credential, or customer data was read
  into the report.
- Stopped before generating any PostgreSQL, Redis, session, credential-encryption, backup,
  SMTP, TLS, deployment-SSH, provider, or recovery value. No production file, directory,
  user, key, image, container, database, volume, network, setting, or external service was
  created or changed.

#### Files changed

- Blocked command/preflight record: `docs/PROGRESS.md`

#### Validation

- Strict SSH host-key verification succeeded for the already pinned target. The host reported
  its audited identity as `vmi3398336.contaboserver.net`.
- The existing staging root and secret directory are mode `0700`; its secret files use mode
  `0400` or `0444`. API and web containers run as UID/GID `10001:10001`; API bind-mounted
  secret files appear as mode `0444`, matching the already documented Docker Compose
  file-secret limitation rather than proving an approved production secret manager.
- All seven staging containers remained healthy. The preflight found zero production-named
  containers and zero production-named volumes. No application or unrelated workload was
  restarted or mutated.
- Repository status was clean and synchronized with `origin/main` before this documentation
  record.

#### Decisions made

- The assistant's conversational suggestion to call an in-place promotion “Command 35” was
  incorrect. The repository's canonical Command 35 title and boundary remain authoritative.
- A final-server designation is accepted as the owner's target intent, but it is not a final
  production `GO` decision and cannot substitute for a production-only SSH boundary,
  approved secret storage, independent escrow, named custodians, or Command 34 remediation.
- Staging credentials, keys, certificate copies, volumes, queue prefix, backup passphrase,
  and fictional database must never be reused or silently relabeled as production.
- An external secret manager or paid service requires explicit owner selection and cost
  approval. The existing Compose bind-mounted files cannot be treated as an approved manager
  without a documented owner decision, off-server encrypted escrow, recovery test, and
  accepted root/Docker access boundary.

#### Open questions and risks

- Command 34 remains blocked by the missing provider account/server ID, plan/region/cost,
  provider-console recovery evidence, production-only SSH key, shared-host firewall/SSH and
  patch plan, resource limits/monitoring, and named infrastructure/rollback owners.
- Command 35 still requires the exact secret-management choice, primary and backup
  secret/security custodians with reachable private contacts, approved recovery/escrow
  location, access and revocation policy, and approval for any external or paid service.
- Administrator MFA and offline recovery-code custody cannot be verified for a production
  administrator because no production identity or deployment exists. Historical
  credential-encryption keys and backup passphrases also need separately controlled escrow.
- Creating production secrets now would place unrecoverable authority on a host whose
  administrative and recovery boundaries remain unapproved. Production remains `NO-GO`.

#### Recommended next command

Authorize **Command 34 Remediation — Harden the Selected Shared Host** with the required
maintenance window, provider/plan/cost and console-recovery evidence, exact port ownership,
production SSH/firewall/patch/resource scope, and named infrastructure and rollback owners.
Then resume Command 35 with an explicit secret-manager/escrow choice and named primary and
backup custodians. Do not start Command 36 yet.

## Operational Hotfix — Staging Login Browser API Origin

- **Status:** Completed, deployed to staging, and delivered to GitHub `main`
- **Date:** 2026-08-26

### Scope completed

- Investigated the user's `Failed to fetch` login report at
  `https://my.speedhost.bd/login`. Confirmed the API, same-origin Nginx routes, CORS
  preflight, PostgreSQL, and Redis were healthy, while the login response CSP and compiled
  Next.js browser bundle referenced the placeholder `https://api.billing.example.com`.
- Built `webhost-billing-web:72ef8ee-login-hotfix1` with
  `NEXT_PUBLIC_API_URL=https://my.speedhost.bd`, verified the placeholder was absent and the
  expected origin existed, and streamed only that image to the staging host.
- Preserved the protected pre-change staging environment, added equivalent release tags for
  unchanged component images, updated only the staging image tag, validated Compose, and
  recreated only `webhost-billing-staging-web-1`.
- Added `deploy/staging/verify-web-origin.cjs` so future staging checks validate the browser
  CSP and JavaScript bundle instead of proving only that the API itself works.

### Files changed

- Browser-origin deployment verifier: `deploy/staging/verify-web-origin.cjs`
- Staging verification, incident, and rollback record: `docs/STAGING_DEPLOYMENT.md`
- Operational tracking: `docs/PROGRESS.md`

### Validation

- The replacement image built successfully as unprivileged user `10001:10001`; its browser
  files contained `https://my.speedhost.bd` and no `api.billing.example.com`.
- The recreated web container became healthy with zero restarts. The public login CSP now
  contains `connect-src 'self' https://my.speedhost.bd`; `/auth/csrf` returned 200 with the
  correct origin and secure cookie boundary.
- The protected credentialed smoke passed administrator/customer login, both dashboards,
  authorization denial, invoice detail/PDF, ticket, payment/hosting adapters, password-reset
  queueing, logout, and post-logout denial. Passwords were read only from protected files and
  were never printed.
- Every other running container retained the same container ID/status across the web
  recreation. Webhost Billing API/worker/scheduler/PostgreSQL/Redis/Mailpit and unrelated
  applications were not recreated or restarted.
- The new verifier passed Node syntax, live origin validation, Prettier, and the repository
  diff check. The changed set contained no secret/private-key markers.

### Decisions made

- Treat `NEXT_PUBLIC_API_URL` as immutable web-image provenance. A runtime environment value
  cannot repair an already compiled Next.js client bundle.
- Keep staging on the one same-origin `my.speedhost.bd` topology. Do not introduce a second
  API hostname to fix a build mistake.
- Preserve the prior image/config for evidence, but classify the old web image as known-bad
  for browser authentication.

### Open questions and risks

- Browsers that kept the old page open must reload it; a hard refresh may be needed to discard
  an already-loaded JavaScript bundle.
- This fixes staging login only. It does not promote staging to production or close the
  Command 34 infrastructure, recovery, policy, SMTP, monitoring, or provider gates.

### Recommended next action

Retry login after a hard refresh. Continue numbered production-readiness commands only after
the user confirms browser login and explicitly authorizes the next command.

## Operational Change — Separate Administrator and Customer Entry Routes

- **Status:** Completed, deployed to staging, and delivered to GitHub `main`
- **Date:** 2026-08-26

### Scope completed

- Replaced the public root landing page with a redirect from `/` to the customer login at
  `/login`.
- Made `/login` explicitly customer-facing and retained customer registration access there.
- Made `/admin` the dedicated administrator entry. Anonymous visitors see an administrator
  sign-in form at that URL, without the public customer-registration link.
- Kept authenticated role routing authoritative: administrators enter `/admin`, customers
  enter `/portal`, and a customer session attempting `/admin` is returned to `/portal`.
- Changed anonymous administrator subpages such as `/admin/customers` to redirect to
  `/admin`; anonymous customer portal pages continue to redirect to `/login`.

### Files changed

- Root redirect and Next.js redirect configuration: `apps/web/src/app/(store)/page.tsx`,
  `apps/web/next.config.ts`
- Dedicated login presentation and administrator access boundary:
  `apps/web/src/app/login/page.tsx`, `apps/web/src/app/(admin)/admin/layout.tsx`,
  `apps/web/src/components/auth/login-form.tsx`, `apps/web/src/lib/server-auth.ts`,
  `apps/web/src/proxy.ts`
- Focused unit and end-to-end coverage: `apps/web/src/components/auth/login-form.test.tsx`,
  `apps/web/src/lib/server-auth.test.ts`, `apps/web/src/proxy.test.ts`,
  `apps/web/e2e/specs/hosting-lifecycle.spec.ts`

### Validation

- Focused Vitest authentication/routing suite: 3 files and 16 tests passed.
- Changed web files passed ESLint; application and Playwright TypeScript checks passed.
- The Next.js 16.3.2 production build completed successfully with `/`, `/login`, `/admin`,
  and all existing portal/workspace routes present.
- A local production HTTP smoke proved `/` returns 307 to `/login`, `/admin` returns 200
  with `Administrator sign in`, `/login` returns 200 with `Customer sign in`, the admin form
  omits customer registration, and `/admin/customers` returns 307 to `/admin` anonymously.
- Built and deployed `webhost-billing-web:5ee6e7b-entry-routes` with the correct same-origin
  browser API URL. The live HTTPS route smoke proved the same 307/200 behavior, and the
  browser-origin verifier passed.
- The protected credentialed smoke passed both role logins, both dashboards, administrator
  authorization, customer denial, invoice/PDF, ticket, provider-adapter, password-reset,
  logout, and post-logout checks.
- Only `webhost-billing-staging-web-1` was recreated. It became healthy with zero restarts;
  every non-web container retained its container ID. The pre-change environment backup is
  protected at mode `0600` under the staging rollback directory.

### Decisions made

- Separate entry URLs do not weaken API authorization. The administrator layout validates
  the server-side session before mounting any workspace content, and every API endpoint keeps
  its existing role and ownership enforcement.
- Existing public `/hosting` and account-registration routes remain available by direct URL;
  only the unwanted root landing page is removed from the entry flow.

### Open questions and risks

- Existing browser tabs may retain the prior page briefly; reload the requested URL if a tab
  does not immediately show the new entry page.
- This operational route change does not promote staging to production or close any existing
  production launch gate.

### Recommended next action

Use `https://my.speedhost.bd/admin` for administrators and
`https://my.speedhost.bd/login` for customers. Authorize the next numbered command separately;
the existing production launch blockers remain in force.

## Operational Hotfix — Settings Browser Bundle Boundary

- **Status:** Completed, deployed to staging, and delivered to GitHub `main`
- **Date:** 2026-08-26

### Scope completed

- Reproduced the administrator settings failure in a clean headless Chromium session against
  `https://my.speedhost.bd/admin/settings` while reading the protected administrator password
  only through an SSH pipe.
- Confirmed login, `GET /settings`, response shape, and the server-rendered settings page all
  returned 200. The database/settings API and authentication boundary were healthy.
- Captured the client exception: the settings chunk tried to load Node-only
  `node:async_hooks` because the browser used a runtime settings constant from the shared
  CommonJS root, whose barrel also eagerly exported the server structured logger.
- Added a dedicated `@webhost-billing/shared/observability` package export, removed the
  Node-only module from the browser-compatible root, and moved API/worker/queue imports to the
  explicit server-only subpath.
- Added a regression test that preserves this package boundary.
- Added a clean Chromium staging verifier that accepts the protected administrator password
  through standard input and reports no credential value.

### Files changed

- Shared package entrypoints and boundary test: `packages/shared/package.json`,
  `packages/shared/src/index.ts`, `packages/shared/test/observability.spec.ts`,
  `packages/shared/test/package-boundaries.spec.ts`
- Explicit Node-only observability consumers: `apps/api/src/main.ts`,
  `apps/api/src/modules/observability/request-observability.middleware.ts`,
  `apps/worker/src/main.ts`, `apps/worker/src/scheduler-main.ts`,
  `packages/queue/src/background-worker.ts`
- Operational tracking: `docs/PROGRESS.md`
- Clean live-browser verifier: `deploy/staging/verify-settings-browser.cjs`

### Validation

- The clean live-browser reproduction failed before the fix with the exact
  `Cannot find module 'node:async_hooks'` client error, proving the fault independently from
  the screenshot.
- All 26 shared contract/observability/boundary tests passed. Shared, queue, API, worker and
  web TypeScript checks passed; changed API/worker files passed ESLint.
- Shared, queue, API and worker builds passed, and the new observability subpath resolved at
  runtime from an application workspace.
- The settings component test passed. The Next.js production build passed with all 29 routes,
  including `/admin/settings`, and `node:async_hooks` was absent from every generated static
  client chunk.
- Built and deployed `webhost-billing-web:3bedc40-settings-hotfix1`. The clean credentialed
  Chromium check passed against the live settings page with the expected heading, no error
  boundary, no client exception, and no non-aborted failed request. The browser-origin
  verifier also passed.
- The full protected credentialed smoke passed both role logins, dashboards, authorization,
  invoice/PDF, ticket, adapter, email-queue, logout and post-logout checks.
- Only the Webhost Billing web container was recreated. It is healthy with zero restarts;
  every non-web container retained its ID, all seven project containers are healthy, and all
  13 unrelated containers remain running. The environment rollback backup is protected at
  mode `0600`.

### Decisions made

- Keep runtime contracts/constants browser-compatible at the shared root. Node-only logging
  context must be imported through the explicit observability subpath.
- Do not change the settings API, database values or authentication policy: each was healthy
  and was not the cause.
- Deployment must recreate only the Webhost Billing web container. The source-level import
  updates keep future API/worker images buildable but do not require those healthy running
  containers to be replaced for this browser-only fault.

### Open questions and risks

- A browser tab that loaded the failed chunk before deployment may need one hard refresh.
- This operational fix does not resume Command 34 remediation, promote production, or alter
  any production launch gate.

### Recommended next action

Retry `/admin/settings` after a hard refresh. Resume Command 34 remediation only after its
separately documented owner, recovery, maintenance, SSH and unrelated-port approvals exist.

### Command 38 — Configure Production SMTP and Email Reputation

- **Status:** Blocked before mutation; read-only preflight completed
- **Date:** 2026-08-26

#### Scope completed

- Reconciled the authorized command with its mandatory preconditions and audited the existing
  email architecture, production deployment configuration, current shared host, isolated
  staging namespace, and authoritative public DNS without sending an email or changing any
  service, secret, container, DNS record, or provider account.
- Confirmed the application already enforces production SMTP, HTTPS links, certificate-validated
  TLS 1.2 or newer, implicit TLS or required STARTTLS, paired optional authentication values,
  bounded connection/socket timeouts, reference-only jobs, deterministic message identifiers,
  bounded temporary retries, and no blind resend after an uncertain SMTP outcome.
- Confirmed the deployed worker uses only private TLS-required Mailpit sandbox delivery. No
  production namespace exists; no host mail transfer service or public SMTP listener was found;
  and the protected staging SMTP files are sandbox-only and cannot be promoted.
- Queried both authoritative Cloudflare name servers. They consistently returned EmailDesk MX,
  MailChannels SPF with soft-fail, and monitoring-only relaxed DMARC for `speedhost.bd`.
  `my.speedhost.bd` has no separate SPF/TXT result, and no provider-issued DKIM selector was
  supplied, so sender alignment and DKIM cannot be accepted.
- Added a durable production SMTP acceptance record with required owner inputs, safe evidence,
  exact acceptance steps, redacted-evidence rules, and stop conditions.
- Added focused coverage proving Bengali and Latin content survives in both HTML and plain-text
  email alternatives.

#### Files changed

- Production provider/DNS/reputation acceptance gate: `docs/PRODUCTION_SMTP_ACCEPTANCE.md`
- Email operations cross-reference: `docs/EMAIL_NOTIFICATIONS.md`
- Bengali/Latin rendering regression: `apps/worker/src/email/email-template.catalog.spec.ts`
- Command tracking: `docs/PROGRESS.md`

#### Validation

- Both authoritative name servers returned matching MX, SPF, and DMARC answers. The current app
  A/PTR, subdomain TXT/MX posture, and MailChannels include were resolved read-only.
- SSH used the dedicated pinned deployment key. All seven isolated staging containers remained
  healthy; all 13 unrelated containers remained running. No service/container was restarted or
  recreated.
- The host audit found no active Postfix, Exim, or Dovecot service and no host listener on SMTP
  ports 25, 465, 587, 1025, or 8025. Worker environment inspection returned names only; secret
  values were not read or printed.
- Focused worker Jest passed 17 tests across the template and provider suites, including all 12
  template alternatives, Bengali/Latin preservation, SMTP failure classification, TLS production
  guards, and private preview output.
- Worker TypeScript checking and focused ESLint passed. Changed files passed Prettier and
  `git diff --check`.
- The first pnpm wrapper attempt could not run because pnpm was absent from the default shell
  PATH; after locating the pinned runtime, its dependency-status hook requested an interactive
  modules purge. No dependencies were changed. Equivalent direct pinned-runtime Jest, TypeScript,
  ESLint, and Prettier commands completed successfully.

#### Decisions made

- Do not infer the production SMTP provider from existing EmailDesk/MailChannels DNS. Those
  records may belong to another mail workflow and do not prove account authorization, outbound
  endpoint, authentication, quota, sender verification, or bounce/complaint operations.
- Do not reuse the staging Mailpit identity or credentials. The staging sender is fictional, the
  parent SPF record is not inherited by `my.speedhost.bd`, and direct delivery from the host's
  generic reverse-DNS identity is not approved.
- Keep the production worker absent and do not send even a fictional acceptance message until
  provider/account identity, sender, controlled test inboxes, cost, DNS mutation authority,
  protected credentials, reputation operations, and rollback ownership are explicit.
- A provider-issued DKIM selector is required for an exact lookup. Guessed common selectors are
  not acceptance evidence, and DMARC `p=none` is monitoring rather than enforcement.

#### Open questions and risks

- Missing: exact SMTP provider/account/operator, approved plan/quota/cost, envelope and header
  sender identities, sender-domain verification, deliverable fictional test inboxes, DNS change
  operator/window/rollback, protected production credential delivery, bounce/complaint and
  suppression owner, alert destination, logging/privacy acceptance, rotation/escrow custodians,
  and named rollback operator.
- SPF alignment depends on the selected provider and envelope sender. DKIM cannot be evaluated
  until the provider supplies its selector and expected record. The DMARC aggregate-report
  mailbox and report-review owner are unconfirmed.
- Provider certificate, authentication, quota/throttling, delivery evidence, inbox placement,
  bounce/complaint behavior, credential rotation/revocation, and temporary/permanent outcomes
  remain untested. Production email stays disabled and production remains `NO-GO`.

#### Recommended next command

Resume **Command 38 — Configure Production SMTP and Email Reputation** only after supplying the
required owner inputs through safe channels and authorizing the bounded DNS/provider acceptance
window. Do not start Command 39 while Command 38 is blocked.

### Command 54 — Prepare Public Open-Source Distribution

- **Status:** Completed and delivered to GitHub `main`; the first alpha tag remains a
  separately authorized follow-up
- **Date:** 2026-09-30

#### Scope completed

- Adopted Apache License 2.0 for free use, modification, and redistribution while
  preserving the product's single-business-per-installation scope and keeping every
  workspace package private from accidental npm publication.
- Added the public-project foundation: notice, changelog, contribution guide, code of
  conduct, security policy, support boundaries, governance model, third-party license
  notice, and a public-release guide with versioning, release, branding, SBOM,
  provenance, and repository-setting expectations.
- Added GitHub issue forms, pull-request template, CODEOWNERS, Dependabot, CI, CodeQL,
  dependency review, full-history secret scanning, and browser-lifecycle validation.
- Enabled GitHub vulnerability alerts, Dependabot security updates, secret scanning,
  push protection, private vulnerability reporting, merged-branch cleanup, and
  protected `main` review/check requirements.
- Updated repository/package metadata and the main project documentation to describe
  Webhost Billing as an open-source alpha rather than a private application.
- Upgraded Next.js, NestJS, Nodemailer, Prisma, and vulnerable transitive dependencies;
  the production dependency graph now has no known audit findings.
- Made the test commands portable across Windows and Unix-like systems, isolated Jest
  from generated Next.js output, repaired the queue test compiler's shared subpath
  resolution, and made the browser lifecycle wait for completed cookie authentication.

#### Files changed

- Licensing and community: `LICENSE`, `NOTICE`, `CHANGELOG.md`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, `GOVERNANCE.md`,
  `THIRD_PARTY_NOTICES.md`, `docs/PUBLIC_RELEASE.md`
- GitHub automation and templates: `.github/CODEOWNERS`,
  `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/*`,
  `.github/dependabot.yml`, `.github/workflows/ci.yml`,
  `.github/workflows/codeql.yml`, `.gitleaks.toml`
- Project metadata and policy: `README.md`, `AGENTS.md`,
  `HOSTING_BILLING_SYSTEM_PLAN.md`, `docs/DECISIONS.md`, `package.json`,
  workspace `package.json` files, `pnpm-workspace.yaml`, `pnpm-lock.yaml`,
  `.gitattributes`, environment examples
- Cross-platform validation: API/worker scripts, `apps/api/test/jest-e2e.json`,
  `apps/web/e2e/database.ts`, `apps/web/e2e/prepare-environment.ts`,
  `apps/web/e2e/specs/hosting-lifecycle.spec.ts`,
  `apps/web/playwright.config.ts`, `apps/web/vitest.config.mts`,
  `packages/queue/tsconfig.spec.json`
- Command tracking: `docs/PROGRESS.md`

#### Validation

- PostgreSQL and Redis remained healthy in Docker. Prisma 7.10 generation, schema
  validation, all 21 migration status checks, and database verification passed.
- Prettier, ESLint, strict TypeScript checks, Compose rendering, and the complete
  production build passed; Next.js built all 29 routes.
- All 196 package tests passed. All 65 API integration tests, the complete critical
  invariant suite, and the isolated Chromium hosting lifecycle passed. The browser
  lifecycle covered customer registration and verification, role boundaries, orders,
  invoice payment, administrator approval, fake-panel provisioning, renewal invoicing,
  suspension, verified-payment unsuspension, support replies, and explicitly confirmed
  termination.
- `pnpm audit --prod` reported no known vulnerabilities. The production license
  inventory completed and its JSON output parsed successfully.
- actionlint 1.7.12 accepted both workflows. Gitleaks 8.30.1 scanned the complete Git
  history and reported no leaks after seven findings were individually verified as
  documentation phrases or explicitly fictional test values and captured in an
  exact-value allowlist.
- The first hosted CI run exposed a Linux argument-forwarding mismatch that treated
  `--runInBand` as a Jest filename pattern. The corrected portable invocation passed
  all 65 API integration tests locally, and the API E2E timeout was raised from the
  unit-test default to tolerate real Nest/Prisma startup time on loaded runners.
- GitHub CI run `36713267843` passed every configured database, format, lint, type,
  package-test, API integration, invariant, Chromium lifecycle, audit, license, and
  build step on commit `531fe2e`. CodeQL run `36713267992` also completed successfully.
- Final documentation commit `ac0b8f7` independently passed GitHub CI run
  `36714122818` and CodeQL run `36714122769`.
- GitHub reports the repository as public with Apache-2.0 detected. Vulnerability
  alerts, Dependabot security updates, secret scanning, push protection, private
  vulnerability reporting, and automatic merged-branch deletion are enabled. The
  `main` protection rule requires current `Validate` and CodeQL checks, one approving
  code-owner review, last-push approval, resolved conversations, and linear history;
  force-pushes and deletion are disabled. Administrator enforcement remains off only
  for emergency recovery or documented maintenance bypass.
- No staging or production service, provider, DNS record, credential, customer record,
  or live application was changed.

#### Decisions made

- Use Apache-2.0 as the project's permissive distribution license. Keep branding and
  trademark rights separate, require attribution/license preservation, and use the
  standard Apache patent grant.
- Publish an alpha-quality source project, not a claim of production readiness or a
  support warranty. Official releases must use reviewed immutable tags and include
  checksums, SBOMs, provenance, migration notes, and known limitations.
- Keep fake providers as the default development and automated-test boundary. Open
  sourcing does not authorize live payment, SMTP, hosting-panel, DNS, or production
  operations.
- Keep complete-history secret scanning in CI. Exceptions must match an exact reviewed
  non-secret value; path-wide, rule-wide, and ambiguous suppressions are prohibited.

#### Open questions and risks

- No alpha tag, GitHub Release, container image, SBOM, checksum, or provenance artifact
  has been published. The application remains alpha software, and the separate
  production-readiness track remains blocked at Command 38.

#### Recommended next command

Confirm the repository-owner security and branch settings, then authorize creation of
`v0.1.0-alpha.1` with checksums, SBOMs, provenance, migration notes, and known
limitations. Resume Command 38 separately only after its documented SMTP owner inputs
and protected credentials exist.

### Command 55 — Publish the First Source Alpha Release

- **Status:** Completed and published
- **Date:** 2026-09-30

#### Scope completed

- Authorized `v0.1.0-alpha.1` as the first public source-only prerelease and kept
  container publication, npm publication, `latest`, staging, and production outside
  this command.
- Synchronized the private monorepo package metadata to `0.1.0-alpha.1` and promoted
  the public-project changelog entries into the versioned release section.
- Added release notes with install, configuration, all 21 forward-only migration,
  rollback, security, artifact-verification, known-limitations, and production
  `NO-GO` guidance.
- Added a cross-platform release builder that refuses a dirty or mismatched checkout
  and generates Git source archives, complete and production-only CycloneDX 1.7
  SBOMs, and SHA-256 checksums in an ignored local output directory.
- Enabled immutable releases for the GitHub repository before creating the first
  release. Published the verified draft as immutable prerelease
  `v0.1.0-alpha.1` at
  `https://github.com/ebit101/webhost-billing/releases/tag/v0.1.0-alpha.1` from
  commit `0f24a2704364f0d5ab25707c2576fc3ac1de2b0f`.
- Attached deterministic `.tar.gz` and `.zip` source archives, complete and
  production-only CycloneDX 1.7 SBOMs, and `SHA256SUMS`. No container image, npm
  package, `latest` tag, deployment, or environment mutation was performed.

#### Files changed

- Release metadata and changelog: root and workspace `package.json` files,
  `CHANGELOG.md`
- Release policy and notes: `docs/PUBLIC_RELEASE.md`,
  `docs/releases/v0.1.0-alpha.1.md`, `docs/DECISIONS.md`
- Reproducible artifact tooling: `scripts/releases/build-source-release.mjs`,
  `.gitignore`, root `package.json`
- Release-day dependency remediation: `pnpm-workspace.yaml`, `pnpm-lock.yaml`,
  `apps/web/package.json`
- Authorized command and tracking: `CODEX_DEVELOPMENT_COMMANDS.md`,
  `docs/PROGRESS.md`

#### Validation

- Pinned pnpm 11.22.0 accepted the unchanged lockfile. Node syntax, Prettier, package
  metadata, and `git diff --check` passed.
- Docker PostgreSQL and Redis were healthy. Prisma 7.10 generated the client,
  validated the schema, found all 21 migrations applied, reseeded fictional data,
  and verified schema/data invariants.
- ESLint, strict workspace TypeScript, all 196 package tests, all 65 API integration
  tests, and the full critical invariant suite passed.
- `pnpm audit --prod --audit-level high` reported no known vulnerabilities. The
  production license inventory parsed and matched the existing reviewed notice:
  342 packages across permissive, attribution, font/data, and documented compound
  license categories.
- The production build passed with all 29 Next.js routes; development and production
  Compose rendering passed. The changed content passed a redacted Gitleaks scan.
- The first local Chromium attempt reached the verified 201/202 payment flow, then
  failed to load Next.js chunks with `ERR_INSUFFICIENT_RESOURCES`. A repeat ended
  when the dev server could not allocate 16 MiB while the workstation had about
  1 GiB physical memory free. This was classified as a constrained-workstation
  failure after the exact commit passed the Chromium lifecycle on GitHub's clean
  hosted runner.
- The exact release-candidate commit then passed hosted CI run `36720353677` and
  CodeQL run `36720353763`; hosted CI provided the required clean checkout and
  independently passed the database, full test, Chromium, audit, license, build,
  Compose, and full-history Gitleaks gates.
- The first local artifact build exposed Windows Node 24 `spawnSync pnpm.cmd EINVAL`
  before either SBOM was written. No remote tag or Release existed. The local tag was
  removed and the builder was corrected to execute pnpm through its pinned JavaScript
  entrypoint; the corrected run generated and validated all five release assets.
- GitHub then surfaced 14 release-day Dependabot alerts that the npm production audit
  did not report: patched `brace-expansion` 1/2/5 and `js-yaml` 3/4 transitive lines,
  plus the development-only Vitest mocker path. Publication was paused; compatible
  per-major overrides and Vitest 4.1.11 were selected for validation.
- The refreshed lockfile removed every vulnerable version. Vitest 4.1.11 passed all
  50 web tests; formatting, lint, strict type checks, all 196 package tests, all 65
  API integration tests, the complete invariant suite, frozen install, full and
  production dependency audits, production build, license inventory, and both
  Compose renderings passed.
- The exact remediated release commit passed hosted CI run `36723176934` and CodeQL
  run `36723176762`. GitHub reported zero open Dependabot security alerts before
  publication.
- The release builder generated archives containing exactly the 518 files in the
  tagged Git tree. Both SBOMs identify `0.1.0-alpha.1` and contain 1,071 complete
  and 359 production components respectively. Checksums and remote asset digests
  matched exactly:
  - source `.tar.gz`: `b4aea18217e4692a4062ccaa3a45a5f03a539e0320d7dcfd989be7d317fd3b7d`
    (767,008 bytes)
  - source `.zip`: `4e96be0c37123accc0ef89e37bcd77c1fa39738c8f661eb7175c5232d22cc5c4`
    (1,090,416 bytes)
  - complete SBOM: `239b656b4e0b9d197a76ccc320772da3c495c9930dafbb917e86e1148a8f4ff4`
    (1,548,850 bytes)
  - production SBOM: `be7a4c957d18a05c4757116e32434864877ce93546acf2dbdd5283c3bb01db96`
    (477,662 bytes)
  - `SHA256SUMS`: `c7514e4660d11cbbeceb7c779d80512c11b17319f698d8a0933e7ab224d0c411`
    (440 bytes)
- Pinned Gitleaks scanned all 71 commits, both extracted final archives, and the
  final asset directory without finding a leak. The remote annotated tag peeled to
  the expected commit before publication.
- GitHub Release `400094460` was created draft-first. All five assets were uploaded
  and checked before publication. Post-publication verification reported
  `draft=false`, `prerelease=true`, `immutable=true`; the public release page and
  every public asset URL returned HTTP 200.

#### Decisions made

- Treat this as an evaluation source release, not a production image release or a
  production-readiness claim.
- Publish through GitHub's draft-first immutable workflow. Upload and verify every
  asset before publication because immutable assets cannot later be replaced.
- Attach both complete and production-only dependency SBOMs so consumers can inspect
  the build toolchain separately from the runtime dependency surface.

#### Open questions and risks

- This is alpha evaluation software. Its immutable tag and release assets cannot be
  replaced; any correction requires a new version.
- Production remains `NO-GO` and separately blocked at Command 38 regardless of
  this source release. Real provider credentials, production data, and environment
  deployment remain outside the delivered scope.

#### Recommended next command

Stop after Command 55. The exact next recommended command is to resume Command 38
only after the documented SMTP owner inputs and protected credentials are supplied;
that command requires separate user authorization.

### Command 56 — Publish the AI-Assisted Technical-Preview Positioning

- **Status:** Completed
- **Date:** 2026-09-30

#### Scope completed

- Repositioned Webhost Billing publicly as an AI-assisted, human-reviewed,
  open-source technical foundation rather than an AI-powered application.
- Added a prominent warning that the technical preview is not fit for live use and
  must not receive real customer data, credentials, payments, email delivery, or
  hosting provisioning while production remains `NO-GO`.
- Documented the human-directed Codex work path from planning and authorization
  through implementation, validation, human review, evidence recording, delivery,
  and the mandatory stop before another command.
- Documented human authority boundaries, the inspectable evidence trail, contributor
  expectations, accurate public wording, and the independent-project/no-endorsement
  disclosure.
- Updated the public GitHub description and ten discovery topics to match the
  approved positioning. The immutable `v0.1.0-alpha.1` release was not changed.

#### Files changed

- Public positioning and navigation: `README.md`, `CHANGELOG.md`
- AI-assisted development policy: `docs/CODEX_WORKFLOW.md`,
  `docs/PUBLIC_RELEASE.md`
- Durable decision and authorized command: `docs/DECISIONS.md`,
  `CODEX_DEVELOPMENT_COMMANDS.md`
- Command evidence: `docs/PROGRESS.md`

#### Validation

- Prettier accepted every changed Markdown file and `git diff --check` passed.
- The README's relative Codex-workflow link resolves to the new tracked document.
- The wording distinguishes development assistance from runtime AI behavior and
  consistently states that every accepted change is human-reviewed.
- Repository metadata was read back from GitHub. Its description exactly matches the
  approved AI-assisted, human-reviewed, not-for-live-use wording, and its ten topics
  include `ai-assisted-development`, `billing`, `web-hosting`, and `self-hosted`.
- Official OpenAI branding guidance was reviewed before using Codex as factual
  attribution. The product name and visual identity remain Webhost Billing, with no
  partnership, sponsorship, or endorsement claim.

#### Decisions made

- Use **AI-assisted technical preview** as the primary public positioning.
- Treat “all accepted changes are human-reviewed” as a project-level assurance while
  preserving automated checks as supporting evidence rather than a substitute for
  review.
- Reserve **AI-powered** for future separately authorized runtime AI capabilities;
  Codex attribution describes the engineering workflow only.

#### Open questions and risks

- The project remains a technical foundation and production `NO-GO`. Public interest
  must not be interpreted as authorization for live evaluation or hosted-system
  probing.
- AI-assisted development does not transfer legal, security, financial, operational,
  or production responsibility away from maintainers and operators.

#### Recommended next command

Authorize Command 57 — Build the Safe Evaluation Demo and Adoption Pack: provide a
one-command fictional-data demo, screenshots, a short walkthrough, a capability and
limitation matrix, and contributor-ready starter issues without enabling real
providers or changing the production `NO-GO` decision.

### Command 57 — Build the Safe Evaluation Demo and Adoption Pack

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-01

#### Scope completed

- Added `pnpm demo:up` as a one-command evaluator path that generates local random
  secrets, migrates and idempotently seeds a dedicated fictional database, creates
  fictional admin/customer logins, builds production-shaped API/web images, starts
  the stack, and waits for health/readiness.
- Added a dedicated Compose project with isolated PostgreSQL/Redis volumes, no
  host-published data or application ports, a loopback-only gateway, internal
  application/data networking, bounded container logs, read-only application
  filesystems, dropped capabilities, and `no-new-privileges`.
- Added a hardened gateway that installs an outbound firewall before dropping to
  UID/GID 101. It permits only Docker DNS, the internal web/API upstreams, loopback,
  and replies to evaluator requests; IPv4 and IPv6 outbound traffic otherwise drops.
- Omitted worker, scheduler, SMTP, and hosting-provider processes and explicitly
  disabled bKash and SSLCOMMERZ. Demo bootstrap refuses any mode, database host, or
  database name outside the exact fictional demo boundary.
- Added repeatable status, log, credential, screenshot, and non-destructive shutdown
  commands. Generated runtime credentials remain in a Git-ignored local file and
  `demo:down` preserves only the dedicated fictional state.
- Added a private server-side API origin for container traffic while preserving the
  browser's public same-origin URL. Production HSTS and upgrade headers remain tied
  to an HTTPS public origin, allowing the explicit loopback HTTP demo without
  weakening HTTPS production configurations.
- Added reviewed public catalogue, administrator, and customer screenshots captured
  through semantic Playwright journeys from the fictional demo.
- Added the five-minute evaluator walkthrough, safety boundary, troubleshooting,
  exact capability/limitation matrix, and four bounded starter tasks. Created the
  approved public GitHub issues #18, #19, #20, and #21.
- Preserved the immutable `v0.1.0-alpha.1` release and the production `NO-GO`
  decision; no environment was deployed and no real provider, credential, customer,
  payment, email address, or domain was used.

#### Files changed

- Demo runtime and gateway: `demo/compose.demo.yaml`, `demo/Dockerfile.gateway`,
  `demo/gateway-entrypoint.sh`, `demo/nginx.conf`, `demo/bootstrap-users.cjs`
- Demo orchestration and screenshots: `scripts/demo/manage-demo.mjs`,
  `apps/web/e2e/capture-demo-screenshots.ts`, `docs/assets/demo/*.png`
- Container/runtime support: `apps/api/Dockerfile`, `apps/web/next.config.ts`,
  `apps/web/src/lib/server-auth.ts`, `apps/web/src/lib/server-auth.test.ts`,
  `packages/config/src/env.ts`, `.dockerignore`, `.gitignore`, `package.json`
- Evaluator and contributor documentation: `README.md`, `CONTRIBUTING.md`,
  `CHANGELOG.md`, `docs/SAFE_EVALUATION_DEMO.md`, `docs/CAPABILITY_MATRIX.md`,
  `docs/STARTER_ISSUES.md`
- Durable decision, authorization, and evidence: `docs/DECISIONS.md`,
  `CODEX_DEVELOPMENT_COMMANDS.md`, `docs/PROGRESS.md`

#### Validation

- Clean first startup applied all 21 migrations, idempotently seeded fictional data,
  bootstrapped both generated-password users, and brought PostgreSQL, Redis, API,
  web, and gateway health checks to healthy. Repeated `demo:up` reran initialization
  safely and retained the same isolated state.
- The host gateway returned HTTP 200 from `127.0.0.1:3100/ready`; inspection showed
  the only published binding was `127.0.0.1:3100`. PostgreSQL, Redis, API, and web
  exposed no host ports.
- Gateway checks reached internal web/API endpoints successfully and failed a direct
  request to `example.com` under the default-drop OUTPUT policy. Process inspection
  showed UID/GID 101, zero effective capabilities, and `NoNewPrivs: 1` after setup.
- `pnpm demo:screenshots` passed authenticated administrator and customer journeys
  and recreated all three images. Each image was visually reviewed for layout,
  fictional-only content, loaded application state, and absence of credentials.
- Prettier, ESLint, strict workspace TypeScript, the full production build (all 29
  Next.js routes), development Compose rendering, demo Compose rendering, and
  production Compose rendering with the checked-in example environment passed.
- The full monorepo test run passed: 26 shared tests, 3 queue tests, 51 web tests, 88
  API tests, and 29 worker tests. The first full run had one web test exceed its
  five-second timeout during Docker contention; the focused file immediately passed
  all 6 tests, and the complete unmodified suite then passed all 197 tests.
- `git diff --check` passed. Pinned Gitleaks scanned all 73 commits with redaction
  enabled and found no leak. The generated runtime file stayed ignored, and the
  reviewed source/screenshots contained no generated demo credential values.

#### Decisions made

- Keep the evaluation stack separate from development and production by Compose
  project name, network, volumes, runtime file, database identity, queue prefix, and
  rate-limit namespace.
- Use production-built application images for realistic evaluation, but omit every
  process capable of scheduled or external work and block container egress at both
  the internal-network and gateway-firewall boundaries.
- Keep the fixed `localhost:3100` origin so cookies, CSRF/origin checks, screenshots,
  and documentation remain deterministic across supported evaluator systems.
- Document implemented capability separately from demo visibility and provider or
  operational acceptance; a visible UI or passing local demo is not a live-readiness
  claim.

#### Open questions and risks

- This remains an alpha technical preview and is not fit for live use. Production is
  still `NO-GO`; real providers, credentials, data, payments, email, hosting changes,
  deployment, backup, monitoring, TLS/DNS, operator, and provider acceptance remain
  outside this command.
- The customer portal overview still contains explicitly fictional presentation
  fixtures; detailed customer pages use authenticated application APIs. GitHub issue
  #19 scopes the replacement without broadening the product.
- Generated credentials are intentionally printed to the local evaluator and stored
  in `.demo-runtime/demo.env`; users must not publish that ignored file or paste its
  values into issues.

#### Recommended next command

Authorize **Command 58 — Implement starter issue #18: Add a read-only `demo:doctor`
preflight**. Do not begin it without separate user authorization.

### Command 58 — Implement Starter Issue #18: Add a Read-Only `demo:doctor` Preflight

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-01

#### Scope completed

- Added `pnpm demo:doctor` as a Node.js-only preflight that runs consistently from
  supported PowerShell and Unix-like shells.
- Reports sanitized Docker CLI and Docker Compose versions, Docker Engine
  reachability, loopback `127.0.0.1:3100` availability, and runtime-file metadata.
- Keeps the diagnostic path read-only: it never initializes the runtime, reads
  `.demo-runtime/demo.env` contents, prints raw command errors, or invokes a Docker
  lifecycle/build command.
- Returns non-zero with a fixed remediation for missing Docker, missing or unsupported
  Compose, unavailable Engine, unavailable loopback port, and invalid/unreadable
  runtime metadata. A missing runtime file remains an expected first-run information
  state because `demo:up` creates it.
- Added focused injected-outcome tests for success, absent runtime, redaction, missing
  Docker, unsupported Compose, Engine failure, busy port, and invalid runtime type.
  Integrated the focused suite into the ordinary root `pnpm test` gate.
- Updated the evaluator, contributor, changelog, decision, starter-issue, and command
  records. The demo/provider/deployment/financial boundaries and production `NO-GO`
  decision remain unchanged.

#### Files changed

- Doctor implementation and tests: `scripts/demo/demo-doctor.mjs`,
  `scripts/demo/demo-doctor.test.mjs`
- Demo command entrypoint and root scripts: `scripts/demo/manage-demo.mjs`,
  `package.json`
- Evaluator/contributor documentation: `README.md`, `CONTRIBUTING.md`,
  `docs/SAFE_EVALUATION_DEMO.md`, `docs/STARTER_ISSUES.md`, `CHANGELOG.md`
- Durable decision, authorized command, and command evidence: `docs/DECISIONS.md`,
  `CODEX_DEVELOPMENT_COMMANDS.md`, `docs/PROGRESS.md`

#### Validation

- Focused Node test suite passed all six tests on Windows and again inside the pinned
  Linux Node 24 container. Coverage includes successful versions, runtime-value
  non-disclosure, missing Docker, Compose v1, unavailable Engine, busy port, missing
  runtime, and invalid runtime metadata.
- Real Windows preflight reported Docker CLI `29.7.2`, Docker Compose `5.4.0`, and
  Engine server `29.7.2`. With the demo running, the expected busy-port failure exited
  non-zero while runtime-file SHA-256 and all five running container IDs remained
  unchanged. With the demo stopped, every prerequisite passed while the runtime hash
  remained unchanged and no container was started by the doctor.
- The retained fictional demo was restored through `demo:up`; all five long-running
  services are healthy and `http://127.0.0.1:3100/ready` returns `200`. Demo Compose
  rendering and new-script Node syntax checks passed.
- Repository Prettier, `git diff --check`, API/worker/web ESLint, and strict TypeScript
  checks across all seven code workspaces passed.
- The complete root package gate passed 203 tests: 6 doctor, 26 shared, 3 queue, 51
  web, 88 API, and 29 worker tests.
- The first complete package run began while the ordinary post-reset Redis service was
  absent and the three pre-existing queue integration tests timed out on
  `127.0.0.1:6379`. The isolated demo was unaffected. Recreating the loopback-only
  development PostgreSQL/Redis services, applying all 21 migrations, seeding fictional
  data, and verifying schema/data invariants resolved the environment prerequisite;
  the unchanged complete suite then passed.
- Reviewed the complete change set and Git ignore boundary. No runtime file, generated
  credential, provider secret, customer data, external-provider action, deployment,
  or production change was introduced.

#### Decisions made

- Keep diagnostic output allowlisted and fixed. Version tokens are parsed from
  successful Docker output, while raw stdout/stderr and spawn errors are discarded.
- Treat runtime-file absence as informational, not a failed prerequisite. A non-file
  or unreadable path is a failure because `demo:up` cannot safely use it.
- Bind and immediately close an exclusive IPv4 loopback socket to test the exact host
  endpoint the demo publishes. A later process may still win the normal race between
  preflight and startup.
- A running safe demo intentionally makes `demo:doctor` report port `3100` as busy;
  `demo:status` remains the inspection command for an active stack.

#### Open questions and risks

- The preflight proves current local prerequisites only. It does not guarantee later
  image-download speed, available disk/memory, or that port `3100` remains free after
  the check.
- The safe demo remains fictional alpha evaluation software and is not fit for live
  use. Production is still `NO-GO`, and no provider or operational acceptance gate is
  changed by this command.

#### Recommended next command

Authorize **Command 59 — Implement starter issue #19: Replace customer portal overview
fixtures with authenticated data** only after separate review and authorization. Do
not start it automatically.

### Command 59 — Implement Starter Issue #19: Replace Customer Portal Overview Fixtures With Authenticated Data

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-01

#### Scope completed

- Replaced the portal overview's hard-coded customer name, domains, service states,
  invoice number, amount, due date, ticket state, metric values, and preview actions
  with the signed-in customer's authenticated data.
- Bound the overview customer identifier to the server-validated `CUSTOMER` session.
  The browser cannot select another customer, and the existing API ownership guard
  remains the object-level authorization boundary.
- Reused the existing customer-detail API's authoritative total counts and at most
  ten recent services, invoices, and tickets. Added clear copy identifying the
  recent service list as bounded.
- Kept all monetary amounts as decimal-string integer minor units and rendered them
  through the existing shared `BigInt`-based formatter.
- Added accessible loading, retryable error, and separate empty states for services,
  invoices, and support tickets.
- Removed the static service/invoice navigation badges and the Command 6 fictional
  interaction preview from the overview.
- Updated the safe-demo screenshot journey and regenerated/reviewed its public
  catalogue, administrator, and authenticated customer images. The customer image
  now shows only API-backed fictional account data.
- Updated the changelog, capability matrix, evaluator guide, starter-issue status,
  and command catalogue without adding an API, migration, provider behavior,
  payment behavior, or general dashboard redesign.
- Closed GitHub issue #19 as completed after the delivered implementation passed
  both required hosted workflows.

#### Files changed

- Authenticated portal overview and navigation:
  `apps/web/src/app/(portal)/portal/page.tsx`,
  `apps/web/src/app/(portal)/portal/layout.tsx`,
  `apps/web/src/components/dashboard/customer-portal-overview.tsx`
- Component and server-boundary coverage:
  `apps/web/src/components/dashboard/customer-portal-overview.test.tsx`,
  `apps/web/src/app/(portal)/portal/page.test.tsx`
- Safe-demo capture and reviewed images:
  `apps/web/e2e/capture-demo-screenshots.ts`, `docs/assets/demo/*.png`
- Public and contributor documentation: `CHANGELOG.md`,
  `docs/CAPABILITY_MATRIX.md`, `docs/SAFE_EVALUATION_DEMO.md`,
  `docs/STARTER_ISSUES.md`
- Authorized/current command records: `CODEX_DEVELOPMENT_COMMANDS.md`,
  `docs/PROGRESS.md`

#### Validation

- Focused portal component/server suite passed four tests covering authenticated
  populated data, all three empty states, the accessible error/retry state, and the
  server-session customer-ID binding.
- The existing customer API E2E suite passed two PostgreSQL/Redis tests, including
  the regression that another customer receives `403` for foreign customer detail.
- Repository Prettier, `git diff --check`, API/worker/web ESLint, and strict
  TypeScript checks across all seven code workspaces passed.
- The complete root package gate passed 207 tests: 6 demo doctor, 26 shared, 3 queue,
  55 web, 88 API, and 29 worker tests.
- The complete production build passed for config/database/shared/queue/API/worker/web;
  Next.js generated all 29 routes and kept `/portal` dynamically server-rendered.
- Development, demo, and production Compose rendering passed. The rebuilt safe demo
  migrated/seeded idempotently, started all five long-running services healthy, and
  returned readiness through `127.0.0.1:3100`.
- The first screenshot attempt correctly failed on the removed fixture heading. The
  semantic wait was updated to the authenticated seeded customer and recent-services
  heading; the complete screenshot capture then passed. All three resulting images
  were visually reviewed for loaded layout and fictional-only content.
- Source/diff review found no hard-coded overview customer, domain, invoice, amount,
  or date and no real credential, customer data, provider call, deployment, schema,
  or production change.
- The exact implementation commit `5e0c71d` passed GitHub CI run `36806530539`
  and CodeQL run `36806530486`; issue #19 was then closed with reason `completed`.

#### Decisions made

- Use the existing ownership-guarded customer-detail endpoint rather than adding a
  dashboard API. Its database counts are authoritative and its linked records are
  already capped at ten.
- Show total service, invoice, and ticket counts instead of fabricating active/open
  aggregates or summing a bounded recent subset. Show the exact recent invoice
  balance and recurring service amount only through the shared money formatter.
- Derive `customerId` from the server-validated session before hydrating the client
  overview. A changed browser request remains subject to the existing customer-ID
  ownership guard.
- Remove inaccurate navigation badges rather than introducing another layout data
  request outside this bounded issue.

#### Open questions and risks

- The overview intentionally does not claim aggregate outstanding balance, active
  service count, open ticket count, or next renewal because the existing bounded
  response does not provide those complete aggregates. Detailed owned pages remain
  the authoritative operational views.
- The page performs its owned-detail fetch after the server route/session guard so
  evaluators see explicit loading and retry states. The API remains authoritative
  for authentication and ownership.
- The safe demo remains fictional alpha evaluation software. Production is still
  `NO-GO`; no provider or operational acceptance gate changed.

#### Recommended next command

Authorize **Command 60 — Implement starter issue #20: Add a mobile safe-demo
screenshot** only after separate review and authorization. Do not start it
automatically.

### Command 60 — Implement Starter Issue #20: Add a Mobile Safe-Demo Screenshot

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-01

#### Scope completed

- Extended the existing safe-demo Playwright capture with one public hosting
  catalogue asset at a 390-pixel-wide touch/mobile viewport.
- Kept the established desktop catalogue, administrator dashboard, and authenticated
  customer portal captures in the same repository-pinned Chromium journey.
- Waited for the catalogue heading, fictional Starter Hosting plan, selected monthly
  billing state, and primary checkout action rather than an arbitrary timeout.
- Sized the mobile capture from the measured primary-action boundary so the plan,
  price, features, and **Choose Starter Hosting** action are all visible without the
  horizontally scrollable comparison table.
- Disabled CSS animations and carets only during screenshot writing to avoid
  mid-transition pixels without changing application behavior.
- Documented and visually reviewed the new asset. It contains only public fictional
  catalogue data and no authentication or private-host material.
- Marked starter issue #20 complete in the contributor pack and added the separately
  gated Command 61 for starter issue #21.
- Closed GitHub issue #20 as completed after the delivered implementation passed
  both required hosted workflows.

#### Files changed

- Deterministic Playwright capture: `apps/web/e2e/capture-demo-screenshots.ts`
- Reviewed mobile asset: `docs/assets/demo/hosting-catalog-mobile.png`
- Regenerated reviewed desktop assets: `docs/assets/demo/hosting-catalog.png`,
  `docs/assets/demo/admin-dashboard.png`
- Evaluator and contributor documentation: `docs/SAFE_EVALUATION_DEMO.md`,
  `docs/STARTER_ISSUES.md`, `CHANGELOG.md`
- Authorized/current command records: `CODEX_DEVELOPMENT_COMMANDS.md`,
  `docs/PROGRESS.md`

#### Validation

- The isolated fictional demo reported HTTP `200` readiness and all five demo
  services were healthy before capture.
- The focused repository-pinned Chromium capture completed and created a 390×1045
  mobile PNG. Visual review confirmed readable branding, heading, billing selector,
  BDT price, feature list, and primary checkout action with no clipped primary
  content.
- Visual/source review found no password, cookie, token, generated secret, private
  host detail, or real identity in the new image or capture code.
- Repository ESLint and strict TypeScript checks across all seven code workspaces
  passed.
- All 55 web component/server tests passed, and the Next.js production build passed
  with all 29 routes.
- Repository Prettier, `git diff --check`, documentation asset-reference checks, and
  a high-confidence changed-text secret scan passed; no demo runtime or environment
  file is tracked.
- The exact implementation commit `01dfc5a` passed GitHub CI run `36854310340`
  and CodeQL run `36854310342`; issue #20 was then closed with reason `completed`.

#### Decisions made

- Use the unauthenticated catalogue rather than a customer service page so the mobile
  adoption asset cannot contain session-bound or account-private content.
- Use a 390-pixel width with touch/mobile emulation and derive the capture height from
  the visible primary action. This preserves a recognizable mobile page while
  excluding lower horizontally scrollable comparison content.
- Treat application semantics as the readiness boundary and Playwright's built-in
  animation disabling as capture stabilization; do not introduce sleep timers or a
  hosted visual-regression service.

#### Open questions and risks

- The screenshots remain reviewed examples from fictional local data, not automated
  pixel-diff assertions and not evidence of production readiness.
- Rapid repeated full capture attempts correctly encounter the existing 5-per-15-
  minute login rate limit. The script does not bypass or clear that security control;
  normal evaluator capture remains the supported path.
- The safe demo remains local alpha evaluation software. Production is still
  `NO-GO`, and no provider, application, schema, or deployment behavior changed.

#### Recommended next command

Authorize **Command 61 — Implement starter issue #21: Add a Bengali safe-demo
quick-start translation** only after separate review and authorization. Do not start
it automatically.

### Command 61 — Implement Starter Issue #21: Add a Bengali Safe-Demo Quick-Start Translation

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-01

#### Scope completed

- Added a concise Bengali quick-start companion for the safe evaluation demo while
  retaining the existing English guide as the canonical source.
- Preserved the exact meanings of alpha technical preview, not fit for live use,
  fictional-data-only evaluation, and production `NO-GO`; the critical English
  phrases remain parenthetically visible in the Bengali warning.
- Covered prerequisites, the read-only doctor, startup, generated fictional logins,
  the customer/administrator walkthrough, shutdown, isolation boundaries,
  troubleshooting, redaction, and private security reporting.
- Kept every command, route, URL, email address, filename, environment marker, and
  product/provider name literal rather than translating executable or identifying
  text.
- Linked the Bengali companion from the English guide and linked the companion back
  to the canonical guide and private security-reporting policy.
- Marked starter issue #21 complete in the contributor pack and added the separately
  gated Command 62 to review the completed adoption pack before defining more work.
- Closed GitHub issue #21 as completed after the delivered implementation passed
  both required hosted workflows.

#### Files changed

- Bengali companion: `docs/SAFE_EVALUATION_DEMO_BN.md`
- Canonical-guide navigation: `docs/SAFE_EVALUATION_DEMO.md`
- Public change and contributor tracking: `CHANGELOG.md`,
  `docs/STARTER_ISSUES.md`
- Authorized/current command records: `CODEX_DEVELOPMENT_COMMANDS.md`,
  `docs/PROGRESS.md`

#### Validation

- Repository Prettier and `git diff --check` passed for the documentation-only
  change.
- All nine relative Markdown references across the English and Bengali guides resolve
  to tracked local files, including both reciprocal guide links and `SECURITY.md`.
- An exact-literal check confirmed the required safety terms, six demo commands, two
  loopback URLs, both fictional email addresses, the runtime filename, demo-mode
  marker, canonical guide, and security policy remain present and unmodified.
- A high-confidence changed-text secret scan found zero credential, private-key,
  GitHub-token, cloud-key, or API-key markers.
- Manual terminology review confirmed the guide contains no generated credential
  value, real identity, live-system instruction, application-localization claim, or
  weakened safety boundary.
- Exact implementation commit `bc9bd08` passed hosted CI run `36856315259` and
  CodeQL run `36856315260`; GitHub issue #21 was then closed as completed.

#### Decisions made

- Keep the Bengali document intentionally concise and operationally equivalent to
  the quick-start portions of the English guide rather than translating the complete
  documentation set.
- State explicitly in both languages that the English guide is canonical. If wording
  differs, evaluators must follow the English safety boundary.
- Preserve commands and machine-facing values verbatim so translated prose cannot
  create an invalid or unsafe invocation.

#### Open questions and risks

- This is documentation assistance, not application localization; the web interface
  and other project documents remain English.
- Future changes to the canonical quick-start or safety boundary must review the
  Bengali companion for drift. The English guide remains authoritative until such a
  review is complete.
- Production remains `NO-GO`; no runtime, provider, schema, application, deployment,
  immutable release, or live environment changed.

#### Recommended next command

Authorize **Command 62 — Review the adoption pack and define the next starter-issue
set** only after separate review and authorization. Do not start it automatically.

### Command 62 — Review the Adoption Pack and Define the Next Starter-Issue Set

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-01

#### Scope completed

- Reviewed the safe evaluation demo, English and Bengali evaluator guides,
  capability matrix, contributor workflow, development/E2E documentation, root and
  web scripts, CI workflow, Commands 58-61, and their completed issue records.
- Confirmed that public issues #18-#21 were closed and that the public issue backlog
  was empty before this review.
- Identified four concrete gaps: local Markdown links had only manual validation;
  the documented accessibility baseline lacked a page-level safe-demo audit;
  `demo:down` retained state without a separately guarded first-run reset path; and
  contributor documentation lacked a concise change-to-source/test map.
- Defined a second bounded starter set with explicit acceptance, validation, and
  excluded-scope criteria. The tasks do not change financial rules, schemas,
  provider authority, production readiness, or the immutable `v0.1.0-alpha.1`
  release.
- Created public GitHub issues #22-#25 for offline Markdown link validation,
  safe-demo accessibility auditing, an explicitly guarded safe-demo reset, and a
  contributor change-path map.
- Added separately gated Commands 63-66, one implementation command for each new
  issue. No proposed issue was implemented by this planning command.

#### Files changed

- Current and completed contributor task catalogue: `docs/STARTER_ISSUES.md`
- Separately authorized implementation commands: `CODEX_DEVELOPMENT_COMMANDS.md`
- Public change summary: `CHANGELOG.md`
- Command review, decisions, validation, and next authorization:
  `docs/PROGRESS.md`

#### Validation

- Repository Prettier and `git diff --check` passed for the documentation-only
  change.
- A repository-wide offline reference check resolved 25 relative Markdown links and
  images across all 58 tracked Markdown files with no missing or out-of-repository
  target.
- GitHub issue search confirmed exactly four open public issues after creation:
  #22, #23, #24, and #25. The earlier starter set remains closed as #18-#21.
- A high-confidence added-text secret scan found zero private-key, API-key,
  GitHub-token, or cloud-key markers.
- Manual terminology and boundary review confirmed every new issue retains
  fictional-data-only evaluation, avoids live providers and deployments, preserves
  production `NO-GO`, and does not claim accessibility certification or production
  readiness.
- Exact implementation commit `bebbf66` passed hosted CI run `36859177024` and
  CodeQL run `36859176923`.

#### Decisions made

- Keep the second set at four independent tasks so each contribution has one clear
  outcome and can be reviewed without coupling documentation, test tooling, Docker
  lifecycle, and accessibility changes.
- Put the offline link validator first because the growing multilingual adoption
  pack currently relies on manual reference checks and every later documentation
  task benefits from an ordinary CI gate.
- Treat the accessibility task as a bounded automated smoke audit, not a complete
  WCAG certification, and keep it on the loopback fictional demo only.
- Treat demo reset as explicitly destructive: require exact confirmation, fixed
  resource identity, redacted failures, and Docker cleanup success before generated
  runtime credentials may be removed.
- Preserve the first starter set in the contributor pack as completed history while
  presenting issues #22-#25 as the current contribution choices.

#### Open questions and risks

- The four issues are scoped proposals until separately authorized and implemented;
  their checks and commands do not exist merely because the issues are published.
- A page-level accessibility scanner detects only a subset of accessibility defects
  and still requires keyboard and human review.
- A reset command is inherently destructive to the dedicated fictional demo state;
  its exact confirmation and resource-boundary tests are mandatory before delivery.
- Production remains `NO-GO`. This command contacted no provider, deployed no
  environment, used no real data or credential, and changed no runtime behavior.

#### Recommended next command

Authorize **Command 63 — Implement starter issue #22: Add offline Markdown link
validation to CI** only after separate review and authorization. Do not start it
automatically.

### Command 63 — Implement Starter Issue #22: Add Offline Markdown Link Validation to CI

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-01

#### Scope completed

- Added a dependency-free, cross-platform Node.js validator that discovers tracked
  Markdown files through Git and checks relative inline links, images, and reference
  definitions without making network requests.
- Resolved each local target from its source document after removing query strings
  and fragments and decoding URL-encoded path segments.
- Allow parent references that remain within the repository while rejecting lexical
  traversal and existing symbolic-link targets that escape the repository.
- Ignore absolute URI schemes, protocol-relative web targets, document-only
  fragments, fenced code, inline code, and HTML comments.
- Report every invalid local reference with its repository-relative source path,
  line number, original target, and bounded reason, then return a non-zero status.
- Added fixture-based coverage for valid file and image targets, encoded paths,
  query/fragment removal, safe parents, ignored external/mail/fragment/code targets,
  multiple missing targets, invalid encoding, traversal, report content, and CLI
  failure status.
- Exposed `pnpm docs:links` and `pnpm test:docs-links`, included the focused suite in
  the root package tests, added the validator to ordinary CI, and documented it in
  the contributor validation path.
- Marked starter issue #22 complete in the contributor task catalogue. No
  application, schema, provider, financial, production, or release behavior changed.
- Closed GitHub issue #22 as completed after the delivered implementation passed
  both required hosted workflows.

#### Files changed

- Validator: `scripts/docs/check-markdown-links.mjs`
- Fixture tests and inputs: `scripts/docs/check-markdown-links.test.mjs`,
  `scripts/docs/__fixtures__/*`
- Root scripts and package-test integration: `package.json`
- Ordinary hosted validation: `.github/workflows/ci.yml`
- Contributor and public change documentation: `CONTRIBUTING.md`, `CHANGELOG.md`,
  `docs/STARTER_ISSUES.md`
- Command evidence and next authorization: `docs/PROGRESS.md`

#### Validation

- `pnpm test:docs-links` passed all four focused tests, including the explicit
  non-zero CLI result for two simultaneously reported broken references.
- `pnpm docs:links` passed: 26 local references across 58 tracked Markdown files.
- Repository `pnpm format:check`, `pnpm lint`, and strict `pnpm typecheck` passed.
- The Windows root `pnpm test` run passed the new tests, all 26 shared tests, all
  three queue tests, all 55 web tests, and 21 API suites/80 tests. Windows Application
  Control prevented the existing native `argon2` binary from loading in two remaining
  API suites; it was not a test assertion failure.
- Those two policy-blocked API suites were rerun in an isolated Linux container and
  passed both suites/all eight tests with the Linux native `argon2` module.
- The separately run worker package suite passed all ten suites/all 29 tests.
- A complete isolated Linux package attempt passed the new tests, shared tests, queue
  tests, and 18 of 19 web files before one existing asynchronous email-delivery UI
  test remained in its loading state. The same 19 web files/all 55 tests passed on
  Windows. No application code was changed by this command.
- `git diff --check` passed, the added-text secret scan found zero high-confidence
  credential markers, and local/remote history was reconciled without rewriting.
- Hosted CI run `36863246747` passed the Markdown gate, complete package tests, API
  integration tests, critical invariants, browser lifecycle, dependency/license
  checks, and production build:
  `https://github.com/ebit101/webhost-billing/actions/runs/36863246747`.
- Hosted CodeQL run `36863246742` passed:
  `https://github.com/ebit101/webhost-billing/actions/runs/36863246742`.

#### Decisions made

- Use only Node.js built-ins and Git so the validator adds no runtime dependency and
  cannot crawl external services.
- Validate tracked `*.md` files only. Test inputs use `.md.fixture` so intentionally
  broken examples cannot make the repository check fail.
- Treat any URI scheme, protocol-relative URL, or document-only fragment as outside
  the local-file check; heading-anchor correctness remains explicitly excluded.
- Check both lexical containment and the canonical path of existing targets so a
  repository symlink cannot silently point outside the checkout.
- Mask code fences, inline code, and HTML comments before extraction to avoid
  treating examples or disabled content as active documentation references.

#### Open questions and risks

- The validator intentionally does not fetch external URLs, validate heading
  anchors, parse raw HTML `href`/`src` attributes, or attempt to implement every
  extension of the Markdown grammar.
- Repository-local links that exist but lead to semantically incorrect content still
  require human review.
- Windows Application Control continues to block the installed native `argon2`
  binary; Linux/hosted validation is required for the affected API tests on this
  machine.
- Production remains `NO-GO`; the immutable `v0.1.0-alpha.1` release, application
  behavior, schemas, providers, and live environments were not changed.

#### Recommended next command

Authorize **Command 64 — Implement starter issue #23: Add a safe-demo accessibility
smoke audit** only after separate review and authorization. Do not start it
automatically.

### Command 64 — Implement Starter Issue #23: Add a Safe-Demo Accessibility Smoke Audit

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-01

#### Scope completed

- Added `pnpm demo:a11y`, which requires an already-running safe demo at the fixed
  loopback origin and refuses to generate a replacement runtime credential file.
- Added a Playwright accessibility runner using repository-pinned Chromium and
  pinned `@axe-core/playwright` `4.13.0` to audit `/hosting`, `/login`, authenticated
  `/portal`, and authenticated `/admin`.
- Limited the automated gate to serious or critical WCAG A/AA findings and bounded
  failure reports to route names and at most eight sorted rule IDs per route. Raw
  nodes, HTML, browser errors, credentials, cookies, tokens, screenshots, traces,
  and videos are not emitted.
- Used the generated fictional administrator and customer credentials only inside
  the runner, waited for route-specific semantic content, and added keyboard checks
  for the skip link plus opening, entering, and closing the responsive public
  navigation.
- Corrected the serious findings found by the audit: named the live notification
  region semantically and raised contrast for the authentication brand treatment,
  workspace labels and active navigation, and administrator chart dates.
- Documented command usage, audited routes, severity and output boundaries,
  credential handling, keyboard coverage, non-mutation boundary, and the explicit
  fact that the smoke audit is not accessibility certification.
- Marked starter issue #23 complete in the contributor task catalogue. No billing,
  payment, provisioning, support, schema, provider, release, or production behavior
  changed.
- Closed GitHub issue #23 as completed after the delivered implementation passed
  both required hosted workflows.

#### Files changed

- Audit runner: `apps/web/e2e/audit-safe-demo-accessibility.ts`
- Demo command orchestration and root command: `scripts/demo/manage-demo.mjs`,
  `package.json`
- Pinned accessibility engine and lockfile: `apps/web/package.json`, `pnpm-lock.yaml`
- Focused accessibility corrections and coverage:
  `apps/web/src/components/auth/auth-shell.tsx`,
  `apps/web/src/components/dashboard/admin-dashboard.tsx`,
  `apps/web/src/components/layout/brand.tsx`,
  `apps/web/src/components/layout/workspace-shell.tsx`,
  `apps/web/src/components/ui/toast.tsx`,
  `apps/web/src/components/ui/ui-interactions.test.tsx`
- Evaluator and public change documentation: `docs/SAFE_EVALUATION_DEMO.md`,
  `docs/STARTER_ISSUES.md`, `CHANGELOG.md`
- Command evidence and next authorization: `docs/PROGRESS.md`

#### Validation

- `pnpm demo:a11y` passed against the healthy loopback demo: `/hosting`, `/login`,
  authenticated `/portal`, authenticated `/admin`, the skip link, and responsive
  public navigation all passed.
- Five relevant web test files passed all 12 tests, including the notification-region
  assertion and existing workspace, authentication, customer-overview, and
  administrator-dashboard coverage.
- `pnpm format:check`, `pnpm docs:links`, `pnpm lint`, strict `pnpm typecheck`, and
  `pnpm install --frozen-lockfile --lockfile-only` passed.
- The web production build passed and generated all 29 static/dynamic application
  routes successfully.
- The Windows root `pnpm test` run passed all six demo-doctor tests, all four
  documentation-link tests, all 26 shared tests, all three queue tests, all 55 web
  tests, and 21 API suites/80 tests. Windows Application Control prevented the
  existing native `argon2` binary from loading in two remaining API suites; it was
  not a test assertion failure.
- The two policy-blocked API suites were rerun from the current API source in the
  isolated Linux demo builder image and passed both suites/all eight tests.
- The separately run worker package suite passed all ten suites/all 29 tests.
- Hosted CI run `36876110955` passed the complete package tests, API integration
  tests, critical invariants, browser lifecycle, dependency/license checks, and
  production build:
  `https://github.com/ebit101/webhost-billing/actions/runs/36876110955`.
- Hosted CodeQL run `36876111035` passed:
  `https://github.com/ebit101/webhost-billing/actions/runs/36876111035`.

#### Decisions made

- Keep the audit evaluator-operated and loopback-only instead of adding a hosted
  scanner, remote target option, browser matrix, or CI dependency on a demo stack.
- Use explicit semantic readiness checks for each route and control; no arbitrary
  browser delay is used.
- Keep credentials in process memory only and configure no retained Playwright
  artifacts so generated passwords and authenticated state cannot enter reports.
- Treat the audit as a narrow regression smoke gate. Manual review and broader
  assistive-technology testing remain necessary for accessibility assurance.
- Make only the smallest contrast and live-region corrections demonstrated by the
  audit; no general interface redesign was introduced.

#### Open questions and risks

- Automated axe checks cannot establish full WCAG conformance or replace keyboard,
  screen-reader, zoom, reflow, and cognitive-accessibility review.
- The command requires the existing safe demo and fixed port `3100`; it deliberately
  does not start, reset, or target another environment.
- Windows Application Control continues to block the installed native `argon2`
  binary; Linux/hosted validation remains required for the affected API suites on
  this machine.
- Production remains `NO-GO`; the immutable `v0.1.0-alpha.1` release, schemas,
  providers, real identities, and live environments were not changed.

#### Recommended next command

Authorize **Command 65 — Implement starter issue #24: Add an explicitly guarded
safe-demo reset command** only after separate review and authorization. Do not start
it automatically.

### Command 65 — Implement Starter Issue #24: Add an Explicitly Guarded Safe-Demo Reset Command

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-02

#### Scope completed

- Added `pnpm demo:reset` behind the one exact documented
  `--confirm-reset-demo` flag. Missing, altered, or additional arguments refuse
  before filesystem inspection or Docker execution.
- Fixed reset to the built-in local Docker `default` context, the
  `webhost-billing-demo` project, `demo/compose.demo.yaml`, its labelled
  containers/networks/volumes, and `.demo-runtime/demo.env`; no arbitrary context,
  project, path, or Compose-file option is accepted.
- Added canonical boundary validation that refuses repository, Compose, runtime
  directory, and runtime file symlinks, non-regular paths, traversal, unreadable
  targets, and resolved targets outside the dedicated demo boundary.
- Removed and verified dedicated Docker state before deleting generated fictional
  credentials. Added a second path validation immediately before unlinking so a
  post-cleanup path swap cannot redirect deletion.
- Preserved runtime credentials on Docker failure, uncertain cleanup, path changes,
  or unlink failure; captured raw process/filesystem errors instead of printing
  secrets or uncontrolled diagnostics.
- Kept reset idempotent when Docker state and credentials are already absent,
  retained cached images, and preserved `demo:down` as the normal nondestructive
  stop-and-restart workflow.
- Added injected filesystem/process coverage and documented the destructive warning,
  exact command, failure behavior, Bengali quick-start note, and safe start-again
  workflow. No generic pruning or development, staging, production, provider,
  schema, or release mutation was added.
- Closed GitHub issue #24 as completed after the delivered implementation passed
  both required hosted workflows.

#### Files changed

- Reset implementation and injected tests: `scripts/demo/demo-reset.mjs`,
  `scripts/demo/demo-reset.test.mjs`
- Demo orchestration and root scripts: `scripts/demo/manage-demo.mjs`, `package.json`
- Evaluator and contributor documentation: `README.md`, `CONTRIBUTING.md`,
  `docs/SAFE_EVALUATION_DEMO.md`, `docs/SAFE_EVALUATION_DEMO_BN.md`,
  `docs/STARTER_ISSUES.md`, `CHANGELOG.md`
- Durable decision and command evidence: `docs/DECISIONS.md`, `docs/PROGRESS.md`

#### Validation

- All 12 injected reset tests passed, covering exact confirmation, pnpm argument
  forwarding, fixed targeting, override refusal, success, absent state, Docker
  failure, uncertain cleanup, redaction, invalid paths, post-cleanup path swaps,
  and unlink failure.
- A live no-confirmation invocation exited non-zero while preserving the runtime
  file and both dedicated volumes. A confirmed invocation removed the exact runtime
  file and left zero labelled containers, networks, or volumes; a second confirmed
  invocation passed idempotently.
- A disposable first-run reset/start/restart cycle passed. The fresh stack reached
  five healthy running services and HTTP 200; `demo:down` retained credentials and
  both volumes; the restart preserved the credential-file hash and volume identities
  and returned HTTP 200 again.
- Demo Compose rendering, `pnpm format:check`, `pnpm docs:links`, `pnpm lint`, strict
  `pnpm typecheck`, and `git diff --check` passed.
- The Windows root `pnpm test` run passed all six demo-doctor tests, the then-current
  reset tests, all four documentation-link tests, all 26 shared tests, all three
  queue tests, all 55 web tests, and 21 API suites/80 tests. Windows Application
  Control prevented the existing native `argon2` binary from loading in two
  remaining API suites; it was not a test assertion failure.
- The two policy-blocked API suites passed both suites/all eight tests in the
  isolated Linux API builder image using the current spec files. The separately run
  worker package suite passed all ten suites/all 29 tests.
- Hosted CI run `36918070073` passed the complete package tests, API integration
  tests, critical invariants, browser lifecycle, dependency/license checks, and
  production build:
  `https://github.com/ebit101/webhost-billing/actions/runs/36918070073`.
- Hosted CodeQL run `36918070063` passed:
  `https://github.com/ebit101/webhost-billing/actions/runs/36918070063`.

#### Decisions made

- Use an exact opt-in phrase instead of a generic `--force` or interactive prompt so
  scripted and human invocation share one auditable destructive contract.
- Pin every Docker action to the local built-in `default` context and reject target
  environment overrides so a selected remote context cannot receive reset calls.
- Treat Docker cleanup verification and a final canonical filesystem check as
  prerequisites for credential deletion; uncertainty fails closed and preserves the
  file.
- Keep cached images because the command resets fictional state, not Docker storage;
  generic pruning remains outside this command and project boundary.

#### Open questions and risks

- Reset intentionally and permanently removes only the fictional demo database,
  Redis state, and generated local credentials. Evaluators must use `demo:down` when
  they intend to retain state.
- Windows Application Control continues to block the installed native `argon2`
  binary; Linux/hosted validation remains required for the affected API suites on
  this machine.
- Production remains `NO-GO`; the immutable `v0.1.0-alpha.1` release, schemas,
  providers, real identities, and live environments were not changed.

#### Recommended next command

Authorize **Command 66 — Implement starter issue #25: Add a contributor change-path
map** only after separate review and authorization. Do not start it automatically.

### Command 66 — Implement Starter Issue #25: Add a Contributor Change-Path Map

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-02

#### Scope completed

- Added `docs/CONTRIBUTOR_PATHS.md` as a first-contributor navigation map for demo
  tooling, Next.js UI, NestJS API modules, worker/scheduler jobs, shared contracts,
  and database migrations.
- Mapped each area to literal owning source paths, nearest focused tests, relevant
  documentation, root-script validation commands, and the safety invariants that
  must remain intact.
- Added a short first-contribution flow that points to the current starter-issue
  catalogue, fictional/local-only test boundaries, focused pull requests, and the
  private vulnerability-reporting process.
- Added an offline `docs:paths` validator that checks every local map link, verifies
  every fenced or inline `corepack pnpm` command against root `package.json`, requires
  all six map areas, and rejects unlinked path literals or pnpm-option commands.
- Added focused validator tests and the `test:docs-paths` root script, included the
  focused test in the ordinary root test gate, and added an explicit hosted CI step.
- Linked the map from `CONTRIBUTING.md` and the README documentation index, added it
  to the contributor validation list, updated the changelog, and marked starter
  issue #25 complete in the catalogue.
- Kept the document explicitly advisory: no code ownership, architecture, schema,
  provider, production procedure, release, or production-readiness behavior changed.
- Closed GitHub issue #25 as completed after the delivered implementation passed
  both required hosted workflows.

#### Files changed

- Contributor map: `docs/CONTRIBUTOR_PATHS.md`
- Offline validator and focused tests:
  `scripts/docs/check-contributor-paths.mjs`,
  `scripts/docs/check-contributor-paths.test.mjs`
- Root commands and hosted validation: `package.json`, `.github/workflows/ci.yml`
- Contributor discovery and status: `README.md`, `CONTRIBUTING.md`,
  `docs/STARTER_ISSUES.md`, `CHANGELOG.md`
- Command evidence and next authorization: `docs/PROGRESS.md`

#### Validation

- `pnpm test:docs-paths` passed all three focused tests: valid paths/scripts,
  simultaneous missing paths/scripts, and missing-area/unlinked-path/invalid-command
  failures.
- `pnpm docs:paths` passed, checking 69 local contributor-map paths and 18 distinct
  root pnpm scripts.
- `pnpm docs:links` passed, checking 96 local references across 59 tracked Markdown
  files after the new map was added to Git.
- `pnpm format:check`, Node syntax checks for both validator files, and
  `git diff --check` passed.
- Manual terminology/security review confirmed that multi-tenant, real-data,
  production, and `prisma db push` references remain prohibitions or non-goals. The
  changed-file high-confidence secret scan found zero matches.
- Hosted CI run `37015176666` passed the contributor-path check, complete package
  tests, API integration tests, critical invariants, browser lifecycle,
  dependency/license checks, and production build:
  `https://github.com/ebit101/webhost-billing/actions/runs/37015176666`.
- Hosted CodeQL run `37015176773` passed:
  `https://github.com/ebit101/webhost-billing/actions/runs/37015176773`.

#### Decisions made

- Use local Markdown links as the map's machine-readable path inventory so entries
  stay useful to contributors and are also checked canonically by the existing
  offline link engine.
- Require minimum validation examples to invoke root pnpm scripts. This keeps
  commands stable and lets the validator prove every documented script exists.
- Reject unlinked repository-path literals in the map so a new path cannot silently
  bypass automated existence checks.
- Keep the map as navigation guidance rather than introducing CODEOWNERS, ownership
  reorganization, generated API documentation, or another architectural layer.

#### Open questions and risks

- Automated existence checks cannot prove that a linked test is the best semantic
  test for a future change. Contributors and reviewers must still apply judgment and
  update the map when boundaries move.
- Some database and browser commands need disposable local infrastructure; the map
  does not authorize production, staging, provider, or public-demo mutation.
- Windows Application Control continues to block the installed native `argon2`
  binary; Linux/hosted validation remains required for the affected API suites on
  this machine.
- Production remains `NO-GO`; the immutable `v0.1.0-alpha.1` release, schemas,
  providers, real identities, and live environments were not changed.

#### Recommended next command

No Command 67 is defined. Authorize a separate **phase review of Commands 58–66 and
definition of the next bounded command** before any additional implementation. Do not
start it automatically.

### Phase Review — Commands 58–66 and Next Bounded Command

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-02

#### Scope completed

- Reviewed Commands 58–66 against Command 57, the repository instructions, the
  product plan, durable decisions, implementation, tests, documentation, and public
  GitHub issue state.
- Confirmed that the delivered phase remains bounded to fictional local evaluation
  and contributor adoption: the read-only preflight, authenticated portal summary,
  mobile screenshot, Bengali quick start, offline link check, accessibility smoke
  audit, confirmation-gated reset, and contributor path map are present with their
  stated safety boundaries.
- Reconciled the public backlog and confirmed that issues #18–#25 are closed and no
  public issue is currently open.
- Corrected the starter-issue catalogue and README so completed issues are no longer
  presented as currently available contributions. Corrected this report's stale
  status summary, which still named Command 64 and Command 65 after Command 66 had
  shipped.
- Defined Command 67 as a documentation-and-issue-planning command that must reopen
  the contributor on-ramp with exactly three bounded tasks, including a read-only
  functional smoke check for an already-running safe demo. No proposed issue was
  implemented during this review.

#### Files changed

- Contributor availability and discovery: `README.md`, `docs/STARTER_ISSUES.md`,
  `CHANGELOG.md`
- Next command and review evidence: `CODEX_DEVELOPMENT_COMMANDS.md`,
  `docs/PROGRESS.md`

#### Validation

- Public GitHub reconciliation confirmed zero open issues and closed state for each
  issue from #18 through #25.
- The review inspected the changed implementation surface from Command 58 through
  Command 66, including demo orchestration/preflight/reset, authenticated customer
  ownership, screenshot capture, accessibility auditing, offline link validation,
  contributor-map validation, CI integration, and evaluator documentation.
- All 6 demo-doctor tests, 12 guarded-reset tests, 4 Markdown-link tests, and 3
  contributor-path tests passed. The live offline checks passed with 96 local
  Markdown references across 59 tracked files and 69 map paths plus 18 root scripts.
- The full web package suite passed all 19 test files and 55 tests, including the
  authenticated portal overview, server session boundary, and UI accessibility
  coverage. Repository lint, strict type checks, formatting, and `git diff --check`
  passed.
- A fresh live accessibility audit was not claimed: the retained runtime file was a
  regular file, but Docker Engine was unavailable at the Windows named pipe when the
  review checked the demo. Command 64's recorded live audit and the latest delivered
  hosted CI/CodeQL baseline remain valid historical evidence.
- Phase-review commit `35a051f` passed hosted CI run `37018322837`, including
  database verification, documentation checks, lint, strict type checks, complete
  package and API integration tests, critical invariants, browser lifecycle,
  dependency/license checks, and the production build:
  `https://github.com/ebit101/webhost-billing/actions/runs/37018322837`.
- Hosted CodeQL run `37018322694` passed:
  `https://github.com/ebit101/webhost-billing/actions/runs/37018322694`.

#### Decisions made

- Treat an empty public starter backlog as an adoption defect, not as permission to
  relabel closed work as current or to invent unreviewed implementation scope.
- Keep the next command planning-only. It must publish a new bounded set before any
  implementation command is authorized, preserving the one-command-at-a-time
  review boundary.
- Require the next set to include a non-destructive functional smoke check. The
  current accessibility audit verifies serious/critical rules and keyboard paths,
  while earlier demo role journeys are recorded as manual command evidence rather
  than exposed as a reusable evaluator smoke command.

#### Open questions and risks

- The phase has strong hosted CI evidence and focused demo tooling, but the complete
  safe-demo first-run/restart journey remains expensive and is not an ordinary CI
  job. Command 67 must keep any proposed smoke task read-only and suitable for local
  evaluation without implying production acceptance.
- Automated contributor-path existence checks cannot prove semantic ownership or
  that a suggested focused test remains the best one after future refactors.
- Windows Application Control can still prevent the native `argon2` binary from
  loading locally; hosted Linux CI remains the complete cross-platform gate.
- Production remains `NO-GO`; the immutable `v0.1.0-alpha.1` release, schemas,
  providers, real identities, and live environments were not changed.

#### Recommended next command

Authorize **Command 67 — Reopen the contributor on-ramp with a third starter-issue
set** only after separate review and authorization. Do not start it automatically.

### Command 67 — Reopen the Contributor On-Ramp With a Third Starter-Issue Set

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-02

#### Scope completed

- Reconciled Commands 57–66, the phase-review findings, contributor map, public issue
  backlog, and product/security boundaries. The public repository had zero open
  issues before this command.
- Defined exactly three one-pull-request starter tasks across the documented demo
  tooling and contributor-documentation change paths:
  - issue #26: a read-only `demo:smoke` command for principal public, customer, and
    administrator evaluator paths;
  - issue #27: offline validation of repository-local Markdown heading anchors; and
  - issue #28: an explicit, redaction-safe safe-demo path in the GitHub bug-report
    form with offline form validation.
- Gave every task explicit acceptance, validation, security-boundary, and
  excluded-scope criteria. Published issues #26–#28 with the repository's existing
  scoped starter labels.
- Reopened the current starter-issue catalogue with only the three genuinely open
  tasks and retained issues #18–#25 as completed examples.
- Added separately gated Commands 68–70. No proposed issue was implemented, no demo
  lifecycle command ran, and no provider, environment, schema, financial, release,
  or production state changed.

#### Files changed

- Starter issue catalogue and owning change path: `docs/STARTER_ISSUES.md`,
  `docs/CONTRIBUTOR_PATHS.md`
- Separately gated implementation commands: `CODEX_DEVELOPMENT_COMMANDS.md`
- Public-project history and command evidence: `CHANGELOG.md`, `docs/PROGRESS.md`

#### Validation

- Authenticated GitHub reconciliation confirmed issues #26, #27, and #28 are open
  with their intended titles and scoped `good first issue`, `help wanted`, and
  task-specific labels. The pre-command public backlog contained zero open issues.
- `pnpm format:check` passed. `pnpm docs:links` checked 105 local references across
  59 tracked Markdown files, and `pnpm docs:paths` checked 78 contributor-map paths
  plus 19 root scripts.
- All 4 focused Markdown-link tests and all 3 contributor-path tests passed.
- `git diff --check`, terminology review, and a high-confidence changed-text secret
  scan passed. The new issue bodies and repository text contain no credential,
  runtime value, customer data, private host, or provider payload.
- Command 67 commit `a79d810` passed hosted CI run `37021368910`, including
  documentation checks, database verification, lint, strict type checks, complete
  package and API integration tests, critical invariants, browser lifecycle,
  dependency/license checks, and the production build:
  `https://github.com/ebit101/webhost-billing/actions/runs/37021368910`.
- Hosted CodeQL run `37021368489` passed:
  `https://github.com/ebit101/webhost-billing/actions/runs/37021368489`.

#### Decisions made

- Make functional demo verification the first task because the existing
  accessibility audit tests WCAG severity and keyboard paths, while prior role
  journeys are maintainer evidence rather than a reusable read-only evaluator
  command.
- Extend the existing link checker for heading anchors instead of adding another
  hosted documentation dependency.
- Improve the existing bug-report form instead of adding a second overlapping form;
  require machine-checked redaction guidance so safe-demo support does not encourage
  credential or real-data disclosure.
- Keep each implementation in its own command and pull-request-sized boundary. The
  planning command does not authorize implementation work.

#### Open questions and risks

- GitHub-style heading slug behavior has edge cases; Command 69 is limited to the
  slug forms needed by tracked repository documentation and must prove them with
  fixtures rather than claiming full renderer compatibility.
- A read-only browser smoke check can still create ephemeral sessions. Command 68
  must retain no browser artifacts and must not mutate application records or Docker
  state.
- Issue-form YAML validation can prove structural guardrails but cannot prevent a
  reporter from ignoring instructions; maintainers must still review submissions
  for accidental secrets or sensitive data.
- Production remains `NO-GO`; the immutable `v0.1.0-alpha.1` release, schemas,
  providers, real identities, and live environments were not changed.

#### Recommended next command

Authorize **Command 68 — Implement starter issue #26: Add a read-only `demo:smoke`
verification command** only after separate review and authorization. Do not start it
automatically.

### Command 68 — Implement Starter Issue #26: Add a Read-Only `demo:smoke` Verification Command

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-02

#### Scope completed

- Added `pnpm demo:smoke` for an already-running safe demo at the fixed
  `http://localhost:3100` origin. It requires the generated runtime to be a regular,
  non-symbolic-link file, validates the fixed origin and fictional credentials, and
  requires an HTTP-successful `/ready` response before launching a browser.
- Added a repository-pinned, headless Chromium verifier for the public hosting
  catalogue, authenticated customer overview, and authenticated administrator
  dashboard. It uses bounded semantic assertions for fictional seeded content and
  blocks browser requests outside the fixed loopback origin.
- Kept the command read-only with respect to business records, Docker, and providers.
  It never starts, stops, builds, inspects, or resets Docker and does not submit
  checkout, billing, payment, provisioning, support, or administrator mutations.
  Authentication creates only normal ephemeral sessions and rate-limit counters.
- Added allowlisted route-level reporting and fixed remediation. Runtime values,
  credentials, cookies, tokens, raw process/browser errors, DOM and response bodies,
  screenshots, traces, videos, and authenticated artifacts are not printed or
  retained.
- Added eight focused command tests covering missing and non-regular runtime paths,
  fixed-origin enforcement, ambiguous runtime entries, readiness failure, exact
  browser dispatch, pass/fail reporting, and rejection/redaction of untrusted child
  output. Documented prerequisites, coverage, safety, limits, normal login-rate
  behavior, and the contributor change path.

#### Files changed

- Command and focused tests: `scripts/demo/demo-smoke.mjs`,
  `scripts/demo/demo-smoke.test.mjs`, `scripts/demo/manage-demo.mjs`, `package.json`
- Browser verifier: `apps/web/e2e/smoke-safe-demo.ts`
- Evaluator and contributor documentation: `README.md`,
  `docs/SAFE_EVALUATION_DEMO.md`, `docs/CONTRIBUTOR_PATHS.md`, `CHANGELOG.md`
- Command evidence: `docs/PROGRESS.md`

#### Validation

- All 8 focused `demo:smoke` tests passed, including guard, dispatch, redaction, and
  trusted-output cases. The final live command passed `/ready`, `/hosting`, `/portal`,
  and `/admin` against the healthy fictional demo and reported that no business or
  Docker state was changed.
- All 6 existing demo-doctor tests, 12 guarded-reset tests, 4 Markdown-link tests,
  and 3 contributor-path tests passed during this command. Live offline checks passed
  with 107 local Markdown references across 59 tracked files and 80 contributor-map
  paths plus 20 root scripts.
- Repository lint, strict type checks, formatting, `git diff --check`, and the web
  production build passed. The complete web package suite also passed all 19 files
  and 55 tests earlier in the command, before the final verifier-only portability and
  catalogue-selection adjustments.
- Later standard web-suite retries while the Docker demo was active exceeded the
  Windows host's fixed five-second UI-test budget across unrelated unchanged files;
  a one-worker extended-timeout retry stopped making progress and was interrupted.
  No component implementation changed. Fresh strict type checks, the production
  build, focused command tests, and the live Chromium role journeys passed after the
  final verifier changes; hosted Linux CI served as the final standard-suite gate.
- Command 68 commit `8d7b4b0` passed hosted CI run `37029995703`, including
  database verification, documentation checks, lint, strict type checks, complete
  package and API integration tests, critical invariants, browser lifecycle,
  dependency/license checks, and the production build:
  `https://github.com/ebit101/webhost-billing/actions/runs/37029995703`.
- Hosted CodeQL run `37029995713` passed:
  `https://github.com/ebit101/webhost-billing/actions/runs/37029995713`. Public
  starter issue #26 was then closed as completed.
- Docker Desktop was separately recovered from the complete installation at
  `D:\\DockerBackup\\DockerDesktop`; Engine 29.8.1 and all retained demo services
  returned healthy without deleting images, volumes, or project data.

#### Decisions made

- Invoke the repository-pinned `tsx` entry point directly with Node instead of
  depending on pnpm's optional `npm_execpath` environment variable. This keeps the
  dispatch cross-platform and fixed while supporting pnpm 11 on Windows.
- Use the same reviewed client-side Monthly catalogue selection as the screenshot and
  accessibility checks before asserting the primary product action.
- Treat normal authentication sessions and rate-limit counters as the only permitted
  operational side effects. Repeated runs must wait for the normal 15-minute window;
  the verifier does not bypass security controls or clear Redis.
- Accept only an exact versioned child JSON shape and discard all raw child output so
  a browser or dependency failure cannot leak runtime secrets into terminal output.

#### Open questions and risks

- This is a bounded evaluator smoke check, not complete end-to-end, accessibility,
  production, payment, provisioning, or lifecycle acceptance. It deliberately does
  not automate demo startup or recovery.
- Five repeated login attempts for one fictional identity inside 15 minutes trigger
  the application's intended rate limit. A later route can therefore fail safely
  until the window expires; evaluators should wait rather than mutate Redis.
- The Windows host showed severe UI-test timing contention while Docker was active.
  Hosted Linux CI must confirm the ordinary five-second package-test configuration.
- Production remains `NO-GO`; the immutable `v0.1.0-alpha.1` release, schemas,
  providers, real identities, financial rules, and live environments were not
  changed.

#### Recommended next command

Authorize **Command 69 — Implement starter issue #27: Validate local Markdown
heading anchors offline** only after separate review and authorization. Do not start
it automatically.

### Command 69 — Implement Starter Issue #27: Validate Local Markdown Heading Anchors Offline

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-02

#### Scope completed

- Extended the existing offline Markdown-link validator so fragments on tracked
  Markdown targets are checked against ordinary GitHub-style ATX heading anchors,
  including same-document references.
- Added slug handling for repeated-heading numeric suffixes, ASCII punctuation,
  Unicode text, and percent-decoded fragments. Target path decoding, lexical
  repository confinement, and canonical symbolic-link confinement still complete
  before another Markdown document is read.
- Kept absolute web URLs, `mailto:` links, code examples, and fragments on
  non-Markdown files outside anchor validation. The checker performs no network
  requests, rendering, execution, or automatic rewriting.
- Added bounded one-line target diagnostics and aggregate anchor counts. Every
  discovered missing anchor remains an independent failure with its source file and
  line, and the command exits non-zero when any failure exists.
- Added fixture coverage for valid same-file and cross-file anchors, duplicate
  headings, punctuation, Bengali Unicode, percent encoding, ignored targets,
  invalid encoding, missing files/anchors, bounded output, and simultaneous
  failures. Updated the contributor guidance and reconciled completed issues #26
  and #27 out of the current starter set.

#### Files changed

- Offline validator and tests: `scripts/docs/check-markdown-links.mjs`,
  `scripts/docs/check-markdown-links.test.mjs`
- Test fixtures: `scripts/docs/__fixtures__/anchors-valid.md.fixture`,
  `scripts/docs/__fixtures__/anchors-missing.md.fixture`,
  `scripts/docs/__fixtures__/ignored.md.fixture`
- Contributor and project documentation: `CONTRIBUTING.md`,
  `docs/CONTRIBUTOR_PATHS.md`, `docs/STARTER_ISSUES.md`, `CHANGELOG.md`
- Command evidence: `docs/PROGRESS.md`

#### Validation

- All 6 focused Markdown-link tests passed, covering valid and missing anchors,
  duplicate suffixes, punctuation, Unicode/encoding, ignored references, bounded
  reporting, traversal, and simultaneous failures.
- `pnpm docs:links` passed offline with 107 local references, including 1 heading
  anchor, across 59 tracked Markdown files. `pnpm docs:paths` passed with 80
  contributor-map paths and 20 root scripts.
- `pnpm format:check`, `pnpm lint`, strict `pnpm typecheck`, and
  `git diff --check` passed.
- Complete `pnpm test` passed: 6 demo-doctor tests, 12 guarded-reset tests, 8
  demo-smoke tests, 3 contributor-path tests, 6 Markdown-link tests, 26 shared
  package tests, 55 web tests, 3 queue tests, 88 API tests, and 29 worker tests.
- Command 69 commit `b641256` passed hosted CI run `37036405352`, including secret
  scanning, database verification, documentation checks, lint, strict type checks,
  complete package and API integration tests, critical invariants, browser
  lifecycle, dependency/license checks, and the production build:
  `https://github.com/ebit101/webhost-billing/actions/runs/37036405352`.
- Hosted CodeQL run `37036405476` passed:
  `https://github.com/ebit101/webhost-billing/actions/runs/37036405476`. Public
  starter issue #27 was then closed as completed.

#### Decisions made

- Extend the existing dependency-free checker rather than add a parser or hosted
  link service. Heading extraction is deliberately bounded to ordinary ATX headings
  used by repository documentation.
- Build the tracked Markdown target allowlist from canonical in-repository paths and
  cache extracted heading sets. This preserves the existing symlink boundary before
  cross-document reads without crawling untracked files.
- Decode paths and fragments separately so percent-encoded Unicode anchors work
  without allowing a decoded fragment to influence path resolution.
- Bound only diagnostic rendering while retaining the original target internally,
  so failures remain testable without permitting unbounded terminal output.

#### Open questions and risks

- This is not a complete GitHub Markdown renderer. Setext headings, explicit HTML
  IDs, generated table-of-contents behavior, and renderer-specific edge cases remain
  outside the authorized scope.
- External anchors and fragments on non-Markdown targets remain intentionally
  unchecked. Repository maintainers must use a separate reviewed process if those
  targets later require validation.
- Production remains `NO-GO`; application behavior, schemas, providers, financial
  rules, releases, and live environments were not changed.

#### Recommended next command

Authorize **Command 70 — Implement starter issue #28: Add a safe-demo path to the
GitHub bug-report form** only after separate review and authorization. Do not start
it automatically.

### Command 70 — Implement Starter Issue #28: Add a Safe-Demo Path to the GitHub Bug-Report Form

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-02

#### Scope completed

- Added **Safe evaluation demo** as an explicit deployment method in the existing
  public bug-report form. The form directs pre-start reports to `demo:doctor`,
  running-stack reports to `demo:status`, and accepts only manually reviewed,
  redacted excerpts.
- Added single-line safe-demo context for the operating system, Docker/Compose
  versions, affected route or component, plus a required health-stage choice that
  distinguishes failures before and after the stack became healthy. The existing
  required version/commit, reproduction, expected, and actual behavior fields remain
  required.
- Added a required sensitive-data confirmation covering `.demo-runtime/demo.env`,
  passwords, cookies, tokens, personal/customer data, payment evidence, private
  hosts, database contents, and unredacted logs. Public guidance links directly to
  safe-demo troubleshooting and private vulnerability reporting.
- Added a dependency-pinned, offline validator that parses every issue-template YAML
  file, verifies common form structure and unique valid IDs, enforces the complete
  bug-form contract, and confines local guidance links before checking their target
  files and Markdown heading anchors. HTTPS links are syntax-checked without network
  crawling.
- Added four focused tests for the live forms, malformed YAML redaction, missing
  safe-demo/core/safety requirements, duplicate IDs, invalid schemes, and missing
  local heading anchors. Added the live check to ordinary CI and the focused suite
  to the root test gate.
- Updated contributor and evaluator guidance and moved completed issue #28 out of
  the current starter set. No new starter task was inferred.

#### Files changed

- Public issue form: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Offline validator and tests: `scripts/docs/check-issue-forms.mjs`,
  `scripts/docs/check-issue-forms.test.mjs`
- Shared heading extraction: `scripts/docs/check-markdown-links.mjs`
- Root commands, parser dependency, and CI: `package.json`, `pnpm-lock.yaml`,
  `.github/workflows/ci.yml`
- Contributor/support/evaluator documentation: `CONTRIBUTING.md`, `SUPPORT.md`,
  `docs/CONTRIBUTOR_PATHS.md`, `docs/SAFE_EVALUATION_DEMO.md`,
  `docs/STARTER_ISSUES.md`, `CHANGELOG.md`
- Command evidence: `docs/PROGRESS.md`

#### Validation

- All 4 focused issue-form tests passed. The live offline command validated 3 issue
  forms, parsed all 4 template YAML files, and checked 2 required guidance links.
- `pnpm docs:links` passed with 111 local references, including 3 heading anchors,
  across 59 tracked Markdown files. `pnpm docs:paths` passed with 82 contributor-map
  paths and 22 root scripts.
- `pnpm format:check`, `git diff --check`, Node syntax checks, and a frozen-lockfile
  install passed. The explicit `js-yaml` 4.3.2 development dependency reuses the
  repository's existing resolved package line.
- Complete `pnpm test` passed: 6 demo-doctor tests, 12 guarded-reset tests, 8
  demo-smoke tests, 3 contributor-path tests, 6 Markdown-link tests, 4 issue-form
  tests, 26 shared package tests, 55 web tests, 3 queue tests, 88 API tests, and 29
  worker tests.
- Manual terminology and schema review confirmed that fields use supported GitHub
  input types, every non-Markdown field has a valid unique ID, dropdown options avoid
  reserved values, the security-sensitive list is descriptive rather than a request
  for secret values, and no field asks for production access or automatic uploads.
- Command 70 commit `6a08d21` passed hosted CI run `37041115983`, including the new
  issue-form gate, secret scanning, database verification, documentation checks,
  lint, strict type checks, complete package and API integration tests, critical
  invariants, browser lifecycle, dependency/license checks, and the production
  build: `https://github.com/ebit101/webhost-billing/actions/runs/37041115983`.
- Hosted CodeQL run `37041115509` passed:
  `https://github.com/ebit101/webhost-billing/actions/runs/37041115509`. Public
  starter issue #28 was then closed as completed.

#### Decisions made

- Keep one bug form for all deployment methods instead of creating an overlapping
  safe-demo form. Non-demo reporters can select the explicit not-safe-demo health
  option, while safe-demo reporters receive bounded fields that avoid raw diagnostic
  dumps.
- Put the prohibited-material list in the required confirmation's description and
  make the acknowledgement refer to that list. This provides an explicit attestation
  without making a form label resemble a request for credentials.
- Use a real pinned YAML parser rather than a partial hand-written parser. Parse
  `config.yml` as well as every issue form, but apply the field contract only to form
  files.
- Reuse Command 69's GitHub-style heading extraction so local issue-form guidance
  links prove both the file and the named section still exist.

#### Open questions and risks

- GitHub Issue Forms remain a public-preview schema. The offline validator protects
  the contract implemented here, but future GitHub schema changes may require a
  reviewed validator update.
- A required checkbox cannot prevent a reporter from pasting sensitive material.
  Maintainers must still review public submissions and move suspected vulnerabilities
  to the private reporting path.
- Production remains `NO-GO`; runtime behavior, telemetry, uploads, security policy,
  Discussions, schemas, providers, releases, deployments, and live environments were
  not changed.

#### Recommended next command

Authorize **Phase Review — Review Commands 67–70 and define the next bounded
command** only after separate review and authorization. Do not start another
implementation command automatically.

### Phase Review — Review Commands 67–70 and Define the Next Bounded Command

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-03

#### Scope completed

- Reviewed Commands 67–70 against their original command text, `AGENTS.md`, the
  product plan, the accepted decisions, their implementation diffs and tests, and
  the current public backlog. The third set remained exactly three bounded issues:
  read-only demo smoke verification, offline Markdown-anchor validation, and safer
  demo bug reporting.
- Confirmed the Command 68 verifier remains fixed to loopback and an existing
  fictional runtime, checks only the intended public/customer/administrator paths,
  retains no authenticated artifacts, emits bounded allowlisted output, and neither
  mutates business records nor manages Docker state.
- Confirmed Command 69 preserves lexical and canonical repository confinement before
  target reads, remains offline, and covers the authorized ordinary ATX, duplicate,
  punctuation, Unicode, percent-encoding, and aggregate-failure cases.
- Confirmed Command 70 retains the required bug fields, explicit safe-demo context,
  sensitive-data acknowledgement, private-reporting route, offline parsing and link
  confinement, focused tests, and ordinary CI integration without collecting or
  uploading diagnostic data.
- Reconciled the catalogue with GitHub: public starter issues #26, #27, and #28 are
  closed and no public issue is open. Open Dependabot pull requests were correctly
  excluded from the issue count.
- Corrected the stale status summary that still identified Command 67 and Command 68
  as current/next, replaced the completed catalogue's obsolete instruction to run
  this review, and fixed a missing separator in the contributor test list.
- Defined only the next planning gate, Command 71, which must discover exactly three
  concrete fourth-set tasks, include at least one no-Docker/no-browser task, and add
  separate implementation commands without implementing any proposed issue.

#### Files changed

- `CODEX_DEVELOPMENT_COMMANDS.md` — added the separately gated, planning-only
  Command 71 with bounded acceptance and explicit exclusions
- `docs/PROGRESS.md` — corrected current command state and recorded this review
- `docs/STARTER_ISSUES.md` — reconciled the empty current set with Command 71
- `docs/CONTRIBUTOR_PATHS.md` — corrected the focused-test list punctuation
- `CHANGELOG.md` — recorded the phase review and contributor-guidance correction

#### Validation

- Focused suites passed: 8 demo-smoke tests, 6 Markdown-link tests, 3
  contributor-path tests, and 4 issue-form tests.
- Live offline checks passed: `pnpm docs:links` checked 111 local references,
  including 3 anchors, across 59 tracked Markdown files; `pnpm docs:paths` checked
  82 mapped paths and 22 root scripts; and `pnpm docs:issue-forms` validated 3 forms,
  parsed all 4 template YAML files, and checked 2 guidance links.
- `pnpm format:check`, `pnpm lint`, strict `pnpm typecheck`, and
  `git diff --check` passed.
- Complete `pnpm test` passed: 6 demo-doctor tests, 12 guarded-reset tests, 8
  demo-smoke tests, 3 contributor-path tests, 6 Markdown-link tests, 4 issue-form
  tests, 26 shared package tests, 55 web tests, 3 queue tests, 88 API tests, and 29
  worker tests.
- Public GitHub API reconciliation confirmed issues #26–#28 closed and zero open
  public issues. The pre-review `main` commit `f241d6d` had successful hosted CI run
  `37042237090` and CodeQL run `37042237132`.
- Phase-review commit `fb69dfb` passed hosted CI run `37044806960`, including full
  history secret scanning, database verification, all documentation checks, lint,
  strict type checks, package/API/invariant/browser tests, dependency and license
  checks, and the production build. Hosted CodeQL run `37044807043` also passed.
- Manually reviewed all added text for terminology, command boundaries, production
  claims, and sensitive material; the bounded review changes contain no credentials,
  runtime files, customer data, provider output, or private hosts.

#### Decisions made

- No application correction is required. The delivered behavior and focused tests
  satisfy the authorized scopes without weakening data, authentication, provider,
  financial, or production boundaries.
- Keep the next step planning-only because the accepted third set is complete and
  the public issue backlog contains no open contributor task. Command 71 must base
  each proposed issue on a current repository need rather than inventing work merely
  to populate a list.
- Preserve one-command-at-a-time authorization: Command 71 may publish a bounded
  issue set and future command text, but it may not implement the new tasks.

#### Open questions and risks

- GitHub Issue Forms remain a public-preview feature, and the Markdown anchor checker
  intentionally implements only the documented ordinary ATX subset. Their existing
  limitations remain accurately documented and need no expansion in this review.
- The live Docker demo was not restarted or rerun during this documentation-focused
  review. Command 68's original live verification and the current hosted gates remain
  recorded; fresh local unit and repository validation passed without requiring
  Docker state.
- No starter issue is open until Command 71 is separately authorized, planned,
  reviewed, and delivered. Production remains `NO-GO`.

#### Recommended next command

Authorize **Command 71 — Reopen the Contributor On-Ramp With a Fourth Starter-Issue
Set** only after separate review and authorization. Do not begin any fourth-set
implementation automatically.

## Report Template

Use this template after every future command:

```text
### Command N — Title

- Status:
- Date:

#### Scope completed
#### Files changed
#### Validation
#### Decisions made
#### Open questions and risks
#### Recommended next command
```

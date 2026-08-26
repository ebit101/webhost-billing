# Webhost Billing Development Progress

## Status Summary

- **Current command:** Command 26 — Add End-to-End Tests
- **Current status:** Completed and delivered to GitHub `main`
- **Last updated:** 2026-08-26
- **Next command:** Command 27 — Add Observability and Health Checks
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

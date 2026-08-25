# Webhost Billing Development Progress

## Status Summary

- **Current command:** Command 12 — Create the Payment Adapter
- **Current status:** Completed and delivered to GitHub `main`
- **Last updated:** 2026-08-25
- **Next command:** Command 13 — Integrate the Real Payment Provider
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

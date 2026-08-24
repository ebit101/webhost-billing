# Webhost Billing Development Progress

## Status Summary

- **Current command:** Command 7 — Implement Customer Management
- **Current status:** Completed and delivered to GitHub `main`
- **Last updated:** 2026-08-24
- **Next command:** Command 8 — Implement Products and Pricing
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

# Webhost Billing Development Progress

## Status Summary

- **Current command:** Resume Command 33 — Record D1–D4 operating-rule approval
- **Current status:** DRAFT-OPS-1 D1–D4 approved and recorded; D5–D8 and operating inputs remain open; no deployment; recorded staging release 6085629 unchanged; production not approved
- **Last updated:** 2026-10-06
- **Next command:** Resume Command 33 — Resolve D5–D8 and Supply Remaining Operating Inputs
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

### Command 71 — Reopen the Contributor On-Ramp With a Fourth Starter-Issue Set

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-03

#### Scope completed

- Reviewed the completed Commands 67–70 and issues #26–#28, the latest phase-review
  findings, the contributor change-path map, the safe-demo lifecycle/capture scripts,
  current offline validators, contributor guidance, and the public backlog.
- Identified a concrete lifecycle mismatch: `demo:credentials`, `demo:status`,
  `demo:logs`, and `demo:down` currently initialize a missing runtime file, while the
  evaluator guidance says `demo:up` creates it. The logs path also uses `--follow`
  despite being described as bounded. Published issue #29 and separately gated
  Command 72 to make those paths side-effect-free and logs finite.
- Identified that the four reviewed evaluator PNGs have only link-existence
  protection. Published issue #30 and Command 73 for one shared capture/validation
  contract covering repository confinement, tracking, PNG headers, dimensions, byte
  bounds, and canonical-guide references without Docker, browsers, pixel decoding,
  or network access.
- Identified that first-time contributors must remember multiple independent
  offline documentation commands. Published issue #31 and Command 74 for one
  allowlisted, sequential `docs:check` aggregate that retains every focused command
  and includes the screenshot contract after Command 73.
- Updated the starter catalogue with exactly three current tasks, each containing
  acceptance, validation, security, and excluded-scope criteria. Added three
  separate one-command-at-a-time implementation gates and did not implement any of
  the proposed work.
- Reconciled GitHub after publication: issues #29, #30, and #31 are the only three
  open public issues. All carry `good first issue` and `help wanted` plus their
  relevant Docker, documentation, JavaScript, or GitHub Actions labels. The 17
  open Dependabot pull requests remain distinct from the issue backlog.

#### Files changed

- `docs/STARTER_ISSUES.md` — added the fourth current starter set and public links
- `CODEX_DEVELOPMENT_COMMANDS.md` — added separately gated Commands 72–74
- `CHANGELOG.md` — recorded the new bounded contributor set
- `docs/PROGRESS.md` — updated command state and recorded planning evidence

#### Validation

- `pnpm format:check` passed.
- `pnpm docs:links` passed offline with 111 local references, including 3 heading
  anchors, across 59 tracked Markdown files.
- `pnpm docs:paths` passed with 82 contributor-map paths and 22 root scripts.
- `pnpm docs:issue-forms` validated 3 forms, parsed all 4 template YAML files, and
  checked 2 guidance links without network access.
- `git diff --check` passed.
- Authenticated public-backlog reconciliation confirmed exactly three open issues:
  #29, #30, and #31, with the intended titles and labels. No issue duplicates a
  completed starter task.
- Manual terminology and security review confirmed the set preserves fictional
  demo data, repository/loopback confinement, bounded output, private vulnerability
  reporting, immutable release state, and production `NO-GO`.
- Command 71 commit `603702d` passed hosted CI run `37049160202`, including full
  history secret scanning, database verification, documentation checks, lint,
  strict type checks, package/API/invariant/browser tests, dependency and license
  checks, and the production build. Hosted CodeQL run `37049160206` also passed.

#### Decisions made

- Put issue #29 first because it resolves an observed mismatch in current lifecycle
  behavior rather than adding another demo capability. It may change only demo
  command orchestration and guidance, not application/authentication behavior.
- Use one shared screenshot contract in issue #30 so validation and capture do not
  establish competing filename/dimension lists. Keep it header-only and offline;
  visual quality remains a human review responsibility.
- Schedule the aggregate documentation command after the asset validator so
  Command 74 can include the complete then-current offline set without inventing a
  plugin/task-runner system.
- Keep all three tasks suitable for one focused pull request and within documented
  demo tooling or contributor-documentation change paths. None grants schema,
  provider, financial, production, deployment, release, or external-service
  authority.

#### Open questions and risks

- Issue #29 requires a small dispatcher refactor to make filesystem/process behavior
  injectable. The implementation must not broaden accepted arguments or weaken the
  exact guarded reset contract while doing so.
- A PNG header/dimension check cannot prove that screenshot content is accurate,
  legible, fictional, or free of sensitive pixels. Command 73 therefore retains an
  explicit manual unchanged-asset review and performs no regeneration.
- Command 74 follows Command 73 so its aggregate can include `docs:demo-assets`.
  Starting issue #31 early would require rebasing its allowlist after Command 73;
  the canonical commands remain sequential and separately authorized.
- Production remains `NO-GO`; no demo was started, stopped, reset, or inspected, and
  no application behavior, schema, provider, release, deployment, credential, or
  real data was touched.

#### Recommended next command

Authorize **Command 72 — Implement starter issue #29: Keep safe-demo inspection
commands side-effect-free** only after separate review and authorization. Do not
start Command 73 or 74 automatically.

### Command 72 — Implement Starter Issue #29: Keep Safe-Demo Inspection Commands Side-Effect-Free

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-03

#### Scope completed

- Added one injected safe-demo inspection boundary for `demo:credentials`,
  `demo:status`, `demo:logs`, and `demo:down`. Every command now validates an
  existing readable, regular, non-symbolic-link runtime file and refuses with fixed
  remediation before Docker when it is missing or unsafe.
- Kept runtime creation in the ordinary lifecycle limited to `demo:up`; none of the
  four inspection/stop commands creates directories, files, credentials, or Docker
  state.
- Pinned successful Docker dispatch to the local `default` context, dedicated
  `webhost-billing-demo` project, fixed project directory, fixed environment file,
  and fixed Compose file while discarding ambient Docker/Compose target overrides.
- Changed `demo:logs` from indefinite follow mode to a captured, no-color snapshot
  requesting and emitting at most the latest 100 lines. Generated runtime secrets,
  bearer values, common authentication headers, ANSI color, and oversized lines are
  redacted or bounded before output; failed Docker calls expose no raw output.
- Preserved `demo:down` as a non-destructive stop that omits volume and orphan
  removal, retains the exact runtime file, and reports a fixed retained-state result.
  Existing doctor, smoke, reset, screenshot, accessibility, product, authentication,
  schema, provider, release, deployment, and production `NO-GO` behavior was not
  broadened.
- Added focused injected filesystem/process tests for missing, unreadable,
  symbolic-link, and non-regular paths; refusal before Docker; exact fixed dispatch;
  environment-target stripping; credential reads; bounded/redacted log handling;
  raw-failure redaction; and retained down state.
- Updated command help, contributor navigation, English and Bengali evaluator
  guidance, the starter catalogue, changelog, and the durable inspection decision.

#### Files changed

- `scripts/demo/demo-inspection.mjs` — added the injected validation, dispatch,
  redaction, bounded-output, and non-destructive stop boundary
- `scripts/demo/demo-inspection.test.mjs` — added eight focused contract tests
- `scripts/demo/manage-demo.mjs` — routed the four commands through the safe boundary
  and updated finite-log help
- `package.json` — exposed the focused test and included it in the ordinary test gate
- `CONTRIBUTING.md` — documented side-effect-free lifecycle behavior
- `docs/CONTRIBUTOR_PATHS.md` — linked the focused test and validation command
- `docs/SAFE_EVALUATION_DEMO.md` — documented runtime refusal and finite redacted logs
- `docs/SAFE_EVALUATION_DEMO_BN.md` — added equivalent Bengali evaluator guidance
- `docs/STARTER_ISSUES.md` — moved issue #29 to the completed starter set
- `docs/DECISIONS.md` — recorded ADR-048 for the inspection boundary
- `CHANGELOG.md` — recorded the safe-demo lifecycle correction
- `docs/PROGRESS.md` — recorded Command 72 scope, evidence, decisions, and next gate

#### Validation

- `pnpm test:demo-inspection` passed all 8 focused tests.
- Disposable live `pnpm demo:status`, `pnpm demo:logs`, and `pnpm demo:down` checks
  passed against Docker Desktop 4.93.0 / Engine 29.8.1. Status found the dedicated
  services; logs exited without follow, emitted 100 Docker log lines plus the pnpm
  banner, and contained zero generated runtime values; down returned success,
  preserved the runtime SHA-256 and every dedicated volume, and left zero dedicated
  containers.
- `pnpm docs:paths` passed with 83 contributor-map paths and 23 root scripts.
- `pnpm docs:links` passed with 112 local references, including 3 heading anchors,
  across 59 tracked Markdown files.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `git diff --check` passed.
- `pnpm test` passed after the local development PostgreSQL and Redis services were
  restored: demo/docs contract tests, 26 shared tests, 3 queue integration tests,
  55 web tests, 88 API tests, and 29 worker tests all passed.
- The first complete-test attempt correctly failed only because Docker Desktop and
  Redis were unavailable. The Docker installation was repaired outside the
  repository, the same suite was rerun from the start, and it passed completely.
- Command 72 implementation commit `2d64549` passed hosted CI run `37100293508`,
  including full history secret scanning, database verification, documentation
  checks, lint, strict type checks, package/API/invariant/browser tests, dependency
  and license checks, and the production build. Hosted CodeQL run `37100293479` also
  passed.
- GitHub issue #29 received the completion evidence and was closed as completed on
  2026-10-03.

#### Decisions made

- Use a small separately testable inspection module rather than adding more implicit
  side effects to the lifecycle dispatcher. Its repository root, filesystem, process
  runner, environment, and writer are injectable only from code/tests; the public CLI
  accepts no target override.
- Treat credentials as an explicit local operator display while redacting generated
  secret values from logs and all failure paths. A successful credentials invocation
  remains documented as sensitive and must not be shared.
- Capture Docker output before publishing it. Status emits successful Compose state,
  logs apply redaction and hard line/character bounds, down discards lifecycle
  chatter, and every process error receives fixed remediation.
- Strip ambient Docker/Compose routing variables and pass all target inputs
  explicitly so an evaluator's shell cannot redirect these commands to another
  project, context, environment file, or Compose file.

#### Open questions and risks

- Successful `demo:credentials` intentionally prints the locally generated fictional
  logins requested by that command. Evaluators must continue treating them as secrets
  and must not paste the output into public reports.
- Application log content remains operational diagnostic material. The command
  removes generated runtime secrets and common authentication headers and imposes
  strict bounds, but contributors must still manually review any excerpt before
  sharing it.
- Production remains `NO-GO`. No financial, authentication, provider, database,
  release, deployment, or production behavior changed, and the immutable alpha
  release was not modified.
- The implementation is delivered on GitHub `main`, hosted CI and CodeQL are green,
  and issue #29 is closed. Issues #30 and #31 remain separately gated and open.

#### Recommended next command

Authorize **Command 73 — Implement starter issue #30: Validate safe-demo screenshot
assets offline** only after Command 72 is delivered, hosted checks pass, issue #29 is
closed, and separate user authorization is given. Do not begin Command 73
automatically.

### Command 73 — Implement Starter Issue #30: Validate Safe-Demo Screenshot Assets Offline

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-03

#### Scope completed

- Added one repository-owned JSON contract for the four reviewed safe-demo PNGs. It
  defines each stable identity, filename, evaluator role, canonical-guide reference,
  required width, capture viewport height, bounded output height, and conservative
  minimum/maximum byte size.
- Refactored the existing Playwright capture runner to consume the shared contract
  for output directory, filenames, widths, and viewport heights. No screenshot was
  regenerated, redesigned, compressed, opened, or otherwise modified.
- Added a fixed offline Node.js validator that treats contract/assets as untrusted,
  requires the exact four-entry contract, rejects duplicate identities, validates a
  regular non-symbolic-link asset directory and files, resolves canonical paths
  inside the repository, and confirms Git tracking and exact canonical-guide
  references.
- Limited image reads to the first 24 bytes and validated the PNG signature, first
  IHDR chunk, required width, bounded height, and file-size bounds without decoding
  pixels. Failures use fixed bounded repository-relative asset/reason output and
  discard raw filesystem/Git details.
- Added six focused fixture/live tests covering the four current assets plus missing,
  traversal, symbolic-link, malformed PNG, wrong width/height, oversized, duplicate,
  untracked, undocumented, and bounded-output cases.
- Added focused `test:demo-assets` and live `docs:demo-assets` commands, included the
  focused suite in the ordinary package test gate, and added the live offline check
  to ordinary CI without adding Docker, browser, pixel-decoding, or network work.
- Updated the contributor path, canonical evaluator guide, completed starter issue,
  changelog, and durable architecture decision. Product behavior, authentication,
  schemas, providers, releases, deployments, and production `NO-GO` were unchanged.

#### Files changed

- `scripts/demo/demo-screenshot-contract.json` — defined the shared four-asset
  capture and validation contract
- `apps/web/e2e/capture-demo-screenshots.ts` — consumed the shared contract without
  running or changing capture output
- `scripts/docs/check-demo-screenshot-assets.mjs` — added the offline metadata,
  confinement, tracking, PNG-header, dimension, size, uniqueness, and guide validator
- `scripts/docs/check-demo-screenshot-assets.test.mjs` — added six live/fixture tests
- `package.json` — exposed focused/live commands and registered the focused suite
- `.github/workflows/ci.yml` — added the live offline screenshot check
- `docs/CONTRIBUTOR_PATHS.md` — mapped the contract, validator, tests, and commands
- `docs/SAFE_EVALUATION_DEMO.md` — documented the offline command and human-review
  boundary
- `docs/STARTER_ISSUES.md` — moved issue #30 to the completed starter set
- `docs/DECISIONS.md` — recorded ADR-049 for the offline asset contract
- `CHANGELOG.md` — recorded the new objective screenshot gate
- `docs/PROGRESS.md` — recorded Command 73 scope, evidence, decisions, and next gate

#### Validation

- `pnpm test:demo-assets` passed all 6 focused live/fixture tests.
- `pnpm docs:demo-assets` validated all 4 current tracked PNG assets offline.
- `pnpm docs:paths` passed with 87 contributor-map paths and 25 root scripts.
- `pnpm docs:links` passed with 116 local references, including 3 heading anchors,
  across 59 tracked Markdown files.
- `pnpm docs:issue-forms` validated 3 forms, parsed all 4 YAML files, and checked 2
  guidance links.
- `pnpm format:check`, `pnpm lint`, strict `pnpm typecheck`, and
  `git diff --check` passed.
- `pnpm test` passed: demo/docs contract suites including the 6 new asset tests, 26
  shared package tests, 3 queue integration tests, 55 web tests, 88 API tests, and 29
  worker tests all passed.
- Manual unchanged-asset review compared each working-tree Git blob with `HEAD`:
  `admin-dashboard.png`, `customer-portal.png`, `hosting-catalog-mobile.png`, and
  `hosting-catalog.png` were byte-for-byte unchanged. No Docker process, browser,
  network request, OCR, image decoder, screenshot capture, or authenticated artifact
  was used or retained by the validator or this review.
- Command 73 implementation commit `08b7f70` passed hosted CI run `37102441401`,
  including the new offline asset check, full history secret scanning, database
  verification, documentation checks, lint, strict type checks,
  package/API/invariant/browser tests, dependency and license checks, and the
  production build. Hosted CodeQL run `37102441354` also passed.
- GitHub issue #30 received the completion evidence and was closed as completed on
  2026-10-03.

#### Decisions made

- Use JSON as the small shared contract so the Node.js validator can read it without
  a runtime transpiler and the strict TypeScript Playwright runner can import exactly
  the same values. Capture-specific credentials and page-ready assertions remain
  outside the asset metadata contract.
- Require exact widths while allowing narrow role-specific height ranges because
  full-page content height can change deliberately. Conservative byte ceilings catch
  accidental oversized replacements without promoting compression as a goal.
- Read only PNG signature/IHDR bytes. This proves file type and objective dimensions
  without executing metadata or decoding pixels, but deliberately cannot assert
  visual correctness or content safety.
- Keep `docs:demo-assets` focused and standalone. Command 74 remains responsible for
  creating the separately authorized aggregate documentation command.

#### Open questions and risks

- Header validation cannot prove that pixels are accurate, legible, fictional, or
  free of sensitive content. Human visual and sensitive-data review remains required
  for every future screenshot replacement.
- Intentional layout changes that move a screenshot outside its height/byte bounds
  require reviewed contract and documentation changes in the same contribution; the
  validator must not auto-relax bounds or rewrite assets.
- Production remains `NO-GO`. The four reviewed images and immutable alpha release
  are unchanged, and no application, financial, authentication, schema, provider,
  deployment, or production behavior changed.
- The implementation is delivered on GitHub `main`, hosted CI and CodeQL are green,
  and issue #30 is closed. Issue #31 remains separately gated and open.

#### Recommended next command

Authorize **Command 74 — Implement starter issue #31: Add one offline documentation
validation command** only after Command 73 is delivered, hosted checks pass, issue
#30 is closed, and separate user authorization is given. Do not begin Command 74
automatically.

### Command 74 — Implement Starter Issue #31: Add One Offline Documentation Validation Command

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-03

#### Scope completed

- Added root `docs:check` as the canonical cross-platform aggregate for the four
  current offline validators: Markdown links/anchors, contributor paths/scripts,
  GitHub issue forms, and the safe-demo screenshot asset contract.
- Implemented the aggregate as a fixed Node.js allowlist with deterministic
  sequential run/pass/fail output, exact first-child failure propagation, and an
  immediate stop before any later validator.
- Captured and discarded child stdout, stderr, and errors. Child processes receive
  only the small platform environment allowlist required to launch Node and Git;
  application/provider/session values are not forwarded.
- Added four injected tests for complete ordered success, non-default failure-status
  propagation, stopped dispatch after thrown failure, and raw-output/environment
  secret suppression.
- Replaced the four repetitive ordinary CI steps with the aggregate while keeping
  every focused root command. Updated general contributor guidance, the detailed
  change-path map, starter catalogue, changelog, and durable decision record.
- Kept formatting, lint, type checks, package tests, Docker, browsers, network
  crawling, arbitrary task dispatch, application behavior, and production authority
  outside the aggregate.

#### Files changed

- `scripts/docs/check-documentation.mjs` — added the fixed offline dispatcher
- `scripts/docs/check-documentation.test.mjs` — added four injected contract tests
- `package.json` — exposed `docs:check`/`test:docs-check` and registered the focused
  suite in the ordinary test gate
- `.github/workflows/ci.yml` — replaced four documentation steps with the aggregate
- `CONTRIBUTING.md` — made the aggregate the ordinary contributor entry point
- `docs/CONTRIBUTOR_PATHS.md` — documented aggregate and focused validation paths
- `docs/STARTER_ISSUES.md` — moved issue #31 to the completed starter set
- `docs/DECISIONS.md` — recorded ADR-050 for the aggregate boundary
- `CHANGELOG.md` — recorded the new canonical offline documentation command
- `docs/PROGRESS.md` — recorded Command 74 scope and evidence

#### Validation

- `pnpm test:docs-check` passed all 4 injected dispatcher tests.
- `pnpm docs:check` passed all 4 allowlisted validators in the documented order.
- Focused `pnpm docs:links`, `pnpm docs:paths`, `pnpm docs:issue-forms`, and
  `pnpm docs:demo-assets` all passed independently: 118 local references including
  3 anchors across 59 Markdown files, 89 contributor-map paths and 27 root scripts,
  3 forms/4 YAML files/2 guidance links, and 4 tracked PNG assets.
- `pnpm format:check`, `pnpm lint`, strict `pnpm typecheck`, and
  `git diff --check` passed.
- `pnpm test` passed the demo/documentation contract suites, including the 4 new
  dispatcher tests, plus 26 shared, 3 queue, 55 web, 88 API, and 29 worker tests.
- Command 74 implementation commit `8c7a8a6` passed hosted CI run `37104008847`,
  including the new aggregate documentation step, full-history secret scanning,
  database verification, lint, strict type checks, package/API/invariant/browser
  tests, dependency/license checks, and the production build. Hosted CodeQL run
  `37104008812` also passed.
- GitHub issue #31 received the completion evidence and was closed as completed on
  2026-10-03.

#### Decisions made

- Launch the fixed validator source files directly with the current Node executable
  instead of shell-chaining pnpm commands. This stays cross-platform and prevents
  command-name or argument injection while the public focused commands remain
  familiar diagnostic entry points.
- Emit fixed validator labels rather than relaying child streams. The aggregate
  shows exactly which validator passed or failed without turning document-derived or
  process output into a cross-process secret channel.
- Forward only PATH and required Windows process-discovery/locale values. Repository
  validators require no application, database, provider, GitHub, or demo secrets.

#### Open questions and risks

- Fixed aggregate output intentionally omits detailed validator counts and failures;
  the named focused command provides those diagnostics without exposing unrelated
  child output through the dispatcher.
- Production remains `NO-GO`; no application, financial, authentication, database,
  provider, release, deployment, Docker, browser, or screenshot behavior changed.
- The implementation is delivered on GitHub `main`, hosted CI and CodeQL are green,
  and issue #31 is closed. The public starter-issue set is now empty pending a new
  phase review.

#### Recommended next command

After Command 74 is delivered, hosted checks pass, and issue #31 is closed, run a
new **Phase Review**. Do not define or implement another command automatically.

### Phase Review — Review Commands 71–74 and Define Command 75

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-03

#### Scope completed

- Reviewed the fourth contributor set against Commands 71–74, `AGENTS.md`, the
  product plan, ADRs 045–050, implementation/tests, delivery reports, the current
  public backlog, and the final hosted checks. Issues #29–#31 are closed as completed
  and no public issue remains open.
- Confirmed Command 72 keeps credentials/status/logs/down side-effect-free, fixes
  Docker targeting, bounds and redacts log output, and retains non-destructive down
  state. Confirmed Command 73 shares one capture/validation contract, performs only
  header/metadata checks, and leaves pixels plus visual safety to human review.
  Confirmed Command 74 dispatches only four fixed local validators, stops on the
  first failure, returns its status, and suppresses raw child output and ambient
  secrets while preserving focused diagnostic commands.
- Found no missing requirement, regression, or security correction in the delivered
  fourth-set implementation. Corrected the stale progress summary that still named
  Command 73/74 and the starter catalogue instruction that still requested this
  already-completed phase review.
- Inspected the current safe-demo screenshots, route/component inventory, primary
  browser lifecycle, capability matrix and release gaps. The foundation already
  covers the intended customer, product, order, invoice, payment, service, ticket,
  renewal, report and provider boundaries, but the product experience needs a
  deliberate operator/customer phase rather than more adoption tooling.
- Identified concrete roadmap inputs without implementing them: workspace search and
  notification controls currently look active without behavior; several operational
  lists fetch a fixed first 100 records without full scale navigation; administrator
  customer-linked records are not drill-down links and show raw minor-unit wording;
  dashboard attention views lack a dedicated recent-payment surface and a complete
  searchable activity log; and configuration/policy gaps remain documented.
- Reviewed current official public WHMCS documentation as a concept benchmark. Its
  client summary emphasizes consolidated billing/service context and common actions;
  order management keeps a review gate; service views connect lifecycle operations
  to customer/order/invoice context; and automation status emphasizes actionable
  failures. These are workflow ideas to evaluate independently, not UI or feature
  parity requirements.
- Added ADR-051 and defined Command 75 as a planning-only, live fictional-product
  audit. It must create a route/capability and hosting-workflow roadmap, prioritize by
  frequency/risk/manual effort/readiness, and define exactly three separately gated
  Commands 76–78. No product feature was implemented during this review.

#### Files changed

- `CODEX_DEVELOPMENT_COMMANDS.md` — added separately gated planning Command 75
- `docs/DECISIONS.md` — recorded workflow-led benchmarking in ADR-051
- `docs/STARTER_ISSUES.md` — replaced the completed phase-review handoff
- `CHANGELOG.md` — recorded the transition to the product-experience phase
- `docs/PROGRESS.md` — corrected current state and recorded review evidence

#### Validation

- Repository and public-backlog reconciliation confirmed clean synchronized `main`,
  closed-completed issues #29–#31, and zero open public issues before review edits.
- Manually reviewed the four safe-demo images, current store/portal/admin route and
  module inventories, administrator customer/order/service/invoice surfaces, the
  full browser lifecycle, capability matrix, and release-checklist gaps.
- Official public comparison sources reviewed on 2026-10-03 were WHMCS's current
  [client Summary](https://docs.whmcs.com/9-1/clients/client-profile/summary-tab/),
  [Products/Services](https://docs.whmcs.com/9-0/clients/client-profile/products-services-tab/),
  [Order Management](https://docs.whmcs.com/9-0/orders/order-management/),
  [Automation Settings](https://docs.whmcs.com/9-0/system/automation/automation-settings/),
  [Automation Status](https://docs.whmcs.com/9-1/system/automation/automation-status/)
  and [Billing Logic](https://docs.whmcs.com/9-1/billing-and-invoicing/billing-logic/)
  documentation. Only workflow concepts and public facts were used; no licensed
  product, code, copy or assets were accessed.
- Focused verification passed all 8 demo-inspection tests, 6 screenshot-contract
  tests and 4 aggregate-documentation dispatcher tests.
- `pnpm docs:check` and every focused validator passed: 118 local references
  including 3 anchors across 59 Markdown files, 89 contributor-map paths and 27 root
  scripts, 3 forms/4 YAML files/2 guidance links, and 4 tracked PNG assets.
- `pnpm format:check`, `pnpm lint`, strict `pnpm typecheck`, and
  `git diff --check` passed.
- Complete `pnpm test` passed the demo/documentation suites plus 26 shared, 3 queue,
  55 web, 88 API and 29 worker tests.
- The pre-review final-state commit `48ff22e` had successful hosted CI run
  `37104414802` and CodeQL run `37104414810`.
- Phase-review commit `3fa0563` passed hosted CI run `37108816870`, including full
  history secret scanning, database verification, the aggregate documentation gate,
  lint, strict type checks, package/API/invariant/browser tests,
  dependency/license checks, and the production build. Hosted CodeQL run
  `37108816913` also passed.

#### Decisions made

- End the repeated safe-demo/contributor-adoption issue cycle. The public on-ramp is
  functional and currently empty by design; the next phase returns to product work.
- Make Command 75 planning-only but require a live route-by-route safe-demo review.
  Choosing implementation slices before observing the actual product would favor
  visible feature count over real operator/customer friction.
- Benchmark workflows, not screens. Webhost Billing remains an independent,
  single-business product and intentionally excludes reseller/marketplace/affiliate,
  multi-currency, worldwide-tax and automatic-termination scope.
- Require three bounded follow-on commands with at least one administrator workflow
  and one customer journey. Every slice must preserve authorization, ownership,
  immutable financial history, and separate payment/provisioning states.

#### Open questions and risks

- Command 75 must distinguish a genuinely inactive affordance from a deliberately
  informational control before recommending removal or implementation.
- Public competitor documentation describes a much broader commercial system. Its
  presence does not prove that a feature belongs in this product; local workflow
  evidence and the one-business plan remain authoritative.
- A safe-demo audit uses fictional records and cannot substitute for credentialed
  provider acceptance or a real operator pilot. Product improvements remain
  evaluation-only until production gates separately pass.
- Production remains `NO-GO`; this review changes no application, schema, provider,
  release, deployment, hosted environment or real business data.

#### Recommended next command

Authorize **Command 75 — Establish the Real-Hosting Product Experience Roadmap**
only after separate review and authorization. Do not begin Command 76–78 or any
application change automatically.

### Command 75 — Establish the Real-Hosting Product Experience Roadmap

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-03

#### Scope completed

- Ran the fictional safe demo and inspected every App Router page as its intended
  anonymous, customer, or administrator role, including seeded customer, service,
  invoice, and printable-invoice detail routes. Reviewed representative public,
  portal, and administrator screens visually in the live application.
- Reconciled the live behavior with API controllers, shared query contracts,
  worker/scheduler responsibilities, capability/release documentation, and the
  primary Playwright lifecycle. No order, payment, ticket, service, provider,
  settings, or other business record was changed; inspection created only normal
  authenticated-session audit evidence.
- Created `docs/PRODUCT_EXPERIENCE_ROADMAP.md` with the required complete route and
  capability inventory, safety invariants, independent public benchmark, workflow
  gap matrix, explicit affordance/navigation/scale/shortcut findings, deliberate
  non-goals, prioritization, and production readiness boundary.
- Verified current official public WHMCS documentation only for workflow concepts
  around client/service context, order review, billing stages, automation evidence,
  and support queues. No licensed system, private material, code, copy, screenshot,
  styling, or trade dress was accessed or used.
- Defined exactly three separately gated, pull-request-sized commands: Command 76
  repairs public entry and plan selection; Command 77 makes administrator customer
  context actionable; Command 78 turns the portal overview into an ownership-bound
  next-action home. None was implemented and no starter issue was published.

#### Files changed

- `docs/PRODUCT_EXPERIENCE_ROADMAP.md` — added the evidence-led product roadmap
- `CODEX_DEVELOPMENT_COMMANDS.md` — added exactly Commands 76–78
- `docs/DECISIONS.md` — recorded journey-first sequencing in ADR-052
- `CHANGELOG.md` — recorded the product-experience roadmap
- `docs/PROGRESS.md` — recorded Command 75 scope, evidence, decisions, and handoff

#### Validation

- `pnpm demo:doctor` passed Docker CLI, Compose, Engine, fixed-loopback-port, and
  redacted runtime-file checks before startup.
- The first cold `pnpm demo:up` build did not complete because concurrent API/web
  package retrieval repeatedly encountered registry latency/errors. The API image
  then built successfully by itself. Repository history confirmed no application
  source affecting the existing web/initializer images had changed since their
  build, so the stack was started from those current local images without rebuilding
  them. This recovery did not reset Docker or business data.
- Initial fictional seeding encountered one transient PostgreSQL transaction-start
  timeout. A non-destructive retry succeeded and PostgreSQL, Redis, API, web, and
  fake gateway became healthy; the initializer completed successfully.
- `pnpm demo:smoke` passed the fixed `/ready`, `/hosting`, `/portal`, and `/admin`
  read-only evaluator path with fictional identities and fixed loopback targeting.
- Manual live inspection covered all public/account, customer, and administrator
  pages in `apps/web/src/app`, including valid seeded dynamic routes. DOM review was
  used for the complete inventory, with additional visual review of the catalogue,
  customer portal, and administrator customer page; stored screenshots were not
  substituted for live evidence.
- All seven official public comparison links in the roadmap were opened and
  verified on 2026-10-03.
- `pnpm demo:down` stopped the demo non-destructively and retained its dedicated
  fictional database volumes and generated credentials.
- `pnpm docs:check`, `pnpm format:check`, and `git diff --check` passed.
- Command 75 implementation commit `5d0f05c` passed hosted CI run `37112708623`,
  including full-history secret scanning, database verification, offline
  documentation, formatting, lint, strict type checks, package/API/invariant/browser
  tests, dependency/license checks, and the production build. Hosted CodeQL run
  `37112708610` also passed.

#### Decisions made

- Repair journey trust before adding breadth: public storefront truthfulness,
  administrator customer context, and customer next-action clarity are the first
  three bounded slices.
- Keep search/pagination, inactive workspace chrome, order/payment review,
  service-focused operations, automation freshness, and financial-policy review as
  explicit P1 roadmap work rather than expanding Commands 76–78.
- Treat public WHMCS material only as a source of workflow questions. Webhost Billing
  remains an independent, smaller, single-business product with no parity promise.
- Preserve role/ownership enforcement, server-authoritative integer money,
  immutable financial history, separate payment/provisioning/service states, fake
  provider evidence, and exact permanent-termination confirmation in every slice.

#### Open questions and risks

- Cold concurrent Docker builds remain sensitive to npm registry throughput. At the
  end of the audit, Docker data remained on `D:`; approximately 15.4 GB was free on
  `C:` and 10.9 GB on `D:`. This is an environment capacity risk, not evidence of a
  product defect.
- The safe demo omits worker/scheduler execution and real provider delivery by
  design. Its route audit cannot replace credentialed sandbox acceptance, monitoring,
  recovery rehearsal, or a real operator pilot.
- The roadmap records P1 trust/scale gaps still outside Commands 76–78: fixed
  first-100 ledgers, inactive search/notification chrome, disconnected
  order/payment/service context, automation freshness, and a one-click global
  partial-payment policy change.
- Production remains `NO-GO`; no application code, schema, authentication,
  financial/provider rule, release, deployment, hosted installation, or real data
  changed in Command 75.

#### Recommended next command

After this documentation-only command is delivered to `origin/main` and hosted CI
and CodeQL pass, authorize **Command 76 — Repair the Public Storefront Entry and Plan
Selection** separately. Do not begin Commands 77–78 automatically.

### Command 76 — Repair the Public Storefront Entry and Plan Selection

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-03

#### Scope completed

- Replaced the anonymous root redirect with a small independent public entry page in
  the existing storefront shell. It now provides real local navigation targets for
  the displayed home, plan, why-us, support, registration, and sign-in links.
- Made public plan selection deterministic from currently active prices. Monthly is
  preferred when available, followed by quarterly and annual periods, with stable
  currency ordering and an honest fallback to the first available combination.
- Kept unavailable periods disabled, preserved the selected product and price IDs in
  the exact checkout URL, and retained server-side price and total revalidation.
- Added an explicit all-prices-unavailable state with no checkout action and a local
  support route rather than presenting a false purchasable state.
- Extended component and Chromium lifecycle evidence across the public root,
  fragment navigation, registration/sign-in routes, first-render plan selection,
  exact checkout identifiers, and authenticated catalogue-to-checkout continuity
  without placing an order during that new assertion.
- Updated the product and bilingual safe-demo guidance for the repaired evaluator
  path. No promotion, telemetry, CMS, schema, provider, payment, financial-rule,
  release, deployment, or production-readiness scope was added.

#### Files changed

- `apps/web/src/app/(store)/page.tsx` — added the public entry page and metadata
- `apps/web/src/app/layout.tsx` — declared the existing smooth-scroll behavior for
  framework-managed fragment navigation
- `apps/web/next.config.ts` — removed the contradictory root-to-login redirect
- `apps/web/src/components/layout/public-storefront.test.tsx` — added public shell,
  landmark, fragment-target, and route coverage
- `apps/web/src/components/products/public-product-catalog.tsx` — added deterministic
  active-price selection and the unavailable-pricing state
- `apps/web/src/components/products/product-management.test.tsx` — covered initial,
  fallback, unavailable-period, empty-pricing, and exact-checkout behavior
- `apps/web/e2e/specs/hosting-lifecycle.spec.ts` — extended the complete lifecycle
  through anonymous entry and authenticated checkout selection
- `apps/web/e2e/smoke-safe-demo.ts`,
  `apps/web/e2e/capture-demo-screenshots.ts`, and
  `apps/web/e2e/audit-safe-demo-accessibility.ts` — verified the first-render monthly
  state without an exploratory click
- `docs/PRODUCTS_AND_PRICING.md`, `docs/PRODUCT_EXPERIENCE_ROADMAP.md`,
  `docs/SAFE_EVALUATION_DEMO.md`, and `docs/SAFE_EVALUATION_DEMO_BN.md` — documented
  the public path, deterministic selection, and remaining boundaries
- `CHANGELOG.md` and `docs/PROGRESS.md` — recorded the bounded delivery

#### Validation

- Focused Vitest coverage passed: 2 files and 5 tests.
- The complete web Vitest suite passed serially: 20 files and 58 tests.
- API Jest passed: 23 suites and 88 tests. Worker Jest passed: 10 suites and 29
  tests. Shared and queue package tests passed: 26 and 3 tests respectively.
- The root package-test orchestration also passed all demo-command, documentation,
  shared, and queue suites. Its initially parallel web run encountered host-memory
  timing pressure; the complete web suite was rerun serially and passed. No failing
  product assertion remains.
- The focused Chromium hosting lifecycle passed: 1 test, including the anonymous
  root-to-catalogue path and authenticated catalogue-to-checkout continuation.
- `pnpm demo:doctor` passed all read-only Docker, Compose, Engine, loopback-port, and
  redacted-runtime checks. A fresh safe-demo image build completed successfully and
  generated `/` as a static route. The first smoke attempt passed `/ready`,
  `/hosting`, and `/portal` while the just-built admin path was still settling; an
  immediate stable retry passed `/ready`, `/hosting`, `/portal`, and `/admin` with no
  business or Docker state mutation. `pnpm demo:down` then stopped the demo while
  retaining fictional data and credentials.
- The Next.js production build passed and generated all 29 application pages.
- Repository lint, strict workspace typechecking, `pnpm docs:check`,
  `pnpm format:check`, and `git diff --check` passed.
- Command 76 implementation commit `2abd595` passed hosted CI run `37118867714`,
  including full-history secret scanning, database verification, offline
  documentation, formatting, lint, strict type checks, package/API/invariant/browser
  tests, dependency/license checks, and the production build. Hosted CodeQL run
  `37118867662` also passed.

#### Decisions made

- Prefer a currently available monthly price, then quarterly and annual, while
  keeping deterministic currency ordering. This makes the common plan visible on
  first render without misrepresenting unavailable periods.
- Keep all public entry links local and backed by real routes or in-page targets.
  The page is an independent Webhost Billing entry, not a competitor-derived clone.
- Preserve checkout authority on the server. Query parameters carry selection only;
  they do not establish an authoritative price or total.
- Leave general post-login return navigation as a documented P1 gap outside this
  bounded command.

#### Open questions and risks

- Anonymous selection does not yet survive a separately completed sign-in flow;
  general return navigation remains intentionally deferred.
- Docker startup initially failed on a stale local secrets-engine socket after the
  interrupted session. The stale state was isolated in a recoverable local backup,
  Docker restarted against its existing `D:` data, and both development services
  and the safe demo recovered without a reset. Docker image unpacking remains slow
  on the constrained local disks.
- The safe demo still uses fictional providers and omits worker/scheduler execution
  by design. Production remains `NO-GO`; this command does not establish provider,
  monitoring, recovery, or live-business acceptance evidence.

#### Recommended next command

After this command is delivered to `origin/main` and hosted CI and CodeQL pass,
authorize **Command 77 — Make Administrator Customer Context Actionable** separately.
Do not begin Command 77 automatically.

### Command 77 — Make Administrator Customer Context Actionable

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-03

#### Scope completed

- Reordered administrator customer detail so account identity, access and
  verification status, linked totals, and bounded recent business records precede
  optional profile and billing edit forms.
- Replaced raw minor-unit wording with the existing bigint-safe currency formatter
  and rendered customer and linked-record dates in the configured business time
  zone obtained from the administrator settings boundary.
- Made linked totals navigable. Recent invoices open the existing administrator
  invoice detail; orders, services, payments, and tickets open their corresponding
  ledgers with an explicit URL-bound `customerId` filter.
- Added strict single-UUID parsing for administrator customer context. Each target
  ledger displays the resolved customer name/number, provides a clear action,
  identifies customer-specific empty results, and sends the filter through the
  existing API contract. Repeated or malformed values are ignored and explicitly
  reported without inferring a customer.
- Preserved the bounded customer aggregate, role/ownership authorization,
  immutable financial records, separate lifecycle states, and existing exact
  permanent-termination gate. No new record-detail route, schema, provider,
  mutation, deployment, release, or production-approval scope was added.
- Extended component, API integration, and fictional Chromium lifecycle evidence
  from customer search through customer context, direct invoice detail, and a
  customer-filtered order ledger without editing a record.

#### Files changed

- `apps/web/src/components/customers/admin-customer-detail.tsx` — reordered the
  screen, applied safe money/business-time presentation, and added protected record
  navigation
- `apps/web/src/lib/admin-customer-filter.ts` and
  `apps/web/src/components/customers/admin-customer-filter-notice.tsx` — added the
  shared strict URL-filter and visible resolved/invalid context presentation
- `apps/web/src/app/(admin)/admin/{orders,services,invoices,payments,support}/page.tsx`
  — parsed the asynchronous App Router query and passed validated customer context
- `apps/web/src/components/{orders,services,invoices,payments,support}/admin-*-manager.tsx`
  — applied the existing API filter, resolved actual customer identity, preserved
  support filters, and added clear/customer-specific empty states
- `apps/web/src/lib/admin-customer-filter.test.ts`,
  `apps/web/src/components/customers/customer-management.test.tsx`, and
  `apps/web/src/components/orders/order-management.test.tsx` — covered strict
  parsing, ordering, safe display, link targets, apply/clear behavior, malformed
  context, and empty/recoverable failure states
- `apps/api/test/{orders,services,invoices,payments,tickets}.e2e-spec.ts` — proved
  the existing administrator `customerId` filters return only the requested
  customer's records
- `apps/web/e2e/specs/hosting-lifecycle.spec.ts` — added administrator-only customer
  route evidence and the read-only cross-record browser journey
- `docs/CUSTOMER_MANAGEMENT.md`, `docs/PRODUCT_EXPERIENCE_ROADMAP.md`,
  `CHANGELOG.md`, and `docs/PROGRESS.md` — documented the delivered behavior and
  retained product boundaries

#### Validation

- Focused Vitest coverage passed: 3 files and 13 tests.
- Focused API integration coverage passed in one clean run: 5 suites and 26 tests
  across orders, services, invoices, payments, and tickets. An earlier combined run
  exposed an extra-login rate-limit interaction in the invoice suite; the new
  assertion was folded into its existing authenticated flow and the clean rerun
  passed.
- The complete Chromium hosting lifecycle passed: 1 test in 2.2 minutes, including
  customer-role denial, administrator customer search, direct invoice detail, and
  customer-filtered order navigation without record edits.
- The root package-test orchestration passed, including all demo/documentation
  tests, 26 shared tests, 3 queue tests, 66 web tests, 88 API tests, and 29 worker
  tests.
- The complete workspace production build passed; Next generated all 29 web pages
  and both NestJS applications built successfully.
- `pnpm docs:check`, `pnpm format:check`, repository lint, strict workspace
  typechecking, and `git diff --check` passed.
- Command 77 implementation commit `4405000` passed hosted CI run `37121397104`,
  including full-history secret scanning, database verification, offline
  documentation, formatting, lint, strict type checks, package/API/invariant/browser
  tests, dependency/license checks, and the production build. Hosted CodeQL run
  `37121397133` also passed.

#### Decisions made

- Treat URL customer context as untrusted input: accept exactly one valid UUID,
  resolve the real customer server-side, and never derive identity from URL text.
- Reuse existing protected list contracts rather than creating four new
  administrator record-detail routes. The one existing invoice detail remains the
  direct destination.
- Keep the filtered ledger's bounded creation/control surfaces intact while making
  the list and relevant invoice selection customer-specific; broader ledger
  pagination and connected review remain P1 roadmap work.
- Use the existing safe currency formatter and administrator settings time zone;
  no monetary arithmetic or authoritative state is moved into the browser.

#### Open questions and risks

- Core ledgers still request a bounded first page of 100 records. URL-bound
  pagination/search across all ledgers remains separate P1 work.
- Orders, services, payments, and tickets still lack dedicated administrator detail
  routes by design; Command 77 provides a filtered workspace rather than expanding
  route breadth.
- The safe demo still uses fictional providers and omits worker/scheduler execution.
  Production remains `NO-GO`; provider acceptance, monitoring, recovery rehearsal,
  operator pilot evidence, deployment, and live data remain outside this command.

#### Recommended next command

After this command is delivered to `origin/main` and hosted CI and CodeQL pass,
authorize **Command 78 — Turn the Customer Portal Overview Into a Next-Action Home**
separately. Do not begin Command 78 automatically.

### Command 78 — Turn the Customer Portal Overview Into a Next-Action Home

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-03

#### Scope completed

- Added a dedicated customer-only, ownership-guarded portal summary endpoint and a
  strict shared contract. It derives the complete owned account's outstanding
  balance/count, overdue count and earliest outstanding invoice, earliest due active
  or suspended service, and separate customer/staff support queues.
- Kept integer minor units in the database and lossless decimal strings at the API
  boundary. The API refuses mixed outstanding currencies rather than combining
  them, and its bounded ten-record lists remain secondary display context only.
- Rebuilt `/portal` around an explicit priority order: payment, suspended service,
  and customer reply are primary actions with direct permitted links; active renewal
  and staff-owned support are informational. Paid zero-balance history cannot become
  a payment action.
- Added distinct attention, healthy, first-use empty, loading, and recoverable failure
  states before account totals and recent activity.
- Added shared-contract, API service/controller, component, and fictional Chromium
  evidence for lossless serialization, complete-account aggregates, mixed invoice
  states, active/suspended service states, customer/staff ticket states, empty state,
  ownership denial, priority/link rules, an action-needed customer, and a healthy
  customer with only paid zero-balance history.
- Updated the safe-demo verifier for the current storefront and next-action portal.
  No mutation, database schema, real provider, release, deployment, or production
  scope was added.

#### Files changed

- `packages/shared/src/contracts/customers.ts` and
  `packages/shared/test/contracts.spec.ts` — added and tested the strict bounded
  portal-summary contract and safe-money boundary
- `apps/api/src/modules/customers/customer.service.ts`,
  `apps/api/src/modules/customers/customer.service.spec.ts`, and
  `apps/api/src/modules/customers/customer.controller.ts` — derived complete-account
  action facts and exposed the customer-only owned endpoint
- `apps/api/test/customers.e2e-spec.ts` — covered the successful owner response and
  administrator/other-customer denial
- `apps/web/src/components/dashboard/customer-portal-overview.tsx` and its test —
  implemented the next-action hierarchy, direct links, healthy/empty/error states,
  and secondary recent activity
- `apps/web/e2e/fixtures.ts`, `apps/web/e2e/prepare-environment.ts`, and
  `apps/web/e2e/specs/hosting-lifecycle.spec.ts` — added healthy paid-history data
  and action-needed/healthy browser evidence
- `apps/web/e2e/smoke-safe-demo.ts` — aligned fixed read-only demo assertions with
  the repaired storefront and portal
- `docs/CUSTOMER_MANAGEMENT.md`, `docs/PRODUCT_EXPERIENCE_ROADMAP.md`,
  `docs/DECISIONS.md`, `CHANGELOG.md`, and `docs/PROGRESS.md` — documented the
  endpoint, delivered roadmap slice, ADR-053, and validation evidence

#### Validation

- Shared contracts passed: 28 tests, including lossless portal balances and the
  ten-record recent-list bound.
- Focused API service tests passed: 5 tests covering full-account aggregation,
  paid/unpaid/overdue history, suspended service, both ticket responsibilities,
  empty state, lossless bigint serialization, and mixed-currency refusal. Customer
  API E2E passed: 2 workflows including owner access and role/ownership denial.
- Focused web component tests passed: 4 tests covering action priority, direct links,
  paid zero-balance demotion, healthy, first-use empty, and failure behavior.
- The complete Chromium hosting lifecycle passed: 1 test in 1.8 minutes, including
  an action-needed customer and a distinct fictional healthy customer.
- `pnpm demo:doctor` passed. The production-shaped safe-demo images built, and the
  final `pnpm demo:smoke` passed `/ready`, `/hosting`, `/portal`, and `/admin` without
  business or Docker mutation. Earlier smoke attempts exposed stale ambiguous UI
  selectors; they were corrected to role-specific current-product evidence before
  the passing rerun. `pnpm demo:down` retained fictional data and credentials.
- `pnpm docs:check`, `pnpm format:check`, repository lint, strict workspace
  typechecking, and the complete production build passed; Next generated all 29 web
  pages and both NestJS applications built successfully.
- The complete shared, queue, web, and API package suites passed with 28, 3, 67, and
  91 tests respectively. The initial concurrent worker run had three five-second
  database timeouts after the Docker build; the complete worker package was rerun
  serially and passed all 10 suites and 29 tests. No failing assertion remains.
- Command 78 implementation commit `c54bb14` passed hosted CI run `37125002385`,
  including full-history secret scanning, database verification, offline
  documentation, formatting, lint, strict type checks, package/API/invariant/browser
  tests, dependency/license checks, and the production build. Hosted CodeQL run
  `37125002373` also passed.

#### Decisions made

- Treat the API aggregate as the authority for portal actions. The browser formats
  and prioritizes returned facts but does not reconstruct account balances from
  recent records.
- Select the earliest positive-balance unpaid/overdue invoice and earliest due
  active/suspended service across the full owned account. Treat `OPEN` and
  `WAITING_FOR_STAFF` tickets as staff-owned work and
  `WAITING_FOR_CUSTOMER` as the customer's next action.
- Fail closed on multiple outstanding currencies because multi-currency accounting
  remains outside the accepted single-business scope.
- Keep the endpoint customer-only even though administrators may access general
  customer detail; the endpoint is specifically a portal presentation boundary.

#### Open questions and risks

- Core ledgers still silently cap at the first 100 records, workspace search and
  notification chrome remain inactive, and automation freshness and connected
  order/payment/service review remain recorded P1 gaps for phase review.
- The worker package's fixed five-second integration limits remain sensitive to
  concurrent local Docker/disk pressure; the clean serial rerun is the accepted
  complete-package evidence for this command.
- The safe demo remains fictional and omits worker/scheduler execution and real
  provider delivery. Production remains `NO-GO`; provider acceptance, monitoring,
  recovery rehearsal, policies, operator pilot, deployment, and live data remain
  separately gated.

#### Recommended next command

After this command is delivered to `origin/main` and hosted CI and CodeQL pass,
authorize **Phase Review — Review Commands 76–78 and define the next bounded
command**. Do not begin another implementation command automatically.

### Phase Review — Review Commands 76–78 and Define Command 79

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-03

#### Scope completed

- Reviewed Commands 76–78 against their exact command text, `AGENTS.md`, the product
  plan, ADRs 051–053, implementation diffs, shared/API/web contracts, component and
  browser tests, command reports, and final hosted evidence.
- Confirmed Command 76 provides an honest public entry, valid local navigation,
  deterministic active-price selection, unavailable-price handling, and exact
  server-revalidated checkout identifiers without adding post-login return scope.
- Confirmed Command 77 puts administrator customer context before editing, uses safe
  money and configured-time-zone presentation, and connects existing protected
  detail/list routes through validated, visible, clearable server-side customer
  filters without creating broad new detail surfaces.
- Confirmed Command 78 derives customer actions from the complete ownership-bound
  account on the server, preserves lossless monetary serialization, separates
  payment/service/support responsibility, and keeps bounded recent records secondary.
- Found no missing acceptance requirement, regression, authorization weakness, or
  corrective application change within the three delivered commands.
- Reassessed the remaining P1 gaps by operator/customer frequency, financial or
  service risk, manual effort, dependency readiness, and bounded testability. The
  partial-payment toggle is the only documented one-click financial-policy shortcut;
  both current API write routes are already administrator-only and audited, making a
  server-enforced transition review the highest-risk, most bounded next slice.
- Added ADR-054 and defined exactly one separately gated **Command 79 — Guard
  Partial-Payment Policy Changes**. No application behavior, business record,
  schema, provider, deployment, release, or production-readiness state changed.

#### Files changed

- `CODEX_DEVELOPMENT_COMMANDS.md` — added the bounded, separately gated Command 79
- `docs/DECISIONS.md` — recorded the risk-led sequencing and server-enforced policy
  confirmation boundary in ADR-054
- `docs/PRODUCT_EXPERIENCE_ROADMAP.md` — recorded the completed first-set review,
  selected next slice, and retained P1 gaps
- `CHANGELOG.md` — recorded the product-phase review and next-command selection
- `docs/PROGRESS.md` — updated current state and recorded review evidence

#### Validation

- Reconciled clean synchronized `main` before edits and reviewed the focused commits
  and delivery reports for Commands 76–78. Their final implementation commits had
  successful hosted CI and CodeQL evidence recorded before this review.
- `pnpm docs:check` passed all four offline documentation validators.
- `pnpm format:check`, repository lint, strict workspace typechecking, and
  `git diff --check` passed.
- Complete `pnpm test` passed every demo/documentation suite plus 28 shared, 3 queue,
  67 web, and 91 API tests. The concurrent worker stage hit two existing five-second
  database timeouts after the other packages completed; a complete serial worker
  rerun passed all 10 suites and 29 tests, leaving no failing assertion.
- The complete workspace production build passed; Next generated all 29 web pages
  and both NestJS applications built successfully.
- Phase-review commit `06cb29a` passed hosted CI run `37127827031`, including
  full-history secret scanning, database verification, offline documentation,
  formatting, lint, strict type checks, package/API/invariant/browser tests,
  production dependency/license checks, and the production build. Hosted CodeQL run
  `37127827051` also passed.
- The push reported one high-severity development dependency alert. A fresh
  `pnpm audit --prod` found no known production vulnerability; full `pnpm audit`
  traced the alert to `braces <=3.0.3` through the web lint-only
  `eslint-config-next > fast-glob > micromatch` chain. Remediation remains separate
  dependency-maintenance work rather than an unreported runtime risk.

#### Decisions made

- Prioritize the explicitly unsafe financial-policy shortcut before adding broader
  workflow convenience. Frequency alone does not outweigh the consequence of an
  accidental change to future payment acceptance.
- Keep one canonical editable partial-payment policy in administrator settings. The
  payment ledger should show the effective value as operational context and link to
  settings, not provide a duplicate mutation.
- Enforce confirmation on an actual stored-value transition at both API write paths,
  not only in React. An unchanged save remains idempotent and does not demand a false
  confirmation ceremony.
- Keep audit metadata to the safe old/new policy values. Command 79 is not authority
  to mutate balances or historical records, build a general approval system, or
  absorb adjacent P1 work.

#### Open questions and risks

- General settings currently saves one complete business-settings document. Command
  79 must retain a trusted persisted baseline so an administrator can cancel the
  policy review without discarding unrelated draft edits or misreporting current
  state.
- The existing payment-specific and general-settings APIs can both persist the same
  value. Command 79 must apply one shared strict transition contract and prove that
  neither route bypasses confirmation while preserving compatibility for unchanged
  saves.
- Connected order/payment review, URL-bound pagination for core ledgers, dashboard
  attention, automation freshness, service-focused context, checkout continuity,
  and inactive workspace search/notification chrome remain P1 gaps. Their sequence
  requires a later review; none is implicitly authorized by Command 79.
- Production remains `NO-GO`; fictional evaluation and green local/hosted checks do
  not satisfy provider, SMTP, monitoring, recovery, policy, infrastructure, or
  operator-pilot gates.
- The lint-only `braces` advisory remains open on the default branch at review time.
  Production dependencies audit clean, but the development dependency should be
  updated through the existing reviewed dependency workflow rather than ignored.

#### Recommended next command

After this phase review is delivered to `origin/main` and hosted CI and CodeQL pass,
authorize **Command 79 — Guard Partial-Payment Policy Changes** separately. Do not
begin Command 79 automatically.

### Staging Deployment — Deploy Current Main

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-03

#### Scope completed

- Deployed all application changes through the Commands 76–78 phase review to the existing
  isolated staging environment at `https://my.speedhost.bd`; production was not touched.
- Confirmed the pinned shared host, isolated release root, current service inventory,
  protected file permissions, 88 GB of host free space, healthy seven-service staging
  stack, 21 completed migrations, and successful Nginx configuration before mutation.
- Created and fully verified an encrypted pre-deployment PostgreSQL backup before the
  application switch.
- Built Linux/amd64 non-root migration, API, web, and worker images, transferred them
  directly without a temporary Windows archive, and verified matching local/remote image
  digests.
- Corrected the migration and worker image builds to normalize the shared shell entrypoint
  from Windows CRLF to Linux LF. The first migration candidate failed before database
  access; the rebuilt entrypoint passed in-container content and shell-syntax checks.
- Ran the corrected one-shot migration image twice during release alignment; both successful
  runs found 21 migrations and no pending migration.
- Atomically selected release `71558a8`, set all application images to that exact tag, and
  recreated only `api`, `web`, `worker`, and `scheduler`. PostgreSQL, Redis, and Mailpit
  remained running.
- Created deterministic `rollback-pre-a0a7354` image aliases and a protected executable
  rollback environment because the prior deployment used mixed historical image tags.
- Removed the four local release image tags after verified remote delivery and pruned
  33.85 GB of unused BuildKit cache without removing containers, volumes, databases, or
  the separate Docker backup VHD.
- Trimmed 34.1 GiB of freed blocks, stopped only the local Docker Desktop engine, and
  compacted its exact active VHD from 50.67 GB to 17.77 GB. This restored `D:` from
  1.88 GB to 34.78 GB free while preserving the separate 27.61 GB pre-upgrade backup VHD.
- Preserved fake-provider posture and left Command 79 separately gated and unauthorized.

#### Files changed

- `apps/worker/Dockerfile` — normalizes the shared runtime entrypoint before dropping to the
  non-root user
- `deploy/production/migration/Dockerfile` — normalizes the migration entrypoint before
  dropping to the non-root user
- `CHANGELOG.md` — records the cross-platform deployment-image correction
- `docs/STAGING_DEPLOYMENT.md` — records the current release, backup, image evidence,
  validation, isolation, and executable rollback procedure
- `docs/PROGRESS.md` — records this operational deployment report

#### Validation

- Local and remote image inspection passed for Linux/amd64, UID/GID `10001:10001`, and
  matching digests. The web production build generated all 29 routes successfully.
- In-container CRLF absence and `bash -n` checks passed for the migration and worker
  entrypoints. `git diff --check` passed.
- The encrypted backup passed SHA-256, OpenPGP integrity, archive-structure, required-table,
  PostgreSQL-version, and migration-history verification. Its SHA-256 is
  `bfaa3c4e897812c2d6eca3361bafbbadea9b5388b6c8eb03531f9bb78ba668ba`.
- Final Compose configuration validation and one-shot migration passed with 21 migrations
  and no pending migration.
- Final `api`, `web`, `worker`, and `scheduler` containers are healthy on tag `71558a8` with
  zero restarts; exactly one scheduler is running. PostgreSQL, Redis, and Mailpit retained
  their prior healthy containers.
- `/health` returned `OK`; `/ready` returned `READY` with PostgreSQL and Redis `UP`.
  `/`, `/hosting`, `/login`, and `/admin` returned 200; anonymous `/portal` returned the
  expected 307.
- Browser API-origin inspection passed. Clean Chromium passed the administrator settings
  route and the public storefront with one live selectable plan.
- Credentialed staging smoke passed administrator and customer login, protected pages and
  APIs, customer denial from administrator data, invoice detail/PDF, support detail,
  password-reset queueing, logout, and logged-out rejection.
- Credentialed payment gateways remained disabled. Fake payment and hosting-panel adapter
  contracts passed. Mailpit contained the generated staging messages.
- Application logs contained zero error-level entries. Nginx configuration validation
  passed without a reload. NodeWatch and RemotePilot public endpoints returned valid 307s,
  and unrelated MessageDock, NodeWatch, RemotePilot, and Travel Mate containers remained
  running.
- The deterministic rollback Compose configuration and all three prior application image
  aliases were verified without switching away from the healthy release.
- Local Docker Engine 29.8.1 restarted successfully after offline VHD compaction, reported
  zero build-cache bytes, and returned both retained PostgreSQL and Redis containers to a
  healthy state. PostgreSQL accepted connections, and the active VHD and `D:` free-space
  measurements confirmed the expected compaction result.

#### Decisions made

- Treat deployment as staging-only operational work, not authorization for Command 79,
  production, real providers, data import, or broad shared-host maintenance.
- Preserve the host reverse proxy and stateful containers; switch only release-scoped
  application processes and use the existing loopback listeners.
- Normalize shell entrypoints inside every image that consumes the shared script so builds
  remain reliable from Windows worktrees without depending on checkout line endings.
- Use exact commit-tagged images for the final release and explicit rollback aliases for the
  older mixed-tag state.

#### Open questions and risks

- Production remains `NO-GO`; real payment, hosting-panel, registrar, and public SMTP
  acceptance, monitoring, off-site immutable backup, timed restore rehearsal, policy
  approval, infrastructure review, and operator pilot remain required.
- The verified backup and its passphrase remain on the same staging server; this is not an
  off-site or immutable recovery copy.
- Future image builds can grow the dynamic Docker VHD again. BuildKit cleanup, filesystem
  trim, and an offline compaction should be repeated when free space becomes constrained;
  the protected 27.61 GB pre-upgrade backup VHD remains intentionally retained. No
  unrelated image, container, volume, database, or backup-VHD cleanup was attempted.
- Command 79 remains separately gated and unauthorized.

#### Recommended next command

After this deployment report is delivered and hosted CI and CodeQL pass, authorize
**Command 79 — Guard Partial-Payment Policy Changes** separately. Do not begin Command 79
automatically.

### Command 79 — Guard Partial-Payment Policy Changes

- **Status:** Completed and delivered; local validation, hosted CI, and CodeQL passed
- **Date:** 2026-10-03

#### Scope completed

- Replaced the payment ledger's enable/disable button with effective read-only policy
  context and a protected link to `/admin/settings#billing-policy`.
- Kept the persisted partial-payment value separate from the editable settings draft.
  Save now reviews current/proposed values and the exact consequences for future
  manual submissions, administrator recording, and pending-reference verification.
- Cancellation restores the saved policy without losing unrelated draft edits. A
  failed save retains the review and draft for retry, and an unavailable persisted
  baseline cannot be saved as guessed defaults.
- Added strict request-only confirmation contracts; response and stored settings
  remain ordinary policy data. Both existing API write routes use one transactional
  guard requiring `CHANGE_PARTIAL_PAYMENT_POLICY` for an actual value transition.
- Serialized cross-route writes with the same PostgreSQL advisory lock, including
  the initially absent default policy. Unchanged saves require no confirmation and
  create no transition audit; actual changes retain one safe old/new boolean audit.
- Extended the fictional browser lifecycle to navigate from payments to settings,
  review and cancel, and prove zero write requests, unchanged policy, and no new
  transition audit. Confirmed mutations are exercised only in API/component fixtures.

#### Files changed

- Contracts: `packages/shared/src/contracts/payments.ts`,
  `packages/shared/src/contracts/settings.ts`, `packages/shared/test/settings.spec.ts`
- API: `apps/api/src/modules/payments/partial-payment-policy.ts`,
  `apps/api/src/modules/payments/partial-payment-policy.spec.ts`,
  `apps/api/src/modules/payments/payment.service.ts`,
  `apps/api/src/modules/payments/payment.controller.ts`,
  `apps/api/src/modules/settings/settings.service.ts`,
  `apps/api/src/modules/settings/settings.controller.ts`
- API fixtures: `apps/api/test/settings.e2e-spec.ts`,
  `apps/api/test/payments.e2e-spec.ts`
- UI: `apps/web/src/components/settings/settings-manager.tsx`,
  `apps/web/src/components/settings/settings-manager.test.tsx`,
  `apps/web/src/components/payments/admin-payment-manager.tsx`,
  `apps/web/src/components/payments/payment-management.test.tsx`,
  `apps/web/src/components/ui/confirmation-dialog.tsx` (scrollable small-screen review)
- Browser: `apps/web/e2e/specs/hosting-lifecycle.spec.ts`
- Evidence: `CHANGELOG.md`, `docs/PRODUCT_EXPERIENCE_ROADMAP.md`,
  `docs/CRITICAL_BUSINESS_INVARIANTS.md`, `docs/PROGRESS.md`

#### Validation

- Shared contract tests passed all 29 tests, including strict confirmation values,
  unchanged request compatibility, and response exclusion of the request-only field.
- API transition unit tests passed all 7 cases; the complete API unit suite passed
  all 24 suites and 98 tests. Both payment/settings API E2E suites passed together
  (9 tests), including administrator-only access, missing/incorrect confirmation,
  enable/disable persistence, unchanged saves, exact safe audit metadata, concurrent
  cross-route transitions, and preservation of pending payment/invoice records.
- The root test run passed all 57 demo/documentation tests plus 29 shared and 3 queue
  tests, then failed on concurrent web timeouts and a subsequent ticket-text mismatch.
  A clean complete web rerun with one worker passed all 21 files and 73 tests;
  complete serial API and worker reruns passed 98 and 29 tests respectively. No test
  timeout was increased or assertion weakened.
- An added payment fixture initially caused a sixth administrator login to exceed
  the real five-login limit; reuse of the already authenticated session corrected
  the fixture. The subsequent combined API run passed without its initial 429 and
  follow-on CSRF failures.
- `pnpm docs:check`, `pnpm format:check`, repository lint, strict workspace type
  checking, and `git diff --check` passed. Strict checks caught and resolved untyped
  test mocks and the second settings-save button's old handler.
- The complete production build passed: Next generated all 29 pages and both NestJS
  applications built successfully.
- The complete Chromium lifecycle passed in 2.0 minutes on the final code, including
  desktop/header and 375-pixel mobile/footer policy review/cancellation, zero settings
  write requests, unchanged seeded policy, and no transition audit. The initial
  browser run also passed. An intermediate overlapping build removed worker output
  used by the automation fixture; the accepted final rerun executed alone after the
  completed production build.
- Implementation commit `200abd4b4adb50853313b993d35b34e829376090` was reconciled
  without history rewriting and pushed to `origin/main`. Hosted
  [CI run 37138081618](https://github.com/ebit101/webhost-billing/actions/runs/37138081618)
  and
  [CodeQL run 37138081568](https://github.com/ebit101/webhost-billing/actions/runs/37138081568)
  both completed successfully for that commit. CI also passed the full API integration
  and critical-invariant suites, complete browser lifecycle, production dependency
  audit, license inventory, and production build. Dependency review was skipped as
  expected for a push event. No deployment or release was performed.

#### Decisions made

- Implement ADR-054 with one canonical administrator review using the existing
  accessible confirmation dialog and a request-only literal shared by both routes.
- Compare against the stored value inside the transaction, rather than trusting a
  client baseline; serialize both writers to preserve accurate old/new audit evidence.
- Keep the general business-settings save atomic. The review explicitly states that
  other draft settings are saved too; cancellation changes only the policy draft.

#### Open questions and risks

- Other administrators can change a policy after this page loads. The API compares
  the latest stored value and rejects an unconfirmed transition; reload settings to
  obtain the current baseline if another administrator has changed it.
- Production remains `NO-GO`. Existing provider, SMTP, monitoring, off-site recovery,
  policy, infrastructure, and operator-pilot gates remain separately required.
- The previously recorded lint-only `braces` advisory remains separate dependency
  maintenance. Broader P1 product work remains outside this command.

#### Recommended next command

Authorize **Phase Review — Review Command 79 and define the next bounded command**
separately. Do not begin another
implementation automatically.

### Phase Review — Review Command 79 and Define Command 80

- **Status:** Review completed; next implementation defined but not authorized
- **Date:** 2026-10-03

#### Scope completed

- Reviewed Command 79 against its exact command, permanent rules, product plan,
  ADR-054, implementation and report commits, strict shared contracts, both API
  controllers/services, transaction helper, settings/payment UI, and unit,
  integration, component, and browser assertions.
- Confirmed the payment ledger is read-only for policy; settings separates saved
  and draft values, reviews both transition directions, preserves unrelated edits
  on cancellation, retains failures for retry, and disables saving unknown defaults.
- Confirmed both administrator-only API writers use the same stored-value guard
  and transaction advisory lock. Missing/wrong confirmation cannot change policy;
  unchanged saves create no transition audit; concurrent same-target changes retain
  one audit containing only the safe old/new boolean values. Request confirmation
  is not stored or returned. Existing payment/invoice records remain unchanged.
- Reviewed desktop/header and mobile/footer browser cancellation assertions proving
  zero policy writes, an unchanged seeded setting, and no transition audit.
- Identified no in-scope corrective application change. This review changes only
  documentation and sequencing, not business behavior or records.
- Reassessed remaining P1 work. Selected the core anonymous purchase handoff over
  broader operator detail, pagination, dashboard, service, and automation work:
  `proxy.ts` and `requireWorkspaceRole` currently discard checkout selection at
  sign-in, `LoginForm` always sends customers to `/portal`, registration links do
  not carry selection, and `CustomerCheckout` silently substitutes the first
  product/price when the explicit pair is unavailable or mismatched.
- Defined exactly one separately gated **Command 80 — Preserve Hosting Plan
  Selection Through Customer Sign-In**, with strict allowlisted intent, current
  catalogue revalidation, explicit unavailable states, and no automatic order.

#### Files changed

- `CODEX_DEVELOPMENT_COMMANDS.md` — bounded Command 80, acceptance, regression
  evidence, exclusions, and separate authorization boundary
- `docs/DECISIONS.md` — ADR-055 for fixed-route, untrusted checkout-selection intent
- `docs/PRODUCT_EXPERIENCE_ROADMAP.md` — Command 79 review outcome and selected slice
- `CHANGELOG.md` — documented review and next-command definition
- `docs/PROGRESS.md` — current state, evidence, limitations, and exact next command

#### Validation

- Started from clean `main` at `f9e21aa76f0349af797ebde8034d5cd063828756`, containing
  implementation `200abd4` and its delivery report. Rechecked that exact head's
  [CI run 37138594466](https://github.com/ebit101/webhost-billing/actions/runs/37138594466)
  and
  [CodeQL run 37138594465](https://github.com/ebit101/webhost-billing/actions/runs/37138594465)
  both completed successfully.
- Fresh shared tests passed all 29 cases, including strict confirmation contracts
  and response exclusion. Fresh policy unit tests passed all 7 cases. Fresh payment
  and settings component tests passed all 10 cases across 2 files with one worker.
- Fresh combined payment/settings API integration rerun passed all 9 tests in
  2 suites, including role guards, both write routes, exact transition audits,
  cross-route concurrency, and unchanged pending-payment/invoice evidence. Expected
  existing VM-module and PostgreSQL-driver deprecation warnings remained non-failing.
- Full build, package, invariant, and browser success for Command 79 is hosted
  evidence from the verified head, not claimed as a fresh full local rerun in this
  documentation-only review. No application correction required broader reruns.
- `pnpm docs:check` passed all four offline validators; repository-wide
  `pnpm format:check` and `git diff --check` passed. Diff review confirmed only the
  five declared documentation files changed, with no next-command implementation,
  business mutation, runtime artifact, provider action, or deployment. Remote
  reconciliation found the starting head synchronized with `origin/main` (0/0).

#### Decisions made

- Close the identified policy shortcut before expanding purchase or operator
  workflows; retain one canonical editable policy and server-side enforcement.
- Prioritize completing the exact catalogue-to-checkout journey next. A validated
  UUID pair is a hint, not pricing or authorization proof; reconstruct only the
  fixed local checkout path, retain default role-derived landings, and reject
  hostile or ambiguous return intent.
- An unavailable explicit selection must be visible, not replaced by a different
  plan. The server remains the order/pricing authority, and login never submits one.
- Include same-browser login/register navigation only. Cross-device/email/reset
  resume and a general return-navigation framework would expand the bounded slice.

#### Open questions and risks

- Another administrator can change policy after settings loads. Command 79 compares
  the latest stored value and rejects unconfirmed changes; it is not optimistic
  versioning for all business settings and does not claim to prevent every stale
  confirmed save. Broader section-level settings work remains P2.
- The catalogue can change during sign-in. Command 80 must revalidate availability,
  membership, and server-authoritative pricing instead of trusting carried IDs.
- The Next.js layout/session/proxy boundaries require a checkout-specific design
  that preserves expired-session intent without weakening authoritative guards;
  Command 80 must consult the bundled Next.js documentation and test both paths.
- Remaining operator connectivity, pagination, attention, automation freshness,
  service context, and inactive workspace chrome remain separate P1 gaps.
- The previously recorded lint-only `braces` advisory remains separate dependency
  maintenance. No dependency, provider, deployment, release, or schema changed.
- Production remains `NO-GO`; this review does not close credentialed providers,
  SMTP, monitoring, off-site recovery, policies, infrastructure, or operator-pilot
  gates and does not authorize live or staging changes.

#### Recommended next command

Authorize **Command 80 — Preserve Hosting Plan Selection Through Customer Sign-In**
separately after this review's delivery. Do not begin it automatically.

### Command 80 — Preserve Hosting Plan Selection Through Customer Sign-In

- **Status:** Completed and delivered; local validation, hosted CI, and CodeQL passed
- **Date:** 2026-10-03

#### Scope completed

- Added one browser/server-compatible intent validator derived from the existing
  strict order contract. It accepts exactly one product UUID and price UUID, drops
  incomplete/malformed/duplicate identifiers, ignores all unrelated payload, and
  reconstructs only fixed local login, registration, or customer-checkout routes.
- Preserved anonymous checkout selection in the proxy redirect. For requests with
  a session cookie, the proxy replaces any forged intent header with a bounded
  validated pair from the exact checkout path, or deletes it on all other matched
  paths. The authoritative server guard uses that pair only to direct unauthenticated
  customers back to sign-in; cookie presence alone does not authorize checkout.
- Added a customer-role check to the checkout page itself, retaining authorization
  on navigation when a parent layout may be reused. Login and registration pages
  narrow async query parameters before passing selection to their client forms.
- Login/register links and the post-registration sign-in link retain only the
  selected pair. Failed login and retry retain it; password reset and verification
  emails are unchanged. Administrator and MFA completions always use the returned
  role and land at `/admin`, never a customer checkout hint.
- Checkout reloads the current public catalogue and accepts only the exact product's
  current price. Unavailable, retired, and cross-product selections leave both
  fields empty, block submission, explain that no replacement/order exists, and
  offer catalogue navigation or deliberate selection. No-intent checkout still
  selects an available priced plan. A changed route selection remounts its checkout
  instance so prior draft/results do not leak into the new intent.
- Extended the local fictional lifecycle from an anonymous catalogue CTA through
  cookie-invalid sign-in, login/register round trips, verification in a second tab,
  and the retained registration-tab sign-in link. It asserts exact checkout and zero
  new-customer orders/invoices before the existing explicit Place order step.
- Added no authentication API, database schema, provider, billing rule, automatic
  order/payment/provisioning, cart, durable intent, release, or deployment change.

#### Files changed

- Intent and guard: `apps/web/src/lib/checkout-intent.ts`,
  `apps/web/src/lib/checkout-intent.test.ts`, `apps/web/src/proxy.ts`,
  `apps/web/src/proxy.test.ts`, `apps/web/src/lib/server-auth.ts`,
  `apps/web/src/lib/server-auth.test.ts`
- Entry routes: `apps/web/src/app/login/page.tsx`,
  `apps/web/src/app/register/page.tsx`,
  `apps/web/src/app/(portal)/portal/checkout/page.tsx`,
  `apps/web/src/app/checkout-entry.test.tsx`
- Forms: `apps/web/src/components/auth/login-form.tsx`,
  `apps/web/src/components/auth/login-form.test.tsx`,
  `apps/web/src/components/auth/register-form.tsx`,
  `apps/web/src/components/auth/register-form.test.tsx`,
  `apps/web/src/components/orders/customer-checkout.tsx`,
  `apps/web/src/components/orders/order-management.test.tsx`
- Browser: `apps/web/e2e/specs/hosting-lifecycle.spec.ts`
- Evidence: `CODEX_DEVELOPMENT_COMMANDS.md`, `CHANGELOG.md`,
  `docs/PRODUCT_EXPERIENCE_ROADMAP.md`, `docs/CRITICAL_BUSINESS_INVARIANTS.md`,
  `docs/PROGRESS.md`

#### Validation

- Focused final web rerun passed all 70 tests in 7 files, covering strict intent,
  hostile destinations, duplicates, forged header replacement, absent/expired
  sessions, default/administrator/MFA landings, failed login/retry, registration
  payload exclusion, server pages, current selection, and deliberate replacement.
- The complete package gate passed all 336 tests: 57 demo/documentation, 29 shared,
  3 queue, 120 web, 98 API, and 29 worker tests. The cross-product-price fixture was
  subsequently strengthened to include that price on another available product;
  its owning order-interface suite passed all 11 tests and the final focused rerun
  passed without changing assertions, limits, or authentication behavior.
- The existing order API integration suite passed all 5 tests, including authoritative
  totals, rejected ineligible prices/browser totals, ownership, idempotency, and
  stable historical pricing. No order/API implementation changed.
- The full local fictional browser lifecycle passed (1 test, 1.7 minutes), including
  exact anonymous and invalid-session handoffs, registration link continuity,
  verification in a second tab, exact post-login selection, zero automatic orders
  or invoices, and the existing explicit order/payment/hosting/support lifecycle.
  The first run caught a test navigation race: credentials were entered before the
  registration-to-login navigation completed, so no login request was sent. Waiting
  for the exact login URL and visible sign-in heading corrected the fixture; no
  application assertion, timeout, authentication, or business rule was weakened.
  Final web and browser TypeScript checking passed after that fixture correction.
- Repository lint, strict workspace type checking, full production build, formatting,
  and four offline documentation validators passed. Lint first rejected synchronous
  effect resets; keyed checkout instances resolved that without a rule suppression.
  Type checking first rejected a Testing Library query's Playwright-only `exact`
  option; an exact name regex corrected the test and the complete rerun passed.
- Consulted the installed Next.js page/search-parameter, layout-caching, async
  headers, redirect, and proxy request-header documentation before implementation.
  Only the upstream request-header API is used; no intent header is deliberately
  emitted as a client response header.
- Implementation commit `619c899121b83b5b0af1903df8ccb0fdc1893128` was reconciled
  without history rewriting and pushed to `origin/main`.
  [CI run 37141700352](https://github.com/ebit101/webhost-billing/actions/runs/37141700352)
  passed the full-history secret scan, database preparation, formatting,
  documentation, lint, type checks, package tests, API integration and critical
  invariant tests, fictional browser lifecycle, production dependency audit,
  license inventory, and production build.
  [CodeQL run 37141700415](https://github.com/ebit101/webhost-billing/actions/runs/37141700415)
  also passed. The pull-request-only dependency review job was skipped as expected
  for this direct delivery push. This follow-up report changes documentation only;
  the final pushed head is checked separately before handing the command back.

#### Decisions made

- Reuse the existing UUID boundary schema without a new shared/auth API contract.
  Treat carried selection as navigation context, never authorization or money.
- Support expired-session handoff through a proxy-overwritten, revalidated request
  header rather than a general return URL or persistent browser/server store.
- Add a checkout page guard because cached layouts do not re-run on every navigation.
  Keep API authorization and pricing as the authoritative business boundaries.
- Require deliberate replacement of unavailable intent; do not turn a stale price
  into silent acceptance of a different plan or billing period.

#### Open questions and risks

- Availability may change again after catalogue load. The existing order API still
  revalidates the eligible product/price and calculates its own amount at submission.
- Verification in another tab is supported by returning to the retained registration
  tab. Email links, password reset, cross-device resume, closed-tab recovery, and
  general return navigation deliberately do not persist or carry checkout context.
- Previously recorded VM-module/PostgreSQL-driver warnings and the lint-only
  `braces` advisory remain separate maintenance; no dependency change was made.
- Production remains `NO-GO`. Provider acceptance, SMTP, monitoring, off-site
  recovery, policies, infrastructure, and operator-pilot gates remain outstanding.
- Other P1 operator connectivity, pagination, dashboard attention, automation
  freshness, service context, and inactive workspace chrome remain separately gated.

#### Recommended next command

After successful delivery, authorize **Phase Review — Review Command 80 and define
the next bounded command** separately. Do not define or implement another command
automatically.

### Phase Review — Review Command 80 and Define Command 81

- **Status:** Review completed; next implementation defined but not authorized
- **Date:** 2026-10-04

#### Scope completed

- Reviewed Command 80 against its exact command, permanent rules, product plan,
  ADR-055, source and delivery-report commits, shared UUID contract, proxy/server
  session guards, account-entry pages/forms, checkout, catalogue/order API authority,
  component/unit tests and the fictional browser lifecycle.
- Confirmed one validated product/price pair is the only carried context. Duplicate,
  incomplete and malformed identifiers are dropped, unrelated destinations/money/
  customer/domain inputs are ignored, and only fixed local entry/checkout routes
  are reconstructed. Both supported cookie names still require API identity proof.
- Confirmed proxy context replaces forged headers and is absent on other matched
  routes; the server revalidates the bounded header. Checkout has its own customer
  page guard in addition to the layout guard. Returned role, including administrator
  MFA, controls landing; authentication and verification APIs remain unchanged.
- Confirmed registration link continuity and failed-login retry preserve selection
  without adding intent to registration payloads or verification/reset emails.
  Current catalogue membership is checked before selection; retired, empty and
  cross-product data leave selection empty until deliberate replacement. A route
  selection change keys a new checkout instance rather than carrying old drafts.
- Reviewed the browser assertions for anonymous and invalid-session redirects,
  login/register round trips, second-tab verification, exact post-login selection,
  and zero new-customer orders/invoices before explicit Place order. The existing
  API remains authoritative for price, ownership, historical snapshots and retries.
- Identified no in-scope corrective application change. Corrected stale roadmap
  registration, portal-home, public-navigation and browser-coverage descriptions,
  and distinguished the historic Command 79 gap list from current delivery status.
- Reassessed remaining P1 gaps. Selected customer invoice history: its component
  requests `/invoices/my?pageSize=100`, retains only `result.data`, and supplies no
  search/status/page controls, even though the existing strict customer query and
  session-derived API scope support deterministic search/filter/paging with counts.
- Defined exactly one separately gated **Command 81 — Make Customer Invoice
  History Searchable and Paginated**, without implementing it. Scope is one
  read-only customer ledger and its evidence, not a general list framework,
  administrator ledger, new financial behavior or product breadth.

#### Files changed

- `CODEX_DEVELOPMENT_COMMANDS.md` — bounded Command 81, acceptance evidence,
  exclusions and explicit not-authorized boundary
- `docs/DECISIONS.md` — ADR-056 for URL-bound, ownership-safe invoice history
- `docs/PRODUCT_EXPERIENCE_ROADMAP.md` — corrected current capability descriptions,
  Command 80 review outcome and selected customer-only invoice-ledger slice
- `CHANGELOG.md` — review and next-command definition, not an implementation claim
- `docs/PROGRESS.md` — current state, review evidence, risks and exact next command

#### Validation

- Started from clean `main` at `164389f917a104ac5bf5ed25c97921862d9884ac`, containing
  implementation `619c899` and its delivery report. Rechecked that exact head's
  [CI run 37142196982](https://github.com/ebit101/webhost-billing/actions/runs/37142196982)
  and
  [CodeQL run 37142196979](https://github.com/ebit101/webhost-billing/actions/runs/37142196979)
  both completed successfully. Remote reconciliation found 0 ahead/0 behind.
- Fresh focused web tests passed all 70 cases in 7 files with one worker: intent,
  proxy, server authorization, server pages, login, registration and order/checkout
  components. No timeout, assertion or authentication limit was changed.
- Fresh order API integration tests passed all 5 cases in one suite, including
  server-priced atomic creation, duplicate submission, ineligible-price/browser-
  total rejection, ownership and historical values after repricing. Existing
  VM-module and PostgreSQL-driver deprecation warnings remained non-failing.
- The verified delivered head's hosted CI proves the full package, API integration,
  invariant, fictional browser, audit, license and production-build gates. Those
  are existing hosted evidence, not claimed as fresh complete local reruns in this
  documentation-only review. No application change required broader local reruns.
- `pnpm docs:check` passed all four offline validators; repository-wide
  `pnpm format:check` and `git diff --check` passed. Final hosted CI/CodeQL are checked
  after pushing the review commit. Diff review confirmed changes are confined to
  the five declared documentation files, with no Command 81 implementation,
  schema/provider action, release or deployment.

#### Decisions made

- Close one concrete customer billing-history visibility limit before broader
  operator connectivity, attention, service or automation work. Use the existing
  endpoint and strict query contract, not a new read model or search subsystem.
- Carry only four validated ledger query fields. Customer identity stays exclusively
  session-derived; query payload cannot choose another account or a return target.
- Use matching-record metadata, not page length as proof of complete history and
  never page sums as an account-wide financial balance. Keep current money,
  invoice visibility/detail/payment rules and independent business states unchanged.
- Bound each request to one page; make stale/failed/out-of-range states honest and
  recoverable. Require greater-than-100 and cross-customer evidence without changing
  production history, authentication limits or existing lifecycle assertions.

#### Open questions and risks

- Catalogue availability can still change after load; the existing order API
  revalidates current eligibility and pricing at explicit submission. Command 80
  does not promise durable, cross-device, closed-tab or email/reset-link recovery.
- Invoice lists can change while paging; deterministic ordering is not a frozen
  snapshot. Command 81 must handle empty/out-of-range pages and stale responses
  without fabricating counts or silently presenting old data as fresh.
- The existing API query schema and ownership boundary are ready, but larger
  history, filter combinations, URL restoration and pagination metadata isolation
  are acceptance work for Command 81, not behavior proven by this review.
- Order/payment connectivity, other ledger scale, dashboard attention, automation
  freshness, service context and inactive workspace chrome remain separate P1 work.
- The previously recorded lint-only `braces` advisory remains separate dependency
  maintenance. No dependency, provider, deployment, release or schema changed.
- Production remains `NO-GO`; credentialed providers, SMTP, monitoring, off-site
  recovery, final policies, infrastructure and operator-pilot gates remain open.

#### Recommended next command

Authorize **Command 81 — Make Customer Invoice History Searchable and Paginated**
separately after this review's delivery. Do not begin it automatically.

### Command 81 — Make Customer Invoice History Searchable and Paginated

- **Status:** Completed and delivered to GitHub `main`; source CI and CodeQL passed
- **Date:** 2026-10-04
- **Authorization:** Explicit user authorization for Command 81 only.

#### Scope completed

- Replaced the customer invoice ledger's first-100 request with one bounded page
  from the unchanged, authenticated `/invoices/my` endpoint (default page 1/size 20).
- Added a runtime-validated URL allowlist for search, status, page and page size.
  Duplicate, malformed, unsupported or unsafe-offset values use visible recoverable
  defaults. Customer identity, redirects, amounts and unrelated inputs never reach
  the request or fixed local navigation route.
- Added labelled search/status/size controls, clear filters, authoritative matching
  counts/ranges and previous/next controls. Search/status/size changes reset page 1
  while retaining other committed filters. Existing safe money/date formatting and
  invoice detail links remain unchanged; no page-derived financial totals are added.
- Distinguished first-use empty, filtered-empty, out-of-range, loading and retryable
  errors. Cancelled query outcomes cannot overwrite newer results; loading/failure
  never presents old rows or metadata as a refreshed result.
- Added fictional 105-record API and browser histories, deterministic/non-overlapping
  page evidence, filtered counts, foreign-row/count isolation and read-only browsing
  checks. Retained the original payment/provisioning/ownership lifecycle assertions,
  authentication limits and test timeouts.
- Changed no API implementation, endpoint, schema, invoice/payment business rule,
  provider, authentication policy, other ledger, release or deployment.

#### Files changed

- `apps/web/src/lib/invoice-ledger-query.ts` and its test — bounded allowlist,
  canonical fixed-route query construction and unsafe/duplicate rejection.
- `apps/web/src/app/(portal)/portal/invoices/page.tsx` and
  `apps/web/src/app/invoice-ledger-entry.test.tsx` — validated server-page query entry.
- `apps/web/src/components/invoices/customer-invoice-list.tsx`,
  `customer-invoice-ledger.test.tsx` and `invoice-management.test.tsx` — customer
  controls, request lifecycle, metadata/recovery and preserved existing regression.
- `apps/api/test/invoices.e2e-spec.ts` — 105 owned plus three foreign records,
  read-only deterministic paging/filter/isolation and unchanged role guards.
- `apps/web/e2e/fixtures.ts`, `prepare-environment.ts` and
  `specs/hosting-lifecycle.spec.ts` — isolated fictional history and browser continuity.
- `CHANGELOG.md`, `CODEX_DEVELOPMENT_COMMANDS.md`,
  `docs/PRODUCT_EXPERIENCE_ROADMAP.md`, `docs/CRITICAL_BUSINESS_INVARIANTS.md` and
  `docs/PROGRESS.md` — scope, authorization, evidence and remaining boundaries.

#### Validation

- Focused query, server entry and invoice component tests: 37 passed.
- Relevant invoice API E2E: all six tests passed, including the 105-record history
  and existing ownership, immutable-history and invoice-state regressions.
- Full package tests: 369 passed (57 demo/docs, 29 shared, three queue, 153 web,
  98 API and 29 worker). An initial run overlapping production/type builds timed
  out in the existing 5-second worker renewal lifecycle test and then failed its
  teardown with a hosting-operation foreign key. The complete serial rerun passed
  all 10 worker suites without changing assertions, timeouts or worker code.
- Full lint and strict type checks: passed. Final web lint: passed without warnings.
- Production build: passed, including the dynamic customer invoice route and all
  Next.js, API, worker and package artifacts.
- `pnpm docs:check`: all four offline validators passed.
- Full fictional Chromium lifecycle: passed (one complete journey, 2.8 minutes),
  including the original hosting/payment/support/ownership regressions and the new
  105-record read-only search/filter/paging, reload/detail/back-forward and mobile
  filter recovery assertions.
- `pnpm format:check` and `git diff --check`: passed.
- Git remote/branch reconciliation: canonical `origin`, `main`, fetched remote
  with zero ahead/behind before delivery; no history rewrite or force push.
- Source commit `152301d28abccbf6066400be3ad3a52dbddc62ca` was pushed to
  `origin/main` without force or published-history rewriting.
- Hosted [CI run 37145485190](https://github.com/ebit101/webhost-billing/actions/runs/37145485190)
  passed on that exact source commit. All Validate steps passed, including complete
  history secret scanning, database preparation, formatting, documentation, lint,
  types, package tests, full API E2E, critical invariants, full browser lifecycle,
  production dependency audit, license inventory and production build. The PR-only
  dependency-review job was correctly skipped for this direct `main` push.
- Hosted [CodeQL run 37145485149](https://github.com/ebit101/webhost-billing/actions/runs/37145485149)
  passed on the same exact source commit.
- This completion report is a separate documentation-only delivery; it adds no
  application behavior or authorization for a later command.

#### Decisions made

- Applied ADR-056 without expanding its customer-only, read-only scope.
- Used existing query/response contracts and session-derived API identity; bounded
  offsets also respect Prisma's signed 32-bit `skip` limit.
- Kept committed URL filters separate from an unsent search draft and reset request
  state on query changes. Validated current response metadata rather than estimating
  history or account balances from a page.
- Extra history exists only in guarded fictional test fixtures. No production data
  or provider connection was used.

#### Open questions and risks

- Counts and rows are separate queries within one API transaction; neither that
  transaction's default isolation nor subsequent page requests promise a frozen
  history snapshot. An empty page offers safe recovery, and inconsistent metadata
  fails closed. This wording was clarified by the Command 81 phase review.
- The initial worker timeout is recorded above; the full serial rerun passed. The
  failed run may have left a fictional renewal fixture in the local development
  database. No broad cleanup or production data deletion was performed.
- Existing experimental VM warnings and the previously recorded development-only
  `braces` advisory remain separate maintenance work.
- GitHub reported the existing direct-main branch-rule bypass during the authorized
  delivery and the existing Dependabot alert 15. No repository protection setting,
  dependency or lockfile was changed; the production dependency audit passed in CI.
- Order/payment connectivity, other ledger scale, dashboard attention, automation
  freshness, service context and inactive workspace chrome remain separately gated.
- Production remains **NO-GO**. Real providers, SMTP, monitoring, off-site recovery,
  final policies, infrastructure and operator-pilot evidence remain open.

#### Recommended next command

Authorize **Phase Review — Review Command 81 and define the next bounded command**
separately. Do not define or begin Command 82 automatically.

### Phase Review — Review Command 81 and Define Command 82

- **Status:** Review completed; next implementation defined but not authorized
- **Date:** 2026-10-04
- **Authorization:** User authorized this phase review only, not Command 82.

#### Scope completed

- Reviewed Command 81 against the command playbook, permanent rules, product plan,
  ADR-056, source/report commits, shared invoice/pagination contracts, server-page
  entry, customer component, invoice controller/service, API fixtures and the full
  fictional browser assertions.
- Confirmed only search/status/page/pageSize enter the customer request; defaults,
  duplicate/malformed rejection, safe offsets and fixed local links preserve the
  authenticated customer boundary. Customer identity remains exclusively API-derived.
- Confirmed matching metadata is validated against the current request, requests
  remain one bounded page, and query changes key a new request instance. Delayed
  outcomes cannot replace current results. Empty/filter-empty/out-of-range/loading/
  failure/retry states retain controls and recovery without page-derived balances.
- Reviewed the 105-owned/three-foreign API fixture, deterministic non-overlapping
  pages and filtered counts, identity-override rejection, anonymous/admin-role
  protections, unchanged record snapshots, and browser search/status/size/reload/
  detail/back-forward/mobile assertions with zero non-read browsing requests.
- Identified no in-scope corrective application change. Clarified the earlier
  report: list/count queries share a Prisma transaction, but default isolation and
  later page requests do not guarantee a frozen history. Corrected the roadmap's
  remaining first-100 finding and unsupported customer-order service-state wording.
- Selected one remaining P1 administrator lookup gap. `AdminOrderManager` shows
  unlinked customer text, only the first plan/domain and no invoice context beside
  state actions; existing `GET /orders/:orderId` and `orderSchema` already supply
  customer IDs, all item snapshots and invoice state/total/balance/due date.
- Defined exactly one **Command 82 — Connect Administrator Order Review to Customer
  and Invoice Context**. It is a read-only panel plus two existing local detail
  links, not a new route, general framework, approval gate, payment/service workflow
  or new API/schema. No Command 82 implementation was performed.

#### Files changed

- `CODEX_DEVELOPMENT_COMMANDS.md` — bounded Command 82, evidence, exclusions and
  explicit separate-authorization requirement.
- `docs/DECISIONS.md` — ADR-057 for explicit read-only administrator order context.
- `docs/PRODUCT_EXPERIENCE_ROADMAP.md` — corrected current ledger/service evidence,
  Command 81 review outcome and selected administrator-only next slice.
- `CHANGELOG.md` — review/definition, without claiming Command 82 implementation.
- `docs/PROGRESS.md` — corrected transaction wording and this review/evidence report.

#### Validation

- Started from clean `main` at `a04063d253175a643932e0fc215ebd9060416d5e`, containing
  Command 81 source `152301d` and its completion report. Fetched remote reconciliation
  found zero ahead/behind.
- Rechecked that exact delivered head's
  [CI run 37145934196](https://github.com/ebit101/webhost-billing/actions/runs/37145934196)
  and [CodeQL run 37145934169](https://github.com/ebit101/webhost-billing/actions/runs/37145934169):
  both completed successfully. Full package/API/invariant/browser/audit/license/build
  gates are verified hosted evidence, not claimed as fresh complete local reruns.
- Fresh focused web tests: all 37 tests passed in four files (query, server entry,
  customer ledger and invoice management), using one worker and unchanged assertions.
- Fresh shared tests: all 29 passed, including money, pagination and response contracts.
- Fresh invoice API E2E: all six tests passed, including larger history, filtered
  count/row isolation, role/ownership, immutable history and invoice state behavior.
  The existing experimental VM warning remained non-failing.
- `pnpm docs:check`: all four offline validators passed. Repository-wide
  `pnpm format:check` and `git diff --check` passed. The final review commit's hosted
  CI/CodeQL are checked after pushing and before handoff. Diff review confines this
  phase to the five declared documentation files; no application correction or
  Command 82 implementation required a broader local application rerun.

#### Decisions made

- Close a repeated administrator order-to-customer/invoice lookup gap using ready
  contracts before expanding another ledger or high-impact service/payment workflow.
- Require an explicit one-order read, runtime validation and exact response identity,
  independent states and historical snapshots. Use only returned validated identifiers
  for fixed local links; page context or display/domain text grants no authority.
- Treat the review as informational. Existing creation and state actions retain their
  eligibility/API rules; review itself performs no mutation and an affected open view
  must be invalidated or revalidated after an existing successful mutation.
- Do not fabricate service/provisioning evidence absent from the order contract.
  Delayed results after selection/close/filter changes must be discarded.

#### Open questions and risks

- Invoice and order state can change after a review read. The API remains authoritative
  for explicit actions; Command 82 must not imply a frozen snapshot or approval proof.
- Command 81's initial worker timeout and possible retained local fictional fixture
  remain recorded in its report. Fresh invoice checks and both full hosted delivery
  runs passed; no cleanup, timeout increase or unrelated worker fix was authorized.
- The existing development-only `braces` advisory, VM/driver upgrade warnings and
  direct-main delivery-rule bypass remain separate maintenance/process concerns.
- Other ledger scale, customer order navigation, payment/service context, dashboard
  attention, automation freshness and inactive chrome remain separately gated.
- Production remains **NO-GO**. No live app, external provider, dependency, release,
  schema, production record or deployment was changed by this review.

#### Recommended next command

Authorize **Command 82 — Connect Administrator Order Review to Customer and Invoice
Context** separately. Do not begin it automatically.

### Command 82 — Connect Administrator Order Review to Customer and Invoice Context

- **Status:** Completed and delivered to GitHub `main`
- **Date:** 2026-10-04

#### Scope completed

- Added explicit one-order read-only review to `/admin/orders`, using the existing
  protected detail endpoint and complete shared runtime response contract. Selected
  UUIDs, returned order identity and the active valid customer filter are checked;
  only validated returned customer/invoice IDs create fixed local detail links.
- Presented every historical item with description, requested domain, billing
  period, quantity and unit/setup/line snapshots, order totals/dates, optional
  plain-text notes, and linked invoice status/due/total/balance. Existing lossless
  formatting and configured business timezone are used without repricing or totals
  reconstruction. Order/invoice states remain distinct; no service state is invented.
- Added labelled loading/unavailable/error/retry/close controls, keyboard focus and
  mobile layout. Selection is never automatic; keyed request scopes and cancellation
  discard delayed outcomes after selection, close or customer-filter changes.
- Preserved existing creation and Approve/Reject/Cancel eligibility and request
  bodies. Successful existing mutations invalidate review. Review contains no
  mutation controls, approval gate, new route, API, schema or provider operation.
- Extended the existing fictional browser lifecycle with exact customer/invoice
  navigation, return to orders and mobile/keyboard review/close before deliberate
  approval, comparing business records and observing requests for no write.

#### Files changed

- `apps/web/src/components/orders/admin-order-review.tsx` — isolated read-only panel.
- `apps/web/src/components/orders/admin-order-review.test.tsx` — 14 focused tests.
- `apps/web/src/components/orders/admin-order-manager.tsx` — explicit selection,
  focus return, scoped filter reset and successful-mutation invalidation.
- `apps/web/src/components/orders/order-management.test.tsx` — 16 manager tests,
  including unchanged create/status requests and read-only context regression.
- `apps/web/e2e/specs/hosting-lifecycle.spec.ts` — fictional browsing evidence.
- `CODEX_DEVELOPMENT_COMMANDS.md` — user authorization record.
- `CHANGELOG.md`, `docs/PRODUCT_EXPERIENCE_ROADMAP.md`,
  `docs/CRITICAL_BUSINESS_INVARIANTS.md` — bounded delivery/safety documentation.
- `docs/PROGRESS.md` — this report and required phase-review stop.

#### Validation

- Started from clean `main` at `8b089df944dda45edecccfe647b9bee7bbfda72c`.
  Consulted installed Next.js navigation documentation before implementation.
- Focused web tests: 30 passed in two files (14 review and 16 manager).
- Relevant order/invoice API E2E: 11 passed in two suites. Existing VM/driver
  warnings remained non-failing; no API or financial rule was changed.
- Web lint and strict application/E2E type checks passed. Initial checks caught an
  invalid test billing-period enum, a duplicate-text query and a Testing Library
  unsupported query option. Corrected test-only mistakes; assertions and timeouts
  were not weakened or increased.
- The initial full package run passed 57 demo/documentation, 29 shared, three queue,
  172 web and 98 API tests. Its worker renewal-lifecycle test exceeded the existing
  five-second deadline during overlapping validation, followed by a teardown foreign
  key failure; the other 28 worker tests passed. This repeats a previously recorded
  environment-sensitive failure, but is not accepted as a passing run. The complete
  isolated `pnpm test` rerun passed all 388 tests, including all 29 worker tests in
  ten suites, with original assertions and deadlines unchanged. This supports
  contention as the timeout trigger, not a proven deterministic root cause.
- Full workspace lint, strict type checks (including browser tests) and production
  build passed. All four offline documentation validators, repository-wide
  formatting and `git diff --check` passed.
- The first browser run failed at the unchanged customer-registration assertion,
  before reaching order review. The trace shows native form GET navigation on the
  cold development route rather than the expected authenticated POST, consistent
  with a pre-hydration race. No authentication behavior, assertion, delay, provider
  or deadline was changed. The unchanged full fictional Chromium lifecycle rerun
  passed (3.1 minutes including startup), including all original assertions and
  added read-only order/customer/invoice and keyboard/mobile checks. Snapshot
  comparisons and request observation passed before deliberate approval.
- Existing VM, driver and color warnings, and expected API errors from deliberately
  unavailable automation evidence, were non-failing. No timeout/assertion adjustment,
  production connection or authentication workaround was used.
- Final web lint/types and offline docs/format/diff checks were rerun successfully
  after the last test/report edits.

#### Delivery evidence

- Source commit `9796d98e261735cda012db05e865a8b0f31ad7c7` was pushed to
  `origin/main` after clean non-force reconciliation. The source working tree was
  clean, with exactly the ten declared files included.
- Hosted [CI run 37163135827](https://github.com/ebit101/webhost-billing/actions/runs/37163135827)
  passed on that exact source commit. Every Validate step passed: full-history secret
  scan, database preparation, formatting, documentation, lint, strict types, complete
  package tests, full API E2E, critical invariants, full browser lifecycle, production
  dependency audit, license inventory and production build. The PR-only dependency
  review job was correctly skipped for this direct `main` push.
- Hosted [CodeQL run 37163135829](https://github.com/ebit101/webhost-billing/actions/runs/37163135829)
  passed on the same exact source commit.
- This completion report is a separate documentation-only delivery. It adds no
  application behavior or authorization for later work; final-head hosted checks
  are verified after pushing and before completion handoff.

#### Decisions made

- Applied ADR-057 using existing contracts, navigation, formatter and settings read.
  Nothing in browser navigation changes API role/ownership authority.
- Close review after any successful existing mutation instead of implying stale
  data is refreshed. A customer-filter change resets the workspace/request scope,
  including unsent creation form state; review selection is not durable URL state.
- Disable detail-link prefetch; fetch only one deliberate order and the existing
  settings needed for timezone. A failed or mismatched response never retains the
  previous successful view or exposes raw schema/provider errors.

#### Open questions and risks

- Review is context as of its request, not a frozen snapshot or current hosting
  state. Explicit actions remain server-authoritative and independently eligible.
- The first-100 order list, other ledger scale, payment/service context, dashboard
  attention, automation freshness and inactive chrome remain separately gated.
- Existing development-only dependency advisory and direct-main rule bypass remain
  separate maintenance/process concerns. No dependency or security policy changed.
- The interrupted worker test may have retained its random fictional fixture in the
  local development database after failed cleanup. No broad cleanup is authorized;
  the browser lifecycle uses its own separately guarded loopback schema.
- Registration's initial native GET exposed only the fixed fictional test fields in
  its local trace. The inferred hydration/fallback risk remains separate auth work;
  a passing rerun does not establish that cold-route behavior is fixed.
- Production remains **NO-GO**. No live app, credentialed provider, release,
  production data, deployment or financial/approval policy was changed.

#### Recommended next command

Authorize **Phase Review — Review Command 82 and define the next bounded command**.
Do not define or implement another command automatically.

### Phase Review — Review Command 82 and Define Command 83

- **Status:** Review completed; next implementation defined but not authorized
- **Date:** 2026-10-04
- **Authorization:** User's "next" accepted the offered phase review, not Command 83.

#### Scope completed

- Reviewed Command 82, permanent rules, product plan, ADR-057, source/report commits,
  order response/runtime money/date contracts, the administrator manager/review,
  filter boundary, order controller/service and focused/browser/API regressions.
- Confirmed one explicitly selected order read, runtime UUID/response validation,
  exact current order/customer matching, fixed returned-identifier links, all-item
  historical snapshots, independent state wording, plain-text notes and configured
  timezone/lossless money. Review never reads mutable catalogue prices for value,
  invents service evidence or becomes an approval/permission gate.
- Confirmed scope keys and active/abort guards discard obsolete outcomes after
  selection/close/filter changes; successful existing create/status actions close
  review. Existing request bodies and eligibility remain unchanged. Browser tests
  compare records and observe no non-read request before deliberate approval.
- Identified no in-scope corrective order change. Rechecked the earlier registration
  failure against auth source: four auth form components omit native method and
  initially expose named inputs/submit controls, relying on client preventDefault.
  The recorded native GET is actual fictional browser evidence; pre-hydration is
  the inferred trigger, not a proven exhaustive diagnosis. Administrator MFA
  settings forms render only after an effect-loaded status and are not a new
  workflow target; shared-control regressions remain required.
- Defined exactly one **Command 83 — Prevent Native Credential Submission From
  Authentication Forms**, prioritizing credential safety over additional P1 lookup
  features. It requires deterministic no-JavaScript/withheld-script evidence and
  preserved normal CSRF/MFA/reset/checkout journeys, not a new auth API, policy,
  general framework, native sign-in fallback or test-wait workaround.
- Defined only; no Command 83 implementation, credential submission/probing, live
  application access, deployment, provider operation or database cleanup performed.

#### Files changed

- `CODEX_DEVELOPMENT_COMMANDS.md` — bounded Command 83 and separate authorization.
- `docs/DECISIONS.md` — ADR-058 and primary-source form/hydration evidence.
- `docs/PRODUCT_EXPERIENCE_ROADMAP.md` — review outcome and security-first sequence.
- `CHANGELOG.md` — review/definition without claiming implementation.
- `docs/PROGRESS.md` — current boundary and this evidence report.

#### Validation

- Started from clean `main` at `9d7bd63f5c67d35dad10081df1318a4c30f37807`, containing
  Command 82 source `9796d98` and its completion report. Fetched canonical remote
  reconciliation found zero ahead/behind without rewriting history.
- Rechecked exact delivered-head hosted
  [CI run 37163595855](https://github.com/ebit101/webhost-billing/actions/runs/37163595855)
  and [CodeQL run 37163595863](https://github.com/ebit101/webhost-billing/actions/runs/37163595863):
  both succeeded. Full package/API/invariant/browser/audit/license/build evidence is
  hosted, not claimed as a fresh full local rerun for this documentation review.
- Fresh focused web tests: all 30 passed (14 review and 16 manager), one worker and
  unchanged assertions. Fresh shared tests: all 29 passed.
- Fresh order/invoice API E2E: all 11 passed in two suites, retaining ownership,
  server pricing, historical values, idempotency and state rules. Existing VM/driver
  warnings remained non-failing.
- `pnpm docs:check`: all four offline validators passed. Repository-wide
  `pnpm format:check` and `git diff --check` passed. Diff review confines this phase
  to the five declared documentation files; no application correction or Command 83
  implementation required a broader local application rerun. Final review-commit
  hosted CI/CodeQL are checked after pushing and before completion handoff.

#### Decisions made

- Preserve ADR-057 without expanding review into a mutation confirmation framework.
- Accept ADR-058 for defining, not implementing, the next bounded safety command.
  HTML GET fallback and Playwright hydration guidance are primary-source support:
  [HTML form](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/form#method),
  [hydration guidance](https://playwright.dev/docs/navigations#hydration).
- Require server/first-client disabled controls, explicit non-GET defense and
  accessible unready feedback; native POST alone is insufficient. Existing API
  authority, allowed token links and plan-intent handoffs remain unchanged.

#### Open questions and risks

- The credential-submission risk remains unfixed until Command 83 is separately
  authorized, implemented and proven. No real credential exposure or production
  incidence is established by the fictional test; passing CI does not close it.
- The recorded worker timeout/cleanup failure and possible local fictional fixture
  remain separate. No cleanup or timeout/worker change is part of this review.
- Order context is as-of-request, not frozen state or provisioning proof. First-100
  order lists, payment/service context, other ledger scale, dashboard attention,
  automation freshness and inactive chrome remain separately gated.
- Existing development-only advisory, direct-main delivery-rule bypass and driver
  warnings remain recorded maintenance/process work. No dependencies/policies changed.
- Production remains **NO-GO**; provider/SMTP/monitoring/off-site recovery/policy,
  infrastructure and operator-pilot evidence remain open. No new release or deployment.

#### Recommended next command

Authorize **Command 83 — Prevent Native Credential Submission From Authentication
Forms** separately. Do not begin it automatically.

### Command 83 — Prevent Native Credential Submission From Authentication Forms

- **Status:** Completed; source delivered with passing hosted CI and CodeQL
- **Date:** 2026-10-04
- **Authorization:** Explicit user's "command 83"; no further implementation authorized.

#### Scope completed

- Added one auth-only readiness boundary for customer/admin password login, its MFA
  challenge, registration, reset request and reset confirmation. SSR and initial
  hydration disable the entire fieldset, excluding named/autofilled fields from
  native payloads; after commit, original handlers remain CSRF protected. POST is
  explicit defense in depth, not a page-route fallback. Accessible preparation and
  JavaScript-required feedback preserve labels, autocomplete and keyboard behavior.
  The existing loading shell also explains JavaScript requirements when no-script
  streaming keeps the form segment hidden; no route/rendering configuration changes.
- Retained original API paths/bodies, strict optional-field omission, token handling,
  verification, role-derived landing, exact allowlisted plan intent, busy/error/retry
  behavior and unchanged shared controls/MFA settings workflows.
- Distinct password/challenge keys clear reused uncontrolled input. Strengthened
  MFA body assertions exposed an email value being reused as the code; no MFA
  policy, recovery, authentication or financial behavior was redesigned.
- Added SSR/first-hydration, reset busy/retry, shared MFA settings and stronger MFA
  body regressions. Added ten isolated browser checks (five entries in each of
  no-JavaScript and controlled script withholding/release), successful-control and
  click/Enter checks, URL/request observation, CSRF POST bodies after release and
  unchanged auth/business record counts. New checks use only fictional values,
  page-local mock auth and disabled trace/video/screenshots, not real auth attempts.
- Existing full fictional lifecycle, limits, assertions, deadlines, provider fakes,
  backend, workers and policies remain unchanged. No production probe/deployment,
  cleanup, dependency update or new release performed.

#### Files changed

- `apps/web/src/components/auth/form-controls.tsx` — auth-only readiness boundary;
  Field, SubmitButton and FormNotice behavior unchanged.
- `apps/web/src/components/auth/{login,register,forgot-password,reset-password}-form.tsx`
  — boundary adoption; separate login branch identities.
- `apps/web/src/components/auth/form-controls.test.tsx`,
  `password-reset-forms.test.tsx`, `admin-two-factor-panel.test.tsx` and
  `login-form.test.tsx` — readiness, request and shared-consumer regressions.
- `apps/web/e2e/specs/auth-readiness.spec.ts` — deterministic fictional browser guard.
- `apps/web/src/app/loading.tsx` — noscript feedback before streamed auth appears.
- `CODEX_DEVELOPMENT_COMMANDS.md`, `docs/DECISIONS.md`,
  `docs/PRODUCT_EXPERIENCE_ROADMAP.md`, `CHANGELOG.md`, `docs/PROGRESS.md` —
  authorization, ADR-059, scope and evidence tracking.

#### Validation

- Started from clean `main` at `bbe2060827fc95a8d2f5045c61e5aaa5013b3a3b`.
  Read project rules, product plan, relevant decisions/progress, installed Next.js
  rendering/hydration guides and official React/HTML/Playwright documentation.
- Final focused auth/shared-controls/order component tests: seven files, all 51 passed.
  Authentication API E2E: all eight passed, including registration/verification,
  session, reset, MFA/recovery, CSRF and role enforcement; VM warning non-failing.
- Initial new-test lint failed on JSX array keys; fixed keys without exemptions.
  Initial strengthened tests found the input reuse and a missing new test response
  helper; fixed the branch identity and helper. The early type check identified
  that same missing helper. Subsequent focused rerun passed all 50 tests.
- First browser run exposed missing visible no-script feedback behind Next's loading
  shell and a test alert selector colliding with Next's route announcer. Added the
  shell's noscript explanation, scoped the assertion to the form and exercised
  native disabled click through the public DOM API (also covering hidden streamed
  controls). No timeout, delay, lifecycle assertion or app rendering policy changed.
- First browser run: seven new checks failed as described above; three new checks
  and the unchanged lifecycle passed. After corrections, `pnpm test:e2e` passed
  all ten new readiness checks plus the complete existing lifecycle (11 total,
  2.2 minutes). No auth limit, deadline, test isolation or assertion was weakened.
- At the initial local-validation checkpoint, hosted CI/CodeQL were pending;
  subsequent exact-commit results are recorded below, not claimed as earlier evidence.
- Final docs:check (all four), repository format:check and lint passed. The full
  strict type check caught an optional-property inference in the new browser
  expected-body fixture; narrowed it to an explicit string record without changing
  requests/assertions. The subsequent full strict type check passed across all
  workspaces, including the browser test project.
- Full strict types then passed across all workspaces. The first full `pnpm test`
  passed 57 tooling, 29 shared, three queue, 185 web and 98 API tests, but the
  unchanged worker renewal lifecycle exceeded its five-second deadline and its
  asynchronous cleanup hit `payments_invoice_id_fkey` (28/29 worker tests passed).
  This repeats the pre-existing recorded failure despite no competing heavy check.
  No worker, assertion, timeout or cleanup change was made; serial worker verification
  and full-suite reruns followed below. Build did not run in the failed test pipeline;
  it was executed separately and passed.
- Serial worker verification against the same default development database also
  failed (28/29): the renewal cycle reported temporary unavailability rather than
  the earlier test timeout. Read-only inspection confirms the lifecycle scans all
  eligible services/open renewals, not just its new random fixture. Retained records
  are a possible interference source, not an established sole cause. Reuse the
  existing guarded loopback `command26_e2e` preparation for fresh fictional-schema
  verification; leave the default development schema and failed fixtures untouched.
- Fresh-schema serial worker execution also failed: 26/29 passed, with the same
  five-second renewal timeout and two outbox dispatch-count assertions (expected
  one, got zero). Isolation did not establish a fix or a sole cause. The existing
  test preparation recreated only the dedicated fictional schema; it did not clean
  the default development database. Worker source, deadlines and assertions remain
  unchanged. These failures blocked initial delivery; further sequencing/isolation
  checks and build/browser verification remained within Command 83's permitted scope.
- Read-only adapter/dispatcher inspection explains the isolated outbox limitation:
  Prisma's model queries use the supplied schema, but worker raw SQL references
  unqualified tables. A schema parameter alone therefore does not isolate every
  query. A further fresh fictional-schema check uses a connection-level PostgreSQL
  `search_path` restricted to `command26_e2e`; this is a child-process test invocation,
  not a worker/database source change or development-record cleanup. Do not treat
  the earlier schema-only run as a validated independent worker test environment.
- With that connection option, a read-only `current_schema()` check confirmed raw
  SQL targets the fixed loopback test schema. All 29 unchanged worker tests passed
  across ten suites with `--runInBand`, retaining their deadlines and assertions.
  The complete root `pnpm test` is now rerunning under the same private child-process
  database override (no URL/credentials printed and no persisted environment change).
- `pnpm build`: passed for all packages, Next.js production output and API/worker
  builds. No release, deployment or live provider operation was performed.
- The root rerun under verified schema isolation again passed 400/401 tests, but
  parallel Jest worker execution reproduced the unchanged five-second lifecycle
  timeout (28/29 worker tests). Successful serial execution does not establish a
  parallel-run repair. Follow Command 83's execution-sequencing requirement: verify
  the full identical package/tooling suite with explicit single-worker/serial test
  invocation on freshly prepared, properly isolated fictional state. No suite,
  business-concurrency assertion, deadline or worker source is altered or skipped.
- Final complete serial package validation: all **401** passed — 57 demo/docs
  tooling, 29 shared contracts, three queue, 185 web, 98 API and 29 worker tests.
  Executed the same nine tooling scripts and all five package suites sequentially,
  with Vitest `--maxWorkers=1` and Jest `--runInBand`, against the guarded fictional
  schema with verified connection-level search path. Worker pretest/package build
  steps also ran. This is a successful full-suite serial execution, not a claim
  that the default local parallel `pnpm test` passed or was repaired.
- Final source-version browser rerun: all **11** passed (3.1 minutes), including
  ten readiness checks and the unchanged complete hosting lifecycle. Used the
  existing guarded preparation/schema, fictional fixtures, original ports, limits,
  assertions and deadlines. The private local connection option also restricted
  raw SQL to the intended test schema; no checked-in test environment changed.
- All required local validation has positive evidence with the recorded execution
  constraints. Final documentation checks/diff review run before committing; hosted
  source-commit CI and CodeQL are verified after pushing and before handoff. No
  unexecuted hosted result is claimed here.
- Source commit `c7b6dd573077a53ebb96c59ecc642a0e869359ea` was committed and pushed to
  canonical `origin/main` after formatting/docs/diff checks passed. Fetch and
  fast-forward-only reconciliation preserved history; the source working tree was
  clean. The existing main-rule bypass and unchanged Dependabot alert 15 were
  reported by the remote, not newly configured or repaired.
- Exact-source [CodeQL run 37170567274](https://github.com/ebit101/webhost-billing/actions/runs/37170567274)
  and [CI run 37170567236](https://github.com/ebit101/webhost-billing/actions/runs/37170567236)
  both succeeded for `c7b6dd573077a53ebb96c59ecc642a0e869359ea`. CI passed history
  secret scanning, formatting/docs/lint/types, its normal unchanged parallel package
  test command, full API integration and critical invariants, all browser tests,
  production dependency audit, license inventory and production build. The PR-only
  dependency-review job was appropriately skipped. This distinguishes successful
  hosted package execution from recorded local parallel/runtime constraints.
- This completion report is a documentation-only delivery with no application,
  configuration, later-command authorization or production approval change. Its
  final-head hosted CI/CodeQL are verified after pushing and before completion
  handoff; source verification above is exact-commit evidence, not a future-result
  assertion.

#### Decisions made

- Implement ADR-058 through ADR-059; do not transmit and then scrub credentials.
- Disable all named controls through hydration, not just submit buttons. Native POST
  is backup only; no generic form framework or no-JavaScript sign-in endpoint.
- Observe only known submitted-field query keys; allowed reset token and validated
  product/price URLs are preserved. Held scripts release through observable readiness,
  without sleeps, network-idle, private React state or test deadline changes.
- Mock new browser auth POSTs per page to avoid real auth writes/rate-limit pressure;
  unchanged complete lifecycle independently proves real-API end-to-end behavior.

#### Open questions and risks

- This closes one browser submission boundary, not all security/operational gates.
  No real credential exposure or production incidence is established by prior
  fictional failure evidence. Direct DOM tampering or compromised scripts are not
  repaired by UI readiness; backend authorization remains mandatory.
- Prior worker timeout/cleanup risk, possible retained fictional fixture, development
  dependency advisory and direct-main rule bypass remain separate. No broad cleanup,
  worker/time-limit, dependency or delivery-policy change is authorized here.
- Local default/parallel worker verification remains environment-sensitive as
  recorded above; the complete unchanged suite passed serially with properly
  isolated model and raw-SQL state. Schema URL parameters alone do not isolate
  unqualified worker SQL. No default development records were cleaned up and no
  new worker isolation/runtime source behavior is claimed by this auth command.
- Other P1 workflows and operator/provider/SMTP/monitoring/off-site recovery/policy
  and infrastructure evidence remain open. Production remains **NO-GO**.

#### Recommended next command

Authorize **Phase Review — Review Command 83 and define the next bounded command**.
Do not define Command 84 or begin another command automatically.

### Phase Review — Review Command 83 and Define the Next Bounded Command

- **Status:** Review completed; Command 84 defined but not authorized
- **Date:** 2026-10-04
- **Authorization:** User's "continue" after the explicit proposed Command 83 phase
  review. Authorizes this review and next-command definition only, not Command 84.

#### Scope completed

- Reviewed Command 83 against project rules, the product plan, ADR-058/059, its
  delivered diff, component/hydration tests, deterministic browser specification and
  completion evidence. The guard covers all five entry routes and the login MFA
  branch, disables all named controls, declares native POST only as defense in
  depth, and retains the existing CSRF requests, token/intent links and shared
  two-factor workflow. No corrective application change was identified.
- Confirmed the first hydration commit is tested through public React/DOM APIs;
  browser checks cover disabled successful controls, fictional autofill, native
  click/Enter attempts, unchanged auth/business counts and restored protected POST
  behavior after script release. Their page-local mocks do not independently prove
  backend policy; unchanged real-API lifecycle and recorded auth E2E provide that
  separate evidence. The existing lifecycle/configuration/backend/worker files were
  not changed by Command 83. This is a bounded safeguard, not a security certification.
- Reviewed remaining roadmap gaps and the current manual-payment UI, contract,
  controller and service. The manual ledger's invoice/customer text is unlinked;
  payer proof/details are returned but not presented for explicit inspection.
  Existing protected detail supplies IDs, kind/state, safe proof, timestamps and
  lossless adjustment/refundable amounts. It deliberately restricts records to
  provider `manual` and enforces customer ownership at the service layer.
- Defined Command 84 for one explicit read-only administrator manual-payment review
  and fixed customer/invoice links. Preserve existing financial rules and state
  separation. Broader payment/original-payment history, search/pagination, service
  context, automation and dashboard work remain separate. Command 84 is not implemented.
- Clarified one historical pending-hosted-check line in Command 83's report, retaining
  its chronological failures, serial evidence and later exact-commit results.

#### Files changed

- `CODEX_DEVELOPMENT_COMMANDS.md` — Command 84 scope, safety boundaries, acceptance
  coverage, validation and explicit not-authorized status.
- `docs/DECISIONS.md` — ADR-060, bounded read-only manual-payment context selection.
- `docs/PRODUCT_EXPERIENCE_ROADMAP.md` — phase-review outcome and remaining boundaries.
- `docs/PROGRESS.md` — this report, chronology clarification and exact next command.
- No application, test, dependency, schema, environment or generated files changed.

#### Validation

- Started with clean `main` at `cc88af94735bfda50583983caad1d1a8c794fdca`.
- Fresh seven-file auth/shared-controls/order component run: **51 passed** using
  Vitest `--maxWorkers=1`; shared package contracts: **29 passed**; existing manual/
  gateway payment component baseline: **3 passed**. No test changes or skips.
- Reverified delivered-head [CI 37171092418](https://github.com/ebit101/webhost-billing/actions/runs/37171092418)
  and [CodeQL 37171092361](https://github.com/ebit101/webhost-billing/actions/runs/37171092361)
  completed successfully for exact `cc88af94735bfda50583983caad1d1a8c794fdca`.
  CI includes normal parallel packages, full API/invariants, browser, audit/license
  and production build gates. Command 83's local 401 serial tests, eight auth API
  E2E and 11 browser checks/build are prior delivery evidence, not fresh local
  executions in this documentation-only review. No local database preparation,
  cleanup, deployment, live probe or provider request was performed here.
- `pnpm docs:check`: all four offline validators passed. Repository
  `pnpm format:check` and `git diff --check` passed. Final diff contains only the
  four documentation files listed above.
- Delivery uses a focused documentation commit, fetch/fast-forward-only remote
  reconciliation and non-force push to canonical `origin/main`. Final review-commit
  CI/CodeQL must be verified successful after pushing and before handoff; those
  exact-head results are reported only after execution, not asserted in advance.

#### Decisions made

- Close the bounded auth implementation review with no corrective code change;
  keep backend enforcement and all production gates mandatory.
- Choose manual-payment investigation over broader ledger/framework or provider work:
  it is a frequent adjacent operator task with a ready protected runtime contract.
  Read-only review is not a new mandatory verification gate or financial-policy change.
- Do not repurpose refundable capacity as invoice balance, snapshot names as current
  customer identity or payment/order status as successful hosting provisioning.
- Keep local parallel-worker failure and unqualified raw-SQL isolation risk explicit;
  a future implementation must sequence checks and verify test isolation, not weaken
  deadlines or clean default development records under this UI authorization.

#### Open questions, risks and blockers

- No implementation blocker found for the bounded review slice. The broader manual-
  payment mutation UX, original-payment navigation and first-100 ledger limit remain
  unchanged; this next command does not imply their completion.
- Prior worker timeout/possible retained fictional fixture, schema/search-path
  mismatch risk, existing dependency advisory and direct-main rule bypass remain
  open. This review repairs none of them and makes no general security assurance.
- Credentialed providers, SMTP, monitoring, off-site recovery, business policy,
  infrastructure and operator-pilot evidence remain missing. Production is **NO-GO**.

#### Exact recommended next command

Authorize **Command 84 — Connect Administrator Manual Payment Review to Customer
and Invoice Context**. Do not begin it or define Command 85 automatically.

### Command 84 — Connect Administrator Manual Payment Review to Customer and Invoice Context

- **Status:** Completed; source delivered with passing hosted CI and CodeQL
- **Date:** 2026-10-04
- **Authorization:** Explicit user's "command 84"; no later command authorized.

#### Scope implemented

- Added one explicit read-only manual-payment review in the existing administrator
  workspace. No new route, endpoint, backend model or general review framework.
  The requested UUID and optional customer context are checked before dispatch;
  detail/settings envelopes are parsed at runtime and returned context must match.
  Only selected detail and business-zone GETs use cookies/no-store/abort signals.
- Showed separate transaction kind/state, method, role, submitted payer/note/failure
  text, original amount, adjusted amount, remaining refundable capacity and all five
  recorded dates, with explicit absent facts. Money uses the existing BigInt-safe
  formatter; dates use validated business time zone. Proof is escaped plain text.
- Added fixed customer/invoice links from returned IDs, historical-name wording,
  capacity-versus-balance and payment-versus-provisioning explanations. Adjustments
  explain their separate original-payment relationship without new routes/history reads.
- Selection/retry is keyed; close/unmount/changed customer/changed selection aborts
  and discards delayed reads. The customer-filter workspace remount clears stale
  context. Successful financial mutations clear the review before subsequent refresh,
  including refresh failure. Explicit close restores trigger focus (ledger fallback).
- Preserved existing mutation endpoints/bodies, CSRF, submission-key retry, partial-
  payment policy link, rejection reason, adjustment and ledger/invoice refresh logic.
  No mutation controls moved into the review; first-100 behavior remains unchanged.
- Added component/read API/browser regression evidence. The new browser test creates
  one pending fictional reference only in the existing guarded loopback schema, logs
  in with the fictional administrator and checks links, keyboard/mobile, safe proof
  and unchanged financial/business records. Traces/video/screenshots are disabled
  for that spec. Existing hosting lifecycle and auth-readiness specs/config are unchanged.

#### Files changed

- `apps/web/src/components/payments/admin-payment-review.tsx` — selected read boundary.
- `apps/web/src/components/payments/admin-payment-manager.tsx` — selection, invalidation,
  filter identity and close focus; original financial actions retained.
- `apps/web/src/components/payments/admin-payment-review.test.tsx` — component and
  original mutation-body/idempotency regressions.
- `apps/web/e2e/specs/manual-payment-review.spec.ts` — real-API fictional navigation.
- `apps/api/test/payments.e2e-spec.ts` — owned/admin detail, malformed/not-found and
  anonymous/role read regressions with unchanged financial state; foreign-owner test retained.
- `CODEX_DEVELOPMENT_COMMANDS.md`, `CHANGELOG.md`, `docs/DECISIONS.md`,
  `docs/PRODUCT_EXPERIENCE_ROADMAP.md`, `docs/PROGRESS.md` — authority, ADR-061 and evidence.

#### Validation

- Started clean at `8fae3a87c73e656975f8bb22af5d36e43c383b46`. Read project rules,
  product plan, current command/decisions/progress, installed Next.js server/client
  and data-fetching guidance and the existing payment/order boundaries.
- First focused payment run: 29 passed, four failed because new unscoped payer-name
  selectors matched the recording label and review fact. Scoped to `dt`; no assertion
  weakening, deadline change or financial behavior correction was needed.
- Subsequent payment/auth/order/customer-filter component run: all **88 passed**.
  Three further malformed-JSON/settings/retry regressions were added after that run;
  the final focused ten-file rerun passed all **91 tests**, including all 33 new
  review tests. Required browser/full-suite/build checks remain pending.
- Docker development PostgreSQL and Redis were inspected healthy, with loopback-only
  ports. No Docker lifecycle, cleanup or disk operation performed.
- Lint passed. First strict type check rejected four new Testing Library role-selector
  options copied from Playwright (`exact`). Removed the unsupported options, retaining
  Testing Library's default exact accessible-name matching; final strict type check passed.
- Existing guarded browser preparation successfully recreated only `command26_e2e`
  on loopback and applied all 21 migrations and fictional fixtures. Private child
  invocations verified both Prisma's schema target and raw SQL `current_schema()`;
  connection details were not printed and no environment/config files changed.
- First relevant API E2E run: 11 passed, one failed when the new additional admin
  login hit the unchanged existing rate limit. Moved the admin detail assertion into
  the existing authenticated admin test, preserving auth attempts, limits, deadlines
  and all financial/concurrency assertions. Rerun: **12 passed** across payment and
  invoice suites, including owned/admin detail, rejected reads and unchanged records.
- Remaining required checks are in progress; no unexecuted result is claimed.
  Heavy checks are sequenced under verified fictional-schema/raw-SQL isolation as
  documented under Command 83. Existing VM-module and pg concurrent-query warnings
  were non-failing; no dependency or infrastructure repair is claimed.
- Complete package coverage passed sequentially under verified isolation: **434
  tests** (57 tooling, 29 shared contracts, three queue, 218 web, 98 API unit and
  29 worker). Ran the same package/tooling suites using Vitest `--maxWorkers=1`
  and Jest `--runInBand`, preserving business concurrency assertions and deadlines.
  This is not a claim that the unresolved default local parallel run is repaired.
- `pnpm docs:check` passed all four offline validators; repository-wide
  `pnpm format:check` and `git diff --check` passed. Full browser and production
  build checks are next; hosted delivery is not yet claimed.
- First full browser run: **11 passed, one failed**. All ten existing auth-readiness
  checks and the complete hosting lifecycle passed. The new test navigated before
  asynchronous login completed: its URL-only assertion already matched the shared
  sign-in/dashboard `/admin` address. Require the authenticated Business overview
  heading and the sign-in button's absence before browsing/snapshot; a busy button
  changing its accessible name alone cannot satisfy authenticated readiness.
  No fixed sleep, deadline, auth setting or existing browser assertion changed;
  the full browser rerun remains pending.
- Second browser run reached validated review but its new assertion counted the
  development Strict Mode effect replay as a second read (11 existing tests still
  passed). Track request completion/cancellation separately: exactly one selected
  read must complete, at most one replay may occur and every replay must explicitly
  fail with Chromium's aborted-request outcome. Zero preloads and browsing mutations
  remain mandatory. No application effect, existing tests or framework config changed;
  another full rerun is required to establish this evidence.
- Final full Chromium browser rerun: **12 passed** (the complete original hosting
  lifecycle, all ten auth-readiness tests and the new manual-payment review). The
  review proves no preload, one completed selected read plus only aborted development
  replay, escaped proof, validated fixed destinations, return navigation, 375px layout,
  keyboard close/reopen/focus and unchanged financial/business snapshots with no
  browsing writes. No screenshots/video/traces were recorded by the new spec.
  Existing color/pg warnings and lifecycle failure-path API logs were non-failing;
  no auth, provider, existing test, deadline or framework config correction is claimed.
- Production build passed for all workspace artifacts. The final lint rerun found
  one unnecessary non-null assertion in the rearranged API read test; removed it
  without changing emitted JavaScript or assertions. Final lint/types and the
  affected API rerun are required before delivery.
- Final lint and strict workspace/browser type checks passed after the test-only
  correction. The production build and all component/browser behavior evidence
  remain unchanged; the final relevant API rerun is in progress.
- Final relevant payment/invoice API rerun passed all **12 tests**. Required local
  validation is now positive: 91 focused web checks, 29 shared contracts (also in
  the 434 complete serial package tests), 12 relevant API E2E and 12 browser tests,
  full production build, lint, strict types and offline docs/format/diff checks.
  Initial failed runs and test-only corrections are retained above, not concealed.
- Fetch confirmed canonical `origin/main` has no intervening commits. Delivery will
  use a focused commit, fast-forward-only reconciliation and non-force push. Hosted
  CI and CodeQL must be verified for that exact source commit before handoff; their
  results are not yet claimed. No generated artifacts or environment files are included.
- Delivered source commit `165241e38f6fe0c7026b1efe9c7085acd049bbfc` to canonical
  `origin/main` after fetch/fast-forward-only reconciliation and non-force push.
  [CI 37176915696](https://github.com/ebit101/webhost-billing/actions/runs/37176915696)
  and [CodeQL 37176915686](https://github.com/ebit101/webhost-billing/actions/runs/37176915686)
  both completed successfully for that exact commit. Hosted CI passed the full
  history secret scan, formatting/docs/lint/types, normal parallel package tests,
  complete API integration and critical invariants, full browser suite, production
  dependency audit/license inventory and optimized build. The PR-only dependency-
  review job was skipped on push, not claimed as executed.
- The source push reported the existing direct-main rule bypass and Dependabot
  high advisory 15; a passing production audit does not establish that the tracked
  advisory or branch policy was repaired. Worktree was clean after delivery. This
  completion-evidence update `12242ba5670b471d4c26bec290f31391755fb11e` is
  documentation-only. Its [CI 37177322802](https://github.com/ebit101/webhost-billing/actions/runs/37177322802)
  and [CodeQL 37177322856](https://github.com/ebit101/webhost-billing/actions/runs/37177322856)
  subsequently passed for that exact head, and were reverified during the Command
  84 phase review. Earlier pending-check lines above are historical checkpoints,
  not the command's final unresolved status.

#### Decisions and unresolved risks

- Implement ADR-060 through ADR-061. The review is supplementary read-only context,
  not a required financial approval gate or provider-proof claim.
- Validate timezone separately from the full high-impact settings document; do not
  silently fall back to browser time or preload related records.
- Prior local parallel-worker timeout/retained fictional fixture and unqualified SQL
  isolation risk remain unresolved. No worker, schema, dependency, default development
  data, provider, release or deployment changes are authorized. Production is **NO-GO**.
- Existing dependency advisory and direct-main rule bypass remain tracked risks;
  this UI command makes no general security assurance or branch-policy repair.

#### Exact recommended next command

Authorize **Phase Review — Review Command 84 and define the next bounded command**
next. Do not define or implement Command 85 automatically.

### Phase Review — Review Command 84 and Define the Next Bounded Command

- **Status:** Review completed; Command 85 defined but not authorized
- **Date:** 2026-10-04
- **Authorization:** User's "continue" after the explicit recommended Command 84
  phase review. Authorizes this review and next-command definition only, not Command 85.

#### Scope completed

- Reviewed project rules, product plan, current command, ADR-060/061, delivered
  manual-payment review/manager diff, contracts, protected controller/service,
  component/read API/browser tests and completion evidence. No corrective application
  change was identified. Selected UUID/context and unknown envelopes are validated;
  only selected detail and required time-zone GETs are dispatched. Aborted/inactive
  requests cannot revive closed, changed, retried or successfully mutated context.
- Confirmed kind/state, original/adjusted/refundable amounts and all recorded dates
  remain separate facts. BigInt formatting and business-zone validation preserve
  lossless presentation; proof/reference/failure text is escaped. Snapshot identity
  is labelled historical, capacity is not invoice balance, and payment is not
  provisioning evidence. Fixed customer/invoice links use parsed IDs only; no
  original-payment chain, general review route or mandatory approval gate was added.
- Confirmed existing deliberate recording, verification/rejection and append-only
  adjustment request bodies, CSRF and retry keys remain unchanged. Successful
  mutations clear context before refresh, including refresh failure. API tests reuse
  an existing admin login rather than relax limits. Browser evidence requires an
  authenticated dashboard before browsing and one completed selected read with only
  an explicitly aborted development replay; no sleeps hide readiness failures.
- Inspected remaining roadmap candidates and current administrator invoice UI/API.
  The UI discards metadata and caps its ledger at 100. The protected list already
  supplies bounded search/status/customer pages, stable createdAt/id ordering and
  matching-record counts. Defined Command 85 to expose that existing lookup path
  without financial aggregates or changing draft/identity form behavior. Other
  ledger, customer-picker, service, attention and freshness work stays separately gated.
- Reconciled manual-payment completion in the roadmap and clarified the historical
  pending delivery-check paragraph in Command 84's report, retaining its failed runs.

#### Files changed

- `CODEX_DEVELOPMENT_COMMANDS.md` — bounded Command 85, validation/acceptance and
  explicit not-authorized status.
- `docs/DECISIONS.md` — ADR-062, administrator invoice lookup sequencing.
- `docs/PRODUCT_EXPERIENCE_ROADMAP.md` — payment review completion and next slice.
- `docs/PROGRESS.md` — this review, prior final-head evidence and exact next command.
- No application, test, dependency, schema, environment or generated files changed.

#### Validation

- Started with clean `main` at `12242ba5670b471d4c26bec290f31391755fb11e`.
- Fresh four-file payment review/management, order review and customer-filter run:
  **54 passed**, using Vitest `--maxWorkers=1`. Fresh shared contracts: **29 passed**.
  No test changes, skips, deadline/rate-limit changes or database preparation.
- Reverified delivered-head [CI 37177322802](https://github.com/ebit101/webhost-billing/actions/runs/37177322802)
  and [CodeQL 37177322856](https://github.com/ebit101/webhost-billing/actions/runs/37177322856)
  completed successfully for exact `12242ba5670b471d4c26bec290f31391755fb11e`.
  CI covers normal parallel packages, complete API/invariants, browser, production
  dependency/license and optimized-build gates. Command 84's 434 local serial package,
  12 relevant API and 12 browser tests/build are prior evidence, not fresh executions
  in this documentation-only review. No local Docker/database lifecycle, default-
  data cleanup, live application probe, deployment or provider request performed.
- `pnpm docs:check` passed all four offline validators. Repository-wide
  `pnpm format:check` and `git diff --check` passed. Final review diff contains only
  the four documentation files listed above; no application correction was needed.
- Fetch confirmed no intervening `origin/main` changes. Delivery uses a focused
  documentation commit, fetch/fast-forward-only reconciliation and non-force push
  to canonical `origin/main`. Its exact-head hosted CI/CodeQL must pass before final
  handoff; those results are not asserted in advance.

#### Decisions made

- Close Command 84's bounded read-only implementation review without changing
  application behavior. Backend authorization and every production gate remain mandatory.
- Prioritize operator invoice lookup because it is a frequent billing task with a
  ready protected query contract. Do not expand this into all-ledger pagination,
  customer-picker redesign, service fulfilment or accounting policy.
- Keep ledger queries separate from unsaved financial forms. A future successful
  draft creation must reconcile current filters/order/metadata and distinguish a
  later read failure from write failure, preserving retry idempotency.

#### Open questions, risks and blockers

- No blocker found for defining the next invoice-ledger slice. Implementation and
  its browser/API evidence are not established by this review and require authorization.
- First-100 customer options, other ledgers, original-payment history, service context,
  attention/freshness and inactive chrome remain open; Command 85 closes none of them.
- Local parallel-worker timeout/possible retained fictional fixture, Prisma versus
  unqualified-SQL isolation risk, dependency advisory 15 and direct-main rule bypass
  remain unresolved. Successful hosted tests are not a local worker or policy repair.
- Credentialed providers, SMTP, monitoring, off-site recovery, final business policies,
  infrastructure and operator-pilot evidence remain missing. Production is **NO-GO**.

#### Exact recommended next command

Authorize **Command 85 — Make the Administrator Invoice Ledger Searchable and
Paginated**. Do not begin it or define Command 86 automatically.

### Command 85 — Make the Administrator Invoice Ledger Searchable and Paginated

- **Status:** Completed; source delivered with passing hosted CI and CodeQL
- **Date:** 2026-10-04
- **Authorization:** Explicit user's "commaand 85"; no later command authorized.

#### Scope implemented

- Added administrator-only query parsing for search/status/page/pageSize and the
  existing independent customer-filter boundary. Fixed local URLs encode values
  as data and reject duplicates, malformed values and overflowing offsets.
- Added an independent invoice ledger with labelled search/status/size/pagination,
  explicit applied-versus-draft search, matching-record metadata and distinct empty,
  no-match, invalid, out-of-range and retry states. Invalid ledger URLs do not read;
  invalid customer scope retains its notice and explicit all-customer wording.
- Runtime-validate unknown invoice envelopes, identifiers, exact expected page
  length, counts, duplicate rows and selected customer/status scope. Preserve
  historical identities, BigInt-safe money and existing protected detail links;
  disable detail prefetch and issue no per-row or PDF reads while browsing.
- Only the ledger subtree is keyed. Query changes preserve unfinished invoice
  lines and identity fields. Abort and discard obsolete reads on query/retry/
  revision/unmount. Successful creation refreshes the latest selection, never
  prepends a nonmatching draft, and exposes read retry separately from write success.
- Preserve original creation/identity endpoints, bodies, CSRF, submission-key retry,
  optional-field omission and form success behavior. Customer chooser remains first
  100; no financial, provider, schema, worker, dependency, deployment or cleanup work.
- Add query/server-entry/component regressions and guarded fictional administrator
  browser evidence; extend existing invoice API history tests using an already
  authenticated administrator, not extra sign-ins or relaxed authentication limits.

#### Files changed

- `apps/web/src/lib/admin-invoice-ledger-query.ts` and its test — URL/read boundary.
- `apps/web/src/components/invoices/admin-invoice-ledger.tsx` and its test — read-only
  ledger and unchanged form/mutation regressions.
- `apps/web/src/components/invoices/admin-invoice-manager.tsx` — separate forms/context
  loading and current-query post-create refresh; `invoice-management.test.tsx` —
  existing list fixture and independent-read readiness assertion.
- `apps/web/src/app/(admin)/admin/invoices/page.tsx` and
  `apps/web/src/app/admin-invoice-ledger-entry.test.tsx` — async URL entry.
- `apps/web/e2e/specs/admin-invoice-ledger.spec.ts` — real protected fictional journey.
- `apps/web/e2e/prepare-environment.ts` — correct the existing healthy invoice's
  fictional address snapshot and supply its matching line item for valid read evidence.
- `apps/api/test/invoices.e2e-spec.ts` — admin list/role/read-only regressions.
- `CODEX_DEVELOPMENT_COMMANDS.md`, `CHANGELOG.md`, `docs/DECISIONS.md`,
  `docs/PRODUCT_EXPERIENCE_ROADMAP.md`, `docs/PROGRESS.md` — authority and evidence.

#### Validation

- Started clean on `main` at `8319a63b55f1a02ba00fc35ab1fa2e7fd29cb9d1`.
  Read project instructions, plan, decisions/progress, command and installed Next.js
  client/server, router and Link guidance. No dependency changes.
- First focused run: **47 passed, four failed** from new fixtures including query
  fields in strict pagination metadata, reusing an already-consumed Response, and
  an existing synchronous ledger assertion. Corrected fixtures and independently
  awaited ledger readiness without relaxing schema or assertions. Rerun: **53 passed**.
- First web type check rejected missing `params` in two new typed server-entry test
  invocations. Added the required empty async params; final rerun remains required.
- PostgreSQL/Redis inspected healthy on loopback. Existing guarded preparation
  successfully recreated only `command26_e2e`, applied 21 migrations and fictional
  fixtures. A private child-process override verified Prisma model access and raw
  SQL `current_schema()` target that same fixed schema via connection search_path.
  No connection details printed, environment files edited or development data cleaned.
- Broader focused, API, full package/browser/build and delivery checks are pending.
  No unexecuted validation or hosted result is claimed.
- Final ten-file administrator/customer invoice, payment/order/customer-filter and
  new query/server-entry run: **138 passed** with `--maxWorkers=1`.
- Relevant invoice/customer API E2E: **eight passed**, retaining existing financial
  and ownership tests while proving deterministic administrator pages beyond 100,
  combined description/status/customer queries, strict invalid queries, role and
  anonymous denial and unchanged invoice/financial/business records. Existing VM-
  module/pg warnings were non-failing. Complete suites and delivery remain pending.
- Workspace strict types and lint passed; all four offline documentation validators,
  repository formatting and diff whitespace checks passed. The full browser run
  has passed the new administrator history journey (page six of 105 invoices,
  combined filters, unchanged records, unsaved forms, browser history/refresh and
  mobile keyboard controls); its remaining existing regressions are still running.
- First full browser run: **12 passed, one failed** at the original lifecycle's
  final administrator sign-in. Source inspection confirms the existing account's
  four lifecycle sign-ins plus payment review consume its five-attempt login limit;
  the new ledger sign-in was a sixth. Isolate only the new journey with a dedicated
  fictional administrator created behind the same fixed loopback-schema guard.
  Original lifecycle/payment/auth specs, auth limits/namespaces, deadlines and assertions remain
  unchanged. No raw trace/credential contents were inspected or reported; another
  complete browser run is required.
- Read-boundary inspection found the existing healthy invoice fixture used an
  address shape rejected by `invoiceAddressSchema` and omitted a required line item.
  Corrected only that guarded fictional fixture to the existing read contract,
  retaining its customer, status, amounts, dates and all lifecycle assertions.
  Added all-customer clearing/return evidence to the new ledger browser test.
  The already-running second browser run uses the earlier loaded fixture/spec;
  final full-suite evidence must follow these changes, not be inferred from it.
- Second full browser run: **13 passed** after isolating the new administrator's
  account. All ten auth-readiness checks, payment review and original hosting
  lifecycle passed unchanged. This run used the earlier loaded fixture/spec and
  does not establish the subsequently added all-customer clearing evidence.
- Final lint rerun passed. All **57 tooling tests passed** sequentially. Complete
  package tests now run serially after fresh guarded fictional-schema preparation;
  final expanded browser checks and production build remain required.
- The first serial package invocation stopped before running tests because shared
  contracts use Node/tsx, not Vitest. Corrected the child invocation to each package's
  installed runner (shared tsx, queue/API/worker Jest, web Vitest). No package script,
  dependency or test changed to hide this invocation error; rerun is required.
- Added a fixed malformed-JSON error and focused regression so raw unexpected
  response contents cannot be displayed. Final complete web and browser validation
  must include this last read-boundary refinement.
- Complete package/tooling validation passed sequentially under verified fictional
  model/raw-SQL isolation: **484 tests** (57 tooling, 29 shared, three queue,
  268 web, 98 API unit and 29 worker). Node/tsx, Vitest `--maxWorkers=1` and Jest
  `--runInBand` preserve the original business/concurrency assertions and deadlines.
  This does not claim that default local parallel-worker execution is repaired.
  Existing experimental-VM and intentional outbox failure-path logs were non-failing.
- Final expanded full Chromium browser suite: **13 passed**, including page-six
  older history, combined filters, all-customer clearing/return, browser history/
  refresh, unsaved forms, 375px keyboard controls, no preloads/browsing writes and
  unchanged financial/business snapshots. All ten original auth-readiness checks,
  manual-payment review and complete hosting lifecycle passed unchanged.
- Final strict workspace/browser types, lint and documentation/format checks passed.
  The first production build inherited a non-production NODE_ENV from the private
  test runner and failed static prerendering after Next's environment warning.
  Rerun the build with child-only `NODE_ENV=production`, matching hosted CI.
  No source, environment file, framework configuration or dependency was changed
  to hide this invocation error; build and hosted delivery remain pending.
- Production build rerun with child-only `NODE_ENV=production`: **passed** for all
  workspace packages, optimized Next.js output and NestJS API/worker artifacts.
  Final source has positive local evidence: 484 complete package/tooling tests,
  eight relevant API tests, 13 full browser checks, lint, strict types, docs and
  formatting. Historical failed runs above remain part of the report.
- Fetch confirmed canonical `origin/main` has no intervening changes. Delivery
  uses a focused commit, fast-forward-only reconciliation and non-force push.
  Its exact-source hosted CI and CodeQL must pass before handoff; those results
  are not asserted in advance. No generated/environment files are included.
- Delivered source commit `d2cd50c08208d64f52305c7cd490304b60b99327` to canonical
  `origin/main` after fetch/fast-forward-only reconciliation and non-force push.
  [CI 37198689039](https://github.com/ebit101/webhost-billing/actions/runs/37198689039)
  and [CodeQL 37198689021](https://github.com/ebit101/webhost-billing/actions/runs/37198689021)
  both completed successfully for that exact commit. Hosted CI passed full-history
  secret scanning, formatting/docs/lint/types, normal parallel package tests,
  complete API integration and critical invariants, the full browser suite,
  production dependency audit/license inventory and optimized build. The PR-only
  dependency-review job was skipped on push, not claimed as executed.
- Push retained the existing direct-main rule bypass and high Dependabot advisory
  15; neither governance nor the tracked advisory was repaired. Worktree was clean
  and `HEAD` synchronized with `origin/main` after source delivery. This final
  completion-evidence update is documentation-only; its hosted checks are
  independently required before handoff. Earlier pending-check lines are historical
  checkpoints, not unresolved source validation failures.

#### Decisions and unresolved risks

- Apply ADR-062 through ADR-063. Invoice matching counts are not account balances,
  and invoice state is not payment, order, service or provisioning evidence.
- Separate customer-scope clearing remains available even if optional customer
  display-name lookup fails; ledger scope still names the validated ID honestly.
- Local default parallel-worker timeout/possible retained fictional fixture and
  unqualified-SQL isolation risk remain unresolved. Heavy tests will run sequentially
  with verified fictional isolation, without worker/deadline/assertion changes.
- Dependency advisory 15 and direct-main rule bypass remain existing risks. Missing
  credentialed providers, SMTP, monitoring, off-site recovery, business policies,
  infrastructure and operator-pilot evidence keep production **NO-GO**.

#### Exact recommended next command

After completion, authorize **Phase Review — Review Command 85 and define the next
bounded command**. Do not implement or define Command 86 automatically.

### Phase Review — Review Command 85 and define the next bounded command

- **Status:** Review completed; documentation-only next-command definition
- **Date:** 2026-10-04
- **Authorization:** User's "continue" after Command 85 and its recommended phase
  review; Command 86 implementation is not authorized.

#### Scope reviewed and outcome

- Reconciled Command 85 with project instructions/plan, ADR-062/063, delivered diff,
  route/API role boundary, query/response helpers, independent ledger/forms, tests,
  fictional fixtures/browser journey and recorded validation. No corrective
  application change was identified; this review changes documentation only.
- Confirmed bounded URL inputs/offsets, invalid-query no-read behavior, independent
  customer warning/explicit all-customer scope, encoded fixed destinations,
  runtime page/row/customer/status validation and server ordering/count filters.
  Matching records are not money aggregates. Rows/counts use a transaction but do
  not promise a frozen history across requests or pages.
- Confirmed cookie/no-store abortable GETs, keyed read-only context, distinct
  recovery states, no detail/PDF preloads, unchanged lossless/historical facts,
  persistent unsaved forms and original financial bodies/CSRF/retry keys.
  Successful draft creation refreshes the latest query without injecting a row;
  a subsequent read failure cannot become a duplicate creation retry.
- Defined one next service-inspection slice after inspecting its existing protected
  detail, serializer, shared contract, administrator workspace and ownership tests.
  Service customer identity is current profile data; product references are
  historical snapshots. Nullable order references supply no invoice/payment/order
  state. Command 86 adds no new relationship contract or provider authority.

#### Files changed

- `CODEX_DEVELOPMENT_COMMANDS.md` — full bounded Command 86 definition and explicit
  not-authorized/not-implemented boundary.
- `docs/DECISIONS.md` — ADR-064 for selected application service facts.
- `docs/PRODUCT_EXPERIENCE_ROADMAP.md` — review outcome, remaining boundaries and
  next-slice rationale.
- `docs/PROGRESS.md` — current summary, review evidence and exact next command.

#### Validation

- Started clean on `main` at `563f9ca0ab8ed88158e1d76110ae8776345b2764`.
  Initial remote-tracking comparison was 0 ahead/0 behind.
- Reverified completed-head [CI 37199212977](https://github.com/ebit101/webhost-billing/actions/runs/37199212977)
  and [CodeQL 37199212961](https://github.com/ebit101/webhost-billing/actions/runs/37199212961)
  via hosted metadata: both completed successfully for that exact SHA. This closes
  the preceding completion-report hosted checkpoint, not a new application run.
- Initial web test filter matched eight files (**99 passed**); three filenames did
  not correspond to existing suites. Corrected the filter from the file inventory.
  Final 11-file admin/customer invoice, server-entry, order/payment review and
  customer-filter regression run: **155 passed**, `--maxWorkers=1`.
- Fresh shared contracts: **29 passed**. No application/business rule changed.
  Previous eight API, 13 full browser and 484 complete local package/tooling tests
  plus types/lint/production build are retained Command 85 evidence, not fresh local
  reruns. This review performed no database preparation, Docker or provider action.
- All four offline documentation validators passed; repository-wide Prettier check
  and `git diff --check` passed. Final fetch confirmed canonical `origin/main` has
  no intervening changes (0 ahead/0 behind before the focused review commit).
- Delivery gate: use a focused documentation commit and non-force push after
  reconciliation, then verify CI and CodeQL for that exact review head before final
  handoff. Earlier hosted results cannot substitute for the review head's checks.

#### Decisions and unresolved risks

- Apply ADR-064. Command 86 is definition only; review/close/retry/navigation must
  remain read-only and lifecycle actions retain their current confirmations.
- First-100 customer chooser, other ledgers/service setup, financial histories,
  service relationships, attention/freshness and inactive chrome remain separately
  gated. No cleanup, worker, dependency, release or deployment change is authorized.
- Existing local parallel-worker timeout/retained fictional-fixture risk and
  model-schema versus unqualified-SQL isolation limitation remain unresolved.
  Any later database testing must verify both model and raw-SQL search_path.
- Dependabot advisory 15 and direct-main rule bypass remain tracked. Credentialed
  providers, SMTP, monitoring, off-site recovery, final business policies,
  infrastructure and operator-pilot gates keep production **NO-GO**.

#### Exact recommended next command

Authorize **Command 86 — Add Read-Only Administrator Service Inspection**. Do not
start its implementation or any later command automatically.

### Command 86 — Add Read-Only Administrator Service Inspection

- **Status:** Completed; source delivered with passing CI and CodeQL
- **Date:** 2026-10-04
- **Authorization:** User's "command 86"; no later command authorized.

#### Scope completed

- Add explicit service review through the existing protected detail and validated
  business-zone settings read; no new endpoint, route, relationship or provider call.
- Runtime-validate unknown detail, selected service/customer scope and time zone.
  Abort/discard obsolete selection/close/filter/unmount reads. Invalidate selection
  synchronously on customer scope changes and at every existing mutation dispatch;
  keep unrelated forms mounted and disable new inspection while a mutation runs.
- Show application state, historical product/price references, lossless recurring
  money, nullable order references, current profile identity, server/account and
  lifecycle facts/reasons. Only the fixed returned customer destination is linked;
  no inferred invoice/payment/order/remote-panel state or operation history.
- Preserve all original lifecycle endpoints/bodies/CSRF/keys/reasons and exact
  termination confirmation. Add focused boundary/form/action tests and isolated
  fictional browser evidence; strengthen existing API read/invariant assertions.

#### Files changed

- `apps/web/src/components/services/admin-service-review.tsx` and its test.
- `apps/web/src/components/services/admin-service-manager.tsx`.
- `apps/web/e2e/specs/admin-service-review.spec.ts`.
- `apps/api/test/services.e2e-spec.ts`.
- `CODEX_DEVELOPMENT_COMMANDS.md`, `CHANGELOG.md`, `docs/DECISIONS.md`,
  `docs/PRODUCT_EXPERIENCE_ROADMAP.md`, `docs/PROGRESS.md` — authority and evidence.

#### Validation

- Started clean at `e0a6fea73d916f98ab3d727b270d6a5a0c6bb66f` on `main`.
  Read project/web instructions, plan, decisions/progress, authorized command and
  installed Next.js client/server and Link guidance before web edits.
- Loopback PostgreSQL and Redis inspected healthy; C: had 16.45 GiB and D: 32.49 GiB
  free. No Docker cleanup, disk relocation or default development data mutation.
- Initial web lint passed. First two-file service run: **34 passed, eight failed**
  because seven new assertions expected a customer name alone inside combined
  name/email text and one expected different existing warning wording. Corrected
  exact text assertions; no runtime contract, business behavior or original
  assertion was weakened. Rerun required.
- Focused/API/full package/browser/types/lint/docs/format/build and hosted delivery
  checks remain required; no unexecuted success is claimed.
- Second service run: **41 passed, one failed** because both application service
  and server state legitimately displayed ACTIVE. Narrowed the assertion to the
  labelled application-state fact, retaining server-state coverage. First web
  types rejected three Playwright-style `exact` options in Testing Library calls;
  removed those unsupported options (string role names are already exact).
  Added a delayed-review/failed-mutation discard regression; reruns required.
- Final focused eight-file service/panel, admin/customer invoice, order/payment
  review and customer-filter run: **145 passed**. Web strict application/browser
  types and full workspace lint passed. All four offline documentation validators
  and diff whitespace checks passed; broader validation and delivery remain pending.
- New browser evidence uses its own fixed fictional client with connection
  search_path, verified before fixture creation, so it does not rely on URL schema
  alone. Shared database/worker isolation behavior remains unchanged and unresolved.
- Relevant service/hosting-panel/customer API E2E: **12 passed** across three
  suites after guarded fictional preparation and verified model/raw-SQL isolation.
  Retained ownership, financial/provisioning separation, redaction, retry and exact
  termination tests; added selected administrator GET equality, missing/invalid/
  anonymous denial and unchanged service/operation/financial/audit/outbox evidence.
  Existing pg/experimental-VM warnings were non-failing. Repository formatting passed.
  Complete package/tooling tests, browser suite, workspace types and build remain
  required. No production or default-development database was reset.
- Complete package/tooling validation passed sequentially under verified fictional
  model/raw-SQL isolation: **521 tests** (57 tooling, 29 shared, three queue,
  305 web across 35 files, 98 API unit and 29 worker). Original runner assertions
  and deadlines remain unchanged; experimental-VM and intentional failure-path logs
  were non-failing. This does not repair default local parallel-worker execution.
- Full strict workspace/application/browser types passed. Full browser evidence,
  production build and hosted source delivery remain required.
- First full browser run: **13 passed, one failed**, exposing an incorrect new
  assertion: the existing sibling
  panel workspace reads stored `GET /hosting-panel/operations` history on mount.
  This is not a provider operation. Preserve that component; capture its initialized
  baseline, prove selecting review adds no history read, and allow only that stored
  GET while separately rejecting all browsing writes/action requests. All original
  browser tests remain unchanged; final full-suite rerun is required.
- Final strict workspace/application/browser types and all four offline
  documentation validators passed after the browser assertion correction.
- Final full browser rerun: **14 passed** in 4.3 minutes, including the new
  keyboard/mobile service review and unchanged-record journey, all ten original
  auth-readiness tests, invoice/payment journeys and complete hosting lifecycle.
  Final workspace lint and diff whitespace checks passed. Production build and
  exact-head hosted delivery checks remain pending.
- Production workspace build passed with explicit child `NODE_ENV=production`,
  including optimized Next.js, API, worker and shared artifacts. No private
  environment file or production configuration was changed. Final remote fetch
  confirmed 0 ahead/0 behind before the focused implementation commit.
- Delivery gate: commit the ten scoped files, reconcile without force/history
  rewrite and push `origin/main`; verify CI and CodeQL for that exact source head
  before completing the report. Previous command results are not a substitute.
- Delivery completed: focused implementation commit
  `2b7cc3acc4370d9ae7dd6648cf663c688e38d9ed` was reconciled and non-force pushed
  to canonical `origin/main`. Exact-head
  [CI 37204856354](https://github.com/ebit101/webhost-billing/actions/runs/37204856354)
  and [CodeQL 37204856364](https://github.com/ebit101/webhost-billing/actions/runs/37204856364)
  both completed successfully. Hosted package/API/critical-invariant/browser tests,
  production dependency audit, license inventory and production build passed.
  Dependency review was skipped as expected for the authorized direct-main push,
  not a claimed pull-request check. The existing rule bypass remains tracked below.
- Final repository-wide formatting and offline documentation checks passed locally;
  no generated/dependency/private environment artifact was committed. Record these
  verified source results in a documentation-only completion commit, then verify
  its exact-head CI/CodeQL before final handoff; application code is unchanged.

#### Decisions and unresolved risks

- Apply ADR-064 and ADR-065. Current customer identity is not an invoice snapshot; a service
  read is not provider verification. Review is read-only, never an approval gate.
- First-100/service setup limitations, other relationships/workflows, worker/isolation,
  dependency/governance and production gates remain outside this authorization.
  Production stays **NO-GO**; use fake providers and verified fictional isolation.
- Existing Dependabot high advisory 15 and direct-main rule bypass remain tracked,
  not repaired. Credentialed providers, SMTP, monitoring, off-site recovery, final
  business policies, infrastructure and operator-pilot evidence remain production
  gates; source delivery does not authorize deployment or a new release.

#### Exact recommended next command

Authorize **Phase Review — Review Command 86 and define the next
bounded command**. Do not define or implement Command 87 automatically.

### Phase Review — Review Command 86 and define the next bounded command

- **Status:** Review completed; correction delivered; Command 87 definition only
- **Date:** 2026-10-04
- **Authorization:** User's "contiue" after Command 86 and the recommended phase
  review. Command 87 implementation is not authorized.

#### Scope reviewed and correction

- Reviewed project/web instructions, plan, decisions, current/recent progress,
  Command 86, its delivered diff, protected detail/serializer/runtime schemas,
  service/panel managers, route composition, fixtures and regression evidence.
- Found a missed page boundary: creation/lifecycle dispatch cleared service review,
  but the separate panel manager's configuration, connection test, account tools
  and manual retry could leave old review facts visible after beginning an operation.
- Added one page-local client coordinator with a dispatch revision and pending
  count. Sibling dispatch synchronously clears/aborts review before CSRF/request
  work; inspection stays disabled until all begun panel requests finish. Success,
  failure and delayed review responses never restore old selection automatically.
  Forms remain mounted; service and panel requests/bodies/keys/confirmations,
  classification, eligibility and exact termination behavior remain unchanged.
- Confirmed safe current-profile/historical-product distinctions, lossless money,
  business-zone validation, nullable facts and fixed customer links. No provider
  authority, financial relationship, new endpoint or approval gate was added.
- Defined only Command 87: URL-bound administrator service inventory search/status
  and pagination through existing API metadata. Customer scope, forms, selected
  review and mutation reconciliation must remain independent and safe. Setup/tool/
  history scale and broader fulfilment remain separately gated.

#### Files changed

- `apps/web/src/components/services/admin-services-workspace.tsx` — page-local
  coordination, no global framework.
- `apps/web/src/app/(admin)/admin/services/page.tsx`,
  `apps/web/src/components/services/admin-service-manager.tsx`,
  `apps/web/src/components/services/admin-hosting-operation-manager.tsx` — connect
  dispatch invalidation while retaining original forms and requests.
- `apps/web/src/components/services/admin-service-review.test.tsx` and
  `apps/web/e2e/specs/admin-service-review.spec.ts` — sibling boundary regressions.
- `CODEX_DEVELOPMENT_COMMANDS.md`, `CHANGELOG.md`, `docs/DECISIONS.md`,
  `docs/PRODUCT_EXPERIENCE_ROADMAP.md`, `docs/PROGRESS.md` — outcome and definition.

#### Validation

- Started clean at `37b29f33c612e5e2ef1dd635e49ed1600f3576a3` on `main`.
  Reverified exact-head
  [CI 37205283977](https://github.com/ebit101/webhost-billing/actions/runs/37205283977)
  and [CodeQL 37205283991](https://github.com/ebit101/webhost-billing/actions/runs/37205283991):
  both successful, closing Command 86's completion-report checkpoint.
- Read the installed Next.js server/client guide before code edits. Loopback
  PostgreSQL/Redis were healthy; C: 16.44 GiB and D: 32.46 GiB free. No cleanup,
  relocation, external provider or default-development database action.
- Fresh two-file service regression: **51 passed**, including eight new tests for
  all seven sibling dispatch paths, exact original request/CSRF/body evidence,
  unfinished creation/reason forms, pending inspection blocking, failed requests,
  late-response abort/discard and successful completion without resurrection.
- Fresh focused eight-file service/panel, invoice/order/payment and customer-scope
  regression: **153 passed**. Shared contracts: **29 passed**. Web strict application/
  browser types and full workspace lint passed. Full web/browser/build and final
  documentation/format checks remain pending; no unexecuted success is claimed.
- Prior Command 86's 521 complete package/tooling tests and 12 relevant API tests
  are retained evidence, not new local runs. Backend/contracts/worker are unchanged.
  Final exact-head CI/CodeQL must independently validate the review source.
- Complete fresh web suite: **313 passed** across 35 files, preserving all original
  assertions and timing limits. All four offline documentation validators, scoped
  formatting and diff whitespace checks passed. Full browser evidence, workspace
  types/production build and exact-head delivery remain pending.
- Full strict workspace/application/browser types passed. Before and after guarded
  browser preparation, verified fictional Prisma model and raw-SQL search_path
  isolation; only the fixed loopback `command26_e2e` schema was recreated. The
  expanded service journey disables private artifacts and intercepts one deliberate
  fictional panel failure after separately proving zero inspection writes. Original
  lifecycle/auth browser tests, rate limits and deadlines remain unchanged.
- Full fresh Chromium suite: **14 passed** in 3.4 minutes, including expanded
  service inspection/held sibling failure, invoice/payment journeys, all ten auth-
  readiness checks and complete original hosting lifecycle. Inspection/navigation
  produced no writes; the deliberately intercepted POST produced no business
  record changes. Fresh workspace types/lint are positive; build/delivery pending.
- Production workspace build passed with explicit child `NODE_ENV=production`,
  including optimized Next.js and API/worker/shared artifacts. Final repository-wide
  formatting, all four offline documentation validators and whitespace checks
  passed. No failed runtime/test run occurred during this correction validation.
- Fetch confirmed 0 ahead/0 behind before the focused review commit. Deliver the
  eleven scoped files by non-force push after reconciliation, verify CI/CodeQL for
  that exact review head, then record completion without starting Command 87.
- Delivered correction/definition commit
  `7c12d0648bff29e84df3b5b2cd37056f4ebee448` to canonical `origin/main` after
  reconciliation and non-force push. Exact-head
  [CI 37212883274](https://github.com/ebit101/webhost-billing/actions/runs/37212883274)
  and [CodeQL 37212883340](https://github.com/ebit101/webhost-billing/actions/runs/37212883340)
  both completed successfully. Hosted history-secret scan, package tests, full API
  integration, critical invariants, browser suite, production audit/license inventory
  and production build passed. PR-only dependency review was skipped on push,
  not claimed as executed; the existing branch-rule bypass remains unresolved.
- Earlier pending lines are historical checkpoints, not unresolved validation
  failures. This completion report changes documentation only; verify its own
  exact-head CI/CodeQL before final handoff. Command 87 remains unauthorized and
  unimplemented. No generated/dependency/private artifacts or live deployment.

#### Decisions and unresolved risks

- Apply ADR-066 and define ADR-067. Stored application facts are not remote
  verification, and matching service counts are not balances or financial states.
- Local default parallel-worker timing/retained fictional fixtures and unqualified
  SQL isolation remain unresolved. Verify both model schema and raw-SQL search_path
  before database testing; do not change worker/deadlines/dependencies to mask them.
- First-100 service inventory is defined next, not implemented here. Setup/tool/
  history scale, other ledgers, richer relationships, action redesign, dashboard/
  freshness/chrome, advisory 15 and direct-main governance remain separate.
- Production remains **NO-GO**: credentialed providers, SMTP, monitoring, off-site
  recovery, final policies, infrastructure and operator-pilot evidence remain gates.
  No deployment, release, cleanup or later implementation is authorized.

#### Exact recommended next command

Authorize **Command 87 — Make Administrator Service Inventory Searchable and
Paginated**. Do not start it or any later command automatically.

### Command 87 — Make Administrator Service Inventory Searchable and Paginated

- **Status:** Completed; delivered to `origin/main` with exact-source-head CI/CodeQL verified
- **Date:** 2026-10-04
- **Authorization:** User explicitly authorized Command 87 by its full title.
- **Validation/delivery:** Continued on 2026-10-05 (Asia/Dhaka).

#### Scope completed

- Replaced only fixed first-100 administrator inventory with existing protected
  `GET /services` and service/pagination runtime schemas. Server entry narrows URL
  search/status/page/page-size and independent optional customer scope. Duplicate,
  malformed, overlong, unsupported server-filter and overflowing-offset inputs
  block inventory reads; no arbitrary navigation destination is retained.
- Search/status/page-size reset page deliberately. Clearing inventory filters
  retains valid customer scope; clearing customer scope is separate. Applied scope,
  invalid-customer warning, all-customer wording, matching-record counts and current
  versus historical identities are explicit. Existing search semantics and server
  createdAt/ID descending order remain intact; reads are not a frozen history.
- Abortable cookie/no-store reads validate every row, scope, unique IDs, count/page
  metadata and expected page length. Superseded requests, retry and unmount cannot
  restore old rows/counts. Loading, invalid, malformed/inconsistent, failed, empty
  and out-of-range states have honest recovery; network errors are sanitized.
- Only the read-only inventory remounts. Query/retry invalidates selected review,
  preserving unfinished creation, evidence/confirmation and panel inputs. A retained
  action explicitly identifies its original service and never retargets a new row.
  Keyboard navigation restores inventory-heading focus; mobile filters stay bounded.
- Existing creation/status/panel bodies, keys, CSRF, eligibility, classification and
  exact TERMINATE confirmation remain intact. Sibling dispatch clears/blocks review
  as before; completion refreshes the latest applied query without injecting a
  nonmatching service, restoring inspection or repeating writes on failed reads.
  Setup/options, account tools and stored history retain their independent surfaces.
- Added fictional >100-record query/component, API and browser evidence; no new
  endpoint, route, schema, financial rule, service relationship or provider authority.

#### Files changed

- `apps/web/src/lib/admin-service-ledger-query.ts` and its test — URL/runtime boundary.
- `apps/web/src/components/services/admin-service-ledger.tsx` and its test — independent
  inventory, query navigation, cancellation and recovery.
- `apps/web/src/app/(admin)/admin/services/page.tsx` and
  `apps/web/src/app/admin-service-ledger-entry.test.tsx` — server-entry narrowing.
- `apps/web/src/components/services/admin-service-manager.tsx`,
  `apps/web/src/components/services/admin-services-workspace.tsx` — retained forms,
  original targets, selected-review invalidation and latest-query reconciliation.
- `apps/web/src/components/services/admin-service-review.test.tsx`,
  `apps/web/src/components/services/service-management.test.tsx` — retain assertions,
  adapt response metadata and asynchronous inventory waits to the independent read.
- `apps/api/test/services.e2e-spec.ts` — existing search/status/customer/ordering/count
  evidence, including a 140-record history and read-only record comparisons.
- `apps/web/e2e/specs/admin-service-ledger.spec.ts` — isolated fictional administrator,
  guarded connection/schema/search_path, dedicated disabled fake history server and
  older-service search/page/review/customer journey; private artifacts disabled.
- `CODEX_DEVELOPMENT_COMMANDS.md`, `CHANGELOG.md`, `docs/DECISIONS.md`,
  `docs/PRODUCT_EXPERIENCE_ROADMAP.md`, `docs/PROGRESS.md` — authorization and outcome.

#### Validation

- Started clean on `main` at `69f5355aabd1e983fef1e5def06cb9687c3a8238` with the
  canonical remote. Read project instructions, plan, decisions/progress, Command 87,
  installed Next.js server/client, Link/prefetch and router guidance before edits.
  C: approximately 16.46 GiB and D: 32.41 GiB free; no Docker cleanup or relocation.
- Fresh focused eleven-file service/panel, query/server-entry, invoice/order/payment
  and customer-filter regression: **203 passed**. Tests prove >100 history, combined
  filters/restoration/clearing, malformed/duplicate/unsafe URL blocking, bad rows/scope/
  metadata, delayed discard, safe errors/GET retry, retained forms/original targets,
  review abort, latest-query reconciliation and unchanged original operation bodies.
- Verified both fictional Prisma model and raw-SQL search_path before and after
  guarded preparation of the fixed loopback `command26_e2e` schema. Fresh six-file
  relevant API/financial/hosting invariant E2E: **39 passed**, including all original
  role/ownership, evidence, state-separation and operation regressions.
- Initial focused failures were asynchronous fixture assumptions (2), an exposed
  network error (1, corrected), and a copied server-entry expected status (1). Initial
  lint/types found a focus-ref naming issue, stale removed-helper call and RTL option;
  these were corrected without weakening assertions, rules or deadlines.
- First full browser run: **13 passed, 2 failed**. New fixture used an unsupported
  server enum; corrected to the existing DISABLED value on a dedicated fictional
  server, avoiding original active-server capacity. Pagination's added status role
  collided with the original operation-status assertion; use polite live inventory
  announcements while preserving original action status and lifecycle assertions.
  These intermediate failures were resolved and revalidated by the final runs below.
- Second full browser run: **14 passed, 1 failed** (3.1 minutes). All original
  lifecycle/auth/review journeys passed. New journey reached older records and
  combined filters, then encountered an ambiguous searchbox locator from existing
  workspace chrome; scope the locator to the inventory search field. No original
  assertion or timeout was relaxed; final focused/full browser reruns passed below.
- Corrected focused browser journey: **1 passed** (51.6 seconds), including older
  page/search, combined scope/status, history/refresh, keyboard, 375px filters,
  selected review/customer link, separate clearing, out-of-range/invalid recovery,
  zero browsing writes and unchanged service/operation/financial/audit/outbox facts.
- Full fresh Chromium suite: **15 passed** (3.0 minutes), preserving all original
  lifecycle, auth-readiness, service/panel, invoice and payment journeys. Strengthened
  new API/browser comparisons to retain complete audit/outbox records, not merely
  counts; these final assertions were revalidated before delivery. No product behavior,
  fixture ownership, worker/source dependency or original assertion was broadened.
- Final strengthened-record revalidation: **39 relevant API tests passed** again
  (35.1 seconds), followed by a guarded fresh-schema **15/15 full Chromium pass**
  (2.9 minutes). Complete audit/outbox comparisons passed alongside unchanged
  service/operation/invoice/payment records. All original journey assertions,
  fixture rate limits and deadlines remain unchanged.
- Complete fresh package/tooling coverage passed sequentially under the verified
  fictional connection: all nine tooling test commands, **29 shared**, **3 queue**,
  **363 web tests across 38 files**, **98 API unit tests across 24 suites**, and
  **29 worker tests across 10 suites**. Original tests/timeouts were not changed;
  local Nest/queue package execution used `--runInBand` to avoid the recorded
  parallel timing risk. This is not a claim that default local scheduling/isolation
  has been repaired; hosted CI still exercises its ordinary complete command.
- Final workspace lint initially identified three unnecessary non-null assertions
  in the new API fixture. Removed only the erased type assertions; runtime data,
  expectations and business behavior are unchanged. Service E2E and the full
  lint/type/docs/format/production-build sequence were rerun successfully below.
- Final quality sequence passed after the type-only fixture correction: **6 service
  API E2E tests**, full workspace lint, full strict workspace type checking (including
  generated Next.js routes and browser tests), all **four offline documentation
  validators**, repository formatting and the complete production build with explicit
  `NODE_ENV=production`. All package, Next.js, API and worker build steps succeeded.
- Focused 17-file source commit `d4b9a91187014b01c7cdaacc13707bb6c6ace40c`
  was reconciled without force and pushed to canonical `origin/main`. Exact-source-head
  [CI](https://github.com/ebit101/webhost-billing/actions/runs/37224469334) and
  [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/37224469340)
  both completed successfully. CI validated full-history secret scanning, formatting,
  offline documentation, lint, types, default package tests, full API integration,
  critical invariants, browser lifecycle, production dependency audit, license inventory
  and the production build. Pull-request-only dependency review was skipped on push,
  not reported as executed. Final report delivery and its own exact-head checks are
  verified separately at handoff; no production deployment or release was performed.

#### Decisions and unresolved risks

- Apply ADR-068. Inventory is read-only application evidence, never balance,
  remote verification, financial-state inference or a service-action approval gate.
- Known default parallel-worker timing/retained fictional fixture and unqualified
  raw-SQL isolation risks remain unresolved. Private local validation uses explicit
  connection search_path with model/raw verification; worker/dependency/deadline and
  default-development records remain untouched. Exact-source-head hosted gates passed;
  that result does not establish a repair of the recorded local timing/isolation risks.
- Setup/tool/history scale, customer service history, other ledgers, richer relations,
  action redesign, attention/freshness/chrome, advisory 15 and direct-main governance
  remain separate. No release, deployment, cleanup or next implementation authorized.
- Production remains **NO-GO**: credentialed providers, SMTP, monitoring, off-site
  recovery, final policy/infrastructure and operator-pilot evidence remain gates.

#### Exact recommended next command

Authorize **Phase Review — Review Command 87 and define the next bounded command**.
Stop after Command 87 delivery; do not define or implement Command 88 automatically.

### Phase Review — Review Command 87 and define the next bounded command

- **Status:** Review completed; test synchronization corrected; Command 88 definition only
- **Date:** 2026-10-05 (Asia/Dhaka)
- **Authorization:** User explicitly requested this phase review. Command 88
  implementation is not authorized.

#### Scope reviewed and outcome

- Read project instructions, product plan, decisions, recent progress, Command 87,
  delivered diff and runtime/API contracts. Reviewed inventory/query/server entry,
  service/panel coordination and operation preservation, large fictional API/browser
  fixtures and component regressions. No corrective application change identified;
  final hosted verification subsequently exposed a test synchronization gap below.
- Confirmed bounded URL/customer parsing, fixed destinations, complete runtime row/
  metadata validation, duplicate/context rejection, abort/discard and honest recovery.
  Counts are matching records; createdAt/ID order is not a frozen cross-page snapshot.
- Confirmed only inventory remounts: unfinished creation/reason/confirmation/panel
  input remains, retained actions identify original targets, query/retry/dispatch
  invalidates review, sibling pending operations block inspection, and completion
  reads the latest query without row injection, review resurrection or repeat writes.
  Original request bodies/CSRF/keys, eligibility and exact TERMINATE gate stay intact.
- Defined only Command 88 from inspected source: `/admin/orders` requests first 100
  and discards pagination, while protected API search/status/customer pages exist.
  Existing search is order number, historical email and any item's domain; sort is
  createdAt/ID, not placedAt. Serializer exposes current profile name and historical
  email/items, not service state. Independent form fields/key and clicked write target
  must survive query changes; ledger scope must not silently reassign creation.

#### Files changed

- `CODEX_DEVELOPMENT_COMMANDS.md` — bounded Command 88 definition and explicit gate.
- `docs/DECISIONS.md` — ADR-069 sequencing/safety boundary.
- `docs/PRODUCT_EXPERIENCE_ROADMAP.md` — service-scale outcome and next order slice.
- `docs/PROGRESS.md` — review evidence, risks and exact next authorization.
- `apps/web/src/components/services/admin-service-ledger.test.tsx` — synchronize
  the delayed-read test with actual request dispatch, retaining abort/discard evidence.
- No application, schema, dependency, worker or deployment behavior changed.

#### Validation

- Started clean on `main` at `59418cfd443827ac63a9f42f3fa3a8dfe9acb1cd`.
  Fetch confirmed 0 ahead/0 behind canonical `origin/main`. Reverified that exact
  delivered head's [CI](https://github.com/ebit101/webhost-billing/actions/runs/37225044376)
  and [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/37225044371)
  both completed successfully. Other Dependabot workflows are not substituted gates.
- Fresh focused **197 tests across 11 files passed**: service query/ledger/server
  entry/review/original management, order review/checkout/management, payment review/
  management, administrator invoice ledger and independent customer-filter regression.
  Fresh shared contracts: **29 passed**. No assertion, deadline or limit was changed.
- Command 87's full local API/browser/package/lint/types/build evidence is retained
  in its report, not claimed as rerun here. No local database reset, provider, Docker
  lifecycle/cleanup or default-development data mutation was needed for this review.
- Scoped documentation formatting, all four offline validators and whitespace
  checks passed. Deliver only the four reviewed documentation files through a focused
  commit, remote reconciliation and non-force push. Final exact-review-head CI/CodeQL
  verification is required before handoff; no unexecuted gate is claimed as passed.
- Documentation definition commit `cc2f57b139f9cb8d7d8b2f89b38c64a5f0468079`
  was reconciled and non-force pushed. Its CodeQL passed, but
  [CI](https://github.com/ebit101/webhost-billing/actions/runs/37256922619) failed
  at package tests: **362 web tests passed, 1 failed**. The delayed inventory test
  captured `oldRead` after the search field appeared but before the read effect ran,
  producing an undefined lookup rather than an abort/discard assertion failure.
  Add default-deadline `waitFor` assertions for actual first/back request dispatch;
  retain all original abort, late-response, restored-query and unmount assertions.
  No sleeps, retries, timing limits, exclusions or application behavior changed.
  Fresh correction validation passed: **26 focused inventory tests**, complete
  **363 web tests across 38 files**, web lint, strict web/application/browser types,
  scoped formatting, all four offline documentation validators and whitespace checks.
  Installed Next.js testing/client guidance was read before the test edit. Deliver
  this focused correction and verify its own exact-head CI/CodeQL before handoff;
  no application/schema/worker/provider or local database behavior was changed.

#### Decisions and unresolved risks

- Define ADR-069 and Command 88 only; preserve ADR-068 and separate state/history
  boundaries. Review is not an operation approval gate or remote-account proof.
- Known local parallel-worker timing/retained fictional fixture and raw-SQL isolation
  limitations remain unresolved. Future database checks must verify both model schema
  and raw-SQL search_path; green hosted checks do not establish their local repair.
- Customer histories, other ledgers, setup/tool/history/picker scale, relationships,
  action redesign, attention/freshness/chrome, advisory 15 and direct-main governance
  remain separate. Production stays **NO-GO** pending credentialed providers, SMTP,
  monitoring, off-site recovery, final policies/infrastructure and operator pilot.
- No Command 88 implementation, release, cleanup or deployment is authorized here.

#### Exact recommended next command

Authorize **Command 88 — Make Administrator Order Ledger Searchable and Paginated**.
Stop after this review's delivery; do not implement Command 88 automatically.

### Command 88 — Make Administrator Order Ledger Searchable and Paginated

- **Status:** Completed — implemented, locally validated and source delivery verified
- **Date:** 2026-10-05
- **Authorization:** The user explicitly requested Command 88 by its full title.

#### Scope implemented

- Replace only the administrator order list with bounded URL search/status/page/
  page-size and independently validated customer scope using existing contracts.
  Reject duplicate/malformed/unsupported owned inputs and unsafe offsets; expose
  fixed local navigation and honest invalid/empty/out-of-range/retry states.
- Validate all order/item/invoice facts, unique IDs, scope and authoritative counts.
  Abort/discard superseded cookie/no-store reads. Search retains historical email,
  order number and any requested domain semantics; ordering remains createdAt/ID.
- Keep creation fields, selected customer/product/price and submission key outside
  the query-keyed subtree. Clear/abort review before navigation/retry/mutation;
  inspection stays blocked during writes. Preserve original mutation targets,
  bodies, CSRF, eligibility and submission-key lifecycle; refresh the latest query
  after completion without injecting nonmatching records or replaying a write.
- Add >100-record query/component/API/browser evidence with all-item historical
  review, fixed customer/invoice links, history/reload/keyboard/375px checks and
  complete before/after business snapshots. Fake providers and fictional isolated
  accounts only; no credential-bearing traces/video/screenshots.

#### Files changed

- `apps/web/src/app/(admin)/admin/orders/page.tsx` and server-entry regression.
- `apps/web/src/lib/admin-order-ledger-query.ts` and query/metadata tests.
- `apps/web/src/components/orders/admin-order-ledger.tsx`, its tests, manager
  integration and retained original order/checkout regressions.
- `apps/api/test/orders.e2e-spec.ts` and
  `apps/web/e2e/specs/admin-order-ledger.spec.ts`; the existing lifecycle's exact
  customer-clear URL expectation now includes canonical page/page-size defaults.
- `CHANGELOG.md`, `CODEX_DEVELOPMENT_COMMANDS.md`, `docs/DECISIONS.md`,
  `docs/PRODUCT_EXPERIENCE_ROADMAP.md` and this report.

#### Validation

- Started clean on main at `ee937cc965ff06096b58d530451f9c8019bc6c5b`;
  existing review correction's exact-head CI/CodeQL completed successfully.
- Focused new ledger/query/entry plus retained order/checkout regressions:
  **70 tests across 4 files passed**. Initial test-only failure used an unavailable
  Chai matcher; corrected to the same native disabled-property assertion used
  by existing tests. No product assertion or default deadline was weakened.
- Guarded local database preparation verifies both Prisma model access and
  raw-SQL current_schema at fixed loopback `command26_e2e`, with explicit
  search_path. Focused orders API: **6 passed**; fictional older-order browser
  journey: **1 passed (51.9s)**, with complete unchanged business snapshots.
  Initial API snapshot included intentional access-denial audits: moved role/
  ownership probes before the permitted-browsing baseline, retaining both checks.
  Initial browser attempts hit a local 404 during overlapping type generation,
  then an exact text-label locator mismatch for a wrapped select. Sequential
  rerun and unique role-based creation selectors passed without changing default
  deadlines or product assertions. Strict web/browser types passed after removing
  two unsupported testing-library options. Complete suite, workspace quality,
  production build and exact-head hosted checks are pending, not claimed passed.
- Complete local web **419/41 files**, API unit **98/24 suites**, shared **29**,
  queue **3**, worker **29/10 suites** and all nine tooling-test commands passed.
  Local Nest checks were serial; no timing limit or worker assertion changed.
  Critical API integrations **40/6 suites passed**. Initial full browser run:
  **15 passed, 1 failed** solely because the retained lifecycle asserted the old
  bare customer-clear URL. Update that one exact expectation to the intended bounded
  URL; retain every lifecycle/business assertion and rerun the complete suite.
- Complete browser rerun: **16 passed (3.1m)**. API lint then rejected an
  unnecessary non-null TypeScript assertion in the new fixture; remove that
  assertion without changing runtime expectations, and rerun focused API plus
  complete workspace quality/build checks before delivery.
- Final focused orders API rerun **6 passed** after the lint-only fixture correction.
  Complete API/worker/web lint, strict workspace/application/browser types, all four
  offline documentation validators, repository-wide Prettier check and optimized
  production build **passed**. No dependency, deadline, worker source or original
  business assertion was changed. Whitespace checks passed and fetch confirmed
  **0 ahead/0 behind** canonical origin/main before the focused commit.
- Deliver the validated scoped changes with a focused commit and non-force push;
  verify that exact source head's CI and CodeQL before final handoff. Hosted gates
  are not yet claimed passed in this pre-push report. No release or deployment.

#### Delivery closure

- Focused implementation commit `08a3a96135b71e94d53e9c367c5fd24205a0ee7d`
  was reconciled and non-force pushed to canonical origin/main. Working tree was
  clean and main/origin/main were **0 ahead/0 behind** after delivery.
- That exact source head's
  [CI](https://github.com/ebit101/webhost-billing/actions/runs/37260467919) and
  [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/37260467903)
  both completed **successfully**. CI independently passed full-history secrets,
  frozen dependency installation, database verification, format/docs/lint/types,
  default package tests, full API integration, critical invariants, browser tests,
  production dependency audit/license inventory and production build.
  PR-only dependency review was skipped on this push, not claimed executed.
- Push repeated the existing direct-main required-PR/check bypass warning and
  high Dependabot advisory 15. No rule, dependency or production gate was altered.
  Successful hosted default worker tests do not establish repair of the retained
  local timing/fixture or raw-SQL isolation limitations.
- This final report-only closure is validated with formatting, all four offline
  documentation checks and whitespace checks, then committed/reconciled/non-force
  pushed. Verify its own exact-head CI/CodeQL before final handoff and report the
  final links there; do not substitute this source head's results for that check.

#### Decisions and unresolved risks

- ADR-070 isolates the order ledger from creation state and preserves historical
  search semantics, original write targets and independent billing/service states.
- No API/schema/worker/dependency, other ledger, picker scale, provider, cleanup,
  release or deployment change. Production remains **NO-GO**.
- Known parallel-worker timing/retained fictional fixture and URL-schema-only
  raw-SQL isolation risks are not repaired here. Run local Nest tests serially,
  verify both schema boundaries, and retain original deadlines/assertions.
- Advisory 15, direct-main governance and broader production/provider/SMTP/
  recovery/policy/infrastructure/operator-pilot gates remain separately unresolved.

#### Exact recommended next command

**Phase Review — Review Command 88 and define the next bounded command.**
Stop after Command 88 delivery; do not define or implement Command 89 automatically.

### Phase Review — Review Command 88 and define the next bounded command

- **Status:** Review completed; no corrective application change identified;
  Command 89 definition only
- **Date:** 2026-10-05 (Asia/Dhaka)
- **Authorization:** User said “continue” after the proposed Command 88 phase
  review. This authorizes review/definition, not Command 89 implementation.

#### Scope reviewed and outcome

- Read project instructions, product plan, decisions, relevant progress, Command 88
  and delivered changes. Reviewed query/server entry/ledger/manager, original review,
  order API/runtime contracts and large fictional API/browser/component fixtures.
- Confirmed bounded URL inputs and offsets, independently validated customer scope,
  fixed destinations, full item/invoice/metadata validation, duplicate/scope/status
  rejection, abort/discard and honest invalid/empty/out-of-range/GET retry behavior.
- Confirmed creation/customer/product/price/domain/note and submission keys remain
  independent of ledger navigation. Setup options load once and retain their
  existing initial loading boundary. Query/retry and mutation dispatch clear review;
  pending writes block inspection. Original clicked status IDs, CSRF/bodies/keys
  remain unchanged; completion reconciles latest filters without row injection,
  repeat writes, stale review or loss of successful creation notice.
- Search is historical email/order number/any item domain, not current profile
  identity or invoice/product name. Sorting is createdAt/ID, not placedAt. Counts
  are matching records, not money or service/provisioning proof. No new correction
  to application or test behavior was found by this review.
- Defined Command 89 only from inspected customer source: `/portal/orders` fetches
  `/orders/my?pageSize=100`, discards pagination and has no search/status controls.
  Existing customer-only controller derives scope from the authenticated identity.
  One read-only customer history is next; invoice links/richer relationships and
  all-item review remain separate, not implicitly implemented by pagination.

#### Files changed

- `CODEX_DEVELOPMENT_COMMANDS.md` — bounded Command 89 and explicit authorization.
- `docs/DECISIONS.md` — ADR-071 ownership/history sequencing boundary.
- `docs/PRODUCT_EXPERIENCE_ROADMAP.md` — review outcome and customer history gap.
- `docs/PROGRESS.md` — review evidence, retained risks and exact next command.
- No application, API, test, schema, dependency, worker or deployment changes.

#### Validation

- Started clean on main at `6b075a3c631b72d959c84352f8b0e0575fa00826`.
  Fetch confirmed **0 ahead/0 behind** canonical origin/main. Reverified that exact
  delivered report head's
  [CI](https://github.com/ebit101/webhost-billing/actions/runs/37261087772) and
  [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/37261087775)
  completed **successfully**; this closes Command 88's report-head handoff check.
- Fresh focused order query/ledger/server-entry/review/original checkout-management,
  service inventory/management, invoice ledger, payment review/management and customer
  filter regressions: **184 tests across 11 files passed**. Fresh shared contracts:
  **29 passed**. No assertion, timing limit, authentication limit or test changed.
- Command 88's full local API/browser/package/lint/types/build evidence remains in
  its report; those database/browser/build checks are not claimed rerun locally here.
  No database preparation/reset, provider request, Docker lifecycle/cleanup or
  default-development record mutation was needed for this documentation-only review.
- Complete fresh web regression: **419 tests across 41 files passed**. Scoped
  Prettier formatting, all **four offline documentation validators** and whitespace
  checks passed. Deliver only the four reviewed documentation files through a focused
  commit, remote reconciliation and non-force push. Verify the exact review head's
  CI/CodeQL before handoff; pending hosted gates are not claimed passed.

#### Decisions and unresolved risks

- ADR-071 defines Command 89 only. Preserve ADR-070 and independent financial/
  order/service state, historical snapshots and lossless monetary serialization.
- Retain known local parallel-worker timing/fictional fixture and URL-schema-only
  raw-SQL isolation limitations. Future DB checks must verify model schema and raw
  search_path; hosted success does not establish a local repair.
- Other ledgers, invoice/service links, picker/setup/tool/history scale, operation
  redesign, attention/freshness/chrome, advisory 15 and direct-main governance remain
  separate. Production stays **NO-GO** pending credentialed providers, SMTP,
  monitoring, off-site recovery, policies/infrastructure and operator pilot.
- No Command 89 implementation, release, cleanup or deployment authorized here.

#### Exact recommended next command

Authorize **Command 89 — Make Customer Order History Searchable and Paginated**.
Stop after review delivery; do not start Command 89 automatically.

### Command 89 — Make Customer Order History Searchable and Paginated

- **Status:** Completed and delivered to GitHub `main`; source-head hosted checks
  passed; final report-head verification required before handoff
- **Date:** 2026-10-05
- **Authorization:** User explicitly requested “command 89”.

#### Scope implemented

- Replace the first-100 customer order fetch with URL-bound search/status/page/
  page-size and existing customer-only `/orders/my`. Only those four validated
  fields reach requests or fixed local destinations; identity remains session-derived.
- Bound inputs/offsets, block invalid reads, validate every row/item/invoice and
  authoritative pagination, reject duplicate/status/inconsistent metadata and
  abort/discard superseded query/retry/unmount results. Provide honest invalid,
  loading, safe failure/GET retry, empty/no matches and out-of-range recovery.
- Preserve historical email/order-number/any-item-domain search and createdAt/ID
  ordering. Counts are records, not balances, settlement or provisioning evidence.
  First-item summaries explicitly identify additional items; original checkout,
  invoice text, lossless money and separate business state remain unchanged.
- Add query/server-entry/component regressions, customer API ownership/history
  checks and one isolated fictional browser journey beyond 100 orders, including
  history/reload/keyboard/mobile and complete unchanged business snapshots.

#### Files changed

- `apps/web/src/app/(portal)/portal/orders/page.tsx` and server-entry regression.
- `apps/web/src/lib/customer-order-ledger-query.ts` and URL/metadata regression.
- `apps/web/src/components/orders/customer-order-list.tsx` and component regression.
- `apps/api/test/orders.e2e-spec.ts` and
  `apps/web/e2e/specs/customer-order-ledger.spec.ts`.
- `CHANGELOG.md`, `CODEX_DEVELOPMENT_COMMANDS.md`, `docs/DECISIONS.md`,
  `docs/PRODUCT_EXPERIENCE_ROADMAP.md` and this report.

#### Validation

- Started clean on main at `652a1cf60a90849f96125ef8eabc7aa3f249e8ee`; fetch
  confirmed 0 ahead/0 behind canonical origin/main. Prior review exact-head CI and
  CodeQL were verified successful before handoff; no deployment or release.
- Read project rules/plan/decisions/relevant progress and installed Next.js
  server/client, async page/searchParams, useRouter and Vitest/Playwright guidance.
- Focused new customer query/server-entry/component plus retained order/checkout
  regression: **67 tests across four files passed**. Initial failure exposed a
  strict-schema builder rejecting an extra identity field; explicitly select only
  four owned fields before validation. Initial types rejected two unsupported test
  options and undeclared direct zod import; use the shared inferred order query
  type and supported test options, adding no dependency or changing assertions.
  Strict web/application/browser types then passed. One additional delayed-retry
  regression subsequently passed in the complete web run.
- Guarded loopback preparation verified both Prisma model access and raw SQL
  current_schema in fixed `command26_e2e` with explicit search_path. Orders API:
  **7 passed**, including >100 owned pages, any-item/historical search, deterministic
  ties, isolated status/counts, supplied identity rejection and complete unchanged
  business snapshots. Denied-role probes precede the permitted browsing baseline.
- Focused fictional browser journey **1 passed (1.6m)** with complete unchanged
  business snapshots and owned counts excluding another account's records.
- Complete local web **471/44 files**, API unit **98/24 suites**, shared **29**,
  queue **3**, worker **29/10 suites** and all nine tooling-test commands passed.
  Local Nest checks were serial; no worker/timing or original business assertion
  was changed. Critical API integrations **41/6 suites passed**.
- Complete fictional browser regressions: **17 passed (3.3m)**. Workspace lint,
  strict types, all four offline documentation validators, repository formatting
  and the complete production build passed. Lint initially reported unused mock
  parameters in new component tests; retain explicit mock request types without
  unused parameters. Final focused **68/four files** and web lint then passed
  without warnings; a fresh complete web rerun **471/44 files** also passed after
  that correction. No assertion or timing threshold was changed. After the report
  update, all four documentation validators and repository formatting passed again.
- GitHub delivery and exact-head hosted checks are pending, not claimed passed.

#### Delivery closure

- Focused implementation commit `b2769120dcc003708796a859dea79e2573378e91`
  was reconciled and non-force pushed to canonical origin/main. Working tree was
  clean and main/origin/main were **0 ahead/0 behind** after delivery.
- That exact source head's
  [CI](https://github.com/ebit101/webhost-billing/actions/runs/37304312803) and
  [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/37304312807)
  both completed **successfully**. CI independently passed full-history secrets,
  frozen dependency installation, database verification, format/docs/lint/types,
  default package tests, full API integration, critical invariants, browser tests,
  production dependency audit/license inventory and production build.
  PR-only dependency review was skipped on this push, not claimed executed.
- Push repeated the existing direct-main required-PR/check bypass warning and
  high Dependabot advisory 15. No rule, dependency or production gate was altered.
  Successful hosted default worker tests do not establish repair of the retained
  local timing/fixture or raw-SQL isolation limitations. Earlier pending lines
  are historical checkpoints, not unresolved source validation failures.
- This final report-only closure is validated with formatting, all four offline
  documentation checks and whitespace checks, then committed/reconciled/non-force
  pushed. Verify its own exact-head CI/CodeQL before final handoff and report the
  final links there; do not substitute this source head's results for that check.

#### Decisions and unresolved risks

- ADR-072 isolates read-only history and keeps customer ownership/API authority,
  historical snapshots, monetary precision and separate order/invoice/service state.
- No backend behavior, schema, worker, dependency, other ledger, new invoice/service
  link, provider, cleanup, release or deployment changes. Production remains **NO-GO**.
- Known local parallel-worker timing/fictional fixture and URL-schema-only raw-SQL
  isolation limitations remain unresolved. Verify both schema boundaries and run
  local Nest checks serially without altered deadlines, records or assertions.
- Advisory 15, direct-main governance and credentialed provider/SMTP/monitoring/
  off-site recovery/policy/infrastructure/operator-pilot gates remain separate.

#### Exact recommended next command

**Phase Review — Review Command 89 and define the next bounded command.**
Stop after Command 89 delivery; do not define or implement Command 90 automatically.

### Phase Review — Review Command 89 and Define the Next Bounded Command

- **Status:** Review completed; no corrective application change identified;
  Command 90 definition only
- **Date:** 2026-10-05 (Asia/Dhaka)
- **Authorization:** User said “continue” after the proposed Command 89 phase
  review. This authorizes review/definition, not Command 90 implementation.

#### Scope reviewed and outcome

- Read project rules, product plan, decisions, relevant progress, Command 89 and
  delivered source/tests. Reviewed query parser/builder, async server entry, customer
  list, full runtime order/pagination contracts, session-scoped API and dedicated
  fictional component/API/browser histories beyond 100.
- Confirmed singular bounded query/offset validation, invalid-read blocking,
  ignored identity/redirect inputs and fixed local destinations. Complete runtime
  rows/items/invoice/money and authoritative pagination reject malformed,
  duplicate, wrong-status and inconsistent results. Abort/active guards discard
  superseded query/retry/unmount responses; recovery stays GET-only.
- Historical email/order-number/any-item-domain search and createdAt/ID ordering
  are retained. First-item summaries disclose additional items; counts are records,
  not financial or service/provisioning evidence. Checkout destinations, invoice
  text and independent order/invoice/service rules remain unchanged. No corrective
  application or test behavior change identified by this review.
- Defined only Command 90 from inspected source: customer service cards load
  `/services/my?pageSize=100` and discard pagination. Existing customer-only API
  omits customer/server filters, derives identity from the session and supplies
  domain/historical-product/current-email/external-account search, createdAt/ID
  ordering and owned counts. Preserve cards/detail links and deliberate panel login.
  Support lookup adds creation/reply/selection concerns; choose this smaller read-only
  inventory first, without authorizing service-detail or financial relationships.

#### Files changed

- `CODEX_DEVELOPMENT_COMMANDS.md` — bounded Command 90 and explicit authorization.
- `docs/DECISIONS.md` — ADR-073 ownership-bound service lookup sequencing.
- `docs/PRODUCT_EXPERIENCE_ROADMAP.md` — review outcome and next inventory gap.
- `docs/PROGRESS.md` — review evidence, retained risks and exact next command.
- No application, API, test, schema, dependency, worker or deployment changes.

#### Validation

- Started clean on main at `5b665f1a0df4d00860a0a4a15b6aafbfeb6dc722`.
  Fetch confirmed **0 ahead/0 behind** canonical origin/main. Reverified that exact
  delivered report head's
  [CI](https://github.com/ebit101/webhost-billing/actions/runs/37305391397) and
  [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/37305391387)
  completed **successfully**; this closes Command 89's final-report handoff check.
- Fresh focused customer order query/list/server-entry, administrator order query/
  ledger/review, original checkout/management, service inventory/review/management
  and invoice regressions: **248 tests across 13 files passed**. Fresh shared
  contracts: **29 passed**. No assertion, timing limit or test was changed.
- Command 89's complete local API/browser/package/lint/types/build evidence remains
  in its report; those database/browser/build checks are not claimed rerun locally
  here. No database preparation/reset, provider call, Docker lifecycle/cleanup or
  development record mutation was needed for this documentation-only review.
- Complete fresh web regression: **471 tests across 44 files passed**. Scoped
  Prettier formatting, repository formatting, all **four offline documentation
  validators** and whitespace checks passed. Deliver only the four reviewed
  documentation files via a focused commit, remote reconciliation and non-force
  push; verify the exact review head's CI/CodeQL before handoff. Pending hosted
  gates are not claimed passed, and no release or deployment is authorized.

#### Decisions and unresolved risks

- ADR-073 defines Command 90 only. Preserve ADR-072 and independent financial/
  service/provisioning state, historical snapshots and lossless money.
- Retain known local parallel-worker timing/fictional fixture and URL-schema-only
  raw-SQL isolation limitations. Future DB checks must verify both model schema
  and raw search_path; hosted success does not establish a local repair.
- Other ledgers, service detail/return intent, richer relationships, support
  service-picker/setup/tool/history scale, attention/freshness/chrome, advisory 15
  and direct-main governance remain separate. Production stays **NO-GO** pending
  credentialed providers, SMTP, monitoring, off-site recovery, policy/infrastructure
  and operator pilot. No Command 90 implementation, release, cleanup or deployment.

#### Exact recommended next command

Authorize **Command 90 — Make Customer Service Inventory Searchable and Paginated**.
Stop after review delivery; do not start Command 90 automatically.

### Command 90 — Make Customer Service Inventory Searchable and Paginated

- **Status:** Completed and delivered to GitHub main; exact source-head CI/CodeQL passed
- **Date:** 2026-10-05 (Asia/Dhaka)
- **Authorization:** User explicitly said "command 90". No next command authorized.

#### Scope completed

- Replaced only the customer service inventory's fixed first-100 read with bounded
  URL search/status/page/page-size and the existing customer-only `/services/my`.
  Only singular supported fields are forwarded; invalid/duplicate/unsafe offsets
  block reads. Customer/server/redirect/other input is ignored, not used as scope.
- Async server entry restores committed filters on reload and history navigation.
  Search/status/size changes reset page one while retaining other applied filters;
  fixed local destinations, clear, Previous/Next and authoritative count/range/page
  feedback never silently clamp an out-of-range page.
- Complete runtime service/server/money/nullable lifecycle and pagination checks
  reject malformed facts, duplicate IDs, wrong applied status and inconsistent
  metadata/page lengths. Cookie/no-store GETs abort and discard superseded query,
  retry and unmount results. Recovery is safe, distinct and read-only.
- Preserved original cards, lossless recurring amount, next-due date, stored status,
  text server/username and fixed validated UUID detail links. Null domain explicitly
  reads "Domain unavailable"; missing username remains "Pending setup". Detail,
  Back to services and deliberate panel login remain unchanged. No eager detail
  reads, provider checks, login generation or business writes during browsing.
- Search retains domain/historical product/current email/external-account meaning;
  ordering remains createdAt/ID, not start/due dates or frozen history. Matching
  counts are records, not money, active hosting or remote-state evidence.
- Added focused query/entry/component, owned API history beyond 100 and a dedicated
  fictional keyboard/mobile/history/detail browser journey. API access-denial
  probes stay outside permitted-browsing business/audit snapshots; traces/video/
  screenshots are disabled. No business/security rule or test deadline changed.

#### Files changed

- `apps/web/src/lib/customer-service-ledger-query.ts` and its focused tests.
- `apps/web/src/app/(portal)/portal/services/page.tsx` and
  `apps/web/src/app/customer-service-ledger-entry.test.tsx`.
- `apps/web/src/components/services/customer-service-list.tsx` and its new tests;
  retained `service-management.test.tsx` list fixture uses the new default page size
  and waits for the row, preserving every original assertion.
- `apps/api/test/services.e2e-spec.ts` — owned history/search/count/access/no-write
  regressions; reuses an already authenticated administrator test session.
- `apps/web/e2e/specs/customer-service-ledger.spec.ts` — guarded fictional journey.
- `CHANGELOG.md`, `CODEX_DEVELOPMENT_COMMANDS.md`, `docs/DECISIONS.md`,
  `docs/PRODUCT_EXPERIENCE_ROADMAP.md`, `docs/PROGRESS.md`.

#### Validation

- Started clean at `e89ffc871d84d8c6797b70c6d125c986b5914e3b`; canonical fetch
  confirmed 0 ahead/0 behind. Reverified that exact Phase Review 89 head's
  [CI](https://github.com/ebit101/webhost-billing/actions/runs/37308178133) and
  [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/37308178241)
  successful, closing its final handoff check.
- Read installed Next.js server/client boundary, async page, useRouter and testing
  guidance before edits. Focused query/entry/list/original management: **64 passed
  across four files**. Focused service API: **7 passed**. Web/browser strict types
  and preliminary full lint passed. Both Prisma model access and raw-SQL
  `current_schema` were verified on loopback `command26_e2e` before preparation/tests.
- Initial focused failures exposed a misplaced new test inside cleanup and the
  retained page-size/wait fixture. A subsequent money assertion omitted existing
  display commas; corrected the exact expected lossless string. The first new API
  run hit the existing administrator login limit; reused its authenticated agent
  rather than raising auth limits. All original assertions/deadlines remain.
- The first browser run reached the older detail but a new assertion incorrectly
  assumed one detail GET. The unchanged detail effect runs twice under existing
  development Strict Mode; asserted both exact clicked-target reads while retaining
  zero-preload/panel/write checks. No detail behavior or existing test was altered.
- The initial full API run had **71 passed/one failed**: existing auth ownership
  coverage expects the standard fictional seed customer, absent from browser-only
  preparation. The corrected runner applies the unchanged seed only inside the
  verified fixed fictional schema before rerunning full API checks. Normal/default
  development data, auth assertions and all application/test definitions remain
  unchanged; this is test preparation, not an authentication repair.
- Workspace type checking caught a nullable Prisma JSON read value being spread
  into the new fixture's create input. Added an explicit source-null assertion and
  omitted that insert field, preserving SQL NULL rather than casting or changing
  Prisma contracts. Affected API checks and workspace types are rerun after this
  test-only correction; previous web/browser evidence is unchanged.
- Complete local package regressions passed: **529 web tests across 47 files**,
  **98 API unit tests across 24 suites**, **29 shared contracts**, **three queue
  tests**, **29 worker tests across 10 suites** and all nine root tooling suites.
  Nest checks ran serially without changed deadlines/assertions; this is not a
  claim that the retained default-parallel worker limitation was repaired.
- Final full API integration after the test-only JSON correction: **72 passed
  across 16 suites**; critical API invariants: **42 passed across six suites**.
  Both model and raw-SQL schema guards preceded preparation/tests. Standard seed
  definitions were applied only to the fixed fictional schema, never normal data.
- Complete fictional browser regressions: **18 passed (3.5m)**, including older
  owned service lookup, keyboard/375px/history/detail and unchanged full hosting
  lifecycle. The new journey proves no preloads/panel requests/business writes and
  complete unchanged order/item/invoice/item/payment/event/service/operation/audit/
  outbox snapshots. No browser/application source changed after this successful run.
- Final full lint, strict workspace/application/browser types, all **four offline
  documentation validators**, repository formatting and complete production build
  passed. Whitespace checks passed; canonical fetch remains 0 ahead/0 behind before
  the focused source commit. Commit/reconcile/non-force push and verify exact-head
  CI/CodeQL before handoff; pending hosted gates are not claimed passed. This is not
  a release, deployment or production approval.

#### Delivery evidence and final report closure

- Focused source commit `6c95ea3862533a702bac4a21f9919fd70bc4dbec` was reconciled
  and non-force pushed to canonical origin/main. Working tree was clean and
  main/origin/main were **0 ahead/0 behind** after delivery.
- That exact source head's
  [CI](https://github.com/ebit101/webhost-billing/actions/runs/37314091681) and
  [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/37314091658)
  both completed **successfully**. Hosted CI independently passed full-history
  secrets, frozen installation, database verification, format/docs/lint/types,
  default package tests, full API integration, critical invariants, full browser
  suite, production dependency audit/license inventory and production build.
  PR-only dependency review was skipped on this push, not claimed executed.
- Push repeated the existing direct-main required-PR/check bypass warning and
  high Dependabot advisory 15. No rule or dependency was changed. Hosted success
  does not establish repair of retained local worker/isolation limitations.
  Earlier pending lines are historical checkpoints, not unresolved source failures.
- This report-only closure is checked with formatting, all four offline
  documentation validators and whitespace checks, then committed/reconciled/
  non-force pushed. Verify its own exact-head CI/CodeQL before final handoff and
  report those final links there; never substitute the source-head results.

#### Decisions and unresolved risks

- ADR-074 keeps inventory read-only, ownership API-derived, money lossless and
  order/invoice/payment/service/provisioning states independent.
- No backend behavior, schema, worker, dependency, other ledger, new relationship,
  detail/action redesign, provider, cleanup, release or deployment changes.
  Production remains **NO-GO**.
- Known local parallel-worker timing/fictional fixture and URL-schema-only raw-SQL
  isolation limitations remain unresolved; verify both schema boundaries and run
  local Nest checks serially without changing deadlines, records or assertions.
- Advisory 15, direct-main governance and credentialed provider/SMTP/monitoring/
  off-site recovery/policy/infrastructure/operator-pilot gates remain separate.

#### Exact recommended next command

**Phase Review — Review Command 90 and define the next bounded command.**
Stop after Command 90 delivery. Do not define or implement Command 91 automatically.

### Phase Review — Review Command 90 and Define the Next Bounded Command

- **Status:** Review completed; no corrective application change identified;
  Command 91 definition only
- **Date:** 2026-10-05 (Asia/Dhaka)
- **Authorization:** User explicitly requested the Command 90 phase review and
  next bounded definition. This does not authorize Command 91 implementation.

#### Scope reviewed and outcome

- Read project rules, product plan, decisions, relevant progress and Command 90.
  Reviewed delivered query parser/request builder, async server entry, inventory,
  full runtime service/pagination boundaries, session-scoped API and fictional
  component/API/browser histories beyond 100 services.
- Confirmed only singular bounded search/status/page/pageSize reaches `/services/my`
  or fixed local inventory destinations. Invalid filters block reads; customer,
  server, identity and redirect inputs cannot override session-derived ownership.
  Complete rows/server/money/nullable lifecycle and authoritative metadata reject
  malformed, duplicate, wrong-status or inconsistent results. Abort/active guards
  discard superseded query/retry/unmount reads; safe recovery remains GET-only.
- Existing domain/historical-product/current-email/external-account search and
  createdAt/ID ordering remain intact. Cards retain lossless recurring money,
  next-due dates, nullable placeholders, text server facts and validated detail
  links. No eager detail/panel reads or business writes from inventory browsing;
  original detail and deliberate panel login remain unchanged. Matching counts
  and stored application state are not financial or live remote-hosting evidence.
  No corrective application/test behavior change identified by this review.
- Defined only Command 91 from inspected customer ticket manager, shared ticket
  contracts and API source: `/tickets/my?pageSize=100` still discards metadata,
  shares state with creation/replies and automatically opens the first ticket.
  Protected customer API supplies session-owned search and counts with
  status/priority/updatedAt/ID ordering. Bound the next change to search/status/pages
  and deliberate conversation selection, preserving independent creation and
  ticket-bound reply drafts, original pending targets/keys and latest-query GET
  reconciliation. No service/priority/assignment history filter or new workflow.
- Customer support has ready dependencies without financial adjustment or new
  cross-record models. Administrator support/payment ledgers require their own
  workspace/action safeguards; service-picker/message scale remains separate.

#### Files changed

- `CODEX_DEVELOPMENT_COMMANDS.md` — bounded Command 91 definition/authorization gate.
- `docs/DECISIONS.md` — ADR-075 ticket-history sequencing and independent drafts.
- `docs/PRODUCT_EXPERIENCE_ROADMAP.md` — review outcome and next support-history gap.
- `docs/PROGRESS.md` — review evidence, retained risks and exact next command.
- No application, API, test, schema, dependency, worker or deployment changes.

#### Validation and delivery gate

- Started clean on main at `5cbce22fbeeb0cea4faeacdbf8fb56d941b49cb1`;
  fetched canonical origin/main with **0 ahead/0 behind**. Reverified that exact
  Command 90 final report head's
  [CI](https://github.com/ebit101/webhost-billing/actions/runs/37315053775) and
  [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/37315053652)
  completed **successfully**. This closes its final-report handoff check, using
  final-head rather than only source-head results.
- Fresh focused customer service/order query, server-entry and list tests;
  administrator service query/ledger/review; original service/order/checkout,
  customer invoice and support regressions: **263 tests across 15 files passed**.
  Fresh shared contracts: **29 passed**. Complete fresh web regression:
  **529 tests across 47 files passed**. No assertion, deadline or test changed.
- Command 90's full local API/browser/package/lint/types/build evidence remains in
  its report; those database/browser/build checks are not claimed rerun locally
  here. No database preparation/reset, provider call, development record mutation,
  Docker lifecycle or disk cleanup was needed for this documentation-only review.
- Scoped Prettier, repository formatting, all four offline documentation validators
  and whitespace checks passed on the final four-file diff before delivery.
  Deliver a focused documentation commit, reconcile without history rewriting,
  non-force push origin/main and verify that exact review head's CI/CodeQL before
  handoff. Pending checks are not claimed passed; no release/deployment authorized.

#### Decisions and unresolved risks

- ADR-075 defines Command 91 only; retain ADR-074, ownership enforcement, historical
  snapshots, lossless money and independent financial/service/provisioning states.
- Retain known local parallel-worker timing/fictional fixture and URL-schema-only
  raw-SQL isolation limitations. Future database checks must verify both model
  schema and raw search_path; hosted success does not establish a local repair.
- Administrator ticket/payment ledgers, picker/message/setup/tool scale, richer
  relationships, attention/freshness/chrome, high Dependabot advisory 15 and
  direct-main required-PR/check bypass governance remain separately gated.
- Production remains **NO-GO** pending credentialed providers, SMTP, monitoring,
  off-site recovery, policy/infrastructure and operator pilot. No Command 91
  implementation, provider, release, cleanup or deployment authorized by this review.

#### Exact recommended next command

Authorize **Command 91 — Make Customer Support Ticket History Searchable and Paginated**.
Stop after review delivery; do not start Command 91 automatically.

### Staging Deployment — Deploy Current Main Through Command 90

- **Status:** Completed staging deployment and verification; documentation delivery gated on exact-head CI/CodeQL
- **Date:** 2026-10-05 (Asia/Dhaka)
- **Authorization:** User requested “deploy all changes to live server.” The
  existing `my.speedhost.bd` installation is documented and verified as isolated
  staging; this authorizes its update, not production promotion or real providers.

#### Scope and preflight evidence

- Pinned candidate: `608562903cd2adbd3b70b8ace5c92259c2ba4c4b`, image tag
  `6085629`; includes implemented work through Command 90 and the Command 91
  definition only. Started clean/synced with canonical origin/main and reverified
  exact-head CI/CodeQL success before building.
- Verified DNS and strict pinned-host SSH to the documented shared host, hostname
  `vmi3398336`, root `/srv/webhost-billing-staging`, project
  `webhost-billing-staging`, current release `71558a8`, loopback listeners and
  healthy staging services. Host had **85 GB free** and **4.8 GiB available RAM**.
  Compose validation, Nginx syntax, public liveness/readiness and protected-path
  permissions passed. The existing unrelated Nginx IPv6 protocol-options warning
  remains; no Nginx modification/reload is planned.
- Read-only database preflight found **21 completed migrations**, **zero
  non-fictional accounts**, **zero integration credentials**, and disabled bKash/
  SSLCOMMERZ. No database/schema changes exist between the prior and candidate
  sources; no migration, seed, reset or data import is planned.
- Two available Speedhost-specific keys were rejected for root. The existing SSH
  profile for this same pinned host succeeded; commands remain staging-scoped.
  No key, SSH configuration or unrelated application was changed. The first SQL
  preflight assumed an incorrect database role and failed read-only; corrected
  checks use the existing PostgreSQL container's configured user/database.
- Created and verified an encrypted pre-deployment backup:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261005T144843Z.dump.gpg`.
  SHA-256: `6184ab1712318f60c39fe6dca2fe981fc23f458ec67102cc237fa7d8b72da4ea`.
  Checksum, OpenPGP integrity, archive structure and required tables passed.
  Protected rollback environment:
  `/srv/webhost-billing-staging/rollback/.env.staging-pre-6085629` (mode `0600`).
  Previous images/release remain retained. Captured protected running-container
  inventory and fingerprints for 15 business tables before rollout.
- Uploaded only the clean pinned Git archive to the new release directory.
  Builds also use that archive, excluding untracked dependencies, generated
  artifacts and secrets. Builds are sequential, with a free-space guard before
  each remaining image. No local/remote prune, volume removal or broad cleanup.
- All four images built and transferred with matching local/remote IDs,
  Linux/amd64 and UID/GID `10001:10001`. Packaged dependency versions matched the
  source lockfile: migration **165**, API **309**, worker **281**, standalone web
  **14**. Frozen installs/supply-chain policies, compilation, web TypeScript/static
  generation, shell syntax and candidate Compose passed. Slow registry requests,
  retries and image copy/export extended build time; no policies or versions changed.

#### Rollout and validation completed

- Candidate Prisma status passed read-only: **21 applied migrations**, schema up
  to date. No migrate deploy, seed, reset or data import was run.
- Refreshed and verified the encrypted backup immediately before the switch:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261005T154456Z.dump.gpg`.
  SHA-256: `3b78a7c42d0c389caa0b5a91dac8480e190ec0ba9c81e1f03cc98e9ba13af450`.
  Refreshed the 15-table baseline; kept the earlier backup and old release/images.
- Stopped only old staging worker/scheduler, atomically switched release/tag and
  recreated only API/web/worker/scheduler with `--no-deps` and a scoped failure
  rollback. Switch completed successfully at **2026-10-05 15:45 UTC**.
- API/web/worker/scheduler healthy with **zero restarts**, exactly one scheduler,
  no detected application errors; public liveness/readiness passed. PostgreSQL,
  Redis, Mailpit and every unrelated running container retained their IDs/images.
  All 15 business-table counts/fingerprints matched before/after the checks.
  All 21 migrations and zero integration credentials remain; gateways disabled.
  Nginx syntax passed with its unchanged warning; no edit/reload performed.
  Host retained about **83 GB free**; local final build check: C **14.71 GiB**,
  D **22.54 GiB** free. No prune, volume deletion or Docker restart.
- Public browser API origin/CSP, both logins/roles, customer 403 for administrator
  API, owned invoice/PDF/support, logout/session rejection, fake payment/hosting
  contracts and clean-Chromium settings route passed. The provider invocation
  first failed resolving piped `/dev/stdin`; standard Node stdin `-` rerun passed.
- Fresh fictional password-reset email reached **SENT** through staging SMTP and
  its outbox **PUBLISHED**; Mailpit sandbox message retention verified. Normal
  authentication/audit/queued-email effects were expected, not business changes.
- Clean-browser public hosting CTA/selection-through-sign-in and all six admin/
  customer invoice/order/service ledgers passed search, page size 100, no-match,
  reload/back/forward, clear, keyboard and **375px** filter-layout checks. Ledger
  browsing had no mutations or browser errors. Temporary runner selectors/login
  readiness were corrected against source/tests; admin and customer successful
  runs provide evidence. An additional admin retry did not reach the dashboard;
  its configured five-per-fifteen-minute protection was left intact, and only the
  remaining customer checks were rerun. No application change or limit bypass.
- This deployment does not claim the earlier full local database/unit/e2e suite
  was rerun. Exact pinned-source hosted CI/CodeQL passed before deployment, and
  release builds and the live staging smokes above were executed successfully.

#### Files changed and documentation delivery

- `docs/STAGING_DEPLOYMENT.md` — current release/images, validation, fresh backup,
  rollback and retained staging-only limitations; historical reports preserved.
- `docs/PROGRESS.md` — deployment scope, actual checks, constraints and next command.
- No application source, dependency, schema or secret changes. Operational helpers
  remained task-local; protected host evidence remains outside Git. No credentials,
  browser traces or real customer information were printed or committed.
- Scoped/repository formatting, all four offline documentation validators and
  whitespace checks passed. Deliver a focused documentation commit, reconcile/
  non-force push main and require that exact head's CI/CodeQL success before
  handoff; no pending check is represented as passed. The documentation-only
  delivery commit does not change the pinned deployed application source.

#### Risks and next command

- Production remains **NO-GO**; real providers, public SMTP, monitoring, off-site
  immutable recovery, policy/infrastructure/operator-pilot gates remain separate.
  The encrypted backup/passphrase remain on the staging host, not off-site.
- Retain local worker/isolation, dependency advisory 15 and direct-main governance
  risks; no repair or approval is implied by deployment or hosted success.
- After documentation delivery, separately authorize **Command 91 — Make Customer
  Support Ticket History Searchable and Paginated**.
  Do not begin Command 91 automatically.

### Resume Command 33 — Finalize Business and Launch Policies From Public Speedhost Sources

- **Status:** Source review recorded; final owner approval BLOCKED
- **Date:** 2026-10-05

#### Scope completed

- Resumed only Command 33 following the owner's instruction to use
  `https://www.speedhost.com.bd/` for real business information and policy.
- Reviewed published contact, shared-hosting, hosting terms, payment and privacy
  pages through read-only requests. Some web-reader requests timed out; direct
  HTTP reads succeeded for contact/shared-hosting/privacy/hosting terms. No login,
  payment, checkout, third-party provider or production operation was performed.
- Added dated public business/address/email/phone candidates with source links;
  kept legal-registration verification and invoice identity approval separate.
- Recorded refund, currency/tax and lifecycle conflicts rather than selecting or
  applying an inconsistent policy. The old privacy page cannot supply exact
  application retention periods or named incident owners.
- Reconciled the policy document's hostname description with existing ADR-041:
  `my.speedhost.bd` is an owner-selected production candidate, not an approved
  production deployment. The staging release and all launch gates are unchanged.

#### Files changed

- `docs/PRODUCTION_BUSINESS_POLICIES.md` — dated source review, candidate details,
  conflict/approval checklist and truthful resumed-blocked status.
- `docs/PROGRESS.md` — current command, scope, validation and remaining decisions.
- No application/default/schema/dependency/secret or production-setting changes.

#### Validation

- Scoped Markdown formatting and repository-wide `pnpm format:check` passed.
- `pnpm docs:check` passed all four offline validators: links/anchors,
  contributor paths/scripts, issue forms and safe-demo screenshot assets.
- `git diff --check` passed. Source conflicts were reviewed against the linked
  public pages; no secret, credential or private customer data was added.
- Application tests/builds are not rerun for this documentation-only source review;
  no business-rule implementation or effective policy has changed.
- Deliver only the validated source-review documentation on `main`, without a
  force push. Hosted CI/CodeQL are triggered by delivery; pending runs are not
  described as passing and do not override the unresolved owner-policy gate.

#### Decisions made

- The supplied site is authorized source material, not verification of a legal
  registration, tax opinion, contradictory policy choice or final launch approval.
- Preserve approved BDT, manual-first modes, renewal settings, disabled partial
  payments, invoice numbering and backup proposal. No automatic fees, termination,
  deletion, currency conversion, worldwide VAT or scope expansion is introduced.
- Public contacts cannot stand in for named/tested maintenance or incident routes.
  Do not commit private operating contacts, service lists or payment credentials.
- Final policy approval and production remain **BLOCKED / NO-GO**. A validated
  documentation delivery does not complete the business-policy launch gate.

#### Open questions and risks

- Owner must choose between the hosting terms' initial 14-day refund and the
  shared-hosting page's yearly 30-day refund, including eligibility/exclusions,
  processing/method/fees and service effect.
- Confirm legal invoice identity, published contact candidates, verified VAT/tax
  treatment/wording, BDT-consistent terms and launch billing periods.
- P1–P2/P4–P5, R1–R4, A5–A7, L3–L6, G1–G3 and named/versioned final approval
  remain open as detailed in the policy worksheet. Public website content may
  change and is not a substitute for an approved, retained policy version.
- All previously recorded infrastructure/security/provider/recovery/SMTP and
  monitoring blockers remain. No production launch or worker/scheduler start.

#### Recommended next command

**Resume Command 33 — Resolve Source Conflicts and Approve Remaining Launch Policies**
after the owner supplies the missing choices and approval. Do not proceed automatically
to Command 34 remediation or Command 91; both require separate authorization.

### Resume Command 33 — Prepare Speed Host Before Final WHMCS Data

- **Status:** Bounded preparation checklist recorded; final policy and migration readiness BLOCKED
- **Date:** 2026-10-05

#### Scope completed

- Recorded the owner's request to prepare this installation for Speed Host and
  supply WHMCS data later. Treated this as preparation intent, not approval of
  unknown legal/VAT, refund, import, provider or production-cutover decisions.
- Added an installation-specific checklist using existing business/localization,
  invoice-numbering, product, payment, email-branding and renewal controls. No
  Speed Host values were applied to generic public defaults or any running app.
- Highlighted the impact of WHMCS invoice history on the empty-baseline 1001
  proposal, historical snapshots, source timezone, monetary/status reconciliation
  and the requirement to keep rehearsal jobs/providers/customer email inactive.
- Inspected application/package/script sources and file paths: no WHMCS importer
  was found. Reviewed official WHMCS export/report documentation as potential
  sources, not as an implemented importer or proof of the owner's source version.
- Recorded assessment, mapping/idempotency, isolated rehearsal/reconciliation and
  final freeze/backup/rollback prerequisites. No real export was requested in chat,
  obtained, read, committed or imported. No source WHMCS system was contacted.

#### Files changed

- `docs/PRODUCTION_BUSINESS_POLICIES.md` — Speed Host preparation checklist and
  separately gated WHMCS migration prerequisites.
- `docs/PROGRESS.md` — scope, validation, open decisions and next step.
- No application/default/schema/provider/secret/dependency or deployment changes.

#### Validation

- Scoped Prettier formatting/check passed for both changed Markdown files.
- `pnpm docs:check` passed all four offline validators (links/anchors,
  contributor paths/scripts, issue forms and safe-demo screenshot assets).
- `git diff --check` passed. Reviewed the focused documentation diff; no real
  data, credentials, application changes or effective policy approval was added.
- Previous source-review commit `d435e61731805ddb2b742f374222b0cf5961d372` passed
  [CI](https://github.com/ebit101/webhost-billing/actions/runs/37340855917) and
  [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/37340855706).
  That evidence does not apply to a later commit or close production gates.
- Initial broad search included a nonexistent `apps/web/src/apps` path; corrected
  read-only source/path searches completed. No importer implementation is claimed.
- Application builds/tests and migration rehearsal are not run for documentation-only
  preparation. The data and importer needed for a rehearsal are not available.
- Deliver a focused documentation commit and reconcile/non-force push `main` after
  validation. That delivery triggers new hosted CI/CodeQL; do not represent pending
  checks as passed or change the pinned staging application release.

#### Decisions made

- Speed Host is the intended installation/display brand, not a verified legal name.
- Prepare now and finalize actual data/policies before cutover. Deferral is not
  business-policy approval, production readiness or authority to import real data.
- WHMCS data requires an assessed/tested mapping, not a direct database replacement.
  Preserve issued financial records and identify unsupported source features without
  silently broadening the product scope or losing business obligations.
- Importer assessment/implementation, infrastructure remediation and production
  launch require separately bounded authorization; none starts automatically here.

#### Open questions and risks

- WHMCS version, anonymized export/schema examples, inventory/migration scope,
  source currencies/timezones and protected transfer method remain unknown.
- Existing Command 33 refund/legal/VAT/contact/payment/retention/operational/gap
  decisions remain unresolved. A data export does not supply missing owner approvals.
- All existing production gates and infrastructure/security/provider/recovery/SMTP/
  monitoring risks remain; production is **NO-GO** and the staging release unchanged.

#### Recommended next command

**Resume Command 33 — Resolve Source Conflicts and Approve Remaining Launch Policies**
when the owner supplies the actual decisions. If the owner wants technical preparation
to proceed while those remain pending, first authorize a bounded next command definition
covering either infrastructure remediation or read-only WHMCS migration assessment.
Do not begin an importer, Command 34 remediation, Command 91 or production cutover implicitly.

### Resume Command 33 — Record Speed Host Identity, Optional Tax and Refund Decisions

- **Status:** Named partial approval recorded; remaining Command 33 operating approvals BLOCKED
- **Date:** 2026-10-05

#### Scope completed

- Recorded the owner's explicit instruction to retain tax fields, require no tax
  input now and let operators configure them when needed. B6–B7 now reflect an
  approved application configuration choice, not a request for a mandatory value.
- Incorporated the owner's subsequent values before delivery: registered business
  name Speed Host Bangladesh, approved website address/email without corrections,
  preferred invoice phone +8801782391434, and Shahadat Hossain — Administrator.
- Recorded owner-declared Not applicable tax/VAT wording, 30-day refund window and
  No need for an additional eligibility/exclusion section. No registration/tax
  certification, mandatory Tax ID placeholder or broader product scope is inferred.
- Verified existing shared contracts, administrator invoice form, invoice
  serialization and HTML/PDF rendering: Tax ID is optional, omitted line tax
  defaults to string `0`, and supplied manual tax remains an integer minor-unit
  amount. No new tax-rate/jurisdiction engine or runtime change was necessary.
- Added regression tests for settings without a tax identifier, an explicitly
  supplied fictional identifier and omitted/explicit invoice-line tax amounts.
- Updated the current preparation checklist, configuration-location record and
  runbook gate to remove the blanket requirement for tax input/custom wording.
  Historical progress reports remain unchanged.

#### Files changed

- `packages/shared/test/settings.spec.ts` — optional-tax regression coverage.
- `docs/PRODUCTION_BUSINESS_POLICIES.md` — B6–B7 approval and configuration scope.
- `docs/PRODUCTION_LAUNCH_RUNBOOK.md` — optional-tax policy boundary in launch gate.
- `docs/PROGRESS.md` — scope, validation and remaining decisions.
- No runtime/default/schema/dependency/provider/secret or production changes.

#### Validation

- `pnpm --filter @webhost-billing/shared test` passed all 31 tests, including
  the two new optional-identifier and omitted/explicit-tax regression cases.
- `pnpm --filter @webhost-billing/shared typecheck` passed.
- Scoped Prettier formatting/check and `git diff --check` passed.
- `pnpm docs:check` passed all four offline documentation validators: links,
  contributor paths, issue forms and safe-demo screenshot assets.
- No database, provider or migration rehearsal is performed for this preserved
  contract behavior. No application release or production deployment is made.
- Deliver only the focused policy/test commit; reconcile and non-force push
  `main`. Newly triggered hosted checks are not claimed as passing while pending.

#### Decisions made

- Tax input is optional for application preparation, not a new mandatory setup
  requirement. Preserve optional Tax ID and manual invoice tax amounts/totals.
- Do not infer a registration, exemption or tax rate, insert a fictional number,
  remove imported tax history or rewrite issued invoice snapshots. Operators
  remain responsible for applicable business obligations and entered amounts.
- This resolves B6–B7's application configuration choice, not unrelated owner
  decisions or the final production business/legal gate.
- B1–B4 now have explicit owner-approved values; P6's published window conflict is
  resolved to 30 days. Preserve exact invoice identity and record the named partial
  approval; no runtime setting, tax wording renderer or refund behavior is changed.

#### Open questions and risks

- Supported billing periods, manual evidence/order review, cancellation, refund
  method/fees/processing/service effects, retention, maintenance/incident contacts/
  windows, first-renewal scope and interface-gap approval remain pending. Do not
  request legal identity, preferred phone, tax input or refund-window choice again
  unless the owner changes the supplied values.
- WHMCS version/scope/exports, importer/rehearsal and infrastructure/security/
  recovery/SMTP/monitoring gates remain separate. Production remains **NO-GO**.

#### Recommended next command

**Resume Command 33 — Resolve Source Conflicts and Approve Remaining Launch Policies**.
Do not request mandatory tax input again for preparation; obtain the remaining actual
owner decisions. No importer, infrastructure remediation, Command 91 or cutover begins
without separate bounded authorization.

### Resume Command 33 — Draft Remaining Speed Host Operating Policies for Approval

- **Status:** Draft completed; owner approval, protected operating inputs and real-portal cutover BLOCKED
- **Date:** 2026-10-05

#### Scope completed

- Produced `DRAFT-OPS-1` inside the existing policy record, with eight review groups:
  periods/manual proof, order approval, cancellation, refund processing, retention,
  maintenance/incident/renewal operations, interface workarounds and real-portal cutover.
- Preserved existing owner approvals without requesting business identity, tax input,
  preferred phone or refund-window choice again. Every new proposal is clearly unapproved.
- Recorded the owner's real operating portal goal for `https://my.speedhost.bd`.
  Anonymous read-only GET returned HTTP 200 and the Webhost Billing title. Existing
  deployment evidence identifies fictional staging release 6085629; no fresh authenticated
  lifecycle/production readiness test or host audit is claimed.
- Separated proposed payment/customer handling from implemented schema/API behavior.
  No nonexistent cancellation scheduler, audit export, batch allowlist, tax engine,
  branding configuration or data importer is represented as implemented.
- Drafted operational retention review targets while leaving applicable financial/legal
  periods and hold/disposal controls for owner verification. Reviewed primary OWASP logging
  guidance; it does not prescribe Speed Host's numerical retention obligations.
- Linked real-portal preparation to existing isolated migration, target/security/recovery,
  SMTP/monitoring/release and final cutover gates. No real customer, payment/provider,
  export, SSH, infrastructure or production action was performed.

#### Files changed

- `docs/PRODUCTION_BUSINESS_POLICIES.md` — DRAFT-OPS-1, review inputs and operating-origin goal.
- `docs/PROGRESS.md` — draft status, actual validation and exact next review step.
- No application/default/schema/test/dependency/provider/secret or deployment changes.

#### Validation

- Scoped Prettier formatting/check and `git diff --check` passed for the two changed files.
- `pnpm docs:check` passed all four offline validators: links/anchors, contributor
  paths/scripts, issue forms and safe-demo screenshot assets.
- Reviewed the focused diff and approval boundaries. The file-preview request was queued
  for the draft's section; this is not evidence that runtime or deployment settings changed.
- Inspected existing product/payment contracts and operations/release records. Some web
  readers timed out; a direct public portal GET succeeded. Initial searches included missing
  documentation/source names; file inventory and actual contracts corrected those paths.
- Application tests/builds are not rerun for this documentation-only draft; no effective
  business rule or runtime behavior is changed.
- Deliver only a focused documentation commit, reconcile and non-force push `main`.
  Hosted CI/CodeQL triggered for that commit remain unclaimed until their results are known;
  prior green evidence does not certify this draft or the requested production cutover.

#### Decisions made

- Draft approval must be explicit; new proposals never inherit the earlier approval of
  concrete defaults. Preserve no automatic termination or normal financial/audit deletion.
- Do not invent legal/tax answers, incident contacts, named appointments, date/time windows,
  product prices, payment destinations or tested workaround/production evidence.
- The request to create a real operating portal states the goal but does not close missing
  target/release/backup/window/rollback and readiness gates. Stop before production mutation;
  do not relabel staging, reuse demo data/secrets or run two billing authorities.

#### Open questions and risks

- D1–D8 approval/edits; actual products/prices/cycles and payment-review owner/destinations;
  lawful retention durations/holds; incident primary/distinct backup/protected routes;
  exact maintenance/first-renewal windows, eligibility and workaround evidence remain required.
- WHMCS mapping/importer/rehearsal and all existing infrastructure/security/recovery/SMTP/
  monitoring/release gates remain separate. Production is **NO-GO**; real portal not created.

#### Recommended next command

**Resume Command 33 — Review DRAFT-OPS-1 and Supply Remaining Operating Approvals**.
Review the eight proposed groups and provide missing owner-controlled values/references.
Only after readiness evidence and final exact target/window confirmation may the separately
authorized production cutover make `my.speedhost.bd` the real operating portal. Do not begin
Command 34 remediation, an importer, Command 91 or cutover automatically.

### Resume Command 33 — Collect Existing Speed Host Portal Branding and Public Information

- **Status:** Source intake completed; application branding and production cutover not performed
- **Date:** 2026-10-05

#### Scope completed

- Checked the supplied `clients.speedhost.com` address; the web reader could not access it,
  local HTTPS failed name resolution, and local DNS reported the hostname does not exist.
- Confirmed the main website links Client Login to `clients.speedhost.com.bd`; reviewed
  that public portal and its pre-sales contact form by anonymous read-only GET. Both the
  main website and linked portal returned HTTP 200.
- Downloaded the portal's original public PNG logo unchanged into an already Git-ignored
  owner-asset directory. Recorded source, PNG dimensions, byte count and SHA-256;
  inspected its pixels without generating or editing a replacement.
- Recorded public identity/navigation and the USD/BDT conflict. Preserved approved BDT,
  Speed Host Bangladesh identity, contacts, optional tax and 30-day refund decisions.
- Kept owner branding outside the generic Apache-2.0 distribution; no WHMCS template,
  customer record, credential, provider asset or authenticated page was collected.

#### Files changed

- `docs/PRODUCTION_BUSINESS_POLICIES.md` — portal source, logo provenance and reuse boundaries.
- `docs/PROGRESS.md` — source-intake outcome, validation and exact next review step.
- Local only: `release-artifacts/owner-assets/speed-host/logo.png`; ignored, not committed
  or deployed. No application, configuration, dependency or schema change.

#### Validation

- Public GETs returned HTTP 200 for the linked portal, contact page and logo. The logo
  response was `image/png`; its PNG signature/dimensions and 14,658-byte length were checked.
- SHA-256 recorded and visual inspection performed; `git check-ignore` confirmed exclusion
  of the local owner logo. No file was replaced or removed.
- Scoped Prettier check, all four `pnpm docs:check` validators and `git diff --check` passed.
  Application tests/builds are not rerun for this documentation/local-source-asset intake.
- Previous draft commit `7c2ed9077007d30d1c5479f1d67d4e8402d2563c` had successful CodeQL;
  CI was still in progress at inspection. New-commit hosted checks are not claimed here.
- Deliver only the focused documentation commit after validation, reconcile and non-force
  push to `main`; the ignored owner logo stays local.

#### Decisions made

- Use the independently linked `.com.bd` source and disclose the supplied hostname failure.
  Public source facts cannot overwrite explicit owner approvals.
- Collect the owner's logo, not the proprietary portal theme or its broader feature set.
  A local logo copy does not implement installation branding or grant trademark rights.
- No production changes, WHMCS import, customer-data access or policy approval was inferred.

#### Open questions and risks

- DRAFT-OPS-1 approval and missing operating inputs, isolated migration and the existing
  infrastructure/security/recovery/SMTP/monitoring/release gates remain open.
- Installation branding needs a separately bounded implementation; generic project branding
  stays unchanged. The local owner asset is not available from a fresh public Git checkout.
- Existing dependency/governance risks remain; production stays **NO-GO**.

#### Recommended next command

**Resume Command 33 — Review DRAFT-OPS-1 and Supply Remaining Operating Approvals**.
Do not start branding implementation, migration, another development command or cutover
without its bounded authorization.

### Resume Command 33 — Implement Installation-Specific Speed Host Web Branding

- **Status:** Bounded local implementation completed; operating approvals and production cutover remain BLOCKED
- **Date:** 2026-10-06; began during the previous local date

#### Scope completed

- Recorded the explicitly approved branding follow-up without authorizing Command 34,
  Command 91, policy acceptance, migration or deployment.
- Added a strict browser-compatible public-branding contract, explicit build-time variables
  and fixed errors. Rejected unsafe/remote/traversal/query-bearing logo paths, invalid links,
  dimensions, markup/control characters, title placeholders and unknown contract fields.
- Reused one renderer for storefront, authentication and both workspaces; updated root and
  nested title templates, homepage brand label, optional tagline and approved footer contacts.
  Preserved generic Webhost Billing defaults, routes, focus/navigation and fictional warnings.
- Added build-time local PNG metadata validation with canonical confinement, file/size/
  signature/IHDR/dimension checks. This is not a complete image decoder or upload facility.
- Prepared the original Speed Host PNG and approved public environment locally outside Git.
  Its SHA-256 matches the source-intake record. No asset redraw, third-party request or CSP
  relaxation; owner trademark rights remain separate from the code licence.
- Added explicit Docker/Compose public build arguments, ignored installation PNGs and
  excluded nested local environments/raw release artifacts from the Docker context.
- Added reproducible anonymous loopback browser checks and deployment/rollback guidance.
  Email settings, invoice snapshots/PDFs, authentication/business rules and providers remain
  unchanged; no customer data, forms, payment, SMTP, database, Docker or live host was used.

#### Files changed

- `packages/shared/src/contracts/web-branding.ts`, `packages/shared/src/index.ts`,
  `packages/shared/test/web-branding.spec.ts` — strict public contract and regressions.
- `apps/web/src/lib/web-branding.ts`, `apps/web/src/lib/validate-brand-logo.ts`,
  `apps/web/src/lib/validate-brand-logo.test.ts`, `apps/web/next.config.ts` — validated public
  build configuration, titles and local file metadata boundary.
- `apps/web/src/components/layout/brand.tsx`, `public-footer.tsx`, `branding.test.tsx`;
  `apps/web/src/app/layout.tsx`, `(store)/page.tsx`, `(admin)/admin/layout.tsx`,
  `(portal)/portal/layout.tsx` — shared rendering, public contacts and metadata.
- `apps/web/package.json`, `apps/web/playwright.branding.config.ts`,
  `apps/web/e2e/branding/branding.spec.ts` — isolated read-only browser validation.
- `apps/web/Dockerfile`, `deploy/production/compose.production.yaml`,
  `deploy/production/.env.example`, `deploy/branding/speed-host.env.example`,
  `.gitignore`, `.dockerignore` — optional packaging and distribution boundaries.
- `CODEX_DEVELOPMENT_COMMANDS.md`, `docs/DECISIONS.md`,
  `docs/PRODUCTION_BUSINESS_POLICIES.md`, `docs/SETTINGS_AND_SECRETS.md`,
  `docs/INSTALLATION_BRANDING.md`, `docs/PROGRESS.md` — authorization, ADR-076 and guidance.
- Local only: `apps/web/.env.local`, `apps/web/public/branding/speed-host-logo.png`,
  `release-artifacts/branding-preview/` screenshots; none committed or deployed.

#### Validation

- Shared build, all **34 shared tests** and shared typecheck passed.
- Focused generic/branded surface, title/contact, unsafe-configuration and PNG metadata
  checks passed. Complete web suite passed **49 files / 538 tests** with `--maxWorkers=2`.
  The first concurrent full-suite run had one 5-second registration-test timeout;
  **537 passed / 1 failed**. The unchanged test passed on the bounded-worker rerun; no
  timeout was increased and the initial failure is not concealed.
- Web lint and both application/e2e typechecks passed. Generic and Speed Host production
  web builds passed. The final local build was restored to the Speed Host profile.
- Anonymous browser checks passed **six generic and six Speed Host scenarios** across
  320/375/1440px home/password-reset screens. Checked native PNG decoding, expected titles,
  local/contact destinations, mobile navigation, keyboard focus and no horizontal overflow.
  Browser requests were GET-only to the pinned loopback origin; no external/provider access.
  Screenshots were visually inspected. Local `next start` emitted its existing standalone-
  output warning; these checks are not a Docker/standalone-container deployment test.
- Production Compose YAML parsed and all nine public-branding build arguments matched the
  Dockerfile. No Docker image build, Compose start or production interpolation check claimed.
- Owner asset hash and Git-ignore checks passed. Scoped Prettier, all four offline
  `pnpm docs:check` validators and `git diff --check` passed after the final report update.
- Deliver only validated source/docs, reconcile and non-force push to `main`. Hosted checks
  for this new commit remain unclaimed until their results are observed.

#### Decisions made

- Installation branding is opt-in and build-time, not a database settings/public policy
  endpoint or multi-tenant theme system. No Speed Host asset is shipped by generic Git.
- Keep the logo unchanged and local with a white backing and responsive aspect ratio.
  Missing/unsafe asset metadata fails the build instead of adding a remote fallback.
- Owner branding does not remove fictional warnings, grant trademark use to other
  operators, approve SMTP or rewrite historical invoice identity.
- User authorization covers this implementation, not the next command or live deployment.

#### Open questions and risks

- A fresh owner deployment requires the separately supplied original PNG and selected
  public build values; changing only runtime variables cannot rebrand an existing image.
- DRAFT-OPS-1 approvals, protected operating inputs, final catalogue, WHMCS isolated import/
  reconciliation, infrastructure/security/recovery/SMTP/monitoring/release and cutover gates
  remain open. Existing dependency, branch-governance and worker-isolation risks remain.
- No authenticated customer/administrator browser lifecycle or live deployment acceptance
  was rerun for this frontend-only slice. Production stays **NO-GO**.

#### Recommended next command

**Resume Command 33 — Review DRAFT-OPS-1 and Supply Remaining Operating Approvals**.
Review the proposed operating groups and provide the missing actual decisions/references.
Do not automatically begin deployment, migration, Command 34 remediation or Command 91.

### Authorized Command 33 follow-up — App-wide sentence-case presentation

- **Status:** Completed and locally validated
- **Date:** 2026-10-06

#### Scope completed

- Recorded the owner's app-wide sentence-case rule in permanent project instructions.
- Removed forced uppercase styling across the storefront, authentication, shared chrome,
  administrator and customer workspaces, table headings and browser invoice view.
- Added explicit shared human-label formatting for enum statuses, priorities, payment
  methods/kinds, billing periods, operational categories and related record summaries.
  Badge content itself remains untouched, including customer/invoice identifiers.
- Updated generated invoice headings, metadata labels, table labels, balance label and
  human status text. Financial values, historical identities and numbering are unchanged.
- Kept currency/country codes, technical acronyms, protocol values, exact destructive
  confirmation tokens, user content and original owner/provider assets unchanged.
- Added source-wide style and component regressions plus generated-invoice label checks;
  expanded anonymous browser checks to reject forced uppercase computed styles.

#### Files changed

- `AGENTS.md`, `CODEX_DEVELOPMENT_COMMANDS.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md` —
  durable rule, bounded authorization, ADR-077 and command tracking.
- `docs/INSTALLATION_BRANDING.md` — presentation guidance and a document-level policy
  reference avoiding an inconsistent Unicode-punctuation fragment in the local validator.
- `packages/shared/src/presentation.ts`, `packages/shared/src/index.ts`,
  `packages/shared/test/presentation.spec.ts` — presentation-only helper and contracts.
- `apps/web/src/app/(store)/` and `apps/web/src/components/` — presentation-only updates
  across existing store/auth/layout/dashboard/customer/order/invoice/payment/service/
  support/product/automation/email surfaces and their affected display assertions;
  new `apps/web/src/components/ui/presentation-rule.test.tsx` guards the app-wide rule.
- `apps/web/e2e/branding/branding.spec.ts` — computed-style browser regression.
- `apps/api/src/modules/invoices/invoice-pdf.service.ts` and its specification —
  invoice label presentation and identifier/currency/snapshot preservation regression.
- Ignored local validation artifacts under `release-artifacts/sentence-case/` and
  `release-artifacts/branding-preview/`; none distributed or deployed.

#### Validation

- Shared build and all 36 shared tests passed.
- Invoice renderer's final three tests passed, including deterministic bytes, pagination/
  draft rejection, sentence-case headings and unchanged snapshot identifiers/currency.
- Fictional invoice preview rendered and visually inspected with the document-validation
  workflow. Sentence-case labels are legible, with preserved identifiers/currency and no
  clipping or overlap. No production data, network provider or live invoice was accessed.
- First full web run: 520 passed / 20 failed, comprising outdated display expectations
  and one unsupported matcher in the new test. A diagnostic run made before all corrections
  completed: 521 passed / 19 outdated display expectations. Only human display assertions
  and the unsupported matcher were corrected; request enums and business checks remain.
- A subsequent corrected run passed 537 tests; one old billing-period display expectation
  and two approximately five-second form-test limits remained. The display assertion was
  corrected without changing fixture enums. A single-worker run then passed 537 tests,
  with three approximately one-second order-ledger read waits failing. That unchanged
  29-test order-ledger file passed in isolation. No timeout or behavioral assertion was
  relaxed. The final standalone full-suite run with `--maxWorkers=2` passed all
  **50 files / 540 tests** in 95.53 seconds, with zero failures.
- Shared typecheck, web application/e2e typechecks, API typecheck and API/web lint passed.
  Speed Host production web build passed; no generic-profile rebuild was required because
  branding configuration/contracts were unchanged.
- Six anonymous Speed Host browser scenarios passed at 320/375/1440px for the home and
  password-reset screens: no forced uppercase computed styles, local image decoding,
  titles, navigation, keyboard focus and no overflow. Representative screenshots were
  visually inspected. Existing standalone-output and color-environment warnings remain;
  this is not a container deployment acceptance check. Requests were loopback GET-only.
- The first documentation run rejected the branding guide's Unicode-punctuation section
  fragment. Replacing it with a document-level link preserved the source policy text and
  all four offline documentation validators then passed.
- Scoped Prettier, Git-ignore checks for local owner assets/configuration/preview artifacts
  and `git diff --check` passed. The original owner-logo hash is unchanged. Final report
  formatting/documentation checks are required again before source delivery.
- Reconciled with `origin/main` without rewriting history. Deliver this validated slice
  through a focused commit and non-force main push; do not infer hosted check results.

#### Decisions made

- Sentence case is a presentation rule, not authorization to alter financial history,
  stored values, user names/content, original logos or safety confirmations.
- Use explicit human-label formatting, not automatic transformation of arbitrary badge
  content, entire pages or user-entered strings. Existing email template headings/subjects
  already use sentence case; no delivery or worker behavior was changed.
- This owner-authorized follow-up does not start the next product or launch command.

#### Open questions and risks

- Remaining operating approvals, infrastructure/security/recovery, final catalogue,
  isolated legacy-data migration/reconciliation, mail/monitoring and cutover gates remain.
- Existing dependency, branch-governance and worker-isolation risks remain outside scope.
- Intermittent local short-wait/test-limit failures are recorded above; isolated success
  does not establish production stability or justify relaxing existing safety assertions.
- No authenticated live browser lifecycle, container build or deployment acceptance is
  claimed. Staging release 6085629 is unchanged; production remains not approved.

#### Recommended next command

**Resume Command 33 — Review DRAFT-OPS-1 and Supply Remaining Operating Approvals**.
Request owner authorization before beginning; do not infer deployment or migration approval.

### Authorized Command 33 follow-up — Review remaining operating policies

- **Status:** Review completed; policy acceptance and required operational evidence pending
- **Date:** 2026-10-06

#### Scope completed

- Reviewed the unchanged `DRAFT-OPS-1` against existing settings boundaries, the recorded
  release checklist and production launch runbook.
- Added an eight-group decision checklist and an approval/input reply form in the existing
  business-policy record. Suggested a staged D1–D4 decision followed by D5–D8 inputs.
- Separated rule approval from catalogue/payment details, named roles, protected contacts,
  retention obligations, exact windows, tested workarounds and release/migration evidence.
- Preserved existing approved identity/contact, optional tax, currency, refund window,
  numbering baseline, partial-payment, renewal, backup and manual-first choices.
- Recorded the latest “Yes” as authorization to review, not policy acceptance or launch.

#### Files changed

- `docs/PRODUCTION_BUSINESS_POLICIES.md` — dated review, decision checklist, staged reply
  and explicit evidence/authority boundaries; draft groups remain unchanged and unapproved.
- `CODEX_DEVELOPMENT_COMMANDS.md` — bounded authorized review and next owner-input command.
- `docs/PROGRESS.md` — current status and this review report.

#### Validation

- Documentation-only change; no schema, default, runtime behavior or business-rule change.
  Application tests, Docker, browsers and deployment acceptance are not claimed.
- Initial scoped Prettier check identified only the new Markdown table's formatting.
  Formatted it with Prettier; the repeat check passed for all three changed documents.
- `pnpm docs:check` passed all four offline validators: links/anchors, contributor paths,
  issue forms and safe-demo assets. `git diff --check` passed.
- Verified the canonical remote and `main` branch; fetched `origin/main` and confirmed zero
  ahead/behind before the focused commit. Delivery uses a non-force push; no hosted check
  result or new source release is inferred.

#### Decisions made

- Existing decisions do not need reapproval. Partial replies approve only their stated
  groups; blanks remain unresolved. No operator is appointed from the approver's identity.
- Review/refund targets require owner acceptance and feasible staffing before publication.
  Retention review dates are not deletion permission or legal retention conclusions.
- Accepting an interface gap requires a named operator and verified workaround; independent
  monitoring and tested incident routes remain mandatory.
- A protected evidence reference is not itself a passed check. This review does not refresh
  historic website, provider, infrastructure or full-release evidence.

#### Open questions and risks

- D1–D8 are still proposed only; actual destinations/operators, retention rules, incident
  backup, windows, first-run eligible list and gap decisions/evidence remain unresolved.
- Infrastructure/security/recovery, real mail/monitoring, final catalogue, legacy migration
  and release/cutover gates remain separate. No live setting or process was changed.
- Command 33's overall business-policy gate remains open. This completed documentation
  review is not final policy approval or production readiness.

#### Recommended next command

**Resume Command 33 — Approve DRAFT-OPS-1 and Supply Remaining Operating Inputs**.
Request explicit owner decisions/inputs before recording approval; do not start Command 34,
migration, deployment or cutover from this review authorization.

### Resume Command 33 — Record D1–D4 operating-rule approval

- **Status:** Partial owner approval recorded; overall business-policy gate still open
- **Date:** 2026-10-06

#### Scope completed

- Recorded the exact owner instruction “Approve draft D1–D4”, previously named approver,
  draft version, reviewed source commit and clearly labelled recording timestamp.
- Marked B11/P2/P4/P5/P6 rule decisions approved within D1–D4's full original constraints.
  Retained the original group text and preserved prior identity/tax/currency/financial rules.
- Recorded D4's Saturday–Thursday working-day definition as approved; no reapproval needed.
- Updated the checklist, remaining-input list, final approval block, launch-runbook checkpoint
  and open-decisions index so policy acceptance is distinct from operational readiness.
- Kept D5–D8 unapproved and all unsupplied inputs/evidence unresolved; no owners appointed.

#### Files changed

- `docs/PRODUCTION_BUSINESS_POLICIES.md` — partial approval, corresponding decision/status
  updates, source-version provenance, remaining inputs and unchanged production effect.
- `docs/PRODUCTION_LAUNCH_RUNBOOK.md` — dated partial-policy checkpoint; gate stays blocked.
- `docs/DECISIONS.md` — current open-input index, preserving existing accepted decisions.
- `docs/PROGRESS.md` — status, completed approval-record slice and next bounded intake.

#### Validation

- Documentation-only approval record: no application policy enforcement, configuration,
  code/schema, database or historical financial record changed. Application tests and
  runtime/deployment acceptance are not claimed.
- Scoped Prettier check passed for all four changed documents after formatting the tables.
- `pnpm docs:check` passed all four offline validators: links/anchors, contributor paths,
  issue forms and safe-demo assets. `git diff --check` passed.
- A read-only Node assertion compared the retained D1–D4 proposal bodies against the pinned
  reviewed commit, removing only the new status annotations: exact match. D5–D8 also match
  the original text, remain unapproved, and the exact instruction/source and no-production-
  effect boundary were verified. No app, private data or external provider was accessed.
- Verified canonical remote and `main`; fetched `origin/main` and confirmed zero ahead/behind
  before the focused commit. Delivery is by non-force push; no hosted checks are claimed.

#### Decisions made

- Owner approval covers the full D1–D4 groups as written at
  `c880605c854c7d963323fb706533c9703446fd24`, not only the reply's short summaries.
- Rule acceptance does not supply catalogue/prices/legacy mapping, reconfirmed destinations,
  cash handling, named payment/order/hosting/cancellation/refund operators or staffing proof.
- Refunds/reversals remain append-only; payment never proves hosting; service consequences
  remain separately verified. No automated termination, disposal or refund is introduced.
- D5–D8, legal retention answers, private routes/incident backup, windows, first eligibility,
  gap acceptance, migration and production go/no-go are not authorized by this reply.

#### Open questions and risks

- Complete the unsupplied D1–D4 operating inputs and prove cancellation/renewal safeguards
  before automation or customer-facing promises. Exact private details stay out of public Git.
- D5–D8 and infrastructure/security/recovery/SMTP/monitoring/migration/release evidence remain
  open. Staging data is not promoted and the production scheduler remains unapproved.
- Existing dependency and branch-governance risks are unchanged; no fresh legal, provider,
  website, infrastructure or full-release audit was performed.

#### Recommended next command

**Resume Command 33 — Resolve D5–D8 and Supply Remaining Operating Inputs**.
Request owner decisions/inputs; do not start a later development/infrastructure command,
publish policies, migrate data or deploy from this partial rule approval.

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

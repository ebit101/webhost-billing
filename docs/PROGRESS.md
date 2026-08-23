# Webhost Billing Development Progress

## Status Summary

- **Current command:** Command 2 — Add Local Infrastructure
- **Current status:** Completed and delivered to GitHub `main`
- **Last updated:** 2026-08-23
- **Next command:** Command 3 — Design the Database Schema
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

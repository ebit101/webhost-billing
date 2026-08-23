# Codex Development Command Playbook

## Webhost Billing

This document contains an ordered sequence of copy-paste prompts for developing the application with Codex from initial setup through production launch.

**Project identifier:** `webhost-billing`

Run one command at a time and do not advance while required checks are failing. The prompts follow the outcome-focused structure recommended by the [official OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices): state the goal, constraints, authorization boundaries, evidence, and success criteria.

## Target Architecture

```text
pnpm TypeScript monorepo
├── apps/api       NestJS REST API
├── apps/web       Next.js App Router
├── apps/worker    NestJS application context + BullMQ
└── packages
    ├── shared     Shared types and runtime schemas
    └── config     Shared configuration

PostgreSQL + Prisma
Redis + BullMQ
Docker Compose + Nginx
```

Replace values in square brackets, such as `[PAYMENT_PROVIDER]`, before running the related command.

---

## Command 0 — Define Permanent Project Rules

```text
Read HOSTING_BILLING_SYSTEM_PLAN.md and inspect the current repository.

Create or update AGENTS.md with durable project instructions:

- This is a private, single-business hosting billing application.
- Use a pnpm TypeScript monorepo.
- apps/api: NestJS REST API.
- apps/web: Next.js App Router.
- apps/worker: NestJS application context with BullMQ.
- packages/shared: shared schemas and types.
- PostgreSQL with Prisma.
- Redis with BullMQ.
- Store money as integer minor units and expose it as a string through JSON.
- Store database timestamps in UTC.
- Keep order, invoice, payment, and service states separate.
- External integrations must use provider-neutral interfaces.
- Financial records must not be hard-deleted.
- Destructive hosting termination must require explicit administrator confirmation.
- Payment callbacks must be authenticated and idempotent.
- Use strict TypeScript without unsafe `any`.
- Add or update tests with every business-rule change.
- Never overwrite unrelated existing work.

Also create docs/DECISIONS.md for architectural decisions and docs/PROGRESS.md for completed and pending work.

Do not implement the application yet. Report the proposed repository structure and any unresolved decisions.
```

## Command 1 — Create the Monorepo

```text
Read AGENTS.md, HOSTING_BILLING_SYSTEM_PLAN.md, and docs/DECISIONS.md.

Scaffold the TypeScript monorepo:

- apps/api: NestJS
- apps/web: Next.js App Router
- apps/worker: NestJS application context
- packages/shared
- packages/config
- pnpm workspaces
- shared TypeScript configuration
- ESLint and Prettier
- Vitest or Jest as appropriate
- environment-variable validation
- Dockerfiles suitable for development
- .env.example without real secrets

Add root commands for lint, typecheck, test, build, and development.

Run dependency installation and all relevant validation. Fix errors before finishing. Update docs/PROGRESS.md.
```

## Command 2 — Add Local Infrastructure

```text
Configure local development infrastructure with Docker Compose:

- PostgreSQL
- Redis
- optional local SMTP testing server
- persistent named volumes
- health checks
- development-safe ports
- no production credentials committed to Git

Configure the API, worker, and web applications to use validated environment variables.

Add documentation covering initial setup, starting infrastructure, database connection, migrations, running each application, stopping services, and resetting development data safely.

Start the infrastructure, verify all health checks, and update docs/PROGRESS.md.
```

## Command 3 — Design the Database Schema

```text
Design and implement the initial Prisma schema for:

- User
- Customer
- AdminProfile
- Product
- ProductPrice
- Order
- OrderItem
- Service
- Server
- Invoice
- InvoiceItem
- Payment
- PaymentEvent
- Ticket
- TicketMessage
- EmailLog
- ActivityLog
- AutomationRun
- Setting
- OutboxEvent

Requirements:

- UUID primary keys
- UTC timestamps
- explicit enums for business states
- integer minor-unit monetary fields using BigInt
- ISO currency codes
- historical snapshots in order and invoice items
- unique invoice and order numbers
- unique provider transaction/event identifiers
- appropriate indexes and foreign-key constraints
- soft deletion only where it is genuinely appropriate
- no normal hard deletion for invoices, payments, or audit records

Document important schema decisions. Create and apply the initial migration. Add a small development seed with fictional data. Run Prisma validation and update docs/PROGRESS.md.
```

## Command 4 — Add Shared Contracts and Errors

```text
Create shared TypeScript contracts for money, pagination, API success responses, API errors, authenticated user identity, roles, order status, invoice status, payment status, service status, and ticket status.

Use a runtime schema library where data crosses an application boundary.

Add centralized NestJS exception handling with stable error codes. Do not expose stack traces, database errors, credentials, or internal provider responses to clients.

Add tests for money serialization, validation, and error formatting. Update docs/PROGRESS.md.
```

## Command 5 — Implement Authentication

```text
Implement secure authentication for the NestJS API and Next.js application.

Requirements:

- email and password registration
- login and logout
- password reset using single-use expiring tokens
- email-verification structure
- Argon2 password hashing
- secure HttpOnly cookie-based sessions
- CSRF protection appropriate to the architecture
- login and password-reset rate limits
- administrator and customer roles
- authorization guards
- ownership checks
- session revocation
- audit events for security-sensitive actions

Do not place long-lived authentication tokens in localStorage.

Add API integration tests covering successful authentication, invalid credentials, expired tokens, access denial, and cross-customer access attempts. Update docs/PROGRESS.md.
```

## Command 6 — Build the Application Layouts

```text
Implement the responsive Next.js application shell based on the approved hosting billing mockups.

Create:

- public/store layout
- customer-portal layout
- administrator layout
- navigation and header
- accessible forms
- reusable table
- reusable status badge
- empty, loading, and error states
- confirmation dialog
- toast notification
- responsive mobile navigation

Use a consistent design system with accessible contrast, keyboard focus, and sensible mobile behavior.

Use fictional data only at this stage. Add component tests for important interactions. Run lint, typecheck, tests, and build.
```

## Command 7 — Implement Customer Management

```text
Implement the customer-management module end to end.

Administrator capabilities:

- create customer
- edit profile and billing information
- search customers
- filter by status
- view customer details
- view linked orders, services, invoices, payments, and tickets
- activate or deactivate account access

Customer capabilities:

- view own profile
- edit permitted profile fields
- change password

Protect all endpoints with role and ownership checks. Record administrator changes in ActivityLog.

Add unit, API integration, and frontend tests. Update docs/PROGRESS.md.
```

## Command 8 — Implement Products and Pricing

```text
Implement hosting products and prices.

Administrator capabilities:

- create and edit products
- activate or archive products
- define yearly, quarterly, or monthly prices
- configure currency
- configure hosting-panel package identifier
- define storage, website, email, and bandwidth display features
- control product ordering and public visibility

Customer capabilities:

- browse active public products
- compare billing periods
- select a product for checkout

Archived products must remain available to historical orders, invoices, and services.

Add validation and tests, then update docs/PROGRESS.md.
```

## Command 9 — Implement Order Creation

```text
Implement the complete order-creation workflow.

Requirements:

- authenticated customer checkout
- administrator-created order
- product and price selection
- domain input and validation
- historical order-item snapshots
- collision-resistant human-readable order number
- order totals calculated only on the server
- database transaction for order and invoice creation
- duplicate-submission protection
- explicit order state transitions
- audit trail

Do not trust prices or totals submitted by the browser.

Build the customer checkout and administrator order-management screens. Add tests for normal orders, invalid products, archived prices, duplicate submissions, and authorization.
```

## Command 10 — Implement Invoices

```text
Implement invoice generation and management.

Requirements:

- stable human-readable invoice numbers
- draft, unpaid, overdue, paid, cancelled, refunded, and partially-refunded states
- historical invoice-item descriptions and prices
- subtotal, discount, tax, credit, paid, and balance calculations
- integer minor-unit calculations
- due dates
- printable invoice view
- business identity and customer billing identity snapshots
- administrator-created invoice
- customer invoice list and details
- cancellation rules
- no deletion of issued invoices

Add extensive calculation and state-transition tests, including zero values and large values. Update docs/PROGRESS.md.
```

## Command 11 — Implement Manual Payments

```text
Implement manual payment recording and approval.

Support:

- administrator-recorded payment
- customer-submitted manual payment reference
- proof/reference metadata without unsafe file handling
- pending, verified, rejected, refunded, and reversed states
- partial payment support only if already enabled in settings
- invoice balance recalculation
- immutable original payment
- separate refund/reversal transaction
- administrator audit log

Use a database transaction when applying a verified payment. Add concurrency tests showing the same payment cannot be applied twice.
```

## Command 12 — Create the Payment Adapter

```text
Create a provider-neutral PaymentGateway interface supporting:

- create payment session
- verify webhook signature using the exact raw request body
- normalize provider events
- query transaction status
- extract provider transaction ID
- optional refund operation

Implement a FakePaymentGateway for development and automated tests.

Create the webhook processing pipeline with signature validation, a unique provider event ID, replay protection, amount/currency/merchant/invoice verification, transactional Payment and PaymentEvent creation, correct invoice settlement, a fast webhook response, and an outbox event for slower follow-up work.

Add comprehensive tests for invalid signatures, replays, wrong amounts, wrong currency, duplicate transactions, and concurrent delivery.
```

## Command 13 — Integrate the Real Payment Provider

```text
Implement the real payment adapter for [PAYMENT_PROVIDER].

Use the provider's current official API documentation. Do not guess endpoint behavior or signature rules.

Add:

- validated configuration
- secret redaction
- checkout-session creation
- raw-body webhook verification
- normalized provider statuses
- transaction-status reconciliation
- sandbox mode
- safe timeout and retry policy
- administrator-visible failure information without exposing secrets

Preserve FakePaymentGateway for tests. Add mocked provider-contract tests and document sandbox setup. Never use production credentials or make a real charge.
```

## Command 14 — Implement Services

```text
Implement hosting-service management.

A service must store its customer, product and price snapshot, server, domain, external account identifier, billing period, start date, next due date, status, suspension reason, and termination metadata.

Implement validated service state transitions:

- pending
- provisioning
- active
- suspended
- provisioning failed
- cancelled
- terminated

A paid invoice must not by itself mean provisioning succeeded.

Build administrator service-management pages and customer service pages. Add authorization and transition tests.
```

## Command 15 — Create the Hosting-Panel Adapter

```text
Create a provider-neutral HostingPanel interface supporting:

- test connection
- create account
- get account
- suspend account
- unsuspend account
- change package
- change password
- generate secure panel-login URL when supported
- terminate account

Implement FakeHostingPanel for development and automated tests.

Add explicit timeouts, normalized provider errors, secret redaction, activity logging, idempotency protection, retry classification, a manual retry workflow, no unlimited automatic retries, and permanent termination confirmation.

Test success, timeout, temporary failure, permanent failure, duplicate provisioning, and provider inconsistency.
```

## Command 16 — Integrate the Real Hosting Panel

```text
Implement the real HostingPanel adapter for [CPANEL_WHM_OR_DIRECTADMIN].

Consult the provider's current official API documentation.

Add encrypted credentials, connection testing, account creation, suspension, unsuspension, package changes, account-status queries, secure login links where supported, and termination.

Do not log credentials or complete upstream responses containing secrets.

Use mocks for automated tests. If a real development server is not configured, stop before making external mutations and provide a documented manual verification checklist.
```

## Command 17 — Add Redis, Queues, and Workers

```text
Configure BullMQ and Redis for background processing.

Create queues for:

- emails
- hosting provisioning
- suspension
- unsuspension
- hosting status reconciliation
- payment reconciliation
- renewal invoice generation

Requirements:

- deterministic job IDs where appropriate
- bounded retries with exponential backoff
- non-retryable failure classification
- dead-letter or failed-job visibility
- structured logs with correlation IDs
- no credentials in payloads
- graceful shutdown
- administrator retry action
- job idempotency

Use the transactional outbox so committed business changes cannot lose their required background jobs.

Add worker integration tests and update the operations documentation.
```

## Command 18 — Implement Email Notifications

```text
Implement queued email notifications using SMTP.

Create responsive templates for email verification, password reset, order received, order approved, payment received, invoice created, renewal reminder, overdue notice, service provisioned, service suspended, service reactivated, and ticket reply.

Requirements:

- business branding
- plain-text fallback
- safe template escaping
- email attempt logging
- retry policy
- no secrets in logs
- development email preview/testing

Email failure must never roll back a payment or completed business transaction.
```

## Command 19 — Implement Renewal Automation

```text
Implement scheduled renewal automation.

Requirements:

- create a renewal invoice a configurable number of days before the due date
- send configurable reminders
- mark qualifying invoices overdue
- suspend an eligible service after its configurable grace period
- unsuspend after verified full payment
- never automatically terminate in the initial release
- use database locking or uniqueness constraints to prevent duplicate invoices
- ensure only one scheduler instance processes a schedule
- make every scheduled operation safe to run repeatedly
- record AutomationRun results and failures

Use a controllable clock in tests. Cover timezone boundaries, month-end, leap-year, retries, duplicate scheduler runs, and delayed execution.
```

## Command 20 — Implement Support Tickets

```text
Implement the support-ticket module.

Features:

- customer creates ticket
- customer views and replies to own tickets
- administrator views, filters, assigns, prioritizes, replies, and closes
- statuses for open, waiting for customer, waiting for staff, and closed
- optional service association
- email notification on reply
- safe attachment policy if attachments are included
- audit trail for administrative changes

Prevent HTML/script injection and cross-customer access. Build both portal and administrator interfaces and add tests.
```

## Command 21 — Implement Settings and Secrets

```text
Implement typed business settings for business identity, currency, timezone, invoice prefix and numbering, renewal lead time, reminder schedule, suspension grace period, manual termination policy, manual-payment instructions, email branding, active gateway, and active hosting-panel adapter.

Separate ordinary settings from secrets.

Encrypt integration credentials using a deployment-provided encryption key. Never return decrypted secrets to the frontend. Display only configured/not-configured state or masked identifiers.

Add validation, rotation documentation, authorization, audit logging, and tests.
```

## Command 22 — Complete Dashboards and Reports

```text
Implement the administrator dashboard using real database queries.

Include only actionable metrics:

- collected revenue for the selected period
- outstanding invoice balance
- overdue balance
- active services
- suspended services
- pending orders
- open tickets
- failed automation jobs
- recent auditable activity

Use consistent timezone and money calculations. Exclude cancelled invoices and reversed payments correctly.

Add CSV exports for customers, invoices, payments, and services. Protect exports with administrator authorization and audit their creation.
```

## Command 23 — Add PDF Invoices

```text
Implement downloadable PDF invoices.

Requirements:

- stable invoice snapshot
- business and customer billing details
- itemized charges
- tax, discounts, credits, payments, and outstanding balance
- invoice and due dates
- status
- BDT formatting
- printable layout
- deterministic generation
- customer ownership authorization
- administrator access

Test the PDF-generation service and verify a generated sample visually. Do not include secrets or internal database identifiers.
```

## Command 24 — Harden Security

```text
Perform a security-hardening pass over the entire repository.

Inspect and address:

- authentication and session security
- CSRF
- authorization and object ownership
- IDOR risks
- input validation
- SQL injection
- stored and reflected XSS
- rate limiting
- payment-webhook verification
- replay attacks
- SSRF in external integrations
- unsafe redirects
- file upload risks
- credential encryption
- sensitive logging
- dependency vulnerabilities
- security headers
- CORS
- administrator two-factor authentication
- audit-log completeness

Implement in-scope fixes and add regression tests. Do not make claims based only on static inspection; run the relevant validation.
```

## Command 25 — Test Critical Business Invariants

```text
Create a focused test suite for critical business invariants:

- duplicate webhooks cannot create duplicate payments
- concurrent payment handling cannot overpay an invoice
- a browser redirect cannot mark an invoice paid
- product-price changes cannot alter historical invoices
- payment success and provisioning failure remain separate states
- repeated scheduler runs cannot create duplicate renewal invoices
- repeated provisioning jobs cannot create duplicate hosting accounts
- refunds do not delete original payments
- a customer cannot access another customer's data
- only authorized administrators can terminate services
- termination requires explicit confirmation
- jobs are safe to retry
- money calculations never use floating-point arithmetic

Run the suite repeatedly and fix nondeterministic tests.
```

## Command 26 — Add End-to-End Tests

```text
Add Playwright end-to-end tests for:

1. Customer registration and login
2. Browsing plans
3. Placing an order
4. Fake gateway payment
5. Administrator order approval
6. Fake hosting-account provisioning
7. Customer viewing the active service
8. Renewal invoice generation
9. Overdue suspension
10. Payment-triggered unsuspension
11. Customer support ticket and administrator reply
12. Administrator manual termination confirmation

Make the test environment deterministic and isolated. Capture traces or screenshots on failure. Run the complete end-to-end suite and fix failures.
```

## Command 27 — Add Observability and Health Checks

```text
Implement production-oriented observability:

- structured JSON logs
- request correlation IDs
- job correlation IDs
- payment event identifiers
- health endpoint
- readiness endpoint
- PostgreSQL connectivity check
- Redis connectivity check
- queue backlog visibility
- failed-job visibility
- automation-run history
- external-provider failure metrics
- secret redaction

Do not log passwords, cookies, API keys, webhook signatures, raw sensitive payloads, or control-panel credentials.

Document which alerts should wake the administrator.
```

## Command 28 — Prepare Backups and Recovery

```text
Create a PostgreSQL backup and restore strategy.

Add scripts or documented commands for:

- creating encrypted backups
- verifying backup integrity
- restoring into an isolated database
- restoring application configuration without exposing secrets
- database migration recovery
- rollback decisions
- disaster-recovery checklist

Perform a local test backup and restore using fictional development data. Verify important row counts and relationships after restoration. Do not touch production data.
```

## Command 29 — Prepare Production Deployment

```text
Prepare a production deployment using Docker Compose and Nginx.

Include:

- production Dockerfiles
- non-root containers
- API, web, worker, and dedicated scheduler processes
- PostgreSQL and Redis connection configuration
- health checks
- graceful shutdown
- migration command
- persistent storage guidance
- reverse proxy
- HTTPS setup instructions
- secure headers
- request-size limits
- log rotation
- secret-injection guidance
- deployment checklist
- rollback checklist

Do not deploy externally yet. Build every production image locally and resolve failures.
```

## Command 30 — Conduct the Release Audit

```text
Conduct a complete release-readiness audit.

Read HOSTING_BILLING_SYSTEM_PLAN.md and compare every requirement with the implementation.

Run:

- formatting check
- lint
- typecheck
- unit tests
- integration tests
- end-to-end tests
- production builds
- Prisma validation
- migration test from an empty database
- dependency/security audit
- backup and restore verification

Then manually inspect the primary administrator and customer workflows.

Create docs/RELEASE_CHECKLIST.md containing completed requirements, missing requirements, known defects, security risks, operational risks, external-provider tests still requiring credentials, deployment steps, rollback steps, and a launch recommendation.

Fix release-blocking local defects. Do not conceal failing checks or deploy the application.
```

## Command 31 — Deploy to Staging

```text
Deploy the application to the authorized staging environment.

Before mutation:

- inspect deployment documentation and configuration
- confirm the target is staging, not production
- verify secrets are provided externally
- verify backups and rollback procedure
- list the exact intended deployment actions

Then deploy, apply migrations once, and run smoke tests for HTTPS, authentication, customer authorization, administrator authorization, database, Redis, worker, scheduler, SMTP, fake or sandbox payment, fake or development hosting panel, and health checks.

Report deployed version, verification evidence, failures, and rollback status.
```

## Command 32 — Prepare the Production Launch

```text
Prepare the application for production launch, but stop before any production mutation unless this task has explicit production-deployment authorization.

Verify:

- production target identity
- current backup
- tested restoration
- secrets
- HTTPS and DNS plan
- migration plan
- rollback plan
- maintenance communication
- gateway production configuration
- hosting-panel production configuration
- SMTP reputation/configuration
- monitoring and alerts
- first-renewal schedule
- termination automation remains disabled

Produce the final launch runbook with exact commands, checkpoints, owners, and rollback conditions.
```

After explicitly authorizing the production deployment, use:

```text
Execute the approved production launch runbook exactly as documented.

Stop and report immediately if:

- the target identity differs
- backup verification fails
- migration validation fails
- a health check fails
- payment signature verification fails
- the worker or scheduler is unhealthy
- rollback conditions are reached

After deployment, run read-only smoke tests and record the release version, migration version, health evidence, and monitoring status.
```

---

## Continuation Command

If a phase encounters errors or remains incomplete, use this prompt in the same Codex task:

```text
Continue the current step. Diagnose the reported failures, implement the in-scope fixes, rerun the relevant validation, and update docs/PROGRESS.md. Do not move to the next phase while required checks are failing.
```

## Phase Review Command

Use this after a major phase before moving forward:

```text
Review the current phase against its original command, AGENTS.md, HOSTING_BILLING_SYSTEM_PLAN.md, and docs/DECISIONS.md.

Identify missing requirements, incorrect assumptions, regressions, security risks, and untested behavior. Implement in-scope corrections, run the relevant validation, and update docs/PROGRESS.md with evidence. Do not start the next phase.
```

## Session Handoff Command

Use this when ending a Codex task and planning to continue later:

```text
Update docs/PROGRESS.md with:

- completed work
- files and modules changed
- validation performed and results
- unresolved failures
- external dependencies or credentials still needed
- the exact next recommended command

Do not claim completion for unverified behavior. Leave the repository in a buildable state when possible.
```

## Operating Guidance

1. Run commands in order.
2. Keep one major phase in one Codex task when possible.
3. Do not ask Codex to build the entire production application in a single prompt.
4. Commit after a phase passes its required validation.
5. Use fake providers until their real integrations are intentionally configured.
6. Never place production credentials in a prompt, source file, test fixture, or Git commit.
7. Require explicit authorization before staging or production mutations.
8. Do not enable automatic service termination in the initial release.

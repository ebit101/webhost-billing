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
Implement the real HostingPanel adapter for cPanel/WHM only.

Consult the provider's current official API documentation.

Add encrypted credentials, connection testing, account creation, suspension, unsuspension, package changes, account-status queries, secure login links where supported, and termination.

Do not log credentials or complete upstream responses containing secrets.

Use mocks for automated tests. If a real development server is not configured, stop before making external mutations and provide a documented manual verification checklist.
```

UK2Group domain registration is a separate selected provider requirement. Do not place registrar credentials or domain workflows in the cPanel/WHM adapter. Add it only through a separately authorized future registrar command after domain models, contact ownership, registration/renewal/transfer rules, test mode, idempotency, and current official UK2Group API documentation are defined.

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

# Production Readiness and Launch Commands

Commands 33–48 close the production gates identified by Command 32. Run them in order except where an explicitly documented manual-first choice allows an optional provider command to be skipped. A skipped command still needs an owner-signed decision and evidence that the related provider remains unconfigured and unusable.

No command inherits authorization for the next command. Credentials must be supplied through protected files, a secret manager, or an authenticated administrator form—never through a prompt, Git, logs, screenshots, or shell output.

## Command 33 — Finalize Business and Launch Policies

```text
Read AGENTS.md, HOSTING_BILLING_SYSTEM_PLAN.md, docs/SETTINGS_AND_SECRETS.md, docs/RELEASE_CHECKLIST.md, docs/PRODUCTION_LAUNCH_RUNBOOK.md, and docs/PROGRESS.md.

Finalize the owner-approved production policy record for this single hosting business:

- legal business name, billing address, email, and phone
- operating currency
- tax/VAT treatment and invoice wording
- invoice prefix, padding, and starting number
- supported billing periods
- manual-payment instructions and evidence requirements
- partial-payment policy
- new-order approval policy
- cancellation and refund policies
- customer-data, invoice, log, and backup retention
- renewal invoice lead time
- reminder schedule
- suspension grace period
- business timezone
- first supervised renewal date
- manual-first versus automated payment mode
- manual-first versus automated cPanel mode
- maintenance communication and incident contacts
- accepted or remediated release-checklist interface gaps

Do not invent legal or tax answers. Record unresolved owner decisions as blockers. Update the production launch approval record and safe application defaults/documentation only after explicit values are provided. Do not enter real credentials or mutate production.

Validate changed schemas/defaults/tests if code changes. Update docs/PROGRESS.md, commit, reconcile, push main, stop, and request Command 34 authorization.
```

### Authorized Command 33 follow-up — Installation-Specific Speed Host Web Branding

The owner explicitly authorized this bounded branding implementation after the public
portal/logo source intake. Implement opt-in public web branding for the storefront,
authentication and administrator/customer shells, their document titles and approved
public footer contacts. Preserve generic Webhost Billing defaults and fictional/readiness
warnings. Use the unchanged owner logo locally; do not include trademark assets in the
generic source distribution. Validate configuration and local PNG metadata, reject remote
or unsafe asset paths, and document build-time image configuration. Add regression tests
for generic/branded views and unsafe configuration, then run web/shared validation and
documentation checks. Record progress, commit, reconcile and non-force push `main`.

This follow-up approves no new operating policy, production setting, invoice-history change,
email delivery, WHMCS import, deployment or cutover. Stop after reporting; the remaining
Command 33 operating-policy approvals are still required.

### Authorized Command 33 follow-up — App-wide sentence-case presentation

The owner clarified that avoiding all-caps wording is an app-wide rule. Record the
rule in `AGENTS.md` and apply it to existing storefront, authentication, administrator
and customer interfaces and generated invoice labels. Remove forced uppercase styles
and format human enum labels in sentence case without changing submitted values,
state transitions, identifiers, currency/country codes, historical snapshots,
user-entered content, original assets or case-sensitive confirmation tokens.

Add presentation regression checks, retain request/financial/security assertions and
validate shared contracts, affected invoice rendering and web tests/types/lint/build.
Inspect fictional invoice and anonymous local browser previews. Record results,
commit, reconcile and non-force push `main`; stop after reporting. This authorization
does not approve remaining operating policies, migration, release, deployment or cutover.

### Authorized Command 33 follow-up — Review remaining operating policies

The owner authorized review of the remaining operating-policy draft after the app-wide
sentence-case follow-up. Review `DRAFT-OPS-1` against the existing settings, release checklist
and launch runbook; prepare a concise owner decision checklist and safe approval reply.
Preserve existing approvals, the original draft version and every unresolved input. Record
review authorization separately from policy acceptance. Do not appoint owners, invent legal
retention periods, publish policy promises, change settings/code or access/mutate production.

Validate the documentation, record progress, commit, reconcile and non-force push `main`;
stop and request **Resume Command 33 — Approve DRAFT-OPS-1 and Supply Remaining Operating
Inputs**. This review does not authorize Command 34, migration, deployment or cutover.

### Authorized Command 33 resumption — Remaining owner-input intake

The owner authorized **Resume Command 33 — Resolve D5–D8 and Supply Remaining Operating
Inputs** after approving D1–D4. Collect explicit remaining group decisions, lawful retention
references, named operational roles/distinct incident backup, protected payment/catalogue
references, exact maintenance/first-renewal windows and eligible-list/rollback evidence.
Recheck relevant source boundaries read-only; do not invent missing inputs, appoint owners
from the approver's identity or treat command authorization as draft acceptance. Preserve
the approved D1–D4 source/version and leave unsupplied values open. No implementation,
provider test, policy publication, live setting, migration, deployment or cutover is authorized.
Record the intake checkpoint and proportionate documentation validation; stop for owner
inputs rather than starting Command 34 or repeatedly preparing the same approval packet.

## Command 34 — Select and Audit Production Infrastructure

```text
Using the exact owner-approved production provider, server identifier, hostname, IP addresses, region, plan, and dedicated SSH key, conduct a read-only production infrastructure audit.

Before connecting, require:

- exact target identity and purpose
- pinned SSH host-key fingerprint obtained through a trusted independent channel
- confirmation that this is the intended dedicated production host
- approved monthly cost and capacity
- named infrastructure and rollback owners

Verify OS/support lifecycle, CPU, memory, disk, encryption/provider controls, inodes, time synchronization, Docker/Compose support, listening ports, firewall/cloud security groups, patching, backups, provider recovery, outbound connectivity design, and whether any unrelated application exists.

Do not install packages, change firewall/DNS, restart services, create users, copy source/images, or deploy the application. Stop on any target mismatch, unexpected shared workload, insufficient capacity, unpinned host key, cPanel/Apache conflict, or unsupported Docker setup.

Create a production target inventory and capacity/firewall plan without secrets. Update the launch gate and docs/PROGRESS.md, commit, reconcile, push main, stop, and request Command 35 authorization.
```

## Command 35 — Establish Production Secret Management

```text
Establish the approved production secret-management and recovery boundary on the exact audited production target, without deploying the application.

Require explicit authorization for the external secret manager and any paid service. Generate independent production-only values for PostgreSQL, Redis, session signing, credential encryption, backup encryption, SMTP, TLS, deployment SSH, and any later provider credentials. Never reuse staging values.

Verify:

- root/operator and container access boundaries
- secret file/driver ownership and mode behavior
- no secrets in Git, images, build arguments, Compose rendering, process listings, logs, shell history, reports, or prompts
- separate escrow for the historical credential-encryption key and backup passphrase
- named primary/backup custodians and recovery access
- rotation and revocation procedures
- session-secret rotation behavior
- credential re-entry requirements after encryption-key rotation
- administrator MFA and offline recovery-code custody

Do not configure payment or WHM credentials in this command. Do not print generated values. Produce status/fingerprint metadata only where safe. Update docs/PROGRESS.md, commit, reconcile, push main, stop, and request Command 36 authorization.
```

## Command 36 — Establish Off-Site Backups and Prove Recovery

```text
Configure the owner-approved immutable off-site PostgreSQL backup destination and production backup schedule using docs/BACKUP_AND_RECOVERY.md.

Require the exact target, destination, retention, cost approval, backup owner, recovery owner, and protected passphrase location. Configure at least the documented six-hour schedule, 14-day/8-week/12-month baseline, three-copy/two-storage/one-off-site rule, backup-age alerts, and separately protected key recovery.

Create or retrieve a current encrypted backup, verify checksum, OpenPGP integrity, PostgreSQL archive structure, required tables, metadata, application commit, and all migrations. If no production database exists yet, use only a newly created fictional/staging backup to prove the destination and recovery procedure; Command 45 must still create the production baseline/pre-migration evidence. Restore only into a new allowlisted isolated database. Never overwrite an active database.

Run structural, row-count, relationship, financial, ownership, authentication, invoice, service, and audit checks. Start an isolated application with callbacks, SMTP, workers, scheduler, payment, and cPanel mutations disabled. Measure real recovery point and recovery time. Reconcile Redis/outbox/provider uncertainty rules.

Stop on failed integrity, missing historical encryption key, target mismatch, incomplete restore, relationship/financial discrepancy, or RPO/RTO failure. Record object version/checksum and timing without secret values or customer data. Update docs/PROGRESS.md, commit, reconcile, push main, stop, and request Command 37 authorization.
```

## Command 37 — Prepare Production DNS, TLS, and Edge Cutover

```text
Prepare the production DNS/TLS/edge plan for the approved distinct billing and API hostnames.

Verify current and intended A/AAAA records, authoritative DNS, TTL, CAA if used, rollback values, propagation plan, certificate issuance method, exact SANs, certificate/key match, expiry, renewal, post-renewal container refresh, port ownership, unknown-host rejection, HTTP-to-HTTPS redirects, HSTS scope, request limits, forwarded-header replacement, and public/private port boundaries.

Create exact pre-cutover, cutover, external validation, certificate renewal, and DNS rollback commands with named owners and checkpoints. The web image must be rebuilt for the final API origin.

This command authorizes planning and safe validation only. Do not change public DNS, issue a production certificate, open firewall ports, or cut over traffic unless those exact mutations are separately stated and authorized by the user. Update docs/PROGRESS.md, commit, reconcile, push main, stop, and request Command 38 authorization.
```

## Command 38 — Configure Production SMTP and Email Reputation

```text
Configure and verify the exact owner-approved production SMTP provider and sender domain.

Before mutation, require provider/account identity, sender/domain, fictional recipient addresses, cost approval, DNS-change authorization, credential delivery through protected storage, and a rollback/disable plan.

Verify certificate-validated TLS, authentication, sender/from/reply-to alignment, SPF, DKIM, DMARC, quotas, throttling, bounce/complaint handling, credential rotation, provider logging/privacy, alerting, and worker timeout behavior. Use fictional messages only for verification, reset, invoice, renewal, service, and ticket templates.

Confirm HTML/plain-text rendering, Bengali/Latin text, deterministic Message-ID, delivery evidence, and that temporary/permanent/inconsistent outcomes follow the no-blind-resend policy. Do not send to real customers or enable the production worker for existing work.

Record safe provider evidence without message bodies, tokens, recipients beyond reserved test identities, or credentials. Update docs/PROGRESS.md, commit, reconcile, push main, stop, and request Command 39 authorization.
```

## Command 39 — Configure Monitoring, Alerts, and Log Retention

```text
Configure the approved production monitoring, alerting, and centralized log-retention services using docs/OBSERVABILITY.md.

Require exact vendor/accounts, destinations, cost approval, primary/backup responders, retention/deletion policy, and credential delivery through protected storage.

Monitor external UI/API reachability, /health, /ready, container restarts, PostgreSQL, Redis, queues, outbox, worker, exactly one scheduler, renewal recency, payment/hosting/email failures and inconsistent outcomes, certificate expiry, DNS, time synchronization, disk/inodes, memory/CPU, backup age/integrity, and log collector failure.

Ship only redacted structured logs over encrypted transport. Never send bodies, queries, headers, cookies, credentials, provider payloads, ticket text, payment proof, or login URLs. Configure the immediate and business-hours thresholds from docs/OBSERVABILITY.md.

Trigger safe synthetic alerts and prove both primary and backup responders receive, acknowledge, and escalate them. Do not trigger real payment/hosting incidents. Update docs/PROGRESS.md, commit, reconcile, push main, stop.

If manual-first payment was selected, record Command 40 and 41 as explicitly skipped with gateways unconfigured and request Command 42 or 43 as appropriate. Otherwise request Command 40 authorization.
```

## Command 40 — Run Credentialed bKash Sandbox Acceptance

```text
Run the bKash Tokenized Checkout credentialed sandbox acceptance defined in docs/PAYMENT_GATEWAYS.md.

This command is optional only when the owner selected manual-first payment and bKash remains unconfigured. Otherwise require exact sandbox merchant identity, official sandbox endpoints, fictional BDT invoice/customer, public sandbox callback URL, protected credential entry, expected amount, operator, time window, and approval for sandbox mutations.

Verify token grant, session creation, pinned checkout redirect, successful execute/query proof, exact merchant/payment/invoice/amount/currency/transaction checks, callback replay idempotency, failed/cancelled paths, timeout/uncertain reconciliation, duplicate prevention, safe logs/audit, and that browser navigation never settles payment.

Never use live credentials, real money, real customers, automatic refunds, or service termination. Stop on endpoint/merchant mismatch, TLS failure, unexpected charge, unsafe redirect, signature/proof mismatch, or uncertain state that cannot be reconciled read-only.

Record redacted sandbox evidence and remaining production-endpoint/code review requirements. Update docs/PROGRESS.md, commit, reconcile, push main, stop, and request Command 41 authorization.
```

## Command 41 — Run Credentialed SSLCOMMERZ Sandbox Acceptance

```text
Run the SSLCOMMERZ Hosted Checkout credentialed sandbox acceptance defined in docs/PAYMENT_GATEWAYS.md.

This command is optional only when the owner selected manual-first payment and SSLCOMMERZ remains unconfigured. Otherwise require exact sandbox store identity, official endpoints, fictional BDT invoice/customer, public IPN/return URLs, protected credential entry, expected amount, operator, time window, and approval for sandbox mutations.

Verify session creation, pinned GatewayPageURL, Order Validation API proof, exact store/transaction/validation/payment/invoice/amount/currency matching, duplicate IPN idempotency, success/fail/cancel returns, risk_level=1 pending behavior, transaction query/reconciliation, safe logs/audit, and that browser returns never settle payment.

Never use live credentials, real money, real customers, automatic refunds, or service termination. Stop on endpoint/store mismatch, TLS failure, unexpected charge, unsafe redirect, validation mismatch, high-risk accidental settlement, or unreconciled uncertainty.

Record redacted sandbox evidence and remaining production-endpoint/code review requirements. Update docs/PROGRESS.md, commit, reconcile, push main, stop, and request Command 42 authorization.
```

## Command 42 — Run Credentialed cPanel/WHM Development Acceptance

```text
Run the cPanel/WHM credentialed development acceptance checklist from docs/HOSTING_PANELS.md.

This command is optional only when the owner selected manual-first hosting, no WHM token/server is configured, and application hosting operations remain unused. Otherwise require exact development WHM hostname/certificate, dedicated reseller identity, least-privilege IP-restricted expiring API token, disposable packages, disposable domain/account, verified backup, outbound IP, operator, maintenance window, and the approved mutation sequence.

Run the read-only connection test first. Under the approved window, test exactly one disposable account: create and idempotent replay, accountsummary identity, suspend, unsuspend, package change, password change, and temporary login URL. Reconcile after every result. Do not test a later operation after uncertainty.

Termination requires a second explicit user authorization naming the exact disposable username/domain and confirmation phrase. Without it, skip termination and leave the disposable account intact for manual cleanup. Never touch a real customer, disable TLS verification, grant all privileges, persist passwords/session URLs, or blindly retry an uncertain mutation.

Record redacted operation/audit evidence and cPanel-version differences. Revoke or narrow the development token afterward. Update docs/PROGRESS.md, commit, reconcile, push main, stop, and request Command 43 authorization.
```

## Command 43 — Publish the Immutable Production Release

```text
Prepare the final immutable production images from the exact clean, reviewed main-branch commit without deploying them.

Require the approved private registry, repository paths, scanner, signer/provenance identity, retention policy, release operator, and cost/access approval. Re-run formatting, lint, typecheck, unit/integration/E2E/invariant tests, dependency audit, empty-database migrations, production Compose rendering, production builds, non-root user inspection, secret/source scan, and local production smoke.

Scan every image and resolve release-blocking findings. Sign and publish only immutable commit tags/digests through the approved identity. Record registry digests and verify pulled content, platform, user, entrypoint, health checks, SBOM/provenance, and source commit. Never use latest, embed credentials, expose private ports, or deploy to production.

Update the production launch record and rollback image set without secrets. Update docs/PROGRESS.md, commit documentation only if needed, reconcile, push main, stop, and request Command 44 authorization.
```

## Command 44 — Conduct the Final Production Readiness Audit

```text
Conduct the final production readiness audit against docs/PRODUCTION_LAUNCH_RUNBOOK.md.

Verify every gate has a named primary/backup owner and linked current evidence:

- exact production target and pinned SSH host key
- clean approved release commit and immutable image digests
- capacity, patching, time sync, firewall, and port boundaries
- production-only secrets and recovery escrow
- current off-site immutable backup and timed isolated restore
- DNS/TLS issuance, cutover, renewal, and rollback
- migration list, one-shot plan, compatible image rollback, and isolated restore/cutover
- maintenance communication and decision authority
- owner-approved business, payment, hosting, retention, and renewal policies
- real SMTP acceptance
- monitoring, alerts, log retention, and responder test
- manual-first evidence or credentialed provider acceptance
- exactly one scheduler plan and no termination automation
- first-renewal impact list and supervision
- initial administrator/MFA process
- accepted or remediated release-checklist gaps

Re-run the complete local release gate and perform read-only staging health/backup checks. Do not mutate production. Produce an explicit GO or NO-GO with exact blockers; never waive missing evidence implicitly.

Update docs/PROGRESS.md, commit, reconcile, push main, stop. Request Command 45 authorization only if the result is GO and the user supplies the exact target, release, maintenance window, and explicit production-mutation approval.
```

## Command 45 — Execute the Approved Production Launch

```text
Execute docs/PRODUCTION_LAUNCH_RUNBOOK.md exactly against [PRODUCTION_SSH_TARGET] using approved release [RELEASE_COMMIT] during [MAINTENANCE_WINDOW]. This prompt explicitly authorizes only the documented production mutations after all placeholders are replaced and Command 44 is GO.

Before mutation, restate the exact target identity, pinned host-key fingerprint, IPs, release/digests, backup object/version/checksum, migration list, DNS values, provider modes, operators, rollback point, and stop conditions. Require a final explicit confirmation if any value is absent, changed, or ambiguous.

Follow the runbook checkpoints in order. Apply migrations once. Start API/web/edge without worker/scheduler, bootstrap only the first administrator if the database is new, enroll MFA before exposure, verify settings/SMTP before one worker, and verify renewal impact before exactly one scheduler. Change DNS only at the authorized cutover checkpoint.

Stop and report immediately if the target/digest differs, backup/restore evidence fails, migration validation fails, health/security/authentication/authorization fails, alerts do not arrive, a provider proof check fails, a worker/scheduler is unhealthy, multiple schedulers exist, an external outcome is uncertain, or any rollback condition is reached.

Never force-push, down-migrate, erase volumes/evidence, blindly retry external mutations, enable automatic termination, reuse staging secrets, or touch unrelated systems. Run the documented read-only smoke tests, record release/migration/health/monitoring evidence, update docs/PROGRESS.md, commit the safe release record, reconcile, push main, stop, and request Command 46 authorization.
```

## Command 46 — Observe and Verify the New Production Launch

```text
Conduct the authorized post-launch observation for the exact production release without expanding provider authority or changing business policy.

Monitor the runbook-defined observation window for external UI/API/TLS/DNS, container restarts, PostgreSQL, Redis, worker, exactly one scheduler, queues/outbox, SMTP, payment/hosting/manual workflows, renewal recency, certificate, clock, disk/capacity, backups, logs, and alerts.

Run bounded read-only checks plus fictional administrator/customer workflows. Reconcile every pending/failed/inconsistent payment, email, hosting, automation, and outbox record using durable application evidence and authenticated read-only provider queries. Do not blindly retry or modify real customer/financial/service state.

Apply the documented rollback conditions immediately when reached. Record uptime/health, incidents, alert delivery, backup completion, unresolved effects, and owner acceptance. Update docs/PROGRESS.md, commit, reconcile, push main, stop, and request Command 47 authorization.
```

## Command 47 — Supervise the First Renewal Cycle

```text
Supervise the first production renewal cycle for the exact owner-approved business date, timezone, policy, and eligible-service list.

Before the run, verify a current backup, health/readiness, one scheduler, worker/queues/outbox, SMTP, monitoring/alerts, manual or accepted provider mode, invoice numbering, service due dates, grace policy, and that automatic termination remains absent. Reconcile existing failures before continuing.

Observe the daily run record, generated invoice uniqueness and snapshots, reminder thresholds, email attempts, overdue transitions, and any suspension/unsuspension requests. Do not permit automatic suspension unless the approved hosting mode and eligible overdue list were explicitly accepted. Never infer payment or provider state and never blindly retry an uncertain external mutation.

Stop scheduler then worker on duplicate invoices, wrong dates/amounts/customers, unexpected eligible services, email inconsistency, provider uncertainty, failed alerts, or any termination event. Reconcile and roll back according to durable evidence.

Record counts, IDs only where safe, outcomes, exceptions, manual actions, and owner acceptance. Update docs/PROGRESS.md, commit, reconcile, push main, stop, and request Command 48 authorization.
```

## Command 48 — Close the Launch and Hand Over Operations

```text
Close the production launch after Command 46 observation and Command 47 first-renewal acceptance pass.

Create the final operational handover containing:

- deployed commit and image digests
- target/DNS/TLS identity and renewal ownership
- migration status
- current backup object/version and latest restore-drill evidence
- RPO/RTO and retention
- secret/key/credential rotation schedule without values
- provider modes and accepted credentialed evidence
- business and renewal policies
- monitoring/log/alert destinations and responders
- scheduler/worker/queue/outbox normal baselines
- incident, reconciliation, rollback, and disaster-recovery procedures
- maintenance and update cadence
- remaining accepted risks and backlog

Verify all temporary launch access/password artifacts are removed, unnecessary credentials are revoked, administrator MFA/recovery custody is complete, and no staging secret or fictional account exists in production. Do not delete financial/provider/audit evidence.

Update docs/PROGRESS.md with the final launch status, commit, reconcile, push main, and stop. Do not begin optional features automatically.
```

---

# Optional Post-Launch Commands

Commands 49–53 are not production-launch prerequisites unless the owner explicitly makes them prerequisites. Run them only for a concrete business need.

## Command 49 — Discover and Design the UK2Group Registrar Integration

```text
Research and design the separately authorized UK2Group domain registrar integration without implementing it or using credentials.

Confirm the exact current UK2Group/StarGate/LogicBoxes API product, official primary documentation, supported test environment, authentication, reseller identity, source-IP restrictions, contact/designated-agent obligations, supported TLDs, availability/pricing behavior, registration/renewal/transfer/nameserver operations, asynchronous events, rate limits, idempotency, error model, and credential rotation.

Design a registrar-neutral adapter, domain/contact models, encrypted credential boundary, operation history, ownership/authorization, pricing snapshots, renewal policy, reconciliation, UI workflows, migration plan, fake adapter, and test plan. Keep registrar authority separate from cPanel/WHM hosting authority.

Do not trust screenshots as specifications, copy visible values, use credentials, call the API, register/renew/transfer a domain, or alter nameservers. Record open legal/business questions and a GO/NO-GO implementation recommendation. Update docs/PROGRESS.md, commit, reconcile, push main, stop, and request Command 50 authorization only if GO.
```

## Command 50 — Implement the UK2Group Registrar Module

```text
Implement only the approved Command 49 UK2Group registrar scope behind the registrar-neutral adapter.

Add reviewed Prisma migrations, strict shared contracts, encrypted provider-bound credentials, administrator/customer authorization and ownership, append-only/idempotent operation evidence, safe reconciliation, fake adapter, official test-mode adapter, service/domain separation, UI, logs, documentation, and tests. Preserve integer-money snapshots and UTC dates. Never mix WHM tokens or hosting state with registrar credentials/domain state.

Use mocked/fake boundaries only. Do not configure credentials, call UK2Group, mutate a real/test domain, or enable automatic domain renewal until separately authorized. Run full relevant validation, update docs/PROGRESS.md, commit, reconcile, push main, stop, and request Command 51 authorization.
```

## Command 51 — Run Credentialed UK2Group Test Acceptance

```text
Run credentialed UK2Group acceptance only in the confirmed official test environment using the exact approved reseller identity and disposable test domains/contacts.

Require protected credentials, source-IP approval, test-mode proof, supported TLDs, exact expected charges, mutation sequence, contact/designated-agent policy, operator/window, and rollback/cleanup plan. Begin with read-only connection, availability, pricing, and account-balance/status checks.

Under explicit mutation authorization, test idempotent registration, status, nameservers, contact handling, renewal, failure/duplicate/replay behavior, and reconciliation only where the test environment supports them safely. Transfer, deletion, restore, or real-domain/name-server changes need separate exact approval.

Stop on production endpoint/account, real domain/contact, unexpected charge, identity mismatch, legal-policy uncertainty, or unreconciled external outcome. Record redacted evidence, revoke/narrow credentials, update docs/PROGRESS.md, commit, reconcile, push main, and stop.
```

## Command 52 — Complete Accepted Interface and Alerting Gaps

```text
Implement only the release-checklist gaps the owner explicitly selected: a recent-payments dashboard section, a searchable/paginated administrator activity-log page, and/or direct external administrator alert delivery.

Keep transaction-sourced financial semantics, administrator authorization, metadata redaction, bounded pagination/exports, alert deduplication, provider-neutral delivery, retries, secret management, and existing observability thresholds. Do not expose arbitrary activity metadata, provider payloads, customer message bodies, credentials, or financial proof.

Add tests and documentation, run full relevant validation, update docs/PROGRESS.md, commit, reconcile, push main, and stop.
```

## Command 53 — Expand Resilience and Browser Coverage

```text
Expand only the owner-approved resilience or quality scope justified by production evidence.

Possible independent scopes include managed PostgreSQL with PITR, Redis recovery, high availability, mobile/Firefox/WebKit E2E, MFA/settings/PDF/manual-payment browser paths, capacity/load testing, or visual/accessibility regression testing. Select one bounded scope before implementation; do not combine unrelated infrastructure and UI projects.

Preserve all billing, authorization, idempotency, backup, provider, and deployment invariants. Require explicit authorization for external infrastructure, costs, load against shared/production systems, failover, DNS, or destructive recovery tests. Use isolated fictional data by default.

Document success criteria and rollback, implement/test the selected scope, update docs/PROGRESS.md, commit, reconcile, push main, and stop.
```

## Command 55 — Publish the First Source Alpha Release

```text
Publish `v0.1.0-alpha.1` as a source-only prerelease from a clean reviewed `main`
commit. Synchronize private workspace metadata to the prerelease version, prepare
release notes covering installation, all forward-only migrations, configuration,
known limitations, rollback constraints, and the production `NO-GO` status, and
generate reproducible Git source archives, complete and production CycloneDX SBOMs,
and SHA-256 checksums.

From a fresh clone, install exactly from `pnpm-lock.yaml` and rerun formatting,
lint, strict type checks, package tests, API integration tests, invariant tests,
Chromium lifecycle, Prisma generation/schema/migration/database checks, dependency
audit, license inventory, production build, Compose rendering, full-history secret
scan, and artifact scan. Do not create the tag while a required check is failing.

Enable GitHub release immutability, create the release as a draft, attach every
artifact, verify remote digests and metadata, then publish it as a prerelease so
the tag/assets receive GitHub release attestation and become immutable. Do not
publish container images, a `latest` tag, npm packages, or deploy any environment.
Update `docs/PROGRESS.md`, commit, reconcile and push `main`, then publish and verify
the tag/release. Stop and request separate authorization for any next command.
```

## Command 56 — Publish the AI-Assisted Technical-Preview Positioning

```text
Present Webhost Billing accurately as an AI-assisted, open-source technical
foundation developed through a human-directed and human-reviewed Codex workflow. Add
a prominent not-for-live-use warning, document the command-by-command work path,
human authority boundaries, validation evidence, contributor expectations, and
independent-project attribution, and record the durable positioning decision.

Do not call the application AI-powered unless it contains separately authorized and
documented runtime AI behavior. Do not imply production readiness, autonomous release
authority, an OpenAI partnership, sponsorship, or endorsement. Keep Webhost Billing
as the product identity and use Codex only as factual development attribution.

Update the public repository description and discovery topics to match the approved
positioning without changing the immutable alpha release. Validate documentation and
links, update docs/PROGRESS.md, commit, reconcile, push main, verify hosted checks and
repository metadata, then stop and request separate authorization for any next command.
```

## Command 57 — Build the Safe Evaluation Demo and Adoption Pack

```text
Build a one-command local evaluation demo that uses only fictional data and generated
local credentials. Isolate its PostgreSQL and Redis state, bind its gateway only to
loopback, block container egress, disable real payment, hosting, and email providers,
and make initialization repeatable without touching development, staging, or
production state.

Add reviewed screenshots, a five-minute admin/customer walkthrough, a precise
capability and limitation matrix, and bounded contributor-ready starter issues with
acceptance and validation criteria. Keep the technical-preview warning prominent and
state honestly which surfaces still contain presentation fixtures or require separate
provider/operational acceptance.

Do not use real data or credentials, contact an external provider, deploy an
environment, change the production NO-GO decision, or modify the immutable
v0.1.0-alpha.1 release. Validate first-run and repeat startup, role journeys,
isolation, screenshots, documentation, tests, builds, and Compose rendering. Update
docs/PROGRESS.md, create the approved public starter issues if repository authority is
available, commit, reconcile, push main, verify hosted checks, then stop and request
separate authorization for any next command.
```

## Command 58 — Implement Starter Issue #18: Add a Read-Only `demo:doctor` Preflight

```text
Implement public starter issue #18 as a cross-platform Node.js `demo:doctor`
preflight. Report sanitized Docker and Compose versions, Docker Engine availability,
whether loopback port 3100 is available, and whether the local demo runtime file
exists. The command must be read-only, must not read or print runtime values or raw
command errors, and must not start, stop, rebuild, or remove anything.

Return non-zero with a clear remediation for every failed prerequisite. Treat the
missing runtime file as a normal first-run state because `demo:up` creates it. Add
focused automated coverage for success, redaction, missing Docker, unsupported
Compose, unavailable Engine, busy port, and invalid runtime metadata; include the
focused tests in the ordinary test gate. Update safe-demo and contributor
documentation without changing provider, deployment, financial, or production
boundaries.

Run the focused tests, formatting, lint, strict type checks, the complete package
tests, relevant Compose/demo smoke checks, and source/secret review. Update
docs/PROGRESS.md, commit, reconcile, push main, verify hosted checks, close issue #18
if repository authority is available, then stop and request separate authorization
for any next command.
```

## Command 59 — Implement Starter Issue #19: Replace Customer Portal Overview Fixtures With Authenticated Data

```text
Implement public starter issue #19 using only the existing authenticated customer
APIs. Replace every customer portal overview fixture with the signed-in customer's
name, authoritative account totals, and bounded recent service, invoice, and ticket
records. Derive the customer identifier from the server-validated session and retain
the existing API ownership checks.

Keep monetary values as string-safe integer minor units and render them through the
shared formatter. Add explicit accessible loading, empty, and error states. Remove
hard-coded customer names, domains, invoice identifiers, amounts, dates, and
navigation counts from the overview without adding API capabilities, migrations,
provider behavior, payment behavior, or a general dashboard redesign.

Add component tests for populated, empty, and error states plus server-boundary
coverage proving the overview customer identifier comes from the authenticated
customer session. Re-run the existing cross-customer ownership regression. Run
formatting, lint, strict type checks, complete package tests, the relevant API
integration test, production build, demo screenshot/smoke validation, and
source/secret review. Update documentation and `docs/PROGRESS.md`, commit, reconcile,
push main, verify hosted checks, close issue #19 if repository authority is
available, then stop and request separate authorization for any next command.
```

## Command 60 — Implement Starter Issue #20: Add a Mobile Safe-Demo Screenshot

```text
Implement public starter issue #20 by extending the existing safe-demo Playwright
capture with one useful mobile viewport screenshot of the public catalogue or the
authenticated customer service list. Use the repository-pinned Chromium and the
existing loopback-only fictional demo. Wait for semantic application state rather
than arbitrary timeouts and keep the capture repeatable.

Do not capture or print any password, cookie, token, generated secret, private host
detail, or real identity. Keep the primary content and actions legible at the chosen
viewport and document the new reviewed asset without introducing a hosted visual
regression service or changing application behavior.

Run the focused capture, visually inspect the result, run formatting, lint, strict
type checks, relevant tests/builds, demo health and source/secret review. Update
documentation and `docs/PROGRESS.md`, commit, reconcile, push main, verify hosted
checks, close issue #20 if repository authority is available, then stop and request
separate authorization for any next command.
```

## Command 61 — Implement Starter Issue #21: Add a Bengali Safe-Demo Quick-Start Translation

```text
Implement public starter issue #21 as a concise Bengali companion to the canonical
English safe-demo guide. Preserve the exact technical-preview, not-fit-for-live-use,
fictional-data-only, production NO-GO, provider-disabled, and secret-handling
meanings. Cover prerequisites, startup, fictional logins, the walkthrough, shutdown,
and safe reporting without translating commands, routes, email addresses, or
filenames.

Link the Bengali companion from the English guide while keeping the English guide
canonical. Do not add application localization, translate unrelated documentation,
publish generated credentials, change provider or deployment behavior, or weaken any
safety warning.

Run Markdown formatting, link/reference checks, terminology and secret review, and
the relevant documentation validation. Update documentation and
`docs/PROGRESS.md`, commit, reconcile, push main, verify hosted checks, close issue
#21 if repository authority is available, then stop and request separate
authorization for any next command.
```

## Command 62 — Review the Adoption Pack and Define the Next Starter-Issue Set

```text
Review the completed safe evaluation demo, contributor documentation, capability
matrix, Commands 58-61, closed starter issues #18-#21, and current public issue
backlog. Identify the next three to five bounded contributor tasks that improve
evaluation, accessibility, documentation, testability, or onboarding without
changing financial rules, schemas, provider authority, production readiness, or the
immutable v0.1.0-alpha.1 release.

Write clear acceptance, validation, and excluded-scope criteria; update the
contributor starter-issue pack and command catalogue. Create the approved public
issues only if repository authority remains available. Do not implement any proposed
issue, contact providers, deploy an environment, use real data, or change production
NO-GO.

Run Markdown formatting, link/reference checks, terminology and secret review.
Update `docs/PROGRESS.md`, commit, reconcile, push main, verify hosted checks, then
stop and request separate authorization for any implementation command.
```

## Command 63 — Implement Starter Issue #22: Add Offline Markdown Link Validation to CI

```text
Implement public starter issue #22 as a cross-platform, offline Node.js validator
for relative file and image references in tracked Markdown files. Resolve targets
from each source document, remove query strings and fragments, decode URL-encoded
path segments, allow parent references that remain inside the repository, and reject
targets that escape it. Ignore absolute web URLs, mailto links, and document-only
fragments without making network requests.

Report every broken reference with its source file and line and exit non-zero. Add
fixture-based tests for valid links/images, encoded paths, missing targets, ignored
external references, and traversal outside the repository. Expose the validator
through a root pnpm script, run it in ordinary CI, and document it in the contributor
validation path.

Do not add a hosted crawler, validate heading anchors, rewrite documentation,
contact external URLs, change application behavior, alter schemas/providers, mutate
the immutable v0.1.0-alpha.1 release, or change production NO-GO. Run focused tests,
the new validator, formatting, lint, strict type checks, and complete package tests.
Update documentation and `docs/PROGRESS.md`, commit, reconcile, push main, verify
hosted checks, close issue #22 if repository authority is available, then stop and
request separate authorization for any next command.
```

## Command 64 — Implement Starter Issue #23: Add a Safe-Demo Accessibility Smoke Audit

```text
Implement public starter issue #23 as a `demo:a11y` Playwright command that targets
only the running loopback safe demo. Audit the public hosting catalogue, login page,
authenticated customer overview, and authenticated administrator dashboard with the
repository-pinned Chromium and a pinned accessibility engine. Fail on serious or
critical WCAG A/AA findings and print only bounded rule IDs and routes.

Use only generated fictional accounts. Runtime credentials may be read internally
but must never be printed, attached, or included in failure output. Add keyboard
assertions for the skip link and one responsive navigation path, wait for semantic
application state rather than arbitrary delays, and leave demo/provider state
unchanged. Document the audit's coverage and that it is not accessibility
certification.

Do not target staging/production, use real identities, add a hosted scanner, expand
the browser matrix, perform a general redesign, change financial/schema/provider
behavior, mutate the immutable release, or change production NO-GO. Run the focused
audit against a healthy demo, relevant web tests, formatting, lint, strict type
checks, complete package tests, and the web production build. Update documentation
and `docs/PROGRESS.md`, commit, reconcile, push main, verify hosted checks, close
issue #23 if repository authority is available, then stop and request separate
authorization for any next command.
```

## Command 65 — Implement Starter Issue #24: Add an Explicitly Guarded Safe-Demo Reset Command

```text
Implement public starter issue #24 as a deliberate `demo:reset` command behind one
exact documented confirmation flag. Without that flag, refuse and change nothing.
Target only the fixed demo Compose file and project identity, its dedicated
containers/networks/volumes, and the exact `.demo-runtime/demo.env` file. Refuse
symlinks, non-regular runtime paths, traversal, overrides, or any resolved target
outside the dedicated demo boundary.

Remove demo Docker state first and delete generated runtime credentials only after
confirmed cleanup. Preserve the runtime file when Docker cleanup fails or is
uncertain. Keep reset idempotent for absent/already-reset state, redact raw command
errors and runtime values, and preserve `demo:down` as the normal non-destructive
stop path. Add injected filesystem/process tests for confirmation, success, absent
state, Docker failure, invalid paths, redaction, and exact targeting. Document the
destructive warning and safe start-again workflow.

Do not add generic Docker pruning, development-data reset, arbitrary path/project
options, staging/production mutation, provider calls, schema changes, release
mutation, or production-NO-GO changes. Run focused tests, a disposable
first-run/reset/restart smoke cycle, demo Compose rendering, formatting, lint,
strict type checks, and complete package tests. Update documentation and
`docs/PROGRESS.md`, commit, reconcile, push main, verify hosted checks, close issue
#24 if repository authority is available, then stop and request separate
authorization for any next command.
```

## Command 66 — Implement Starter Issue #25: Add a Contributor Change-Path Map

```text
Implement public starter issue #25 by adding `docs/CONTRIBUTOR_PATHS.md`. Map demo
tooling, Next.js UI, NestJS API modules, worker/scheduler jobs, shared contracts, and
database migrations to their owning directories, nearest focused tests, relevant
documentation, minimum validation commands, and safety invariants. Include a short
first-contribution flow that points to the current starter issues and private
security reporting.

Keep every command and repository path literal and current. Link the map from
`CONTRIBUTING.md` and the README documentation index, and add an automated check
that every mapped repository path and root pnpm script exists.

Do not reorganize code ownership or architecture, create a migration, generate a
full API reference, rewrite the documentation set, change providers/production
procedures, mutate the immutable release, or change production NO-GO. Run formatting,
the repository Markdown link check, the path/script existence check, and terminology
and secret review. Update documentation and `docs/PROGRESS.md`, commit, reconcile,
push main, verify hosted checks, close issue #25 if repository authority is
available, then stop and request separate authorization for any next command.
```

## Command 67 — Reopen the Contributor On-Ramp With a Third Starter-Issue Set

```text
Review the completed adoption work in Commands 57–66, closed starter issues #18–#25,
the contributor change-path map, current public issue backlog, and the phase-review
findings. Define exactly three new bounded starter issues that improve safe-demo
functional verification, documentation, testability, or contributor onboarding.
The set must include a read-only functional smoke check for an already-running safe
demo that verifies the principal public, customer, and administrator evaluator paths
without changing business data or lifecycle state.

Give every issue explicit acceptance, validation, security, and excluded-scope
criteria. Update the starter-issue catalogue so only genuinely open work appears as
current, add separately gated implementation commands to this catalogue, and create
the approved public issues only if repository authority remains available. Keep each
task suitable for one focused pull request and one change path from
docs/CONTRIBUTOR_PATHS.md.

Do not implement any proposed issue, start/stop/reset a demo, use real data or
credentials, contact providers, alter financial rules or schemas, deploy an
environment, mutate v0.1.0-alpha.1, or change production NO-GO. Run Markdown
formatting, offline link/path validation, terminology review, public-backlog
reconciliation, and secret review. Update docs/PROGRESS.md, commit, reconcile, push
main, verify hosted checks, then stop and request separate authorization for the
first implementation command.
```

## Command 68 — Implement Starter Issue #26: Add a Read-Only `demo:smoke` Verification Command

```text
Implement public starter issue #26 as a cross-platform `demo:smoke` command for an
already-running safe demo at the fixed `http://localhost:3100` origin. Verify
readiness, the public catalogue, customer login/overview, and administrator
login/dashboard with repository-pinned Chromium and bounded semantic assertions for
the seeded fictional data. Do not create, update, or delete any business record.

Read the generated fictional credentials only inside the command. Never print or
retain passwords, cookies, tokens, runtime-file values, raw browser errors, DOM or
response bodies, screenshots, traces, or authenticated artifacts. Refuse a non-fixed
origin, require an existing regular runtime file and healthy demo, emit deterministic
route-level output, and fail with fixed actionable messages. Do not start, stop,
build, reset, or otherwise mutate Docker or provider state.

Add focused automated tests for origin/runtime guards, pass/fail reporting,
redaction, and command dispatch without requiring Docker. Document prerequisites,
coverage, safety, and limits. Do not target staging/production, use real identities,
mutate data, contact providers, automate the full lifecycle, change accessibility,
schemas, financial rules, releases, or production NO-GO. Run focused tests, the live
smoke command against a healthy safe demo, relevant web tests, formatting, offline
documentation checks, lint, strict type checks, and the web production build. Update
docs/PROGRESS.md, commit, reconcile, push main, verify hosted checks, close issue #26
if repository authority remains available, then stop and request separate
authorization for Command 69.
```

## Command 69 — Implement Starter Issue #27: Validate Local Markdown Heading Anchors Offline

```text
Implement public starter issue #27 by extending the existing offline Markdown link
validator to validate fragments that target headings in tracked Markdown files,
including same-document references. Match the GitHub-style slugs needed by this
repository for ordinary ATX headings, repeated-heading numeric suffixes, punctuation,
Unicode text, and percent-encoded fragments.

Preserve repository-boundary and symbolic-link escape checks before reading a target
document. Report every missing anchor with source file, line, and bounded target and
exit non-zero without network access. Continue ignoring absolute web URLs, mailto
links, code examples, and fragments on non-Markdown targets. Add fixture coverage for
valid same-file and cross-file anchors, duplicate headings, Unicode/encoding, missing
anchors, ignored targets, and simultaneous failures. Update contributor documentation
for the expanded ordinary offline check.

Do not crawl external sites, check remote anchors, render HTML, rewrite links, replace
the validator with a full parser migration, change application behavior, schemas,
providers, releases, or production NO-GO. Run focused tests, `pnpm docs:links`,
`pnpm docs:paths`, formatting, lint, strict type checks, and complete package tests.
Update docs/PROGRESS.md, commit, reconcile, push main, verify hosted checks, close
issue #27 if repository authority remains available, then stop and request separate
authorization for Command 70.
```

## Command 70 — Implement Starter Issue #28: Add a Safe-Demo Path to the GitHub Bug-Report Form

```text
Implement public starter issue #28 by adding Safe evaluation demo as an explicit
deployment method in the existing GitHub bug-report form. Direct evaluators to
`demo:doctor` before startup or `demo:status` for a running stack and request only
manually reviewed, redacted output. Add bounded safe-demo context for the operating
system, Docker/Compose versions, version or commit, affected route, and whether the
failure occurred before or after the stack became healthy.

Keep version, reproduction steps, expected behavior, and actual behavior required.
Require confirmation that `.demo-runtime/demo.env`, passwords, cookies, tokens,
personal/customer data, payment evidence, private hosts, database contents, and
unredacted logs are absent. Link safe-demo troubleshooting and private vulnerability
reporting. Add an offline validator and focused tests proving every issue-form YAML
file parses and that the safe-demo option, required safety acknowledgement, unique
field IDs, and valid local/HTTPS guidance links remain present.

Do not change runtime behavior, collect telemetry, upload logs automatically, alter
security-reporting policy, enable GitHub Discussions, change schemas/providers,
deploy an environment, mutate releases, or change production NO-GO. Run the focused
validator tests, its live offline check, Markdown links, contributor paths,
formatting, and a manual GitHub form/terminology review. Update docs/PROGRESS.md,
commit, reconcile, push main, verify hosted checks, close issue #28 if repository
authority remains available, then stop and request a new phase review before any
additional implementation command.
```

## Command 71 — Reopen the Contributor On-Ramp With a Fourth Starter-Issue Set

```text
Review the completed third starter-issue set in Commands 67–70, closed public issues
#26–#28, the contributor change-path map, the current public issue backlog, and the
latest phase-review findings. Define exactly three new bounded starter issues that
improve safe-demo evaluator reliability, offline validation or testability, or
first-time contributor onboarding without expanding the product's authority. At
least one issue must be implementable and fully testable without Docker or a browser.

Give every issue explicit acceptance, validation, security, and excluded-scope
criteria. Keep each task suitable for one focused pull request and one documented
change path. Update the starter-issue catalogue so only genuinely open work appears
as current, create the approved public issues only if repository authority remains
available, and add three separately gated implementation commands for the accepted
set. Reconcile the catalogue with the public backlog before delivery.

Do not implement any proposed issue, start/stop/reset a demo, use real data or
credentials, contact providers, alter authentication, authorization, financial
rules or schemas, deploy an environment, mutate v0.1.0-alpha.1, or change production
NO-GO. Do not create speculative work merely to fill the set; every issue must point
to a concrete current repository need and must not duplicate completed work. Run
Markdown formatting, offline link/path/issue-form validation, terminology review,
public-backlog reconciliation, and secret review. Update docs/PROGRESS.md, commit,
reconcile, push main, verify hosted checks, then stop and request separate
authorization for the first implementation command.
```

## Command 72 — Implement Starter Issue #29: Keep Safe-Demo Inspection Commands Side-Effect-Free

```text
Implement public starter issue #29 so `demo:credentials`, `demo:status`,
`demo:logs`, and `demo:down` never create a missing safe-demo runtime file. Refuse a
missing, unreadable, symbolic-link, or non-regular runtime path with fixed remediation
before Docker execution. Keep `demo:up` as the only ordinary lifecycle path that may
initialize the generated runtime.

Change `demo:logs` to a non-following, no-color snapshot capped at the latest 100
lines. Preserve fixed demo Compose/project targeting, non-destructive `demo:down`,
and existing reset/doctor/smoke authority. Add injected filesystem/process tests for
missing and invalid runtime paths, exact dispatch, refusal before Docker, bounded log
arguments/output handling, and retained down state. Update command help plus the
English and Bengali evaluator guidance.

Never print runtime values, raw command errors, environment content, credentials,
cookies, tokens, or unbounded logs. Do not start or reset the demo automatically,
add target overrides or generic cleanup, change product behavior/authentication,
touch schemas/providers/releases/deployments, or change production NO-GO. Run the
focused tests, a disposable live status/logs/down check, offline documentation
validation, formatting, lint, strict type checks, and complete package tests. Update
docs/PROGRESS.md, commit, reconcile, push main, verify hosted checks, close issue #29
if repository authority remains available, then stop and request separate
authorization for Command 73.
```

## Command 73 — Implement Starter Issue #30: Validate Safe-Demo Screenshot Assets Offline

```text
Implement public starter issue #30 by defining one small repository-owned contract
for the four current safe-demo screenshot filenames, roles, required widths, bounded
heights/file sizes, and canonical-guide references. Make the Playwright capture
script and a new offline validator consume the same filename/dimension contract.

The validator must require regular non-symbolic-link assets canonically confined to
the repository, Git tracking, valid PNG signature/IHDR dimensions, conservative byte
bounds, unique filenames, and references from docs/SAFE_EVALUATION_DEMO.md. Use
Node.js and repository dependencies only; decode no pixels, launch no browser or
Docker process, and access no network. Report every failure with a bounded
repository-relative asset/reason. Add fixture coverage for live assets, missing,
traversal/symlink, malformed PNG, wrong dimensions, oversized, duplicate, untracked,
and undocumented cases. Expose focused/live pnpm commands, add the live check to
ordinary CI, and document it in the contributor path.

Do not regenerate, redesign, compare, OCR, or compress screenshots; add a visual
regression service; retain authenticated browser artifacts; change application
behavior/schemas/providers/releases/deployments; or change production NO-GO. Run
focused tests, the live offline asset check, existing documentation validators,
formatting, lint, strict type checks, complete package tests, and a manual unchanged-
asset review. Update docs/PROGRESS.md, commit, reconcile, push main, verify hosted
checks, close issue #30 if repository authority remains available, then stop and
request separate authorization for Command 74.
```

## Command 74 — Implement Starter Issue #31: Add One Offline Documentation Validation Command

```text
Implement public starter issue #31 by adding root `pnpm docs:check` as the canonical
cross-platform aggregate for every registered offline documentation validator:
Markdown links/anchors, contributor paths/scripts, GitHub issue forms, and the demo-
asset contract delivered by Command 73. Keep every focused command available.

Use an allowlisted Node.js dispatcher with deterministic sequential output and the
first failing child status. Stop dispatch after failure, discard raw child errors,
and add injected tests for full ordered dispatch, failure propagation, no later
execution, and safe output handling. The aggregate must not run formatting, lint,
type checks, package tests, Docker, browsers, external crawling, or arbitrary
commands. Use it in ordinary CI while retaining readable validator evidence, and
update contributor guidance to make the aggregate discoverable without hiding the
focused commands in the change-path map.

Do not add a general task runner, auto-fix documentation, redesign CI broadly,
evaluate document content as code, forward secrets, change application behavior,
schemas/authentication/financial/provider rules, releases/deployments, or production
NO-GO. Run focused dispatcher tests, every focused validator, `pnpm docs:check`,
formatting, lint, strict type checks, and complete package tests. Update
docs/PROGRESS.md, commit, reconcile, push main, verify hosted checks, close issue #31
if repository authority remains available, then stop and request a new phase review
before any additional implementation command.
```

## Command 75 — Establish the Real-Hosting Product Experience Roadmap

```text
Establish the next product-development phase from the application that actually
exists. Inspect the complete fictional safe demo as both administrator and customer,
the current store, portal and administrator routes, their API/module support, the
release-checklist gaps, and the primary end-to-end lifecycle. Use current official
public WHMCS documentation only as a workflow-concept benchmark for client context,
orders, billing, services, automation and support; use no licensed account, private
material, copied code, text, screenshots, styling or trade dress.

Create docs/PRODUCT_EXPERIENCE_ROADMAP.md with a route/capability inventory and a
workflow-led gap matrix for: product discovery and checkout; customer account and
self-service; administrator customer context; order/payment review; provisioning
and service lifecycle; invoices/renewals; support; and automation/operational
attention. For every gap record the observed local evidence, affected role, real
hosting-business job, current friction or risk, desired outcome, safety invariant,
test/evidence route, dependencies and priority. Explicitly identify misleading or
inactive affordances, missing cross-record navigation, scale/pagination/search
limits, unsafe shortcuts, and functions that are deliberately out of scope.

Prioritize work by operator/customer frequency, error or financial/service risk,
manual effort, dependency readiness and bounded testability—not by competitor
feature count. Define exactly three separately gated, pull-request-sized Commands
76–78 for the first product-experience set. Each must improve an existing end-to-end
journey using fictional data/fake providers, have explicit acceptance and excluded
scope, preserve role/ownership and financial/provisioning separation, and include
component/API/E2E evidence proportional to its risk. At least one command must
improve the administrator's daily operational workflow and at least one must improve
the customer-facing journey. Do not implement those commands or publish starter
issues during Command 75.

Run demo:doctor, use the supported safe-demo lifecycle without reset or business
mutations, run demo:smoke, and manually inspect every in-scope route with generated
fictional identities. Stop the demo non-destructively afterward, retaining its
dedicated local state. Run docs:check, formatting and git diff checks, verify every
external comparison link manually, and review the roadmap for product terminology,
copyright/trademark independence, secrets and production claims. If Docker or the
safe demo cannot run, record that as a blocker rather than substituting screenshots
for the required live route review.

Do not change application code, schemas, authentication, financial/provider rules,
business records, releases, deployments or production NO-GO; contact real providers
or customers; use real data or credentials; probe any hosted installation; access a
licensed WHMCS instance; promise feature parity; or add reseller, marketplace,
affiliate, multi-currency, worldwide-tax, domain-registrar or automatic-termination
scope. Update docs/PROGRESS.md, commit, reconcile, push main, verify hosted checks,
then stop and request separate authorization for Command 76.
```

## Command 76 — Repair the Public Storefront Entry and Plan Selection

```text
Implement the first product-experience roadmap slice by making the anonymous public
entry and hosting catalogue truthful, navigable and immediately useful. Replace the
root-to-login contradiction with a small independent Webhost Billing public entry
that uses the existing public shell, contains real local targets for every displayed
header/footer link, and offers clear routes to the hosting catalogue, registration
and sign-in. Do not copy competitor structure, text, styling or trade dress.

Make the catalogue choose the first currently active price period deterministically
instead of initially selecting an unavailable hard-coded period. When at least one
active price exists, the first rendered product state must expose its price and a
valid checkout CTA without an exploratory period click. Keep unavailable periods
honest, preserve the selected product/price identifiers in the checkout link, and
continue revalidating every price and total on the server. Define and test a clear
all-prices-unavailable state.

Add component tests for public navigation targets, available/unavailable period
selection, empty pricing and exact checkout URLs. Extend browser evidence across
anonymous `/`, `/hosting`, valid fragment targets, registration/sign-in links and
an authenticated catalogue-to-checkout selection without placing an order. Update
product documentation and the safe-demo walkthrough only where the evaluator path
changes.

Do not add promotions, cross-selling, marketing telemetry, a CMS, payment capture,
domain registration, open redirects, real products/providers/data, schema or
financial-rule changes, deployments, release mutation, or production approval. Do
not implement general post-login return navigation beyond what is strictly needed
for the tested local storefront paths. Run focused web tests, the safe-demo read-only
smoke check, the relevant browser journey, docs:check, formatting, lint, strict type
checks and complete package tests. Update docs/PROGRESS.md, commit, reconcile, push
main, verify hosted checks, then stop and request separate authorization for Command
77.
```

## Command 77 — Make Administrator Customer Context Actionable

```text
Implement the administrator slice from the product-experience roadmap. Reorder the
administrator customer page so operational identity, status, linked counts and
recent business context are available before optional edit forms. Render money with
the shared safe BDT formatter rather than raw minor-unit wording and render dates in
the configured business presentation conventions.

Turn recent orders, services, invoices, payments and tickets into role-protected
navigation. Link directly to an existing administrator detail route when one exists;
otherwise link to the corresponding administrator list with an explicit URL-bound
customer filter. Teach those target list pages to validate, display, clear and send
that customer filter through their existing server query contracts. A filtered
empty state must identify the customer context without leaking or inventing data.
Keep the customer detail aggregate bounded and do not create multiple new record-
detail pages in this command.

Add component tests for ordering of operational/edit sections, safe money/date
presentation, link targets, filter apply/clear behavior, malformed filter handling,
empty/error states and administrator-only access. Add API coverage only where an
existing customer filter is not already proved. Extend the fictional browser journey
from customer search to the customer page, then into at least one direct detail and
one customer-filtered ledger, without editing a record.

Preserve role authorization, customer ownership, immutable financial history,
separate order/payment/provisioning/service states, exact termination confirmation,
and secret redaction. Do not add global search, new order/service/payment/ticket
detail routes, bulk actions, real providers/data, schema changes, record mutations,
deployment, release mutation, or production approval. Run focused component/API/E2E
tests, docs:check, formatting, lint, strict type checks and complete package tests.
Update docs/PROGRESS.md, commit, reconcile, push main, verify hosted checks, then
stop and request separate authorization for Command 78.
```

## Command 78 — Turn the Customer Portal Overview Into a Next-Action Home

```text
Implement the customer-facing self-service slice from the product-experience
roadmap. Extend the ownership-bound portal summary contract with bounded,
server-derived action facts needed to answer: what balance is outstanding, whether
an invoice is overdue, which active or suspended service is due next, and whether a
support ticket is waiting for the customer or staff. Use integer minor units and
safe string serialization; do not calculate authoritative balances in the browser.

Update `/portal` to prioritize due/overdue payment, service-renewal and support
attention with direct links to the permitted invoice, service or support route.
Provide explicit healthy/no-action, loading, empty and failure states. Keep recent
activity as secondary context and do not present a paid zero-balance invoice as the
primary billing action. The summary must remain correct when more records exist than
the bounded recent lists.

Add shared-schema and API service/controller tests for aggregate correctness,
ownership, mixed paid/unpaid/overdue invoices, suspended/active services, ticket
states, empty accounts and safe monetary serialization. Add component tests for
priority and links, then extend browser evidence for one action-needed customer and
one healthy customer using fictional data only.

Do not submit a payment, order, ticket reply or hosting operation; change invoice,
payment, renewal or service state; add notifications, global search, predictive
recommendations, promotions, multi-currency or tax scope; contact providers; use
real data; change deployments/releases; or approve production. Preserve all role,
ownership, payment/provisioning separation, financial immutability and permanent-
termination invariants. Run focused shared/API/web/E2E tests, demo:smoke,
docs:check, formatting, lint, strict type checks and complete package tests. Update
docs/PROGRESS.md, commit, reconcile, push main, verify hosted checks, then stop and
request a phase review before defining further implementation work.
```

## Command 79 — Guard Partial-Payment Policy Changes

```text
Implement the next bounded product-experience slice by making the partial-payment
policy a deliberate, server-enforced administrator decision. Remove the direct
one-click mutation from `/admin/payments`; show the current policy there as
read-only operational context with a protected link to the canonical billing-policy
section in `/admin/settings`.

In settings, retain a persisted baseline separately from the editable draft. When
the partial-payment value changes, require an explicit review step that states the
current value, proposed value, and the exact consequence for future manual-payment
submission, recording, and pending-reference verification. Require a fixed
confirmation value at the API boundary for an actual policy transition, including
the existing payment-settings endpoint, so a client cannot bypass the review by
calling either write route directly. An unchanged policy must not require the
confirmation. Keep the existing administrator role boundary and record one audited
old-to-new transition without sensitive data.

Add strict shared request contracts plus service/controller coverage for missing or
incorrect confirmation, unchanged/idempotent saves, valid enable and disable
transitions, administrator-only access, persisted policy, and safe audit metadata.
Add component tests for read-only payment-page context, the canonical settings link,
draft-versus-persisted state, consequence review, cancellation, successful save, and
recoverable failures. Extend the fictional administrator browser journey through
review and cancellation without changing the seeded policy; prove the authorized
mutation only in isolated API/component fixtures.

Do not change invoice balances, existing payments, refunds, reversals, pending
references, payment arithmetic, gateway behavior, provider configuration, database
schema, roles, releases, deployments, or production readiness. Do not add a general
approval framework or combine this work with ledger pagination, dashboard attention,
order/payment detail, checkout continuity, automation freshness, or service actions.
Preserve integer minor units, immutable financial history, idempotent payment rules,
and the separation of payment, invoice, order, provisioning, and service states.

Run focused shared/API/web tests, the relevant API E2E and fictional browser
journey, docs:check, formatting, lint, strict type checks, complete package tests,
and the production build. Update docs/PROGRESS.md, commit, reconcile, push main,
verify hosted CI and CodeQL, then stop and request a new phase review before defining
or implementing another command.
```

---

## Command 80 — Preserve Hosting Plan Selection Through Customer Sign-In

```text
Repair only the anonymous catalogue-to-customer-checkout handoff. Preserve the
selected productId and priceId through customer sign-in and the same-browser
login/register navigation, including a sign-in link after successful registration.
An authenticated customer must arrive at the selected checkout without placing an
order automatically. Missing or expired sessions must reach the same safe sign-in
handoff; cookie presence alone is never proof of authentication.

Use one small, tested allowlist for checkout intent: exactly one runtime-validated
product UUID and price UUID, reconstructed into the fixed local /portal/checkout
route. Do not accept arbitrary next/returnTo URLs, external or protocol-relative
destinations, encoded redirect chains, paths, fragments, customer identifiers,
amounts, domains, or other payloads as return authority. Drop malformed, incomplete,
or duplicate selection parameters and retain the existing default /portal landing
when there is no valid intent. Use the role returned by authoritative authentication;
administrators, including two-factor sign-in, must still land at /admin and must
never consume customer checkout intent. Preserve role checks, cookie sessions,
CSRF, account verification, MFA, and rate limits unchanged.

Treat carried identifiers only as an untrusted selection hint. Reload the current
public catalogue before selecting a product/price; ensure the price belongs to the
selected active public product. If a syntactically valid carried selection is
unavailable, retired, mismatched, or no longer eligible, show a recoverable unavailable
state and require a deliberate new selection. Never silently substitute the first
plan or billing period. Keep the no-intent checkout path usable. Preserve the API's
current authoritative price calculation, ownership, and idempotent order creation.

Add validator, proxy/server-guard, login/register, and checkout coverage for exact
selection retention, missing/expired sessions, failed sign-in and retry, default
landings, administrator/MFA behavior, login/register round trips, malformed and
duplicate identifiers, hostile return targets, and stale/mismatched catalogue data.
Extend the fictional browser lifecycle to begin with an anonymous catalogue choice,
pass through account entry, and reach that exact checkout without creating an order
until the existing explicit Place order step. Prove the existing order API still
rejects ineligible product/price input and calculates its own amount. Keep all
fixtures local and fictional; do not weaken assertions or authentication limits.

Do not build a general return-navigation framework, shopping cart, persisted intent
model, cross-device/email-link resume, password-reset resume, guest checkout, or
automatic order/payment/provisioning behavior. Do not change authentication APIs,
verification emails, database schema, billing rules, provider configuration,
financial history, roles, releases, deployments, or production readiness. Do not
combine this with ledger pagination, dashboard attention, automation freshness,
service actions, or inactive workspace chrome. Production remains NO-GO.

Run focused web and relevant order API tests, the complete fictional browser
lifecycle, docs:check, formatting, lint, strict type checks, complete package tests,
and the production build. Update docs/PROGRESS.md, commit, reconcile without history
rewriting, push origin/main, verify hosted CI and CodeQL, then stop and request a
phase review before defining or implementing another command.
```

**Authorization:** Separately authorized by the user on 2026-10-03. Implementation
and delivery evidence are tracked in `docs/PROGRESS.md`; no later command is authorized.

---

## Command 81 — Make Customer Invoice History Searchable and Paginated

```text
Improve only the customer invoice ledger at /portal/invoices. Replace its fixed
first-100 fetch with URL-bound search, invoice-status filtering, page size, and
pagination using the existing /invoices/my contract. Keep the existing invoice
detail, print/PDF, payment eligibility, formatting, visibility, and ownership rules.
Do not implement administrator-ledger pagination or a general list framework.

Use a small runtime-validated allowlist containing only search, status, page, and
pageSize, derived from the existing customer invoice query contract. Accept at most
one value per field. Keep search bounded to the existing 200-character limit,
statuses to the existing enum, page/pageSize to safe positive integers, and page
size at most 100 (default 20, page 1). Reject unsafe pagination offsets. Malformed,
duplicate, or out-of-range allowed values must use safe defaults with a visible,
recoverable invalid-filter notice. Ignore unrelated parameters and never forward
customerId, account identity, return destinations, amounts, or mutation inputs.
Reconstruct links only to the fixed local invoice-ledger route. Customer scope must
continue to come exclusively from the authenticated API identity, never the URL.

Keep the committed query in the URL so reload, browser back/forward, and returning
from invoice detail via browser Back retain it. Submitting search, changing status,
or changing page size must reset page to 1 while preserving the other valid filters. Provide a clear
filters action. Consume authoritative response pagination metadata for matching
record count, page/range information, and previous/next controls; never infer
complete history or account-wide balance from the returned page. Preserve safe
money rendering and existing invoice-detail links.

Provide distinct first-use empty, filtered no-results, out-of-range-page, loading,
and retryable error states. Keep filter controls and a safe recovery path usable,
including when the requested page becomes empty. Bound requests to one page rather
than fetching every invoice in the browser. Prevent stale responses from replacing
newer query results. Label controls for keyboard and small-screen use, and do not
show failed or stale data as a successfully refreshed result.

Add query/server-page and component coverage for valid defaults, exact filter
requests, malformed/duplicate values, ignored customer/redirect payloads, filter
reset, metadata/controls, page changes, reload/back-forward state, no results,
out-of-range recovery, errors/retry, stale responses, and preserved detail links.
Extend the existing invoice API integration suite with isolated fictional histories
larger than 100 records, deterministic non-overlapping pages, matching counts and
search/status results, and another customer's records excluded from both data and
metadata. Prove supplied customerId cannot bypass /invoices/my, anonymous access
fails, and the administrator ledger remains role-protected. Use existing API
ordering and contracts; change no invoice business rule or production record.

Extend the fictional browser journey with read-only customer search/filter/paging
and navigation continuity, including an invoice beyond the old first-100 boundary.
Create any extra fictional history only in the isolated test fixture, without
provider calls, altered authentication limits, or weakened lifecycle assertions.
Prove ledger browsing sends no business mutation. Retain the existing payment,
ownership, immutable-history, and payment/provisioning separation regressions.

Do not add bulk actions, exports, new payment or invoice mutations, all-account
aggregates, sorting/date filters, a persisted search model, new API endpoints,
database schema, authentication changes, admin/customer cross-record workflows,
other ledgers, workspace search/notifications, providers, releases, deployments,
or production approval. Production remains NO-GO.

Consult the installed Next.js query/navigation documentation before implementation.
Run focused shared/web query and component tests, the relevant invoice API E2E and
full fictional browser lifecycle, docs:check, formatting, lint, strict type checks,
complete package tests, and the production build. Update docs/PROGRESS.md, commit,
reconcile without history rewriting, push origin/main, verify hosted CI and CodeQL,
then stop and request a phase review before defining or implementing more work.
```

**Authorization:** Separately authorized by the user on 2026-10-04. Implementation
and delivery evidence are tracked in `docs/PROGRESS.md`; no later command is authorized.

---

## Command 82 — Connect Administrator Order Review to Customer and Invoice Context

```text
Improve only the existing administrator order workspace at /admin/orders. Add an
explicit, read-only Review order action for a listed order and a labelled review
panel using the existing GET /orders/:orderId endpoint. Do not add an order-detail
route, API endpoint, read model, schema change or a general record-review framework.

Use the existing shared order runtime contract, not a TypeScript assertion, before
using response identifiers, snapshots or money in the review. Reconstruct only
fixed local /admin/customers/:customerId and /admin/invoices/:invoiceId links from
validated returned identifiers. Never accept a return URL or infer invoice, customer
or service identity from a domain, display number, page filter or browser amount.
API role/ownership enforcement remains authoritative; navigation is not permission.

Present the order number, customer name/email and customer-context link, historical
plan/domain/billing-period/quantity and price snapshots for every returned item,
order totals and dates, optional plain-text order notes, and the linked invoice
number, status, due date, total and current balance with its invoice-detail link.
Keep order and invoice states visibly separate and explain that payment is not proof
of hosting provisioning. The order contract contains no service-state evidence:
do not invent a service link/status or treat COMPLETED/PAID as current hosting state.
Use the existing lossless money formatter and configured business timezone; do not
recalculate totals or read mutable catalogue prices to reconstruct historical value.

Keep review selection explicit, with no automatic first-row selection or mutation.
Fetch one selected order at a time; do not fetch complete account history. Provide
labelled keyboard/mobile controls for review, close and retry, plus distinct loading,
unavailable/not-found and retryable error states. Verify the detail response matches
the requested order and, when present, the current valid customer filter; the filter
is display context, not permission. Validate the selected UUID before requesting it.
Clear or invalidate review context on close or customer-filter
change, discard delayed responses after close/selection/filter changes, and never
present a previous order or failed refresh as the current successful review.
Preserve the existing validated customerId filter and clear-filter journey; arbitrary
query fields must not become new selection, identity or navigation authority.

This panel is informational, not a confirmation or authorization gate. Retain the
existing Create/Approve/Reject/Cancel requests, eligibility and server rules without
new mutation controls inside review. After an existing successful mutation, either
revalidate or invalidate an open affected review so it cannot silently show obsolete
order/invoice state. Review, close, retry and navigation alone must create no order,
invoice, payment, audit business event, service or hosting operation.

Add focused component coverage for exact customer/invoice links, all-item historical
snapshots and safe large monetary values, independent order/invoice states, optional
plain-text notes, invalid/mismatched responses, missing records, failed load/retry,
selection switching/close/filter changes with delayed responses, current state after
an existing mutation, and unchanged create/status-action regressions. Assert review
interactions make only read requests and cannot trigger approval or payment actions.
Retain relevant order/invoice API role/ownership, server pricing, historical-value,
idempotency and payment/provisioning-separation regressions without changing rules.

Extend the existing isolated fictional browser lifecycle with paid-order review,
exact customer and invoice navigation, return to the existing order workspace and
mobile/keyboard review/close. Snapshot business records and observe requests to prove
review/navigation causes no mutation before the existing deliberate approval step.
Keep fake providers, fixture isolation, authentication limits, timeouts and all
existing lifecycle assertions unchanged. Browser Back may restore the existing list
and its customer filter; durable review selection is not part of this command.

Do not implement order/payment/service cross-record workflows beyond the two stated
links, customer-portal changes, ledger pagination/search, exports, bulk actions,
service details, provider operations, financial or approval-policy changes, new
authentication behavior, notifications, dashboard attention, automation freshness,
dependencies, releases, deployments or production approval. Production remains NO-GO.

Consult the installed Next.js navigation documentation before implementation. Run
focused shared/web tests, relevant order and invoice API E2E, the full fictional
browser lifecycle, docs:check, formatting, lint, strict type checks, complete package
tests and the production build. Update docs/PROGRESS.md, commit, reconcile without
rewriting history, push origin/main, verify hosted CI and CodeQL, then stop and request
a phase review before defining or implementing further work.
```

**Authorization:** Defined by the Command 81 phase review and explicitly authorized
by the user on 2026-10-04. Delivery evidence is recorded in `docs/PROGRESS.md`.

---

## Command 83 — Prevent Native Credential Submission From Authentication Forms

```text
Repair only the browser submission boundary of the existing customer/admin login
(including its MFA challenge), customer registration, forgot-password and
reset-password forms. Command 82 recorded a cold registration native GET containing
fictional form fields before the expected POST; current forms rely on client-side
preventDefault, omit a native method, and initially render usable credential inputs
and submit controls. Treat this as a credential-exposure risk, not merely test flake.
Do not implement another business workflow while this boundary is unresolved.

Make server-rendered and first-client-render auth controls non-submittable until
their client handlers are ready. Prevent both button and Enter-key native submission
with JavaScript disabled or application chunks withheld; disabled submit buttons
alone are insufficient if active named fields can still submit implicitly. Keep
passwords, email/profile form fields and MFA/recovery codes out of native navigation
and request URLs. Add an explicit non-GET native form method as defense in depth,
but do not treat method=POST alone as a readiness guard or create a native auth POST
fallback to a page route. No form payload may be transmitted before readiness.

Use a small auth-only readiness mechanism, preferably within the existing form
controls boundary, with consistent server/initial-client markup and no general
form framework. Once ready, retain the original CSRF-protected authMutation POSTs,
request bodies, validation, optional-field omission, busy/error/retry behavior,
password-reset token handling, verification, customer/admin/MFA landings and
allowlisted checkout intent. No credentials enter storage, hidden URL handoffs,
logs or error messages. Preserve labels, autocomplete, keyboard/mobile usability,
and explicit accessible preparation/JavaScript-required feedback instead of an
unexplained permanently disabled form. Shared-control consumers, including the
administrator two-factor settings panel, must retain their existing workflow.

This is not authentication-policy redesign or a no-JavaScript sign-in feature.
Do not change API/auth endpoints, server actions, routes, session cookies, CSRF,
rate limits, ownership/roles, MFA setup/recovery semantics, password policy, token
lifetime or email/reset link formats. Existing authorized reset/verification token
URLs and product/price intent are not credential form submissions; preserve them
without adding arbitrary return destinations. Do not attempt to scrub a secret
after transmitting it, hide the race with test waits or weaken server enforcement.

Add focused tests for server-rendered/initial readiness, disabled successful
controls, safe native method, no-JavaScript feedback, ready/busy/error recovery,
unchanged login/register/reset/MFA request bodies and landings, and auth shared
control regressions. Add deterministic isolated fictional browser coverage using
JavaScript-disabled contexts and controlled application-script withholding/release:
assert click/Enter cannot cause a native document request, URL field leakage or
auth/business mutation before readiness, then prove normal CSRF-protected behavior
after release. Bound tests by observable conditions, not sleeps, networkidle,
private React internals, increased timeouts or additional production probes. Use
fake credentials/providers only; never print observed credential values or commit
raw trace/request data. Scope request observation to known auth form fields; do not
misclassify existing allowed reset tokens or checkout intent as a new submission.

Keep the complete existing fictional lifecycle and its assertions, isolation,
authentication limits and deadlines unchanged. Prove registration/sign-in still
preserve exact plan selection without ordering, admin MFA remains required when
configured, and order/invoice/payment/provisioning state rules are unaffected.
Retain relevant API auth/verification/reset/MFA/CSRF/role regressions unchanged.

Consult installed Next.js rendering/hydration and official browser/Playwright
documentation before implementing. Run focused auth/shared/order web tests,
relevant authentication API E2E, new deterministic readiness browser checks and the
full fictional lifecycle, docs:check, formatting, lint, strict types, full package
tests and the production build. Sequence heavy local checks to avoid the recorded
worker timeout; record any failure without weakening it. Update docs/PROGRESS.md,
commit, reconcile without history rewriting, push origin/main, verify hosted CI
and CodeQL, then stop for a phase review before defining further work.

Do not implement ledger/search, order/payment/service context, financial or provider
changes, worker fixes/cleanup, dependency updates, release/deployment, or production
approval. Production remains NO-GO. This command closes a bounded UI credential
submission risk, not all security or operational readiness gates.
```

**Authorization:** Defined by the Command 82 phase review and explicitly authorized
by the user's "command 83" on 2026-10-04. Implementation and validation are recorded
in `docs/PROGRESS.md`. Further work requires a separately authorized phase review.

---

## Command 84 — Connect Administrator Manual Payment Review to Customer and Invoice Context

```text
Add one explicitly selected, read-only manual-payment review to the existing
administrator payment workspace. Use the existing protected GET /payments/:paymentId
and manualPaymentSchema; do not build a new route, endpoint, read model or general
review framework. The ledger currently shows unlinked invoice/customer text and
inline actions, while its detail contract already supplies proof, timestamps,
transaction kind/state, adjustment totals and related IDs. Repair that bounded
operator lookup path only.

Provide an accessible, keyboard-operable Review payment action, loading, unavailable,
malformed-response, recoverable failure, retry and close states. Validate the requested
UUID and parse unknown returned data at runtime; a returned payment ID must match
the selected ID. Never use unvalidated row data to build a request or link. Selection
must not automatically verify, reject, refund, reverse, record or reconcile anything.
Keep read requests bounded to the selected record and required business-time-zone
configuration; do not fetch a detail for every row or preload entire related histories.

Show reference, manual method, transaction kind and state, submitted-by role, payer
name/note and rejection/failure reason where present, original amount, adjusted and
remaining refundable amounts, and received/reviewed/verified/created/updated dates.
Keep absent facts explicit. Render submitted proof/reference/note/reason as escaped
plain text, never HTML or provider evidence. Format lossless integer minor units
without Number/float conversion and show dates using the configured business time
zone, not the browser default. Label refundable capacity separately from invoice
balance; zero capacity on a pending/rejected transaction is not proof of settlement.

Build fixed local links to /admin/customers/:customerId and
/admin/invoices/:invoiceId only from the parsed returned identifiers. Show the invoice
number and customer name as the supplied historical invoice context, not current
customer profile evidence. A payment state is not an invoice/order/service state and
does not prove hosting provisioning. Do not infer an invoice balance/status, order
or service association from a payment. For an adjustment, clearly explain its link
to the original payment using the returned originalPaymentId, without inventing a
payment detail route, adjustment-history query or automatically following a chain.
Original-payment navigation and richer financial-history review remain separately
gated; customer and invoice details already provide the permitted fixed destinations.

Clear or revalidate selected context on customer-filter change and after successful
existing payment recording, verification/rejection or adjustment. Discard delayed,
closed, unmounted and mismatched selection responses; retry must not revive an old
selection. Restore focus appropriately on close and keep the review usable on small
screens. Opening, switching, retrying, closing and following context links must be
read-only. This review is supplementary context, not a new required approval gate.

Preserve existing financial mutation endpoints/bodies, CSRF, authorization/ownership,
idempotency keys, partial-payment confirmation, rejection policy, append-only refunds
and reversals, successful ledger/invoice refresh and gateway attention/reconciliation.
Do not move mutation controls into the review, add confirmations or redesign their
forms. Keep existing customerId filter parsing/notice and the current first-100
ledger behavior unchanged; search/pagination is a later bounded command.

Add component coverage for charge/adjustment, pending/verified/rejected states,
nullable evidence, proof escaping, large lossless money, business-zone dates,
validated customer/invoice links, malformed/mismatched IDs, stale selection/filter/
close/mutation responses, retry, keyboard/focus/mobile behavior and zero browsing
mutations. Retain and strengthen existing recording/review/adjustment regression
assertions without changing business behavior. Reuse the protected payment and
invoice API role/ownership tests; add only missing read-boundary assertions if needed.
Extend isolated fictional browser evidence with deliberate admin manual-payment
review, fixed customer/invoice navigation and unchanged relevant database records.
Preserve the complete lifecycle and all ten auth-readiness checks, rate limits,
deadlines, isolation and fake providers. No waits or weakened assertions may hide
credential submission or timing failures; no observed secrets/raw traces in reports.

Read installed Next.js guidance before implementation. Run focused payment/customer-
filter/order/auth web and shared tests, relevant payment/invoice API E2E, full browser
suite, docs:check, formatting, lint, strict types, complete package tests and production
build. Sequence heavy local checks; where fictional schema overrides are used,
verify both Prisma model schema and raw SQL search_path as documented in Command 83.
Record any local parallel-worker failure honestly; do not alter deadlines/assertions,
repair worker source or clean development records within this UI command. Required
validation must have positive evidence, and hosted CI/CodeQL must pass before handoff.

Update docs/PROGRESS.md, commit, reconcile without rewriting history, push origin/main,
verify hosted checks, then stop for a separately authorized phase review. Exclude all
other ledgers, gateway/provider features, service automation, authentication policy,
schema/dependency/worker changes, cleanup, release, deployment and production approval.
Production remains NO-GO.
```

**Authorization:** Defined by the Command 83 phase review and explicitly authorized
by the user's "command 84" on 2026-10-04. Implementation and executed validation are
recorded in `docs/PROGRESS.md`; further work requires a separately authorized phase review.

---

## Command 85 — Make the Administrator Invoice Ledger Searchable and Paginated

```text
Repair only the invoice ledger in /admin/invoices. Administrators currently receive
the first 100 invoices and discard pagination metadata, despite an existing
administrator-only GET /invoices with search, status, customerId and deterministic
createdAt/id ordering. Expose older invoices using that existing protected contract;
do not add an endpoint, database model, accounting aggregate or general list framework.

Use URL-bound search, invoice status, page and bounded page size, together with the
existing optional customerId context. Validate against invoiceListQuerySchema and
the existing customer-filter boundary. Reject duplicate, malformed, unsupported
status and overflowing page/offset input before constructing an API request. Keep
query values as data through URLSearchParams and build only fixed /admin/invoices
destinations, never arbitrary return URLs. Preserve the existing invalid-customer
notice/no-inferred-context semantics; any unfiltered scope must be explicit, not
presented as a selected customer's records. Invalid new ledger filters must have
an honest recoverable state rather than a silently substituted normal result.

Provide labelled keyboard-operable search, status, page-size, previous/next and
clear controls. Search/status/page-size changes reset page to one and retain a
valid customerId. Clearing ledger filters retains valid customer context; clearing
customer context is a separate explicit action that resets pagination. Restore
applied state on direct loads, refresh and browser back/forward. Reflect only the
applied query as current; an unsent search draft is not an applied filter. Keep
controls and result feedback usable on small screens.

Parse unknown list responses with paginatedApiSuccessResponseSchema(invoiceSchema).
Use authoritative matching-record metadata, validate its relationship to the applied
page/pageSize and rows, and reject rows outside an applied valid customer/status
scope. Do not compute account balances or full-history totals from visible rows;
matching invoice counts are not outstanding money. Keep historical snapshot names,
lossless minor-unit formatting, independent invoice/payment/service states and the
existing protected invoice-detail/print/PDF destinations unchanged.

Show loading, first-use empty, no-match, invalid-query, out-of-range, malformed-response
and recoverable read-failure states distinctly, with deliberate retry or safe page-one
recovery. Abort/discard delayed, closed/unmounted and superseded query responses;
rows and pagination from an old query must never appear current under a new label.
Browsing, changing filters, retry, reset, pagination and detail navigation must be
read-only. Do not preload invoice detail/PDF or issue a read for every visible row.

Preserve the existing invoice draft-creation and business-identity forms, endpoints,
bodies, CSRF, idempotent submission keys, validation, line calculations and success/
failure semantics. Do not remount/reset unrelated unsaved forms merely to change a
ledger query. After successful existing draft creation, reconcile/refetch the current
applied ledger instead of blindly prepending a draft that may violate its customer,
status, search, page order or metadata. Distinguish successful creation from a later
read-refresh failure so retry cannot create a duplicate. A delayed creation/read
response must not overwrite a newer ledger selection. The first-100 customer chooser
and broader creation/identity UX remain explicit separate limitations, not repaired
by this ledger command. Do not add or redesign financial actions or confirmations.

Add focused query/component tests for default and valid inputs, duplicate/invalid
values, safe URL encoding and offset bounds, applied/draft filters, customer context,
more than 100 records, server metadata, distinct empty/out-of-range/error/retry states,
malformed/mismatched rows, stale/back-forward responses, keyboard/mobile and zero
browsing mutations. Retain customer invoice-history and manual-payment/order-context
regressions. Strengthen existing draft/identity request-body, key-retry and post-create
refresh tests without changing financial behavior or discarding unsaved input.

Reuse relevant invoice/customer API authorization, ownership, deterministic query and
financial-invariant tests; add missing administrator list/read assertions only as needed.
Add guarded fictional browser evidence that reaches an invoice beyond the first 100,
combines search/status/customer context, restores URL state and opens authorized detail
without changing financial/business records. Preserve the complete hosting lifecycle,
all ten auth-readiness checks and manual-payment review evidence. Keep fake providers,
existing rate limits, deadlines and assertions; no sleeps or weakened assertions may
hide auth readiness or financial failures. Do not record credentials or raw traces.

Read installed Next.js guidance before implementation. Run focused new/admin/customer
invoice, payment/order/customer-filter and shared tests, relevant invoice/customer API
E2E, the full browser suite, docs:check, format, lint, strict types, complete package
tests and production build. Sequence heavy checks and verify both model schema and
raw-SQL search_path for isolated fictional database runs. Keep the known local parallel-
worker/isolation risk explicit; do not change worker source/deadlines or clean default
development records within this UI authorization. Required checks need positive
executed evidence; hosted CI and CodeQL must pass before handoff.

Update docs/PROGRESS.md, commit, reconcile without rewriting history and push
origin/main, verify hosted checks, then stop for a separately authorized phase review.
Exclude other ledgers, global search, customer-picker redesign, financial aggregates,
service/provider/automation work, authentication policy, schema/dependency/worker
changes, cleanup, release, deployment and production approval. Production remains NO-GO.
```

**Authorization:** Defined by the Command 84 phase review and explicitly authorized
by the user's "commaand 85" on 2026-10-04. Implementation and validation are recorded
in `docs/PROGRESS.md`. Further work requires a separately authorized phase review.

---

## Command 86 — Add Read-Only Administrator Service Inspection

```text
Implement one explicit read-only service review in the existing /admin/services
workspace. Use the existing protected GET /services/:serviceId and
apiSuccessResponseSchema(serviceSchema); do not add a detail route, endpoint,
relationship read model, global review framework or provider request.

Add a labelled keyboard-operable Review control for each listed service, including
final states. Fetch only the deliberately selected service with cookie credentials,
no-store caching and abort/discard protection. Validate unknown responses, requested
and returned UUIDs, and any valid applied customer scope before showing context or
links. Do not trust a TypeScript cast or the cached row as current detail. Preserve
the existing invalid-customer warning/no-inferred-context semantics. Selection,
filter change, close, retry, unmount and a begun existing mutation must invalidate
old review context; superseded responses must never appear current. Invalidate at
mutation dispatch, not only after a successful follow-up read: uncertain outcomes
must not leave old service facts visible as refreshed evidence.

Show service state and returned domain, historical product/price references,
billing period, lossless recurring amount, server/account metadata, started/next-due
dates, lifecycle timestamps and exceptional/final-state reasons. Use the configured
business time zone through the existing settings read and validate that boundary;
never silently label browser-local dates as business dates. Nullable facts must be
explicit, not guessed. Reasons, product text, identifiers and hostnames remain
escaped text, not HTML, external links or login actions. Expose no secrets, tokens,
provider responses or generated control-panel sessions.

Use only a validated fixed /admin/customers/:customerId link for the returned
customer. Customer name/email in serviceSchema come from the current profile, not
an invoice identity snapshot; label that distinction. Display returned nullable
order number/IDs as references only. This contract supplies no invoice link,
invoice balance, payment state, current order state, operation history or provider
verification timestamp: do not infer them, invent destinations, fetch chains, or
claim this read contacts the hosting panel. Service state is application evidence,
not proof that the remote account currently matches; payment is not provisioning.

Provide loading, malformed/mismatched/forbidden/not-found and recoverable read-failure
states with deliberate GET-only retry and close. Focus the review heading after
selection and restore its trigger on explicit close when still present. Keep the
panel and long text usable at 375px and preserve accessible status/error feedback.
No detail preloads, reads per visible row, write-on-review or automatic retries.

Keep existing creation, provisioning, suspend/reactivate/cancel/terminate and panel
retry/reconciliation behavior unchanged. Preserve endpoints, request bodies, CSRF,
submission keys, eligible-order/server rules, failure classification, evidence
reasons and exact TERMINATE confirmation. Review is neither a new approval gate nor
a prerequisite for existing deliberate actions. Do not reset unrelated unsaved
creation/action forms merely to select/close/retry a review. The first-100 list,
setup-option scale and broader fulfilment UI remain explicit separate limitations.

Add focused component tests for all service states, nullable facts, safe text,
lossless amounts, business-zone dates, fixed customer links/current identity,
malformed/mismatched and customer-scope responses, read recovery, abort/discard on
selection/filter/close/unmount/mutation (including failed refresh), focus/mobile and
zero inspection mutations. Strengthen original service/panel request-body and exact
termination regressions without weakening assertions or business policy. Retain
administrator invoice/order/payment and customer-filter regressions.

Reuse relevant service/hosting-panel/customer API role, ownership, redaction and
financial-state invariants; add missing read-only assertions only as needed. Add
guarded fictional browser evidence for review/customer navigation/close and unchanged
service, operation, financial, audit and outbox records. Preserve the full existing
browser suite, all ten auth-readiness checks and hosting lifecycle; isolate any new
fictional sign-in account if needed rather than raising rate limits or deadlines.
Use fake providers only, and disable credential-bearing trace/video/screenshot
artifacts for the new journey.

Read installed Next.js guidance before web edits. Run focused service/panel and
invoice/order/payment/filter tests, shared contracts, relevant API E2E, full browser
suite, complete package tests, docs:check, format, lint, strict workspace/browser
types and production build. Sequence heavy checks and verify fictional Prisma model
schema and raw-SQL search_path before database tests. Do not change worker source,
timeouts, default development records or dependencies to mask known local failures.
Record fresh versus retained evidence honestly; hosted CI and CodeQL must pass.

Update docs/PROGRESS.md, commit, reconcile without rewriting history and push
origin/main, verify hosted checks, then stop for a separately authorized phase review.
Exclude new relationships/routes, invoice/payment/order workflows, service pagination,
global search, dashboard/freshness/chrome, schema/auth/dependency/worker changes,
providers, cleanup, releases, deployments and production approval. Production stays NO-GO.
```

**Authorization:** Defined by the Command 85 phase review and explicitly authorized
by the user's "command 86" on 2026-10-04. Implementation and validation are recorded
in `docs/PROGRESS.md`. Later work requires a separately authorized phase review.

---

## Command 87 — Make Administrator Service Inventory Searchable and Paginated

```text
Replace only the fixed first-100 administrator service inventory with an explicit
URL-bound read-only ledger inside the existing /admin/services workspace. Use the
existing protected GET /services, serviceListQuerySchema, serviceSchema and
paginated envelope. Add no endpoint, route, schema or business rule.

Support search, application service status, bounded page and page size, preserving
the existing independently validated optional customerId scope. Validate duplicate,
malformed, overlong, unsafe-offset and unsupported owned query inputs before reads;
reconstruct only the fixed local inventory destination. Preserve the invalid-
customer warning and explicit all-customer semantics, never inferred ownership.
Reset page on a deliberate search/status/page-size change. Clearing inventory
filters retains valid customer scope; clearing customer scope is separate. Preserve
refresh, back/forward and deep-link behavior without a general search framework.

Use cookie/no-store abortable GETs and runtime-validate every row, authoritative
pagination and applied status/customer scope. Discard superseded responses on
query changes, retry and unmount. Show loading, invalid-query, malformed/context-
mismatched, empty, out-of-range and recoverable read-failure states; never silently
clamp the page or label old rows/counts as current. Counts are matching records,
not account balances or provisioning success. Search semantics remain the existing
API's domain, historical product name, current customer email and external account
ID matching; deterministic ordering stays createdAt desc then id desc. Do not
invent domain-only search, server filtering or a frozen history across requests.

Keep creation, action and panel forms outside any query-keyed inventory subtree.
Query/selection changes must invalidate the selected service review and its pending
reads without resetting unrelated unfinished creation/reason/confirmation/panel
input. If an action form remains open, keep its original target explicit rather
than retargeting it to a new row. Existing review stays deliberately selected,
runtime validated and GET-only, with fixed customer links and business-zone facts.
No per-row detail preload, chain fetch, provider check, new approval gate or write
on search/page/retry/close/navigation. Keep 375px controls and keyboard focus usable.

Preserve exact creation/status/panel endpoints, bodies, CSRF, submission keys,
eligible-order/server rules, failure classification, reasons and TERMINATE phrase.
Retain page-local panel-dispatch invalidation from the Command 86 phase review,
including configuration, server test, tools and manual retry. Inspection remains
blocked for a pending mutation and cannot resurrect on completion or read failure.
Reconcile only after an existing deliberate mutation finishes: refresh the latest
applied inventory query without injecting a nonmatching service or making a failed
follow-up read trigger another write. Account tools, setup options and stored panel
history remain their existing independent surfaces; their scale is not this ledger.

Add focused query/component evidence for histories above 100, combined filters,
query restoration/clearing, invalid/out-of-range inputs, row/metadata mismatch,
delayed-response discard, failed reads, preserved forms/action targets, selected
review invalidation and unchanged request bodies. Retain all service/panel and
invoice/order/payment/customer-filter regressions. Reuse API role/ownership and
state-separation tests; add deterministic search/status/customer ordering/count
assertions where absent. Add a guarded fictional browser journey proving an older
service can be found, reviewed and linked to its customer without inventory-browsing
mutations; compare service/operation/financial/audit/outbox records. Use an isolated
fictional sign-in account without raising limits/deadlines, fake providers only,
and no credential-bearing trace/video/screenshot artifacts.

Read installed Next.js guidance before edits. Run focused service/ledger and shared
tests, relevant API E2E, complete web/package tests, full browser suite, docs:check,
format, lint, strict workspace/browser types and production build. Sequence heavy
checks and verify both fictional Prisma model schema and raw-SQL search_path before
database tests. Do not modify worker source, dependencies, timeouts, default local
records or test assertions to hide existing execution/isolation risks.

Update docs/PROGRESS.md, commit, reconcile without rewriting published history,
non-force push origin/main, verify exact-head CI and CodeQL and stop for phase
review. Exclude customer service history, setup/tool/history pagination, other
ledgers, richer billing/order/service relationships, service-action redesign,
automation freshness, dashboard/chrome, schema/auth/worker/dependency changes,
providers, cleanup, releases, deployment and production approval. Production NO-GO.
```

**Authorization:** Defined by the Command 86 phase review and explicitly authorized
by the user's "Command 87 — Make Administrator Service Inventory Searchable and
Paginated" on 2026-10-04. Implementation and validation are recorded in
`docs/PROGRESS.md`. Later work requires a separately authorized phase review.

---

## Command 88 — Make Administrator Order Ledger Searchable and Paginated

```text
Replace only the fixed first-100 administrator order list with a URL-bound
read-only ledger in the existing /admin/orders workspace. Use protected GET
/orders, orderListQuerySchema, orderSchema and the existing paginated envelope.
Add no endpoint, route, schema, order state or billing rule.

Expose search, order status, bounded page/page-size and independently validated
optional customerId. Reject duplicate, malformed, overlong, unsafe-offset and
unsupported owned query inputs before reads; build only the fixed local ledger
destination. Retain the invalid-customer warning and explicit all-customer wording.
Reset page on deliberate search/status/page-size changes. Clearing ledger filters
retains valid customer scope; clearing customer scope is separate. Restore applied
filters on refresh/back/forward without a general search or navigation framework.

Keep the existing API search semantics: order number, historical customer email
snapshot and any item's requested domain, case-insensitive. Do not claim current
email, customer-name, invoice-number or product-name search. Ordering stays
createdAt desc then id desc, not displayed placedAt or a frozen cross-page history.
Counts are matching order records, not balances, settled cash or provisioning proof.

Use abortable cookie/no-store GETs. Runtime-validate every order/item/invoice row,
unique IDs, applied customer/status scope and authoritative pagination. Superseded
query/retry/unmount responses cannot restore old rows/counts. Show loading, invalid,
malformed/context-mismatched, failed, empty and out-of-range states with GET-only
recovery; never silently clamp pages or expose raw response/network errors.

Keep creation and product/price/customer selection outside the query-keyed ledger.
Preserve unfinished customer/product/price/domain/note inputs and the existing
submission-key lifecycle across ledger and customer-scope navigation. Ledger
customer scope is not a reassignment of the creation form's selected customer.
Setup/options loading remains independent; no customer-picker scale repair here.
Clear/abort selected order review on query/retry changes and before existing
creation/status dispatch; block inspection while a write is pending. Completion
never restores old selection. Review remains deliberate GET-only, with all-item
snapshots, lossless money, business-zone dates and fixed customer/invoice links.
Current profile name and historical email/items remain distinct. No service state,
provider check, per-row detail preload, approval prerequisite or inferred linkage.

Preserve creation/status endpoints, bodies, CSRF, creation submission keys,
duplicate handling, server-authoritative prices and eligible status buttons. Each
status request keeps the original clicked order ID even if URL filters change while
pending. After an existing deliberate mutation finishes, reconcile the latest
applied query instead of prepending a nonmatching order or patching stale counts.
A failed subsequent read must not repeat the write or misreport successful creation
as a failed submission. Preserve 375px controls and keyboard focus/close behavior.

Add query/server-entry/component tests for >100 records, combined filters,
restoration/clearing, duplicate/invalid/offset/out-of-range inputs, bad rows/metadata,
delayed-response discard, safe failures/GET retry, retained creation fields/key,
selected-review invalidation, pending original targets and latest-query mutation
reconciliation. Retain order/checkout/auth-intent, service/panel, invoice/payment
and customer-filter regressions. Extend existing API tests where needed to prove
search semantics, status/customer combination, tie-break ordering, isolated counts,
role/ownership, out-of-range behavior and no changes from browsing.

Add one guarded fictional browser journey locating an older order, explicitly
reviewing all items and navigating fixed customer/invoice context, including
refresh/history/keyboard/mobile. Compare complete order/item/invoice/payment/service/
operation/audit/outbox facts before and after browsing. Use an isolated fictional
sign-in account and fake providers; do not raise rate limits/deadlines or retain
credential-bearing traces/video/screenshots.

Read installed Next.js guidance before edits. Run focused order/ledger/shared and
relevant API regressions, complete web/package tests, full browser suite, docs:check,
format, lint, strict workspace/browser types and production build. Sequence heavy
checks and verify fictional loopback Prisma model schema AND raw-SQL search_path
before database preparation/tests. Do not modify worker source, dependencies,
timeouts, default records or assertions to hide existing timing/isolation risks.

Update docs/PROGRESS.md, commit, reconcile without rewriting published history,
non-force push origin/main, verify exact-head CI/CodeQL and stop for phase review.
Exclude customer order history, other ledgers, picker/setup/tool/history scale,
broader financial/service relationships, order-action redesign, automation freshness,
dashboard/chrome, auth/schema/worker/dependency changes, providers, cleanup, releases,
deployment and production approval. Production remains NO-GO.
```

**Authorization:** Defined by the explicitly authorized Command 87 phase review
on 2026-10-05. The user separately authorized Command 88 by its full title on
2026-10-05. Stop after its verified delivery for a separately authorized phase review.

---

## Command 89 — Make Customer Order History Searchable and Paginated

```text
Replace only the fixed first-100 customer order list at /portal/orders with
URL-bound search, order status, page and bounded page-size controls. Use existing
customer-only GET /orders/my, orderListQuerySchema.omit({ customerId: true }),
orderSchema and the paginated envelope. Add no endpoint, route or business rule.

Allow only singular search/status/page/pageSize inputs, with the existing trimmed
200-character search bound, order enum, positive safe integers, page 1/default
size 20/maximum 100 and safe PostgreSQL offsets. Invalid or duplicate owned fields
must block reads and show recoverable invalid-filter feedback. Ignore unrelated
parameters; never forward customerId, user/account identity, redirect destinations,
amounts or mutation inputs. Reconstruct only fixed /portal/orders destinations.
The API derives customer scope from the session, not URL or browser input.

Submitting search or changing status/page-size resets page one and preserves the
other applied filters. Provide clear filters, Previous/Next and authoritative
matching count/range/page feedback. Restore committed filters on reload and browser
back/forward. Counts are owned matching orders, not account balances, settled cash
or proof of provisioning. Keep existing case-insensitive search: order number,
historical customer email and any item's requested domain. Do not claim product,
invoice-number, current-email or customer-name search. Ordering is createdAt desc
then id desc, not displayed placedAt or a frozen history across page requests.

Use abortable cookie/no-store GETs and runtime-validate the full order/item/invoice
rows, unique IDs, applied status and safe/consistent pagination including expected
page length. Superseded query/retry/unmount reads cannot restore stale rows/counts.
Keep loading, malformed/inconsistent response, safe failure/GET-only retry, first-use
empty, no matches and out-of-range states distinct. Never silently clamp pages or
display raw network/response errors. Keep controls usable and labels/focus legible
at 375px and by keyboard. Make any first-item summary explicitly incomplete when
additional items exist; any-item search must not imply a full item review.

Preserve existing New order/Browse hosting plans destinations, order/invoice state
columns, lossless money and deliberate checkout. No order-detail/review interface,
new invoice/customer/service navigation or inferred service state here. Invoice
linking and richer customer purchase context remain separately gated work.

Add focused query/server-entry/component tests for >100 records, exact requests,
combined filters, metadata, page-size resets, history restoration, invalid/duplicate/
offset inputs, ignored identity/redirect payloads, bad rows/metadata, duplicates,
stale response discard, safe retry and honest empty/out-of-range recovery. Extend
existing order API tests with fictional histories beyond 100, any-item/historical
email search, tie-break ordering, status/count isolation and another customer's
records excluded from both data and metadata. Prove supplied customerId cannot
override /orders/my, anonymous access fails and administrator routes stay protected.

Add one guarded fictional customer browser journey reaching an older order with
search/status/paging, reload/history/keyboard/mobile and no business writes. Compare
complete order/item/invoice/invoice-item/payment/event/service/operation/audit/outbox
facts before/after permitted browsing; take authorization-denial audits outside that
baseline. Use dedicated fictional sign-in and fake providers, no raised auth limits,
weakened deadlines/assertions or credential-bearing traces/video/screenshots.

Read installed Next.js guidance before code edits. Run focused order/shared and
relevant API regressions, complete web/package tests, full fictional browser suite,
docs:check, format, lint, strict workspace/browser types and production build.
Sequence heavy checks; verify loopback fictional Prisma model schema AND raw-SQL
search_path before preparation/tests. Preserve existing worker/isolation risks;
do not alter worker source, dependencies, timing limits or default records.

Update docs/PROGRESS.md, commit, reconcile without published-history rewriting,
non-force push origin/main, verify exact-head CI/CodeQL and stop for phase review.
Exclude other ledgers, general list/search frameworks, sorting/date/export/bulk
features, financial or service mutations, relationships, setup/picker/history scale,
dashboard/automation/chrome, auth/schema/dependency/worker changes, providers,
cleanup, releases, deployments and production approval. Production remains NO-GO.
```

**Authorization:** Defined by the authorized Command 88 phase review on
2026-10-05. The user separately authorized implementation by saying “command 89”
on 2026-10-05. Stop after verified delivery for a separately authorized phase review.

---

## Command 90 — Make Customer Service Inventory Searchable and Paginated

```text
Replace only the fixed first-100 customer service list at /portal/services with
URL-bound search, service status, page and bounded page-size controls. Use existing
customer-only GET /services/my, serviceListQuerySchema.omit({ customerId: true,
serverId: true }), serviceSchema and the paginated envelope. Add no endpoint,
route, backend behavior or business rule.

Allow only singular search/status/page/pageSize inputs: existing trimmed
200-character search bound, service enum, positive safe integers, page 1/default
size 20/maximum 100 and safe PostgreSQL offsets. Invalid/duplicate owned fields
must block reads with recoverable invalid-filter feedback. Ignore unrelated URL
parameters; never forward customerId, serverId, user/account identity, redirects,
amounts or mutation inputs. Reconstruct only fixed /portal/services destinations.
The API derives customer scope from the authenticated session, never browser input.

Submitting search or changing status/page-size resets page one and preserves other
applied filters. Provide clear filters, Previous/Next and authoritative matching
count/range/page feedback. Restore committed filters on reload and browser
back/forward. Retain existing case-insensitive search over service domain,
historical product name, current customer email and external account ID. Do not
claim control-panel username, server hostname, order/invoice number or customer-name
search. Ordering is createdAt desc then id desc, not startedAt/nextDueAt or a frozen
history across page requests. Counts are matching owned service records, not
active-hosting totals, balances, settled cash or live remote-panel verification.

Use abortable cookie/no-store GETs; runtime-validate complete service/server/money/
nullable lifecycle facts and authoritative pagination, unique IDs, applied status
and safe/consistent metadata including expected page length. Superseded query,
retry and unmount reads cannot restore stale cards or counts. Keep loading,
malformed/inconsistent response, safe failure/GET-only retry, first-use empty,
no matches and out-of-range states distinct. Never silently clamp pages, turn a
failed read into first-use empty, or display raw network/response errors. Keep
labels, keyboard focus and controls usable at 375px.

Preserve existing service cards, lossless recurring amount, next-due date,
application status, server/username facts and fixed /portal/services/<validated UUID>
detail links. Show a clear domain-unavailable placeholder when domain is null;
never infer that a missing domain/account or stored status proves remote success.
Server hostnames remain text, not new external links. No eager per-row detail reads,
panel/provider checks, login-URL generation or business writes during browsing.
Existing service detail, Back to services, deliberate panel-login action and
administrator fulfilment/confirmation/retry behavior remain unchanged. Return-intent,
invoice/order links and richer service context are separately gated.

Add focused query/server-entry/component tests for >100 services, exact requests,
combined filters, page-size resets, history restoration, invalid/duplicate/offset
inputs, ignored customer/server/redirect payloads, malformed money/server/status/
nullable facts, duplicate IDs, inconsistent metadata, delayed query/retry/unmount
discard, safe GET retry and honest empty/no-match/out-of-range recovery.
Extend existing service API regressions with >100 fictional owned services,
another customer's matching records excluded from rows AND counts, each supported
search field, combined status, deterministic createdAt/ID ties and out-of-range
metadata. Prove customerId/serverId cannot override /services/my, anonymous/admin
access fails, administrator routes and cross-customer detail remain protected.

Add one guarded fictional customer browser journey reaching an older service with
search/status/paging/reload/history/keyboard/mobile. Follow its existing fixed
detail link without invoking panel login. Compare complete order/item/invoice/
invoice-item/payment/event/service/operation/audit/outbox facts before/after
permitted browsing; take authorization-denial audits outside that baseline.
Use dedicated fictional sign-in and fake providers, no raised auth limits,
weakened deadlines/assertions or credential-bearing traces/video/screenshots.

Read installed Next.js guidance before code edits. Run focused service/order/shared
and relevant API regressions, complete web/package tests, full fictional browser
suite, docs:check, format, lint, strict workspace/browser types and production build.
Sequence heavy checks; verify loopback fictional Prisma model schema AND raw-SQL
search_path before preparation/tests. Preserve known worker/isolation risks;
do not alter worker source, dependencies, timing limits or default records.

Update docs/PROGRESS.md, commit, reconcile without published-history rewriting,
non-force push origin/main, verify exact-head CI/CodeQL and stop for phase review.
Exclude other ledgers, general list/search frameworks, sorting/date/export/bulk,
financial/service mutations, detail/action redesign, new relationships, support
service-picker/setup/tool/history scale, dashboard/automation/chrome, auth/schema/
dependency/worker changes, providers, cleanup, releases, deployments and production
approval. Production remains NO-GO.
```

**Authorization:** Defined by the authorized Command 89 phase review on
2026-10-05. The user separately authorized implementation by saying "command 90"
on 2026-10-05. Stop after delivery for a separately authorized phase review.

---

## Command 91 — Make Customer Support Ticket History Searchable and Paginated

```text
Replace only the fixed first-100 customer ticket history at /portal/support with
URL-bound search, ticket status, page and bounded page-size controls. Use existing
customer-only GET /tickets/my, myTicketListQuerySchema, ticketSummarySchema and
the paginated envelope. Add no endpoint, route, backend behavior or business rule.

Allow only singular search/status/page/pageSize inputs: trimmed 200-character
search, ticket enum, positive safe integers, page 1/default size 20/maximum 100 and
safe PostgreSQL offsets. Invalid/duplicate owned fields block history reads with
recoverable feedback. Ignore unrelated parameters; never forward customerId,
serviceId, priority, assignment, user identity, redirects or mutation inputs.
Reconstruct only fixed /portal/support destinations. Customer ownership remains
session-derived. Service selection in the creation form is not a history filter.

Submitting search or changing status/page-size resets page one, retaining other
applied filters. Provide clear filters, Previous/Next and authoritative matching
count/range/page feedback; restore committed filters on reload/back/forward.
Keep existing case-insensitive search: ticket number, subject, current customer
email/company name and linked service domain. Do not claim message-body, product,
assignee, invoice or order search. Ordering remains status asc, priority desc,
updatedAt desc then id desc, not createdAt/lastReplyAt or a frozen cross-page
history. Counts are matching owned tickets, not unread messages or SLA evidence.

Use abortable cookie/no-store GETs; validate complete ticket/customer/service/
assignee/date/count facts, unique IDs, applied status and authoritative safe
pagination including expected page length. Discard superseded query/retry/unmount
reads. Distinguish loading, invalid, malformed/inconsistent response, safe failure/
GET-only retry, first-use empty, no matches and out-of-range states. Never clamp
silently, expose raw errors or turn failed reads into empty success. Retain ticket
number, subject, status, priority, linked-service/plain-text conversation facts and
usable labels/focus/controls at 375px and by keyboard.

Keep creation/service-options loading independent of the query-keyed history.
Preserve unfinished subject/body/service selection and Open ticket visibility
across history navigation/retry, including invalid/failed pages. Leave the existing
service picker's first-100 scope separate. History recovery must not resubmit a
ticket, clear a draft or reload options unnecessarily.

Make conversation reads deliberate row selection, not automatic first-row or
per-row preloads. Abort/clear selected conversation on history query/retry and
before existing create/reply dispatch; block inspection while a write is pending.
Validate detail against the clicked UUID and complete runtime conversation schema,
including message ticket IDs/count and duplicate IDs; late selection/detail reads
cannot restore an old conversation. Use safe GET-only detail recovery. Retain
plain-text/no-attachments guidance and the server-enforced closed-ticket reply gate.

Retain reply drafts by their original ticket ID in component-lifetime memory,
outside the query-keyed history, so navigation/retry does not erase or transfer
text to another ticket. Restore a draft only after explicitly selecting that same
ticket. No localStorage, cross-session persistence or general draft framework.
Preserve existing create/reply endpoints, bodies, CSRF, submission-key policy,
ownership, duplicate handling and rate limits. Capture the original target/body/key
before each deliberate dispatch; URL/selection changes must not retarget a pending
reply. A successful write clears only its submitted draft, not newer edits, and
keeps a success notice separate from subsequent read failures.

After an existing deliberate create/reply completes, reconcile the latest applied
history query by GET rather than prepending a nonmatching row, patching stale
counts or resurrecting a selected conversation. If reconciliation fails, offer
GET-only recovery and never retry the write or misreport successful submission.
Query changes, retries and detail inspection themselves perform no business write.

Add query/server-entry/component tests for >100 tickets, combined filters,
restoration/clearing, exact requests, invalid/duplicate/offset inputs, ignored
identity/service/assignment payloads, malformed rows/metadata/detail, stale reads,
safe retry and honest empty/out-of-range recovery. Prove retained creation fields,
ticket-bound reply drafts, detail invalidation, original pending targets/keys,
closed-ticket gating and latest-query reconciliation without duplicate submission.
Retain administrator support, auth, invoice/payment and service/panel regressions.

Extend existing ticket API regressions with >100 fictional owned tickets, each
supported search field, status/count isolation, exact status/priority/updatedAt/ID
ordering and out-of-range metadata. Another customer's matching tickets must not
enter rows or counts. Prove anonymous/admin access to /tickets/my fails, supplied
customer scope cannot override ownership, administrator routes and cross-customer
detail/reply stay protected. Preserve existing deliberate write behavior tests.

Add one guarded fictional customer browser journey reaching an older ticket with
search/status/pages/reload/history/keyboard/mobile and explicitly opening its
conversation without submitting. Compare complete ticket/message and existing
order/item/invoice/item/payment/event/service/operation/audit/outbox facts before
and after permitted browsing; authorization-denial audits stay outside that
baseline. Use dedicated fictional sign-in and fake providers, no raised limits,
weakened assertions/deadlines or credential-bearing traces/video/screenshots.

Read installed Next.js guidance before code edits. Run focused ticket/ledger/shared
and relevant API regressions, complete web/package tests, full fictional browser
suite, docs:check, format, lint, strict workspace/browser types and production build.
Sequence heavy checks; verify fictional loopback Prisma model schema AND raw-SQL
search_path before preparation/tests. Retain known worker/isolation risks; do not
alter worker source, dependencies, timing limits or default records to hide them.

Update docs/PROGRESS.md, commit, reconcile without published-history rewriting,
non-force push origin/main, verify exact-head CI/CodeQL and stop for phase review.
Exclude administrator ticket/payment ledgers, priority/assignment/service history
filters, ticket workflow redesign, attachments/departments/SLA/knowledgebase,
conversation-message paging, picker/setup/tool scale, new record relationships,
general list/draft/navigation frameworks, sorting/date/export/bulk, dashboard/
automation/chrome, auth/schema/dependency/worker changes, providers, cleanup,
releases, deployment and production approval. Production remains NO-GO.
```

**Authorization:** Defined by the explicitly authorized Command 90 phase review
on 2026-10-05. Definition only; implementation is not authorized. Stop after review
delivery and request separate authorization for Command 91.

---

## Command 92 — Implement bounded administrator staff roles

The owner authorized this separate development slice by saying “Okay. Implement as
you directed” after accepting the proposed smaller administrator/role/permission
structure. This does not approve remaining Command 33 operating inputs or start
the separately defined Command 91 customer ticket-history work.

Implement three fixed roles: full administrator, billing operator and support
operator. Keep administrator/customer identity separate and migrate existing
administrator profiles to full administrator. Enforce explicit grants at the API
boundary on every request, with unannotated administrator actions full-only;
preserve customer ownership and all existing financial/provider confirmations.
Keep refunds/reversals, order/hosting operations, settings, integration credentials,
reports/exports, automation and staff management full-only. Provide narrow billing
customer/invoice/manual-payment work and the existing single support queue.

Add full-administrator account invitation, access/role update and invitation resend
through existing encrypted one-time email/password flows. Require enrolled MFA for
restricted work and full-administrator staff mutations. Audit access changes and
denials, revoke sessions/challenges after access changes, consume outstanding
invitation tokens on disable, and prohibit self-disable/demotion and removal of the
last usable full administrator. Serialize concurrent staff changes and recheck the
actor after acquiring the lock. Do not create actual staff accounts or import data.

Add permission-aware navigation, server page checks, read-only billing customer
context and an accessible administrator-management page. Add role/guard/UI tests,
isolated loopback PostgreSQL/HTTP regressions including MFA enrollment, money/history
preservation and competing-owner changes. Run relevant/full unit suites, strict
types, lint, formatting, documentation checks and production builds. Apply migrations
only to newly created fictional test schemas, never existing application/live data.

Record validation and limitations, create a focused source commit, reconcile and
non-force push origin/main. Stop for a separately authorized phase review.
Exclude custom roles, department routing, a hosting-operator role, integration API
accounts, actual operator appointments, policy publication/approval, provider calls,
deployment, WHMCS import and production launch. Production remains unapproved.

**Authorization:** Explicit owner instruction on 2026-10-06. Source implementation
only; no deployment or business-policy approval.

---

## Command 93 — Restore the security and browser validation gate

**Authorized and delivered on 2026-10-06.** The owner separately authorized Command 93
after the Command 92 phase review defined the three acceptance blockers below. Source
repair `63643a3` and report head `ceb40ca` passed exact-head CI and CodeQL. The Command 93
phase review defines Command 95 for remaining development-tooling risks; it does not
authorize that implementation, currency work or production launch.

```text
Command 93 — Restore the security and browser validation gate

Read AGENTS.md, the product plan, decisions and the Command 92 phase-review report.
Preserve the three staff roles, MFA, session/CSRF/ownership checks, invitation/access
invariants, sentence-case UI, immutable financial history and provider boundaries.

Reverify the primary advisories GHSA-jqcg-44mw-7w3h and GHSA-68fv-2mgg-jv7q and the
actual production dependency graph. Apply narrowly reviewed compatible fixes for
proxy-addr 2.0.7 and source-map-js 1.2.1, using patched 2.0.8 and 1.2.2 respectively
or separately justified compatible patched versions. Prefer the existing scoped
override pattern and minimal lockfile changes. Keep frozen-install verification,
integrity/provenance, release-age and build-script policies; do not blanket-disable
them, suppress advisories, raise the audit threshold or perform unrelated upgrades.

Before any lifecycle fixture preparation, fix the test-only connection boundary so
Prisma model queries AND raw SQL target the same explicit fictional loopback scope.
Propagate that boundary to browser API/worker-runner/test clients, and fail closed
before preparation/automation if the host, model schema or current_schema/search_path
does not match. Never reset application/public schemas, existing business records or
live databases. Add focused isolation regressions. Do not change the production
database client, application workers/scheduler or business queries to hide a test issue.

Align obsolete UI state expectations in admin-service-review.spec.ts,
manual-payment-review.spec.ts and hosting-lifecycle.spec.ts with the approved
sentence-case labels. Audit later assertions in those journeys, not only their
first failure. Assert concrete display text independently of the app formatter.
Preserve raw database/provider enums, currency codes, identifiers and confirmation
tokens. Keep all payment/provisioning, replay, ownership, non-mutation and keyboard/
mobile assertions; no skipped tests, removed state checks, case-insensitive shortcuts,
raised deadlines/retries or reduced fake-provider integrity assertions.

Run focused dependency/isolation/label/staff regressions, package tests, API and
critical-invariant suites, then the complete guarded fictional lifecycle and staff
browser suites sequentially. Complete frozen-install, production dependency audit,
license inventory, docs:check, formatting, lint, strict types and production builds.
Do not claim a hosted step passed when it was skipped. If a new failure falls outside
this slice, preserve the evidence and request a new bounded authorization.

Update the report, commit only validated repair work, reconcile canonical main without
rewriting history, non-force push origin/main and verify exact-head CI and CodeQL.
Stop for phase review. Do not deploy, invite real staff, appoint operators, accept
D5–D8, publish policies, import WHMCS, enable providers or begin Command 91.
```

**Historical authorization boundary:** The Command 92 phase review defined Command 93
only; the later explicit owner instruction authorized the delivered repair. Command 33
remains partly approved and production remains unapproved.

---

## Command 94 — Design multi-currency billing and WHMCS migration rules

**Authorized design only — no functional implementation or activation.** The owner
explicitly requested BDT default, USD preferred secondary and major-currency automatic
conversion, then instructed “Design this for currency” on 2026-10-06. This expands the
earlier single-currency scope without starting Command 93 or the separate Command 91.

Inspect current money/settings/catalogue/order/invoice/payment/renewal/report contracts
and relevant source evidence. Produce a repository design covering one BDT base, browsing
preference, supported currency/unit metadata, exact arithmetic, provider-neutral rates,
fixed/derived pricing, quote ownership/expiry/idempotency, immutable invoice/refund money,
fixed service renewals, per-currency collection/balances/reports, administrator/customer
experience and protected WHMCS BDT/USD migration. Verify provider/metadata documentation
through primary sources; distinguish technical proposals from operational acceptance.

Record the explicit scope change in the plan, decisions and Command 33 policy record
without erasing historical approvals or implying D5–D8 acceptance. Preserve existing
runtime/staging settings, real provider currency guards and all business/security rules.
Do not fetch customer exports, implement an importer, create tables or accounts, purchase
or activate a provider, change WHMCS, deploy or authorize production cutover.

Validate documentation/links/formatting and consistency with inspected source. Update
progress, commit the focused design, reconcile canonical main without rewriting history
and non-force push. Stop. The exact next implementation recommendation remains
**Command 93 — Restore the security and browser validation gate**; define a bounded
currency-foundation implementation only after that repair's review and new authorization.

---

## Command 95 — Mitigate unpatched development-tooling denial-of-service risks

**Explicitly authorized by the owner on 2026-10-06; delivered and reviewed with successful source/report-head validation (`51b90fe` / `67ea491`).** The
owner-authorized Command 93 phase review confirmed clean production acceptance but two development-only
advisories. Registry metadata contains neither suggested fix, `braces` 3.0.4 nor
`sprintf-js` 1.1.4; do not install nonexistent versions or call a local mitigation an
upstream release. Command 94 remains design-only.

```text
Command 95 — Mitigate unpatched development-tooling denial-of-service risks

Read AGENTS.md, the product plan, decisions and the Command 93 phase-review report.
Recheck GHSA-vfj7-8cjw-p6xm and GHSA-hp3w-g68c-fv3c, actual lockfile consumers,
official registry releases, upstream changes and available repository alert evidence.
Keep production overrides proxy-addr 2.0.8/source-map-js 1.2.2 and all supply-chain
controls. Do not treat npm's suggested fixed floor as proof a release exists.

Prefer verified, compatible, published upstream security fixes if available at execution.
Otherwise implement only minimal, reviewable local pnpm patches for the installed
braces 3.0.3 and sprintf-js 1.0.3. Register exact-version patchedDependencies, commit
patches with upstream/license attribution and a documented removal condition. Prove
patch application from a frozen install; leave unused-patch tolerance disabled. Do not
install an unmerged Git branch, rename vulnerable packages to hide alerts, publish a
fork, edit package versions, replace a framework/test runner or make broad upgrades.

Bound the affected braces recursive walkers, including direct AST entry points and
all reachable compile/expand/stringify paths; prevent stack exhaustion without
breaking ordinary lint/glob behavior. For sprintf-js, handle invalid numeric precision
without unbounded native calls or uncaught process termination, preserving ordinary
formatting and positional/named placeholders. Review the installed 1.0.3 code, not
only a proposed 1.1.3 upstream patch. Moving the same uncaught RangeError to parse time
is not sufficient mitigation. Do not silently change application monetary arithmetic.

Add deterministic, resource-bounded subprocess regressions against actual installed
dependency entry points: deeply nested and direct AST inputs, valid boundary cases,
oversized/zero numeric precision and representative normal formats/globs. Verify
caller error handling, supported rejection behavior, no timeout/stack overflow and
compatibility with Next lint and Jest/coverage. Do not execute unbounded exploit cases
in the main process. If either mitigation cannot be safely bounded, stop with evidence
and request a separate strategy rather than widening this command.

Keep registry audit findings visible. Record full pnpm audit's exact output/exit status,
production audit and dependency graph separately; local patches may leave the original
version-based findings open. Add reproducible mitigation verification to normal local
and hosted acceptance, but do not ignore advisory IDs, lower thresholds, disable audit,
change vulnerability severities or claim full audit is clean when it is not. Retain
the existing production audit gate. Document remaining exposure, owner review needed
and removal/upgrade criteria; mitigation is not automatic residual-risk acceptance.

Run focused parser/consumer tests, complete package/API/invariant suites and both guarded
fictional browser suites sequentially. Run frozen-install checks, full and production
audits, production licenses, docs:check, formatting, lint, strict types and production
builds. Keep browser isolation, deadlines, retries, MFA/ownership and all financial and
provider assertions unchanged. No application/live schema reset or real provider use.

Update docs/PROGRESS.md and decisions with actual results and unresolved audit findings.
Commit validated in-scope work, reconcile canonical main without rewriting history,
non-force push origin/main and verify exact-head CI/CodeQL. Stop for a separately
authorized phase review to assess residual risk before defining currency implementation.
Exclude currency functionality, Command 91, staff appointments, D5–D8 approval,
WHMCS import, provider activation, releases, deployment and production approval.
```

**Authorization boundary:** The phase review defined Command 95 only; the later explicit
owner instruction authorizes this bounded implementation. If upstream
fixes remain absent, passing mitigation tests does not close GitHub/npm advisories or
authorize proceeding to currency work by inference.

---

## Command 96 — Build the exact currency arithmetic foundation

**Delivered and phase-reviewed on 2026-10-07.** See the progress report for local and
exact-head hosted acceptance; this does not approve operational currency activation.

**Defined by the owner-authorized Command 95 phase review on 2026-10-06 and explicitly
authorized for implementation on 2026-10-07.** This is an unused, pure shared-library foundation, not currency
activation or acceptance of the remaining tooling risks. BDT default/USD preferred
secondary remain the owner-directed target under ADR-080.

```text
Command 96 — Build the exact currency arithmetic foundation

Read AGENTS.md, the product plan, decisions, progress and MULTI_CURRENCY_DESIGN.md.
Recheck the two development-tooling advisories, published releases, installed mitigation
checks and production audit. Keep the existing patches, production overrides and all
supply-chain/acceptance controls. Stop for separate repair if new exposure or a failed
mandatory gate falls outside this slice; do not suppress full-audit findings.

Implement pure, strictly validated contracts and helpers in packages/shared, with no
application consumer wired to them. Preserve moneySchema/parseMoney/serializeMoney and
their existing JSON behavior. Add explicit currency-definition context containing code,
minor-unit exponent, metadata version and provenance. Code syntax does not establish
support, current status, sales permission or collection capability. Reject conflicting
definitions; never look up today's precision to reinterpret historical amounts.

Use BigInt only for monetary/rate calculations. Parse bounded positive decimal strings
losslessly into reduced positive rational rates, with an explicitly documented grammar
and limits. Never convert a financial/rate token through Number, parseFloat or ordinary
JSON numeric parsing. Bound digits, precision, exponents and intermediate work before
constructing large integers/powers. Reject unsupported forms, zero/negative denominators,
invalid rates, noncanonical minor-unit strings and final PostgreSQL BIGINT overflow.

Convert non-negative source minor units using target-major/source-major direction and
explicit source/target exponents. Implement versioned half-even rounding with integer
quotient/remainder; do not round an intermediate rate or silently clip an amount.
Same-currency identity needs no external rate but must validate compatible metadata;
conflicting unit contexts fail closed. Return JSON-safe canonical strings and calculation
evidence, not raw BigInt JSON or a new payable quote. Document that arithmetic policy
tests do not approve its use for live prices, refunds, taxes or historical valuations.

Add deterministic fictional fixtures and independent expected results for BDT/USD,
USD/JPY and USD/KWD examples, zero identity, even/odd half ties, exact/non-exact division,
ratio reduction, direction, large safe amounts, overflow and malformed/oversized inputs.
Prove quantity/line sums use stored rounded unit amounts rather than a converted header.
Test strict metadata/unknown-code handling, incompatible versions/unit contexts and
unchanged existing money contracts. No fetched market rates or customer data in fixtures.
Reverify authoritative exponent facts before using real codes in examples. Do not copy
or ship a full ISO/provider dataset without checked source/licensing rights; metadata
contracts and clearly scoped test fixtures are not a maintained production registry.

Run focused and complete package tests, API/invariant acceptance and both guarded
fictional browser suites sequentially. Run frozen install, separate full/production
audits, licenses, docs, formatting, lint, strict types and production builds. Record
full audit exit 1 separately if the same mitigated version-based findings remain.
No weakened assertions, skipped acceptance, schema reset or real provider operation.

Update progress/decisions with actual results and limitations, make a focused commit,
reconcile canonical main without rewriting history, non-force push origin/main and
verify exact-head CI/CodeQL. Stop for separately authorized phase review.

Exclude database/schema/backfills, runtime registry/settings/UI changes, catalogue
prices, quotes, API/worker integration, FX adapters/network calls, schedules, payments,
refund/renewal changes, WHMCS export/import, Command 91, D5–D8 approval, real staff,
provider accounts/activation, release, deployment and production approval.
```

**Authorization boundary:** The review defined this command only; the owner's later
explicit instruction authorized this bounded implementation. No residual-risk waiver,
currency dataset licence or operational currency policy is approved. Stop after verified
delivery for a separately authorized phase review, not another implementation command.

---

## Command 97 — Build explicit currency policy and capability contracts

**Implementation explicitly authorized by the owner on 2026-10-07.**
Delivered with complete local and exact source-head CI/CodeQL acceptance and phase-reviewed on 2026-10-07. This is an unused shared-contract
slice before persistence and application integration, not a live currency policy.

```text
Command 97 — Build explicit currency policy and capability contracts

Read AGENTS.md, the product plan, decisions, progress and MULTI_CURRENCY_DESIGN.md.
Recheck retained tooling advisories/releases, frozen install, installed mitigation tests
and separate full/production audits. Preserve patches and supply-chain controls. Stop
for separately scoped repair if a changed exposure or mandatory failure is out of scope.

Add strict, bounded runtime schemas and pure policy helpers in packages/shared behind
a separate unused currency-policy entry. Preserve existing root exports, settings/money
contracts, currency arithmetic and all application consumers. Do not install dependencies.

Represent one installation policy revision, one base/reporting currency, a default
browsing currency, optional preferred secondary and explicit per-code capabilities.
Pin selected unit definitions by code and metadata version in caller-supplied context;
no global registry, environment lookup, latest-version fallback or built-in live defaults.
BDT base/default and USD preferred secondary are the owner-directed target, exercised
only as fictional policy fixtures. Keep contracts usable by other single-business installs.

Require explicit independent display, new-sales and collection flags. Omitted/unknown
currency capabilities fail closed; do not infer permission from code syntax, current
metadata, browsing preference, a rate or provider coverage. Validate bounded arrays before
member traversal, unique per-code policy entries, known exact unit references and strict
bounded revision/identifier fields. Default/secondary browsing references must be current
and display-enabled; a secondary, when present, must differ from the default. Historical
definitions cannot enable new browsing/sales. Collection is separate from those flags:
its policy flag never establishes a tested same-currency payment route or settlement.

Keep historical unit resolution independent of display/sales/collection enablement.
Resolve only an exact code/version from supplied metadata; never hide, reinterpret,
convert or update existing money because policy is disabled or metadata is superseded.
Return copied JSON-safe policy/unit facts, not an authorization token or payable quote.

Provide pure transition validation against an explicit current policy and expected
revision. Reject stale expected revisions and a replacement revision equal to the current
one; uniqueness across persisted revision history is a later storage responsibility.
With an explicit authoritative history-exists fact, prohibit changing the base currency code after financial
history exists. That fact is a future server/database responsibility, never trusted browser
input; a pure helper cannot prove history, serialize edits, enforce roles/MFA/CSRF or
approve a base change. Default/secondary/capability changes must not mutate supplied
historical records. Runtime transitions/confirmations and storage remain later work.

Test fictional BDT/USD target policy, alternate install base, malformed/oversized input,
unknown/conflicting versions, duplicates, missing flags, independent disabled states,
invalid default/secondary, historical-unit readability, unchanged inputs, stale/equal
revisions and base lock with/without history. Include current versus historical precision
and prove rates/preferences do not enable collection. No provider data or real business
policy fixture is shipped. Do not copy/distribute a maintained currency dataset without
verified source rights; this command requires none.

Run focused and complete package tests, guarded API/invariant acceptance and both fictional
browser suites sequentially. Run frozen install, full and production audits separately,
licenses, docs/format/lint, all strict types and production builds. Record unchanged
mitigated full-audit exit 1 honestly. Preserve assertions, deadlines, retries and scope
guards; never reset an existing application schema or invoke real providers.

Update progress/decisions with actual results and limitations. After local acceptance,
commit, reconcile canonical main without rewriting history, non-force push origin/main
and verify exact-head CI/CodeQL. Stop for separately authorized phase review.

Exclude database tables/migrations/backfills, existing localization/settings writes,
API/UI/worker integration, maintained registry/metadata refresh, display formatting,
mixed-currency aggregate repairs, catalogue prices, quotes, FX adapters/network calls,
provider routes/credentials, scheduler/jobs, payment/refund/renewal behavior, WHMCS
export/import, Command 91, Command 33 approvals, releases, deployment and production.
```

**Authorization boundary:** The owner authorized Command 97 implementation only. No currency capability,
base change, provider/data licence, residual-risk waiver or operational policy is approved.
Further implementation needs the owner's explicit authorization.

---

## Command 98 — Persist immutable currency unit definitions

**Implementation explicitly authorized by the owner on 2026-10-07.**
Implementation, local acceptance and corrected delivery-head CI/CodeQL completed;
phase-reviewed on 2026-10-07. This is an unused additive metadata-storage
slice, not a live registry, persisted installation policy or financial backfill.

```text
Command 98 — Persist immutable currency unit definitions

Read AGENTS.md, the product plan, decisions, progress and MULTI_CURRENCY_DESIGN.md.
Recheck retained tooling advisories/releases, frozen install, installed mitigation tests
and separate full/production audits. Preserve patches, supply-chain controls and mandatory
acceptance. Stop for separately scoped repair if changed exposure is outside this command.

Add an unused currency-unit persistence foundation in packages/database with one forward,
additive Prisma/PostgreSQL migration. Preserve all existing tables, money/settings/root
contracts, application consumers and financial records. The migration creates an empty
unit-definition store; do not seed a live registry or infer metadata for existing money.

Persist exact code, metadata version, integer minor-unit exponent, provenance and
current/historical version facts, plus server-created UTC evidence where appropriate.
Reuse the strict shared unit/reference contracts and their existing identifier/exponent
bounds. Enforce unique code/version identities and equivalent PostgreSQL constraints,
including direct SQL bypass attempts; do not rely on TypeScript validation alone.

Keep each stored version immutable: reject ordinary UPDATE, DELETE and TRUNCATE at the
database boundary, and expose no update/delete helper. Do not use upsert to rewrite facts.
Append a different version for different facts. Current/historical is a captured version
fact, not a mutable global current pointer or proof of eligibility today. No retirement,
current-version selection or metadata-refresh workflow is implemented in this slice.
These controls are not protection against a database owner disabling them; retain the
existing privilege/governance boundary without claiming absolute immutability.

Add a separate unused database entry with explicit caller-injected Prisma client or
transaction access; no module-load database/environment/network side effects. Validate
unknown input through shared schemas. Append identical code/version/facts idempotently,
including concurrent identical replays; reject conflicting exponent/status/provenance
for the same identity without overwriting or leaving partial writes. Document transaction
requirements for conflict recovery rather than swallowing a failed PostgreSQL transaction.

Resolve only requested exact code/version identities. Bound any reference-list request
to 1–32 before member traversal and database work; reject duplicates and missing/unknown
identities with no partial success, latest-version fallback or global registry enumeration.
Return validated copied JSON-safe unit facts, not stored-object references, live support
flags, authorization tokens or payable quotes. Historical precision stays readable exactly
as captured, regardless of later version facts or future currency policy enablement.

Allow only necessary workspace-shared dependency/entry/test wiring; install no new
third-party dependency and change no unrelated lockfile resolution, patch or override.
Make database tests part of root/guarded package acceptance and hosted CI, not an optional
manual check. Reuse the nonce-qualified marked fictional schema and model/raw search-path
guards; new tests must refuse unmarked/non-loopback targets and never reset an existing
application schema. Test-only validation-launcher wiring is allowed, not app integration.

Test empty migration/store, strict malformed and oversized input, SQL constraints,
exact version reads, unknown/duplicate requests, immutable UPDATE/DELETE/TRUNCATE,
same versus conflicting concurrent replay, rollback/atomicity and unchanged historical
precision. Use authored synthetic/fictional definitions only, never provider data or a
maintained currency dataset. Compare existing fictional financial/settings rows before
and after migration/store operations; prove no new invoice/payment/service/backfill write.

Run focused database regressions and complete package, guarded API/invariant and both
fictional browser suites sequentially. Validate migration on fresh owned fictional scopes
without destructive reset, Prisma generation/schema, frozen install, separate audits,
production licences, docs/format/lint, all strict types and production builds. Record
unchanged mitigated full-audit exit 1 honestly; preserve assertions/deadlines/retries/guards.

Update progress/decisions with actual results and limitations. After local acceptance,
commit, reconcile canonical main without rewriting history, non-force push origin/main
and verify exact-head CI/CodeQL. Stop for separately authorized phase review.

Exclude installation-policy tables/writes and revision/base-history transactions,
API/UI/worker/scheduler integration, financial provenance columns/backfills, existing
localization/settings changes, maintained datasets or metadata publication/retirement,
display formatting, mixed-currency aggregates, catalogue prices, quotes, FX feeds/network
calls, provider routes/credentials, payment/refund/renewal changes, real WHMCS data,
Command 91, Command 33 approvals, releases, deployment and production migrations.
```

**Authorization boundary:** The owner authorized Command 98 implementation only. No dataset/source rights,
unit activation, sale/collection currency, persisted policy, provider route, risk waiver,
operating approval or production migration is approved. The separately authorized phase
review defines Command 99 only; its implementation still requires explicit authorization.

---

## Command 99 — Persist immutable currency policy revisions

**Defined by the owner-authorized Command 98 phase review on 2026-10-07.**
**Implementation explicitly authorized by the owner on 2026-10-07.**
Implementation, complete local acceptance and exact-head CI/CodeQL passed; the
owner-authorized phase review accepted the engineering scope on 2026-10-07.
Store complete unused revision
snapshots, not an installation's selected policy or permission to transact.

```text
Command 99 — Persist immutable currency policy revisions

Read AGENTS.md, the product plan, decisions, progress and MULTI_CURRENCY_DESIGN.md.
Recheck retained tooling advisories/releases, frozen install, installed mitigation tests
and separate full/production audits. Preserve patches, supply-chain controls and complete
acceptance. Stop for separate repair if changed exposure is outside this command.

Add the smallest empty additive Prisma/PostgreSQL policy-revision store in packages/database.
Preserve existing unit definitions, every existing table, root/money/settings/shared
contracts, application consumers and financial records. Seed no policy, live registry or
installation defaults. Never infer policy or unit provenance from existing localization.

Capture a complete Command 97 policy: globally unique explicit revision, one base unit,
default browsing unit, optional distinct secondary and 1–32 unique per-code entries with
explicit independent display/new-sales/collection booleans and exact metadata versions.
Reuse shared schemas and Command 98's exact stored-unit lookup. Validate all references
against database definitions, not caller-supplied definitions or a history-exists flag.
Retain current/display requirements for browsing and the historical display/new-sales
denial; collection flags still prove no approved route or settlement. Enforce full-string
ASCII revision/identifier bounds, including terminal-newline rejection.

Enforce equivalent shape, bounds, uniqueness, complete selected-entry bindings and exact
stored-unit context at the PostgreSQL boundary, including direct SQL bypasses. Store one
complete immutable snapshot atomically. If using related rows, forbid later INSERTs that
extend an already completed revision, not just UPDATE/DELETE/TRUNCATE. A partial parent,
missing entries or changed child facts must not commit as a usable policy. Keep database
owner bypass limitations explicit; no privilege hardening or absolute immutability claim.

Define a deterministic fact representation: compare JSON object fields independent of
property order and canonicalize entries by currency code without mutating caller data.
Document that non-selected entry order is not a preference; default/secondary are explicit.
Globally unique revision identity admits identical replay, including reordered equivalent
input, but rejects different facts for that revision without overwrite or partial writes.
Concurrent matching/conflicting appends must retain one complete immutable winner.

Expose a separate unused database entry with explicitly injected client/transaction access,
no module-load database/environment/network side effects and no new dependencies/lock changes.
Accept only strict unknown policy input. Do not create unit definitions implicitly.
Return runtime-validated copied JSON-safe policy/context facts. Resolve one requested exact
revision or fail closed; no global enumeration, latest/current fallback or active-policy read.
Older revisions remain readable with their exact unit versions regardless of later snapshots.
Document transaction/isolation and whole-transaction retry requirements; propagate compound
conflicts to roll back rather than swallowing an aborted PostgreSQL statement.

Persisting candidate/history snapshots with different bases does not change an installation
base. Do not call the pure transition helper with an invented current policy/history fact,
implement a selected/current pointer, or claim live base locking, stale-edit protection,
authorization, operational audit or confirmation. Authoritative policy selection/initialization
must be separately designed against actual financial history and concurrent legacy writers.

Extend mandatory database/root/guarded/hosted acceptance using fresh marked nonce-qualified
loopback fictional scopes and existing model/raw guards. No reused or reset application schema.
Keep Command 98's original prior-22-migration/unit-migration history comparison intact when
adding migration 24; its current last-migration/count assumptions need deliberate extension,
not assertion removal. Add prior-23-migration comparison including stored unit facts and all
fictional financial/settings rows before/after the new migration and policy operations.
Extend the schema verifier without weakening existing UUID/money/UTC/seed assertions.

Test empty migration, strict malformed/missing/extra/oversized input, 32-entry boundaries,
unknown/conflicting unit versions, duplicate codes, invalid selected references, historical
capability rules and independent flags. Test direct SQL constraints, complete-snapshot
immutability including child inserts where applicable, exact/missing revision reads, copied
results, canonical equivalent replay, conflicting concurrent replay, rollback and unchanged
old revisions/unit precision/financial rows. Use authored fictional values only, no provider
data, maintained dataset or real business policy fixtures. Preserve the secret-scanning gate.

Run focused and complete package tests, guarded API/invariants and both fictional browser
suites sequentially, without overlapping resource-heavy checks. Validate additive migration
on fresh owned fictional scopes, Prisma generation/schema, frozen install, separate audits,
production licences, docs/format/lint, all strict types and production builds. Record the
unchanged mitigated full-audit exit 1 honestly; preserve assertions/deadlines/retries/guards.

Update progress/decisions with actual results and limitations. After local acceptance,
commit, reconcile canonical main without rewriting history, non-force push origin/main
and verify exact-head CI/CodeQL. Stop for separately authorized phase review.

Exclude current/selected-policy state, installation initialization/activation, authoritative
transition/base-history/CAS services, roles/MFA/CSRF/confirmation workflows, API/UI/worker
integration, financial provenance columns/backfills, existing localization/settings writes,
maintained datasets/metadata lifecycle, display formatting, mixed-currency aggregate repairs,
catalogue prices/quotes/FX/provider routes/credentials, payment/refund/renewal changes,
WHMCS data, Command 91, Command 33 approvals, releases, deployments and production migrations.
```

**Authorization boundary:** The owner authorized Command 99 implementation only.
An immutable stored policy is captured configuration evidence,
not an active installation policy, approved sales/collection currency or production approval.
Stop after validated delivery and request a separately authorized phase review.

---

## Command 100 — Design authoritative currency policy selection and legacy-history safeguards

**Defined by the owner-authorized Command 99 phase review on 2026-10-07.**
**Design explicitly authorized by the owner on 2026-10-07.**
Source-grounded design delivered at `c15117c0974f3bbb3b5ab68812182ad6d58ed196`;
exact-head CI/CodeQL passed. The owner-authorized phase review accepted its
documentation-only engineering scope on 2026-10-07. This is not implementation,
installation initialization or currency activation.

```text
Command 100 — Design authoritative currency policy selection and legacy-history safeguards

Read AGENTS.md, the product plan, decisions, progress and MULTI_CURRENCY_DESIGN.md.
Recheck retained tooling advisories/releases, frozen install, installed mitigation tests
and separate full/production audits. Preserve patches and acceptance controls. Stop for
separate repair if changed exposure is outside this design command.

Extend MULTI_CURRENCY_DESIGN.md with one implementation-ready selection/legacy-safety
design grounded in the actual schema, transactions, guards and writers. Do not repeat
the general currency roadmap or implement the design. Cite repository paths/symbols.

Inventory money-bearing tables and all writers: product prices, order/invoice creation,
draft issuance, payments/gateway callbacks, refund/reversal transactions, service creation
and renewals, localization changes, fictional seed and future imports. Identify actual
isolation/locking, idempotency, audit, authorization and failure boundaries. Distinguish
policy evidence from selection authority, and persisted history from display preferences.

Specify the installation selection identity, absent/uninitialized state, exact immutable
revision binding, expected-revision compare-and-swap and no-current/latest fallback.
Define initialization separately from replacement. Empty-install eligibility must be
derived inside an authoritative transaction, not supplied by a browser/history boolean,
inferred from localization or reduced to paid/unpaid/outstanding invoices. Decide which
records/states permanently lock the base and how deletion/cancellation/zero balances
cannot unlock it. Address exact base-unit version/exponent compatibility as well as code;
the Command 97 helper's code-only base check is not the full database safety contract.

Choose and justify a concurrency protocol shared by selection changes and relevant
financial writers. Account for currently uncoordinated API, worker, seed, import and
direct SQL paths; locking only a new selected-policy row does not stop legacy writers.
Specify lock order, isolation, retries, stale-edit handling, rollback and audit atomicity.
Document a staged writer-adoption or explicit writer-drain/maintenance prerequisite
that fails closed until coverage is proven, without shutting down or modifying services.
State database-owner bypass limits and an executable acceptance plan for normal SQL.

Design an existing-history path that preserves amounts, currency codes, precision and
issued snapshots. Mixed BDT/USD records do not identify an installation base. Missing
metadata/policy provenance stays explicitly unresolved until separately reviewed evidence
and migration mapping exist; do not invent versions, rescale, convert, relabel or backfill.
Specify how future new records pin exact unit/policy facts and how legacy reads/collection
stay distinct from new-sale capabilities without hiding old debts. Outline integration
boundaries for per-currency aggregates and formatting; do not repair those consumers here.

Define server-side full-administrator permission, required MFA/re-authentication and
CSRF controls, explicit confirmation bound to expected/current/proposed revisions,
redacted before/after operational audit, safe errors and idempotent request semantics.
Map these requirements to existing guards/contracts and identify missing pieces; do not
add endpoints/UI, grants, credentials, confirmation tokens or new protocol values.

Provide a concrete acceptance matrix and fictional interleaving scenarios: two initializers,
two stale replacements, first financial write racing initialization/base replacement,
legacy writer bypass, cancellation/zero-balance history, same-code precision/version
changes, mixed BDT/USD history with absent provenance, missing exact revision/unit,
rollback/retry, unauthorized/MFA/CSRF failures and atomic audit. This is a test design,
not a claim that these behaviors are implemented or that new tests passed.

Deliver a reviewed writer-path map, initialization/replacement/history state table,
transaction/lock protocol, compatibility and provenance rules, security/audit contract,
acceptance matrix and one proposed smallest follow-on implementation slice. Record
unresolved owner/source evidence and activation prerequisites explicitly. Do not assign
or authorize another development command automatically.

Run all four documentation validators, repository formatting and whitespace checks,
focused unchanged shared/database tests and strict database types as appropriate.
Record source-head hosted evidence separately from fresh local checks; do not claim
SQL/API/browser reruns without executing them. Preserve full-audit exit 1 honestly.
Update progress/decisions, commit the documentation-only command, reconcile canonical
main without rewriting history, non-force push origin/main and verify exact-head CI/CodeQL.
Stop for a separately authorized phase review before implementation.

Exclude application/shared/database source changes, schemas/migrations, selection
state or activation, metadata publication/datasets, provenance writes/backfills, money
formatting/aggregates, catalogue/quotes/FX/provider routes, credentials, live data/imports,
Command 91, Command 33 approvals, releases, deployments and production mutations.
```

**Authorization boundary:** The owner authorized Command 100's design only. No
policy is selected, no operating input is approved and no currency, provider or
production workflow is enabled. The proposed read-only adoption preflight is not
assigned a command number or authorized by Command 100. The separately authorized
phase review below defines Command 101 only; implementation still needs authorization.

---

## Command 101 — Build a read-only currency adoption preflight

**Defined by the owner-authorized Command 100 phase review on 2026-10-07.**
**Implementation explicitly authorized by the owner on 2026-10-07.**
The unused entry and mandatory fictional tests passed complete local and exact-head
CI/CodeQL acceptance at `17951608eae4622bd88033e44b02bcb5bc467bbe`.
The owner-authorized phase review accepted this scope on 2026-10-07 and defines
Command 102 below, without authorizing implementation. This is an advisory inventory, not selection,
migration eligibility, a provenance audit or permission to query live data.

```text
Command 101 — Build a read-only currency adoption preflight

Read AGENTS.md, the product plan, decisions, progress and MULTI_CURRENCY_DESIGN.md.
Recheck retained tooling advisories/releases, frozen install, installed mitigation tests
and separate full/production audits. Preserve patches and acceptance controls; stop for
separate repair if changed exposure is outside this bounded command.

Add one separate unused database-package entry, with an explicitly injected transaction-
capable client and validated explicit target schema. No root export, application consumer,
CLI, environment discovery, module-load I/O, self-created connection or provider/file I/O.
Do not accept caller-owned transactions or browser history/policy/read-only authority flags.
The repository owns one bounded top-level transaction: explicit Repeatable Read, SET
TRANSACTION READ ONLY before data queries, then verify transaction modes. Scope transaction-
local settings only; leave session/pool defaults unchanged. Schema-qualify the fixed source
tables and trusted catalog/functions, safely validate/quote identifiers, and never fall
back to public/current_schema/search_path. Missing tables, permissions, mode verification
or restricted row visibility fail the observation, never produce empty/zero counts.
Use transaction-local row_security=off to reject RLS-filtered counts, not to gain privileges.

From one consistent snapshot inventory product_prices, orders, order_items, services,
invoices, invoice_items and payments. Count all persisted rows, independent of status,
amount, dates, parent/customer soft deletion or active catalogue flags. Distinguish six
financial-history tables from configuration prices. Return database-derived UTC observation
time, exact canonical nonnegative string row counts and deterministic per-code row counts.
Never read/sum money, export record/customer IDs, parse decimal amounts, infer precision,
choose a base or claim a currency code is supported. Shape-valid unknown codes stay visible;
malformed/null codes must be explicitly unresolved, not normalized or silently dropped.

Cap each table's displayed code groups at 32 with explicit truncation and exact omitted-
row count; no monetary sums. Fetch at most one extra group to detect overflow, not an
unbounded list. Counts are BigInt/string throughout, never Number; runtime-validate and
copy the JSON-safe output, reject malformed/negative/unsafe counts or inconsistent totals.
Report payment_events only as bounded aggregate evidence counts (total, linked/unlinked,
normalized-evidence presence), no payload reads/exports, currency guesses or orphan
reconciliation. Uninspected gateway/adoption evidence remains an explicit limitation.

Bound acquisition, lock, statement and total transaction time. Initial ceilings: 2 seconds
acquisition, 500 milliseconds lock, 2 seconds per statement and 10 seconds transaction;
allow only validated shorter positive limits, never zero/unlimited. Use database deadlines
as well as client transaction bounds; no retry, Promise.race-only timeout, partial success
or swallowed aborted SQL. COUNT/GROUP scans are not bounded work just because LIMIT is
small: document possible scan cost and test timeout/cancellation/release of the connection.

Always report selection authority not implemented in this code version, writer coverage
not established and adoption/evidence assessment not established. Existing money/price
rows have unknown exact legacy units/policy. A stored unit/policy or localization setting
cannot resolve that fact. Empty observation is not ready/eligible/approved: return no
activation/base/replacement authorization verdict or persistent history latch. Results may
become stale immediately and cannot substitute for later locked history/adoption checks.

Add source/mock tests for separate-entry/no-I/O/read-only SQL boundaries, strict schema
and budget parsing, exact >Number-safe counts, copied output, unknown/malformed facts,
32/33-group truncation and redacted failure propagation. Add mandatory actual PostgreSQL
tests in newly owned nonce-marked fictional loopback scopes using existing model/raw guards:
empty and mixed/zero/draft/cancelled/failed/terminated/soft-deleted/retired facts, event
evidence limits, consistent snapshot while another connection commits, database-enforced
read-only rejection, restrictive RLS/permission failures, search-path decoys, timeout/lock
failure, and unchanged financial/settings/unit/policy/audit/outbox rows after inspection.
Prove transaction-local settings do not leak to the next pooled transaction. Do not expose
production test hooks or callback execution inside the read-only repository.

Wire both test layers into existing database/root/CI acceptance without optional skips,
relaxing scope ownership or weakening prior unit/policy/history/verifier assertions. Keep
the existing 24 migrations unchanged; no schema/model change is needed. Preserve prior-
22-to-23 and prior-23-to-24 history comparisons, raw/model isolation and cleanup safeguards.
Run complete local acceptance and verify exact-head CI/CodeQL before reporting delivery.
Do not push failing or unverified implementation; record failures/blockers honestly.

Exclude schema/migrations, control/latch/selection/ledger/proof/guard installation, financial
writer adoption, provenance writes/backfills, metadata publication/registry seeds, app/UI/
HTTP/CLI integration, amounts/formatting/aggregates, catalogue/quote/FX/routes/providers,
real-data queries/imports, existing-scope cleanup, operating approvals, release/deployment.
Fictional test setup may write only within new owned guarded scopes, outside the preflight.
Update progress/decisions, focused commit, reconcile canonical main without history rewrite,
non-force push origin/main and verify exact-head CI/CodeQL. Stop for a separately authorized
phase review; do not automatically define or implement a selection migration next.
```

**Authorization boundary:** The owner authorized Command 101's unused preflight and
fictional acceptance only. No permission to inspect live/WHMCS data, activate currency
or deploy follows from its result. Stop after validated delivery for separately authorized
**Phase review — Review Command 101 read-only adoption preflight and define the next
bounded currency command**. Do not automatically authorize a selection migration.

---

## Command 102 — Build an unused currency coordination transaction primitive

**Defined by the owner-authorized Command 101 phase review on 2026-10-07.**
**Implementation explicitly authorized by the owner on 2026-10-07.** This tests the transaction/lock foundation from
Command 100 without installing selection state or changing existing writers. An advisory
lock coordinates only participating callers; it does not enforce currency policy.

```text
Command 102 — Build an unused currency coordination transaction primitive

Read AGENTS.md, the product plan, decisions, progress and MULTI_CURRENCY_DESIGN.md.
Recheck tooling advisories/releases, frozen install, installed mitigation tests and
separate production/full audits. Retain all patches and acceptance controls; stop for
separate repair if changed exposure exceeds this bounded command.

Add one separate unused database entry with an explicitly injected transaction-capable
client, strict explicit schema/shorter limits and a trusted server-code transaction body.
No root/application/HTTP/CLI consumer, connection/env discovery or module-load I/O.
The body is a technical composition boundary, never an HTTP-supplied callback, JavaScript
sandbox, financial-write permission, actor authorization or a selection/eligibility receipt.
No external/provider/file operations or automatic callback/whole-transaction retry.

Own one top-level explicit Read Committed read-write transaction; do not accept a caller-
owned transaction or caller-selected isolation/key. Verify modes before invoking the body;
wrong/read-only/Repeatable Read/Serializable modes fail closed. Apply transaction-local
safe search path and verified database deadlines as well as client acquisition/transaction
bounds. Start with Command 101's ceilings (2 seconds acquisition, 500 milliseconds lock,
2 seconds statement, 10 seconds transaction), shorter strictly positive overrides only.
Missing explicit schema/catalog context or permission/mode/deadline failure must abort.

Acquire one exclusive transaction-level advisory lock, never session-level/unlock calls.
Freeze and document one SQL-derived two-int key formula with a dedicated fixed currency
namespace and database/schema identity, usable identically by future SQL guards. Qualify
trusted catalog/functions; parameterize validated schema data. Reject system/missing
schemas; no public/current-schema/search-path fallback or client-supplied keys/namespaces.
Hash collisions may over-serialize, never permit a bypass. Do not reuse staff, scheduler,
partial-payment or invoice-number keys. Lock acquisition is a separate SQL statement;
the body runs only afterward and obtains fresh facts through subsequent statements.
No policy/history lookup in the pre-wait snapshot, cached authority or nested preflight.

Support an explicit trusted server composition choice for the existing staff mutex:
where required, take fixed staff mutex 920006 before currency coordination, without auth
row locks or arbitrary pre-lock hooks. Require the choice explicitly, not inferred from
browser claims. It authenticates nobody and cannot waive future full-administrator,
MFA/session, CSRF, locked-auth-fact, proof or audit requirements. Non-staff writers use
the currency lock alone. Preserve Command 100's remaining control/business/auth lock order;
do not change StaffService, financial services, workers, scheduler or auth consumers here.

Hold coordination until transaction commit/rollback; never return a live transaction,
release function or transferable authority token. Resolve success only after commit.
After the body, execute a final in-transaction mode/lock verification before commit;
a body that catches an aborted SQL error or changes required modes cannot falsely succeed.
Body/SQL/commit/deadline errors propagate as safe redacted failure, with no partial result,
swallowed aborted statement or retry. Document that deadlines abort database work, not
arbitrary JavaScript or external side effects. Pool defaults/settings/roles/locks must
reset after successful and failing transactions; privileges remain unchanged.

Add mandatory source/mock and actual PostgreSQL tests using only newly owned nonce-marked
fictional loopback scopes and existing model/raw guards. Verify strict inputs before work,
separate-entry/no-I/O boundaries, explicit isolation/deadlines, fixed qualified key formula,
staff-before-currency ordering, body-after-lock and safe errors. With controlled connection
barriers and real lock evidence, prove same-schema serialization, post-wait visibility of
the prior participant's commit, rollback release, independent owned-schema operation,
search-path decoy resistance and missing-schema refusal. Verify acquisition/lock/statement/
transaction failure, no body on denied acquisition, rollback of fictional body writes,
no retry, connection reuse and no leaked advisory locks/local settings. Test tampered
stronger-isolation/read-only modes fail before body and caught SQL errors/mode changes
inside the body still prevent success; no production test hooks. Demonstrate
that nonparticipating SQL is not blocked by an advisory lock, not a policy enforcement claim.

Use only fictional probe rows in newly owned scopes for coordination/rollback scenarios;
preserve every existing financial/settings/unit/policy/audit/outbox fixture outside those
explicit probe effects. Keep all 24 migrations, prior-22/23 history comparisons, preflight
read-only acceptance, isolation/ownership/cleanup and verifier assertions unchanged. Wire
both new test layers into existing mandatory database/root/CI acceptance, no optional skip.
Run complete local acceptance and verify exact-head CI/CodeQL before reporting delivery.

Exclude schemas/models/migrations, singleton/latch/selection/ledger/proof/SQL guards or
privilege installation, financial-writer adoption, auth/security implementation, provenance/
backfill, metadata seeds/publication, amounts/formatting/aggregates/prices/quotes/FX/routes,
providers/live-data queries/imports, operating approvals, existing-scope cleanup, release/
deployment. Record the helper as cooperative unused infrastructure, not installed coverage
or a solved initialization race. Update progress/decisions, focused commit, reconcile main
without history rewrite, non-force push origin/main and verify exact-head CI/CodeQL.
Stop for separately authorized phase review; do not automatically implement selection next.
```

**Implementation:** The separate unused helper and mandatory fictional tests passed complete
local acceptance and was delivered at `fdcaea6b086593260b71c198efc99f18d373f769` on
2026-10-07. Exact-head [CI 37654981028](https://github.com/ebit101/webhost-billing/actions/runs/37654981028)
passed all 28 Validate steps; [CodeQL 37654980978](https://github.com/ebit101/webhost-billing/actions/runs/37654980978)
passed all eight. PR-only Dependency review skipped on push, not passed. The owner-authorized
phase review accepted the unused engineering scope and defines Command 103 only.

**Authorization boundary:** The owner subsequently authorized only Command 102's unused
helper and fictional acceptance. Selection/adoption, financial-writer integration and
activation remain unauthorized. No policy, runtime writer, SQL guard, operating input
or live currency is enabled. After validated delivery, stop for separately authorized
**Phase review — Review Command 102 coordination primitive and define the next bounded
currency command**. Do not automatically implement selection or assign the next slice.

---

## Command 103 — Build an unused SQL currency coordination guard prototype

**Defined by the owner-authorized Command 102 phase review on 2026-10-07.**
**Subsequently authorized by the owner on 2026-10-07.** Delivered on 2026-10-08 at
`2c05dce1e5bbfe542cb1bba479b799187140c073`, with complete local acceptance,
[CI 37665607889](https://github.com/ebit101/webhost-billing/actions/runs/37665607889)
(all 28 Validate steps) and
[CodeQL 37665607804](https://github.com/ebit101/webhost-billing/actions/runs/37665607804)
(all eight steps). PR-only Dependency review skipped, not passed. The owner-authorized
phase review accepted its unused prototype scope on 2026-10-08. Prove the backstop in new
fictional test scopes before installing policy controls or adopting application writers.
This is not a deployable policy guard or permission to attach triggers to application data.

```text
Command 103 — Build an unused SQL currency coordination guard prototype

Read AGENTS.md, the product plan, decisions, progress and MULTI_CURRENCY_DESIGN.md.
Recheck tooling advisories/releases, frozen install, installed mitigation tests and
separate production/full audits. Retain patches and acceptance controls; stop for
separate repair if changed exposure exceeds this bounded command.

Add one separate unused database entry producing a fixed SQL guard prototype from a
strict explicit schema. It is a pure SQL renderer, not an executing installer: no client,
connection/env discovery, file/network/provider or module-load I/O, root/application/CLI
consumer, automatic migration hook or manual production-install instructions. Reject
unknown authority fields, system/invalid identifiers and caller-selected tables, keys,
namespaces, function bodies, privileges or exemption flags before rendering.

Generate only schema-qualified VOLATILE SECURITY INVOKER trigger-function/trigger DDL.
Use a fixed pg_catalog search path and qualified trusted objects/functions. Fixed targets
are the seven ordinary money tables (product_prices, orders, order_items, services,
invoices, invoice_items, payments), settings and payment_events. Before installing in a
test, verify all exact target identities/kinds and absence of prototype-name collisions;
reject unsupported partition/inheritance/view/foreign-table context. Do not replace
existing objects or introduce SECURITY DEFINER, global roles, owner changes or grants.
The trigger function verifies its actual schema/table/OID/BEFORE STATEMENT context;
direct calls or attachment to unrelated tables cannot become a generic lock API.

BEFORE STATEMENT INSERT/UPDATE/DELETE triggers acquire exactly Command 102's exclusive
two-int transaction key, derived in SQL from the actual guarded table schema and current
database. No session advisory lock/unlock, supplied key, GUC-authority flag, pre-lock policy
facts or staff/auth row locks. Reentrant invocation inside withCurrencyCoordination must
use the same key and preserve explicitly shorter caller deadlines. Reject TRUNCATE on
covered targets in this prototype; do not claim that statement guards validate rows.

Require verified Read Committed/read-write and strictly positive caller-established
lock/statement/transaction deadlines no greater than 500/2000/10000 milliseconds.
Caller setup must occur in earlier SQL statements before the guarded DML, not rely on
changing statement_timeout inside an already running trigger to bound that command.
Unbounded/wrong modes or identity/lock failures deny with safe sentence-case errors;
do not silently upgrade isolation, widen deadlines, swallow SQL failure or retry.
Locks last through commit/rollback; no pooled role/default/setting or session-lock leak.

This prototype coordinates statements only. It selects no policy, inspects no business
history/eligibility or amounts, sets no latch and validates no currency/provenance joins.
It cannot refresh the initiating DML statement's pre-wait snapshot or repair prior row
locks. Future adopted callers still acquire coordination before authoritative reads and
business locks; future VOLATILE validation reads must occur after lock acquisition.
Document and demonstrate these limits rather than advertise solved writer coverage.

Only the mandatory test harness may install the rendered DDL, atomically, after existing
nonce ownership/model/raw/loopback guards verify newly created fictional schemas.
Install no object in an existing test/application/production scope. Verify all nine targets
in pg_catalog, including no-row statements; exercise actual non-owner DML using an
existing non-owner PostgreSQL role with transaction-local SET ROLE, not new global roles
or changes to role memberships/other schemas. Do not rely solely on migration-owner tests.

With controlled connection barriers and real pg_locks evidence, prove helper-to-SQL and
SQL-to-helper waiting, rollback/commit release, reentrancy, independent owned schemas,
search-path/attachment decoy refusal and deadline/isolation failures. Cover plain DML,
COPY INSERT, nested writes, ON CONFLICT, MERGE and no-op statements, plus TRUNCATE refusal.
Prove non-owner writers cannot disable/replace triggers; retain owner/superuser bypass as
a residual power. Demonstrate initiating-statement snapshot versus fresh later reads and
safe failure for reversed row-first ordering without a swallowed or partial commit.

Use rollback or explicit owned fictional probes only; compare every pre-existing
financial/settings/unit/policy/audit/outbox row before/after acceptance. Marker-verify
cleanup of exactly test-installed objects before the unchanged seed/verifier. Preserve
all 24 migrations, prior-22/23 history comparisons, Command 101 read-only and Command 102
coordination acceptance, scope guards and mandatory root/CI controls. Add source/mock
and actual PostgreSQL acceptance to the mandatory database launcher, without optional skips.
Run complete local acceptance and verify exact-head CI/CodeQL before reporting delivery.

Exclude application schema/models/migrations, deployed role/privilege/trigger changes,
singleton/latch/selection/ledger/proof/row validation, writer/auth/worker adoption, legacy
provenance/backfill, metadata seeds, amounts/presentation/pricing/quotes/FX/routes,
live-data queries/import, providers, operating approval, existing-scope/cache cleanup,
release/deployment. Record this as a test-only installed prototype, unused by the product,
not ordinary-SQL policy enforcement or a safe initialization/activation boundary.
Update progress/decisions, focused commit, reconcile main without history rewrite,
non-force push origin/main and verify exact-head CI/CodeQL. Stop for separately authorized
phase review; do not automatically install the prototype or implement selection next.
```

**Authorization boundary:** The review defined Command 103 only; the owner subsequently
authorized its renderer and temporary fictional tests, not installation/adoption in the
application. This prototype verifies settings and serializes statements, not row/policy
authority, initiating snapshots or PostgreSQL's internal timer state. Establish the first
active transaction budget correctly: lowering a positive `transaction_timeout` does not
rearm an already active timer. No deployment instructions or application consumer.
After validated delivery, stop for separately authorized **Phase review — Review Command
103 SQL coordination guard prototype and define the next bounded currency command**.

---

## Command 104 — Stage unselected currency control storage

**Defined by the owner-authorized Command 103 phase review on 2026-10-08.**
**Implementation authorized by the owner on 2026-10-08.** Delivered, including the
authorized security repair, at `73e31bd7942784b8f717728b484a407a902f08f7` with complete
local acceptance, full-history secret scan and exact-head CI/CodeQL. The owner-authorized
phase review accepted this scope on 2026-10-08. This is the first additive control-storage
slice, not policy initialization, a history assessment or application enforcement.
Command 103 proved statement coordination; installing a selected policy before complete
writer/row/privilege/deadline/adoption coverage would still be unsafe.

The published storage head subsequently failed its production audit on newly reported
Next.js advisories. After the explicit repair question, the owner authorized a bounded
continuation on 2026-10-08: pin Next.js and matching lint configuration to `16.3.8`,
preserve installed mitigations and all mandatory checks, and renew complete local and
exact-head hosted acceptance. No new currency slice, activation or deployment.

```text
Command 104 — Stage unselected currency control storage

Read AGENTS.md, the product plan, decisions, progress and MULTI_CURRENCY_DESIGN.md.
Recheck tooling advisories/releases, frozen install, installed mitigation tests and
separate production/full audits. Keep patches and mandatory acceptance controls; stop
for separately authorized repair if changed exposure exceeds this bounded slice.

Add exactly one additive migration and Prisma model for schema-local currency_controls.
The migration leaves the table empty: no singleton row, candidate, unit/default seed,
history scan, trigger on existing business tables or application behavior change.
Use one fixed internal key 1, not tenant IDs. The only legal staged row has generation
0, selected policy reference NULL, history latch NULL (explicitly unknown, not false),
and all exact base-anchor reference/code/exponent fields NULL. Preserve nullable exact
foreign-key bindings to the immutable policy/unit stores where represented; no cascade
deletion or mutable snapshot copy. Generation is stored as an integer and serialized as
a canonical string. Unknown history is distinct from history-free and history-present.

Database checks must enforce the complete unassessed shape, singleton uniqueness and
nonnegative generation. SQL NULL must not pass a check accidentally: reject false/true
history, any selected revision, nonzero generation and partial/non-null base anchors.
No selected or assessed row is legal in this migration, even with an existing candidate
or a caller claiming empty history. A later separately reviewed migration/transition
protocol must deliberately open assessed/selected states; do not supply a bypass flag.

Allow insertion of the one constant unassessed shape only. Reject ordinary UPDATE,
DELETE and TRUNCATE at statement level, including empty/no-op operations. Guards apply
to this new table only, use qualified trusted objects/fixed safe paths and remain
SECURITY INVOKER; no SECURITY DEFINER, global role/membership/grant/owner changes or
executing Command 103 installer. Owner/superuser DDL bypass remains a residual power.
Insertion by a SQL writer can create uncertainty only, never selection or eligibility.

Add a separate unused currency-control database entry with strict explicit schema,
trusted staff composition and bounded limits. Expose only a bounded read and explicit
idempotent staging of that constant unassessed row. Reads never insert. Stage/read use
Command 102's owned transaction and identical key; load qualified control facts in
subsequent statements after acquisition. Verify raw/model/schema identities, ordinary
target kinds and permissions rather than trusting search_path or a supplied transaction.
No supplied generation, history, anchor, policy, actor/approval, eligibility or bypass
fields; reject unknown fields before work. No root/application/CLI/worker consumer,
client/env discovery, external I/O, module-load effects, retry or transaction handle.
Return copied bounded JSON facts only after commit; redacted failure returns no partial
result. Absent row is explicitly absent; a staged row is explicitly unassessed. Neither
means history-free, ready, initialized, safe to adopt, or a selected-policy fallback.
Missing table/permissions, restrictive RLS or malformed rows fail closed, never empty.

Do not read financial/settings/event rows to manufacture an assessment. Do not select
greatest/newest/first policy or BDT/localization as authority. Command 101 observations
and Command 97's caller-history pure helper cannot resolve the unknown latch. Staging
may coexist with legacy writers precisely because it grants no history/base authority;
later writer drain, fresh post-lock validation, permanent latch/anchor, authenticated
transition/ledger/proof and reviewed privileges are still required before selection.

Mandatory source and owned fictional PostgreSQL acceptance must prove: empty migration
and read-without-insert; strict authority refusal; singleton/direct-SQL shape/null/FK
constraints; concurrent identical stage calls retain one row and original timestamp;
same-key waiting and fresh post-wait reads with real locks/barriers; rollback/commit
failure and pool/deadline/role release; qualified decoy and raw/model scope refusal;
all mutation/truncate denial including COPY/conflict/MERGE/nested/no-row paths; actual
existing non-owner roles with local SET ROLE and no global privilege changes. A normal
insert/conflict-do-nothing may replay the constant row; conflict-do-update must deny.
Probe savepoint/PLpgSQL error recovery without claiming every SQL error irrevocably
aborts an outer raw transaction: denied control mutations still cannot change its facts.

Keep all 24 existing migration files byte-for-byte, prior-22/23 comparisons, Command
101/102/103 acceptance and guarded seed/verifier unchanged in meaning. Add a prior-24
row comparison after the new migration, including immutable unit/policy and all money,
settings, audit/outbox/event facts. Update hard-coded total migration counts to 25 only
where required; do not skip older gates. Install Command 103's prototype solely in the
new schemas its tests own; no application/test-scope adoption or existing-scope cleanup.
Wire new cases into the mandatory root/database/CI launcher, without optional skips.
Run complete local acceptance, full-history secret scan and exact-head CI/CodeQL.

Exclude assessed-history/latch activation, selection/replacement/adoption transitions,
ledger/proof/security executor, financial-table guards/row validation or provenance,
writer/auth/worker adoption, production-role hardening, legacy backfill/registry,
amounts/presentation/pricing/quotes/FX/routes, real-data query/import, providers,
operating approvals, existing-scope/cache cleanup, release/deployment. This unused
staged store is not installed currency enforcement or approval to migrate live data.
Update progress/decisions, focused commit, reconcile main without history rewrite,
non-force push origin/main and verify exact-head CI/CodeQL. Stop for separately
authorized phase review; do not automatically assess history or select a policy.
```

**Authorization boundary:** The owner subsequently authorized Command 104's inert storage
and fictional acceptance only. The migration is empty; its unused entry may explicitly
stage unknown facts, never assess history or select a policy. No application or live
target adoption is authorized. After verified delivery, the next review is **Phase review —
Review Command 104 unselected currency control storage and define the next bounded
currency command**. That review is now authorized and defines Command 105 below;
it does not authorize its execution.

---

## Command 105 — Specify assessed-state transitions and activation prerequisites

**Defined by the owner-authorized Command 104 phase review on 2026-10-08.**
**Authorized by the owner on 2026-10-08.** Completed as a source-grounded documentation-only
implementation specification in `docs/MULTI_CURRENCY_DESIGN.md` section 3d, delivered at
`64c1713` with local documentation/security acceptance, complete-history secret scan and
exact-head CI/CodeQL success. The owner-authorized phase review accepts the specification
scope and defines Command 106 below. No assessed state or proposed slice is implemented.
Command 100 established the target protocol; Commands 102–104 now expose concrete
lock, timer, SQL-recovery and unassessed-storage constraints. Translate those into
precise implementation dependencies before opening assessed/selected states. Do not
repeat the general currency design or add another disconnected authority helper.

```text
Command 105 — Specify assessed-state transitions and activation prerequisites

Read AGENTS.md, the product plan, decisions, progress and MULTI_CURRENCY_DESIGN.md.
Review delivered Commands 97–104 and current migration/schema/service/worker/auth code.
Recheck tooling exposure and required gates without upgrades, suppression or cleanup;
stop for separately authorized repair if changed exposure exceeds this design command.

Produce one implementation-ready assessed-state and enforcement specification in the
existing currency design, with source paths and tests. No runtime or migration changes.
Build on Command 100 rather than replacing its protocol. Distinguish proposed contracts,
observed code and executed evidence. Never label a proposed prerequisite as installed.

Specify the exact legal tuples and transition matrix for absent, unassessed, assessed
unselected, selected history-free and selected history-present states. Resolve whether
an assessed-unselected state needs to be persisted or can exist only inside one trusted
transaction. Define all NULL/anchor/reference/generation invariants, exact unit/exponent
bindings, irreversible history/base protection, generation exhaustion and no A-to-B-to-A
stale revision reuse. Separate staging, assessment, initialization, replacement, first
committed history and reviewed legacy adoption. Absence/NULL, Command 101 counts and
Command 97 caller-history facts can never grant assessment or activation authority.

Specify the smallest additive migration sequence that can eventually relax Command
104's zero/null shape without a writer-visible unguarded interval. State which checks,
guards and exact foreign keys change or remain, how existing unassessed rows survive,
and how installation failure/restore/recovery stays fail-closed. Do not edit any of the
25 migrations, install prototypes, assess history or write selected fixtures to an
existing scope. Selection must remain unavailable until all prerequisites are proven.

Map actual database owners, runtime writers and migration/proof/transition/latch duties
to proposed least-privilege boundaries. Current owner credentials and predefined-role
test probes are not a hardened production role. Specify direct DML/EXECUTE denials,
fixed qualified paths, narrow trigger targets and the security-definer trust boundary
where required. A supplied actor, GUC, timestamp, callback or reusable step-up timestamp
is not authorization. Define actual non-owner acceptance, safe test-only role/object
ownership and cleanup; any later global privilege installation needs separate approval.

Specify actor/session/action/body-bound one-use proof, exact expected revision/generation,
canonical request fingerprint, matching replay/conflicting replay and superseded-revision
tracking. Locate current staff/session/MFA/audit code and identify required extensions.
Proof consumption, CAS, immutable transition ledger and activity audit must commit
atomically; no arbitrary ledger append can masquerade as successful selection. Replay
returns the original receipt only after current authorization; it does not report old
selection as current. Audit/proof/commit failure returns no success and no automatic retry.

Refresh the Command 100 writer map against current code: all seven money tables,
product prices, relevant settings/numbering, worker/status writes, callbacks, scripts
and imports. Specify guard-first application changes plus normal-SQL row/state/unit/join
and lineage validation, allowed genuine draft-line replacement, successful-row history
latching and blocking gateway/adoption obligations. No-op/failed/conflict-nothing writes
must not fabricate history. Preserve original money and keep hidden/disabled currencies
readable historically. Do not assume statement coordination is row validation.

Make the lock/deadline/drain protocol concrete: staff mutex before currency, control
before business/auth locks in the reviewed order, fresh subsequent Read Committed reads,
no row-first or initiating-snapshot authority, correctly established initial transaction
timer plus independent bounded client control. Account for savepoint/outer-handler
recovery: denied mutations remain denied, but earlier raw work may commit. Define how
the adopted workflow prevents partial transition/audit/proof outcomes rather than
claiming every SQL error irrevocably aborts the outer transaction.

Produce a dependency-ordered, bounded implementation sequence with file targets,
acceptance and stop conditions for each slice. Identify one smallest next implementation
candidate, not a bundle of automatic authorizations or a promised go-live date. Include
fictional empty/mixed-history/prior-25 preservation, real concurrent first-history versus
replacement, direct SQL/COPY/conflict/MERGE/no-op, restrictive RLS/privileges/decoys,
proof replay/revocation, audit/COMMIT failure, deadlock/deadline/pool release, and guarded
maintenance/writer-drain/adoption/recovery tests. Test-only assessed fixtures must not
silently relax the product migration or normal database launcher. Keep prior acceptance.

List activation gates separately from engineering delivery: writer coverage and deployed
versions, non-owner roles, owner-approved maintenance/drain/recovery, exact metadata and
legacy provenance, protected WHMCS/credit evidence, operating inputs and final launch.
No production credentials/data queries/imports, providers, approvals, deployment or release.

Update progress/decisions/product plan and offline documentation; run validation
proportional to documentation-only changes, frozen install and security mitigation/
production/full audit checks. Full audit's retained advisories are risks, not a passed
audit or waiver. Focused commit, cached pinned full-history secret scan, reconcile main
without history rewrite, non-force push origin/main and exact-head CI/CodeQL. Stop for
separately authorized phase review; do not implement the proposed next slice.
```

**Authorization boundary:** The owner subsequently authorized Command 105's specification
only. Opening selected states now would contradict Command 104's protection and unadopted
writer boundary.
Command 105 executes no migration, SQL installer, role/grant, transition/proof/ledger,
history scan, application change, live query/import/provider, cleanup, release or deploy.
After its validated delivery, stop for **Phase review — Review
Command 105 assessed-state specification and define the next bounded currency command**.

---

## Command 106 — Build an isolated currency privilege acceptance harness

**Defined by the owner-authorized Command 105 phase review on 2026-10-08.**
**Subsequently authorized by the owner on 2026-10-08; implementation and local acceptance completed.** This is P1 of section 3d, a mandatory
test-only foundation for later privileged prototypes, not currency selection or a
production role installer. Stop afterward for the separately authorized Command 106 phase review.

**Delivered at `fb86cca`; the owner-authorized phase review on 2026-10-09 accepts P1
engineering scope.** Corrected exact-head CI passed all 29 Validate steps and CodeQL
all eight. Fresh development-security findings require Command 107 below before P2.

```text
Command 106 — Build an isolated currency privilege acceptance harness

Read AGENTS.md, the product plan, decisions, progress and MULTI_CURRENCY_DESIGN.md
section 3d and its Command 105 review. Recheck installed tooling/security exposure;
retain all patches/gates. If a new required security repair exceeds this command,
stop for authorization; do not upgrade, waive or suppress vulnerabilities implicitly.

Build a reusable test-only disposable PostgreSQL harness and mandatory acceptance
under packages/database/test/currency-privilege-harness.* and associated specs/runner.
Use installed pg/tsx/Node tools; no new dependency, package installation workaround
or runtime/root database export. Wire package test:unit and a mandatory isolated
privilege test through packages/database/package.json so ordinary pnpm test includes
it. Retain apps/web/e2e/run-database-tests.ts and every existing database/source/
seed/history gate. Existing CI Run package tests must execute it without an opt-out,
continue-on-error or missing-Docker skip. A workflow edit is allowed only if necessary
for this mandatory wiring, not to relax tests, audits or timeouts.

Inspect the local Docker endpoint and the cached approved postgres:18.6-bookworm
image before creation. Reject remote/unverified endpoints, unexpected image identity/
version/architecture or missing cache. Record the verified repository digest and
create using its immutable cached image ID with --pull=never. CI may use the image
already prepared by its unchanged infrastructure step; the harness must not pull.
The review observed cached digest
postgres@sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650
on linux/amd64. A different approved architecture/digest needs explicit reviewed
evidence, not silently trusting a same-name tag. Missing resources are a blocker,
never a reason to reuse Compose, demo, rehearsal or production containers/databases.

Create exactly one nonce-named, labelled throwaway container per run, fresh private
database/schema and out-of-product ownership marker. No application DATABASE_URL,
.env loading, inherited database credentials, shared networks, host bind mounts,
Docker socket mount, privileged mode or existing data volumes. Bind an automatically
allocated PostgreSQL port only to 127.0.0.1; validate inspected mappings and derive
all connection targets from the newly returned full container ID plus fresh marker.
Use bounded tmpfs over the image's actual PostgreSQL data-volume target, no persistent
or anonymous data volumes. Verify mounts/labels/image/nonce and database/server identity
before migrations or role DDL. Stop on unexpected mounts, foreign marker or endpoint.

Use one CPU, at most 512 MiB container memory, 64 MiB shared memory, 256 MiB data
tmpfs and 128 PIDs; bounded connections/logs and no restart policy. Check available
daemon/host resources before creating it and run sequentially. Bound readiness,
SQL connection/acquisition/statement/lock/transaction and child processes, plus a
ten-minute whole-run watchdog and separately bounded cleanup. Shorter limits are
allowed; do not silently raise ceilings or treat a timeout as a passing assertion.
Do not claim SQL timeouts sandbox arbitrary JavaScript or privileged Docker users.

Apply all 25 product migrations byte-for-byte in their existing order, without a
26th migration, guard relaxation or modified seed/verifier. Verify the actual
migration/constraint/trigger/function manifest, all product rows and empty unit,
policy and control stores. An explicit migration-operator insert may stage only the
existing key-1 zero/null uncertainty; snapshot it and prove it remains unchanged.
Never create selected/assessed product fixtures, money history, actual proofs,
selection receipts, legacy sidecars or a human-approval simulation in this command.

Only after verified fresh-cluster ownership create nonce-scoped fictional LOGIN
business/issuer/executor principals and minimal NOLOGIN object/function owners.
Bootstrap migration credentials stay in the harness only. Authenticate separate
pg connections with independently generated ephemeral SCRAM credentials; assert
session_user/current_user, role attributes, owners and exact grants/memberships.
Owner-side SET ROLE or predefined pg_read_all_data/pg_write_all_data probes are not
the new login evidence. No runtime principal may be superuser, CREATEROLE, CREATEDB,
replication/BYPASSRLS, owner, or inherit/SET ROLE to a privileged owner/other duty.

Use clearly labelled fictional probe objects in a separate nonce-owned schema to
test private-table DML/read and exact-signature EXECUTE separation, minimal qualified
SECURITY DEFINER ownership/search_path and PUBLIC/default ACL refusal. Include a
positive authorized probe so denial is not merely bad authentication. Probe functions
return fictional facts only; no transition, proof issuer, generic latch/ledger setter,
currency CAS or selected-state SQL. Each denied query must assert its expected SQLSTATE
and unchanged facts/manifest, not accept any connection or syntax failure as denial.

Actual non-owner login tests must deny protected product control INSERT/UPDATE/DELETE/
TRUNCATE (including no-row statements), unit/policy mutation, private probe access,
cross-duty EXECUTE, SET ROLE/escalation, guard disable/drop/replace/reattachment and
session_replication_role=replica. Distinguish ACL denial from existing trigger denial;
do not mislabel the former as row-policy enforcement. A deliberately untrusted
temporary-object attack principal may have TEMP only in this disposable cluster:
prove temporary/table/function-overload decoys cannot redirect qualified probe reads
or grant owner execution. Verify restrictive RLS/visibility refusal where applicable;
do not advertise row_security=off as a bypass. Product guards remain unchanged.

Add source/unit tests with injected process/inspect boundaries for missing Docker/cache,
foreign endpoint/image/port/mount/marker, inherited-secret rejection, startup/migration/
test failure, deadlines, interruption and cleanup refusal. Actual SQL tests must execute
the real login matrix and record product snapshots before/after; no mocked privilege
success or optional skip. Close all pools/processes before cleanup. Verify exact full
container ID, nonce labels/image/mount ownership again and remove only the newly owned
container/tmpfs. Never prune Docker, delete shared volumes, match broad name prefixes,
clean old scopes/caches or automatically adopt a leftover failed run. Cleanup failure
fails the gate and reports only redacted exact ownership identifiers for owner review.

Never print/persist bearer credentials, password SQL, connection URLs, env dumps or
raw container/database error causes. Keep credentials in memory/child environment
only with bounded captured/redacted output; no command string interpolation or secret
arguments/log inheritance. Include sentinel-secret non-disclosure tests across failure
paths. A harness success establishes fictional privilege mechanics only, not production
role installation, human authorization, complete writer enforcement or activation.

Run frozen install, ten tooling mitigation tests, production and full audits, complete
database source/SQL/harness/seed/history acceptance, strict types, root/API/invariant/
browser/lint/build/documentation gates proportional to executable test wiring. Preserve
all 25 migration hashes and prior-22/23/24 history comparisons; no failing/optional gates.
Retained development advisories are not a passed full audit or waiver. Update report/
decisions/design/product plan, focused commit, cached pinned full-history secret scan,
reconcile main without history rewrite, non-force push and exact-head CI/CodeQL.

Stop for Phase review — Review Command 106 isolated privilege acceptance harness and
define the next bounded currency command. No product schema/runtime/export change,
control opening, proof/ledger/transition/row-latch implementation, writer adoption,
shared-cluster roles/grants, live queries/import/provider, approval, release/deploy
or unrelated container/volume/scope/cache cleanup. Do not start P2 automatically.
```

---

## Command 107 — Repair newly disclosed Handlebars tooling advisories

**Delivered and accepted by the owner-authorized phase review on 2026-10-09.**
Commit `ecfdd16005d294e4fd0dbefabfce7b11baa872a5` passed renewed local acceptance,
normal main delivery, CI 37901445001 (all 29 Validate steps) and CodeQL 37901445054
(all eight steps), freshly reverified at that exact head. PR-only dependency review
skipped, not passed. No blocking in-scope defect found; see `docs/PROGRESS.md`.
Security prerequisite only; no currency slice P2.

```text
Command 107 — Repair newly disclosed Handlebars tooling advisories

Read AGENTS.md, the product plan, decisions, progress and currency design's Command
106 review. Reconcile fb86cca's delivered evidence and recheck current production/full
audits, actual installed paths and maintainer advisories before editing. The review
found Handlebars 4.7.9 through ts-jest 29.4.12 in API, worker and queue, with
GHSA-8r5x-fm3f-whwj (critical), GHSA-p8wg-vrv2-v86f (critical) and
GHSA-xw65-4hp5-5hc7 (moderate). Maintainer release and registry verified 4.7.10 as
the published patched target. If another required repair exceeds this bounded
scope, stop for authorization; do not broaden upgrades or suppress findings.

Resolve every installed affected Handlebars instance to exactly 4.7.10 using the
smallest reviewed pnpm-workspace.yaml override/resolution and regenerated lockfile.
No ts-jest/Jest/Nest/Next/Node/pnpm major upgrade, new direct runtime dependency,
minimum-release-age/install-script workaround or unrelated override. Confirm real
consumer resolution in all three packages; a direct mock or guessed store path is
not proof. Verify patch provenance and registry integrity; a changed target requires
explicit review/authorization, not silently using latest.

Keep braces@3.0.3 and sprintf-js@1.0.3 registered patches/hashes, all ten installed
mitigation checks and every container patch-copy/install gate intact. Their audit
alerts remain unresolved, not waived. Do not remove them because metadata advertises
unpublished patched versions; fresh registry checks and separate authority would
be required. No broad allowlist, audit ignore, severity reduction or continue-on-error.

Add mandatory installed-consumer tests under scripts/security and the existing
test:tooling-security path. Verify each actual ts-jest consumer uses the exact patched
package. Test the three repaired boundaries with harmless canaries: invalid/malicious
AST values must not compile/render attacker JavaScript; dangerous own/prototype
constructor access must not grant code execution; inline precompiled output must
neutralize script/comment boundary sequences. Use precise safe expected outcomes,
not any crash/error, plus positive compile/render/precompile compatibility checks
and the existing Jest/coverage consumers. Follow maintainer fixes, not guessed defenses.
Run adversarial probes only in sanitized bounded child processes, with no credentials,
network, filesystem mutation, subprocess payload or raw exploit output. Retain
existing memory/stack/deadline/output ceilings and safe capture; never increase budgets
or relax assertions merely to pass. Tests must cover installed code, not fixture-only
success or source-text version checks. Keep all old checks mandatory in root/CI.

Run frozen install, renewed installed mitigation/security regressions, production/full
audits and production license inventory. All three Handlebars advisories must be absent
after the fix, and no new unresolved security finding may be hidden. The retained
braces/sprintf-js findings are still a failed full audit, not a clean audit or waiver.
Keep local resource/sequencing constraints explicit; do not claim a default-parallel
pass from a serial local run. Run complete root/shared/database source/actual-login/
retained SQL/seed/history, API integration, critical invariant, worker, browser lifecycle
and staff browser gates, strict workspace/browser types, lint, build, formatting,
offline docs and whitespace. Exact-head hosted ordinary pnpm test remains required.
Preserve the 25 migration hashes, prior-22/23/24 comparisons, pinned CI image preparation
and Command 106 ownership/secret/cleanup/deadline rules; no missing-Docker/cache skip.

Update report/security decisions/design/product plan, make a focused commit, run the
cached pinned full-history secret scan, reconcile canonical main without rewriting
history, non-force push and verify exact-head CI/CodeQL. Do not push failing or
unverified repairs. Report any remaining audit/compatibility/CI constraints honestly.

Stop for Phase review — Review Command 107 Handlebars tooling repair and define the
next bounded currency command. P2 remains only a later candidate. No currency contracts,
proof/ledger/evidence storage, selected/assessed state, control relaxation, writer/role
adoption, schema/migration change, live query/import/provider, operating approval,
deployment/release or unrelated Docker/volume/scope/cache cleanup in this command.
```

---

## Command 108 — Build unused currency selection request contracts

**Authorized by the owner on 2026-10-09; delivered at `a1fcbb6` and accepted by the
owner-authorized phase review.** Complete local and exact-head CI/CodeQL acceptance
passed; the two retained development advisories remain unwaived.
P2a request parsing only, not P2 authority storage. The separate unused shared entry
and strict decoder/tests are implemented; acceptance evidence and delivery are
recorded in `docs/PROGRESS.md`. No currency selection or application integration.

```text
Command 108 — Build unused currency selection request contracts

Read AGENTS.md, the product plan, decisions, progress and currency design's Command
107 review. Reconcile ecfdd16's exact delivered acceptance and rerun security audits
before implementation. A new required security repair outside this scope needs
separate authorization. Keep the patched Handlebars resolution, both existing local
patches, all 15 installed tooling checks and every mandatory package/CI gate intact.
The two retained development audit findings are not a clean full audit or a waiver.

Implement only the strict confirmation-request part of Command 105's P2 dependency.
Use a new separate unused shared entry, dedicated tests and the minimal explicit
package subpath needed to test/build it. Do not export it from the shared root or
import it into an application, database helper, worker, browser or fixture launcher.
There is no HTTP endpoint, UI, proof issuance or currency selection in this command.

Define exactly six required fields: action (initialize/replace/adopt), proposedRevision,
expectedRevision (explicit null or exact revision), expectedGeneration, requestKey
and proofToken. Reuse the existing policy revision grammar/64-character ceiling and
reviewed UUID grammar; preserve case-sensitive identifiers without silent normalization.
Generation is a canonical decimal string from 0 through 9223372036854775807; validate
length/grammar before bounded BigInt comparison, never coerce Number or use floating
point. Proof token is an opaque 43-character base64url string, a shape check only.
Initialize/adopt require null expected revision and generation 0. Replace requires
an explicit expected revision and positive generation, and a different proposed
revision. A syntactically valid maximum generation is not permission to increment it.

Provide a bounded JSON-text decoder with a 4 KiB UTF-8 ceiling checked before JSON
parsing, then strict flat runtime validation. Reject missing/unknown/nested fields,
caller-supplied actor/session/schema/history/anchor/evidence/approval/definitions,
invalid actions, noncanonical numbers, oversize identifiers, invalid keys/tokens,
malformed JSON and non-object input. Do not accept an arbitrary caller object graph,
silently trim/default/coerce, return a partial result or echo input in diagnostics.
Expose copied validated request facts and fixed redacted failure outcomes. Failures
must not echo raw Zod issues/errors or bearer values; no result contains transaction
handles, receipts or approval flags. Accepted requests contain the bearer and must
never be logged; success means syntactic decoding only, not proof validity or
authorization. No token minting,
hashing, token persistence, clock/network/environment access or external operation.

Test every valid action and exact boundary, 4 KiB bytes rather than UTF-16 characters,
malformed/authority/extra inputs, revision grammar/case, UUIDs, token shape, canonical
generation and max/max+1 without Number rounding, contradictory action/state pairs,
required explicit null, copied output and redaction. Use fictional tokens only.
Assert separate-entry/root/application isolation and keep all prior acceptance.
Do not implement stable-intent/assessment digests here: their server-owned installation,
identity/evidence serialization and binding remain a later separately reviewed slice.

Run frozen install, all shared tests/build/types, database source/preservation and
existing complete root/database actual-login/retained SQL/seed, API integration,
critical invariants, worker, browser lifecycle and staff browser gates, strict workspace
and browser types, lint, production build/license/audits, tooling security, formatting,
offline docs and whitespace. Keep all 25 original migration hashes and prior-22/23/24
comparisons unchanged. Resource refusal is a failed run, not a skip: preserve all
budgets and distinguish serial local acceptance from exact-head hosted ordinary tests.
Update the five tracking documents with actual results, focused commit, pinned cached
full-history secret scan, canonical non-force main delivery and exact-head CI/CodeQL.

Stop for Phase review — Review Command 108 unused currency selection request contracts
and define the next bounded currency command. No database migration/model, proof/ledger/
evidence store, immutable-binding/issuer/executor/digest implementation, policy choice,
assessed/selected state, control relaxation, role adoption, writer/lineage change,
history query, live import/provider, operating approval, release/deploy or unrelated
Docker/volume/scope/cache cleanup. P2 storage and P3–P9 need separate commands and approval.
```

---

## Command 109 — Specify canonical currency authority bindings

**Defined by the owner-authorized Command 108 phase review on 2026-10-09;
not authorized or implemented.** Documentation-only prerequisite for P2 authority
records. Command 105 defines the protocol; this command resolves its concrete identity,
serialization and reference-lifecycle gaps before a digest implementation or migration.

```text
Command 109 — Specify canonical currency authority bindings

Read AGENTS.md, the product plan, decisions, progress and currency design section 3d
and the Command 108 review. Reconcile a1fcbb6's delivered acceptance; rerun frozen
install, installed tooling-security checks and production/full audits. A new security
repair outside this documentation scope requires separate authorization. Keep all
15 tooling tests, registered patches/pins, request contracts and mandatory gates intact.
The retained braces/sprintf-js findings are a failed full audit, not a waiver.

Produce one source-grounded implementation-ready binding specification in the existing
currency design. Do not repeat the overall currency design or implement a serializer,
hash helper, identity service, proof/store, endpoint or migration. Resolve the concrete
formats and lifecycle dependencies needed by Command 105's inert P2 records.

Specify the authoritative installation identity and its acquisition/trust boundary,
including database/schema placement, restore, clone, relocation and wrong-installation
replay. Current schema/database lock identity, settings or an arbitrary supplied UUID
are not a persistent installation identity. If additive identity/epoch storage is
needed, specify its minimal future keys, ownership, immutability and initialization
boundary only; no automatic seed, generated identity or live target lookup here.

Map User, AdminProfile, AuthSession, AdminTotpCredential, AdminRecoveryCode and ActivityLog
to exact server-owned actor/session/credential evidence. Existing lastSeenAt/updatedAt,
password/factor consumption and recovery regeneration are not a dedicated authorization
epoch. Specify exact non-secret identity/version binding and invalidation for password
reset, logout, demotion/status change, MFA disable/re-enrollment and recovery regeneration.
Distinguish mutable live authorization from immutable historical evidence. Preserve normal
revocation, credential/recovery deletion and fictional fixture cleanup; never retain raw
password hashes, encrypted factor secrets, session/bearer tokens or recovery values as
currency evidence, nor freeze those secrets with restrictive proof foreign keys.

Specify exact ordered UTF-8 JSON tuples for currency-selection-request-v1 stable intent
and currency-selection-assessment-v1 assessment, SHA-256/64-lowercase-hex outputs and
domain separation. Stable intent excludes bearer and mutable current state, retaining
original request/installation/actor/session identity for completed replay. Assessment
binds stable intent to the complete observed control discriminator/tuple, canonical
immutable proposed and applicable prior policy/unit facts, credential evidence and
immutable compatibility/adoption evidence references. No current/latest lookup, inferred
null, caller approval flag or Command 101 count can complete missing authoritative facts.

Give exact tuple positions, types, optional-to-null rules, string integer ranges, field/
entry/count/UTF-8 byte ceilings and pre-traversal rejection rules. Resolve absent versus
unassessed and all selected tuples, unchanged-generation first-history invalidation,
case-sensitive revisions/metadata, UUID text versus PostgreSQL UUID identity, independent
ASCII ordering for capabilities/units/evidence, duplicates and explicit evidence-kind/
version/digest identity. Do not rely on JSON object insertion order, localeCompare,
floating-point financial/generation arithmetic, arbitrary object traversal or raw error
details. Describe which source fields are excluded and why (bearers, incidental activity
timestamps, mutable session heartbeat and factor-consumption counters in particular).

Specify the minimal future immutable binding/reference layout for proof, ledger and
protected evidence: exact restricted actor/session/policy/unit references where valid,
non-secret historical credential/recovery evidence where live rows are deleted, unique
request/generation/selected-revision constraints, consumption-to-ledger link and audit
identity. Resolve insertion/foreign-key cycles and expiry/revocation/retention without
cascading away financial authority history or preventing ordinary auth operations.
Digest equality alone grants neither human authorization nor successful selection.
Do not relax Command 104's zero/null controls or permit arbitrary ledger success appends.

Provide concrete fictional tuple/byte/hash vectors and an acceptance matrix for reordered
facts, null/state differences, UUID aliases, exact large generations, changed policy/unit/
evidence/credential bindings, oversized/malformed inputs and cross-installation denial.
Explain completed matching replay after later selection/first history/proof expiry versus
new-operation freshness checks, current authorization denial and conflicting-key replay.
Label vectors/specification and proposed tests distinctly from executed validation; any
independent vector calculation must be secret-free and must not add product/runtime code.

Name one smallest next implementation candidate with exact files, storage/role dependencies,
required source/isolated-login/SQL/preservation acceptance and stop conditions. It must
advance inert P2 records, not open assessed states or bundle P3–P9. Do not assign another
command number or authorize that candidate automatically. Keep authentication/writer/
lineage/drain/consumer/recovery and business/provider/launch prerequisites explicit.

Update the five trackers. Run fresh shared tests/build/types, database source tests,
installed tooling checks, frozen install, renewed audits, full formatting, all four
offline documentation validators and whitespace. Verify byte-for-byte baseline equality
for runtime/schema/migrations/dependencies/workflows; do not rerun live/history queries
or claim prior full SQL/API/browser suites as fresh local execution. Focused commit,
cached pinned full-history secret scan, fetch/fast-forward-only reconciliation, non-force
main push and exact-head hosted CI/CodeQL remain required for documentation delivery.

Stop for Phase review — Review Command 109 canonical currency authority binding
specification and define the next bounded currency command. No implementation, schema/
migration/role/PostgreSQL container creation, authority seeding, proof issuance/selection, application
consumer, live query/import/provider, operating approval, release/deploy or unrelated
Docker/volume/scope/cache cleanup. The required cached, network-disabled secret-scanner
container is delivery tooling, not permission to create a database or privilege fixture.
Request syntax is not authority or production readiness.
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

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

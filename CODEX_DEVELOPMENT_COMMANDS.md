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

**Authorization:** Defined by the Command 84 phase review on 2026-10-04. Not
authorized or implemented. The user's "continue" authorizes that review and this
next-command definition only; explicit Command 85 authorization is required.

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

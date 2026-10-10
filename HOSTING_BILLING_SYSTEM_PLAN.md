# Webhost Billing

## Product Requirements and Architecture Plan

**Document status:** Initial planning draft  
**Target use:** A single web-hosting business per installation
**Product approach:** Simple, secure, and focused on essential daily operations

**Technical identifier:** `webhost-billing`

---

## 1. Executive Summary

This project is a lightweight, open-source web-hosting billing and service-management system inspired by the useful core of WHMCS. Each installation is intended for one hosting business; public source distribution does not expand the product into a multi-tenant, worldwide, general-purpose hosting platform.

The system will help the business owner:

- Manage customers and hosting packages
- Receive and approve orders
- Generate invoices and record payments
- Provision and manage hosting accounts
- Automate renewals, reminders, suspension, and reactivation
- Provide customers with a simple self-service portal
- Handle basic support tickets

The system should remain a modular monolith: one application and one database, with small adapters for external services such as a hosting control panel and payment gateway.

## 2. Product Goals

### Primary goals

1. Reduce manual work for recurring hosting renewals.
2. Keep customer, service, invoice, and payment data in one place.
3. Safely automate common hosting-account actions.
4. Give customers a clear portal for services, invoices, and support.
5. Keep the software small enough for one person to maintain.

### Non-goals for the first release

- Competing with WHMCS as a commercial product
- Supporting every country, currency, tax system, or payment gateway
- Building a public plugin marketplace
- Supporting multiple hosting-control panels immediately
- Creating native mobile applications
- Adding complex marketing, affiliate, or reseller systems

### Owner-authorized currency expansion — 2026-10-06

The owner explicitly expanded the earlier single-currency scope: BDT is the default,
USD is the preferred secondary currency, and major currencies should be supported
through automatic conversion. The design uses one BDT base/reporting currency, an
independent browsing preference, and immutable invoice/service/payment currencies.
This is a bounded exception to the currency non-goal above, not worldwide tax,
gateway parity, reseller accounting or production approval.

[Multi-currency billing design](docs/MULTI_CURRENCY_DESIGN.md) defines exact arithmetic,
currency capabilities, price/quote provenance, fixed renewals, provider failure behavior,
per-currency reporting and preservation of WHMCS BDT/USD history. Command 94 is design
only. Existing single-currency contracts remain unchanged until separately authorized
implementation. Commands 93 and 95 repaired and validated the acceptance gate; the
Command 95 phase review defined Command 96's pure arithmetic foundation, subsequently
authorized, delivered and phase-reviewed on 2026-10-07. Its unused helpers do not change
application billing behavior. Command 97's unused explicit currency-policy/capability
contracts were separately authorized, delivered and validated locally and at the exact
source head and phase-reviewed on 2026-10-07. The review defines Command 98's unused,
additive immutable unit-definition storage, subsequently authorized, delivered with complete
local and exact-head hosted acceptance, and phase-reviewed on 2026-10-07. The review defines
Command 99's unused immutable policy-revision snapshots only; the owner subsequently authorized
implementation on 2026-10-07. Complete local acceptance and exact-head CI/CodeQL passed;
the owner-authorized phase review accepted its engineering scope. That review defines
Command 100's source-grounded design of authoritative policy selection and legacy-history
safeguards, separately authorized and completed on 2026-10-07. It specifies coordinated
writer/SQL protection, permanent base history, explicit legacy adoption, exact-unit
compatibility and full-administrator confirmation/audit. Its exact-head CI/CodeQL passed;
the owner-authorized phase review accepted the design and defines Command 101's unused
read-only adoption preflight only. Its protocol is not implemented. The next slice requires
one bounded database-enforced read-only snapshot, exact counts and explicit unknowns;
it cannot authorize migration/activation or live-data access. The owner subsequently
authorized Command 101 on 2026-10-07. Its unused count-only entry and fictional SQL tests
passed complete local and exact-head CI/CodeQL acceptance at `1795160`. The owner-
authorized phase review accepted its scope on 2026-10-07 and defines Command 102's
unused coordination transaction primitive only. That next slice must prove cooperative
Read Committed locking, fresh post-wait reads, staff-before-currency composition and
bounded failure/release in fictional tests. The owner subsequently authorized that unused
helper and fictional acceptance on 2026-10-07. It owns a verified bounded Read Committed
transaction with a fixed SQL-derived schema/database advisory key and explicit staff-first
composition; the trusted body returns no authority/transaction handle. Selection, writer
coverage and ordinary-SQL enforcement are not installed by cooperative coordination.
Command 102 was delivered at `fdcaea6` with complete local and exact-head CI/CodeQL
acceptance. Its owner-authorized phase review accepts that scope and defines Command 103's
unused SQL coordination guard prototype: pure fixed SQL rendering with trigger installation
only by guarded tests in newly owned fictional scopes. The owner subsequently authorized
Command 103 on 2026-10-07: its separate pure renderer and mandatory tests passed complete
local and exact-head hosted acceptance at `2c05dce` on 2026-10-08. The owner-authorized
phase review accepted that unused prototype scope and defines **Command 104 — Stage
unselected currency control storage** only. The proposed additive store starts empty;
explicit staging can record only generation zero, no selected revision/anchor and an
unknown history latch, never false or initialization eligibility. SQL protects this
unassessed shape; no assessment/selection transition or existing-table enforcement.
The owner subsequently authorized Command 104 on 2026-10-08. Its one additive empty
store and separate unused read/constant-stage entry were delivered with the authorized
security repair at `73e31bd`, complete local acceptance and exact-head CI/CodeQL. The
owner-authorized Command 104 phase review accepts this engineering scope and defines
**Command 105 — Specify assessed-state transitions and activation prerequisites** only:
an implementation-ready, source-grounded specification of legal states, migration/
privilege/proof/ledger boundaries, complete writer coverage and dependency-ordered
fictional acceptance. Command 100's protocol remains the basis, not installed authority.
The owner subsequently authorized Command 105 on 2026-10-08. Its documentation-only
specification fixes exact durable tuples (no assessed-unselected row), selection versus
first-history semantics, isolated proof/transition privileges, atomic ledger/audit/replay,
complete writer coverage and protected opening/drain/recovery prerequisites. The smallest
next implementation candidate was an isolated privilege acceptance harness. Command 105
was delivered at `64c1713` with exact-head CI/CodeQL success; its owner-authorized phase
review accepts the documentation scope and defines **Command 106 — Build an isolated
currency privilege acceptance harness**, not its implementation. The next slice creates
only newly owned disposable fictional infrastructure and actual distinct-login permission
tests; it cannot use shared-cluster roles, alter product migrations or open selected states.
Its proposed acceptance is not executed evidence and
no transition/role/migration/writer is implemented. Unknown history remains null, never
false, and generation zero is not authority. No application/CLI/worker consumer, history
assessment, selected policy, live migration or existing-business-table guard is added.
It verifies caller settings and coordination only, not an initiating statement's
snapshot or internal timer state; trusted callers must establish the first active
transaction deadline, not assume that lowering a positive setting rearms its timer.
No application migration, installed policy guard or writer adoption follows this review.
The owner subsequently authorized Command 106 on 2026-10-08. Its test-only P1 harness
uses one newly owned, capped tmpfs PostgreSQL container and private nonce bridge, an
immutable cached image and loopback-only derived port. Distinct ephemeral SCRAM logins
and minimal non-login owners exercise fictional ACL/definer/DDL/temporary/RLS boundaries;
snapshot checks follow every precise SQLSTATE denial. Mandatory package/root/CI wiring
retains all prior migration/source/seed/history checks. This is not production role
installation, selection, proof issuance, writer enforcement or human approval.
Command 106's corrected delivery at `fb86cca` passed exact-head CI/CodeQL; the
owner-authorized phase review on 2026-10-09 accepts that P1 engineering scope only.
A fresh full audit now reports three additional Handlebars development-tooling
advisories (two critical), while the production audit remains clear of known findings.
The next bounded command is **Command 107 — Repair newly disclosed Handlebars tooling
advisories**, subsequently authorized on 2026-10-09. Its narrow exact 4.7.10 override
and installed-consumer security/compatibility regressions are implemented; complete
renewed acceptance and delivery are recorded in `docs/PROGRESS.md`. The three
Handlebars advisories are absent from the post-repair audit; the two retained local
patch advisories remain unresolved and the full audit still fails. Currency slice P2 (inert
authority records) remains a dependency, not implemented. The owner-authorized Command
107 review accepts `ecfdd16` with exact-head CI/CodeQL closure and defines **Command 108 —
Build unused currency selection request contracts** only. This P2a slice prepares strict,
bounded confirmation-request decoding before storage; syntax is never human approval.
No request contract or P2 store is implemented or authorized by that review.
The owner subsequently authorized Command 108 on 2026-10-09. Its separate unused
shared request entry decodes at most 4 KiB UTF-8 JSON into six strict copied fields,
or a fixed redacted failure. Duplicate/unknown/authority fields, noncanonical or
overflowing generation strings and contradictory action/state pairs deny. Success
does not validate a proof or select currency; accepted bearer-containing requests
must not be logged. No endpoint, root/application consumer, hash/issuer/store or
migration is added. Full acceptance and delivery are recorded in `docs/PROGRESS.md`.
Command 108 was delivered at `a1fcbb6` with exact-head CI/CodeQL success. Its owner-
authorized phase review on 2026-10-09 accepts the request-syntax engineering scope and
defines **Command 109 — Specify canonical currency authority bindings**, documentation
only. Exact persistent installation identity, ordered stable-intent/assessment bytes,
non-secret credential evidence and immutable reference lifecycles must be resolved
before sensitive P2 storage. No digest, authority record, identity/epoch store or next
implementation is authorized by this review. Existing auth and zero/null controls stay intact.
The owner subsequently authorized Command 109 on 2026-10-09. Section 3e specifies
server-owned installation/execution identity, non-secret auth versions and immutable
factor evidence, exact bounded stable-intent/assessment tuples and receipt/reference
lifecycles. Fictional byte/hash vectors were independently calculated; no codec or
authority store is implemented. Its smallest later candidate is empty inert installation
identity storage, not identity seeding, proof issuance or selection. No next command is
numbered or authorized by that specification; complete acceptance remains gated.
Command 109 was delivered at `3c4606c` with exact-head CI/CodeQL acceptance. The
owner-authorized phase review on 2026-10-10 accepts its documentation scope and defines
**Command 110 — Stage inert currency installation identity storage**, not its execution:
two empty immutable identity/placement tables, one additive migration and mandatory
source/owned SQL/P1 permission/preservation acceptance. No defaults, seed, deployment
pin, auth epoch, digest/proof/selection or application consumer. Existing production
privilege adoption remains unproven; inert storage cannot attest placement or approve money.
The owner subsequently authorized Command 110 on 2026-10-10. After Docker restoration,
the preceding review at `b7d43af` passed its scan/main/exact-head CI/CodeQL gates before
implementation began. Two unused identity models and one empty additive migration passed
renewed local acceptance, including actual SQL/non-owner denials and prior-25 preservation.
Initialization/pin/auth/proof/selection and ordinary consumers remain absent; delivery
closure, actual checks and failed attempts are tracked separately in the progress report.
No selection/guard or application consumer is installed by the observation helper or review.
No live registry, selected installation policy or financial backfill is included. Broader persistence,
per-currency reads, pricing and activation remain later separately gated slices. Remaining
tooling advisories are not waived. No currency is activated by this sequence.

## 3. User Roles

### Administrator

The business owner or trusted staff member. Administrators can manage customers, products, orders, invoices, payments, services, tickets, servers, automation settings, and logs.

### Customer

A hosting customer who can manage their profile, place orders, view services, pay invoices, and open support tickets.

The owner authorized a bounded staff-role addition on 2026-10-06. Administrator
accounts now have one fixed staff role: full administrator, billing operator or
support operator. Existing administrator profiles retain full access during migration.
Billing operators can read customer context, manage invoices and verify/record manual
payments; refunds, reversals, hosting operations, settings and staff changes remain
full-administrator-only. Support operators manage the existing single ticket queue.
Restricted operators must enroll in two-factor authentication before business access;
staff changes also require an enrolled full administrator. No custom-role builder,
department engine, hosting-operator role or integration API-user role is introduced.

## 4. Minimum Viable Product Scope

### 4.1 Administrator panel

- Dashboard with active services, pending orders, overdue invoices, and recent payments
- Customer creation, search, editing, and status management
- Hosting product and price management
- Order review, approval, rejection, and cancellation
- Service activation, suspension, reactivation, and termination
- Invoice creation, editing before payment, cancellation, and payment recording
- Manual payment entry for bank or mobile-financial-service transactions
- Basic support-ticket management
- Server and control-panel connection settings
- Email, automation, grace-period, and business settings
- Email-delivery and administrator-activity logs

### 4.2 Customer portal

- Registration, sign-in, password reset, and profile management
- Hosting-package ordering
- Service list with status and renewal date
- Invoice list, invoice details, and printable/PDF invoice
- Online payment and manual-payment submission
- Basic ticket creation and replies
- Secure control-panel login link, if supported by the selected panel

### 4.3 Automation

A scheduled background job should:

- Create renewal invoices before the next due date
- Send invoice-created and renewal-reminder emails
- Mark unpaid invoices overdue
- Suspend eligible services after a configurable grace period
- Reactivate a suspended service after verified payment
- Record every action and failure in an automation log

Permanent service termination should require administrator approval in the first release.

## 5. Core Business Workflows

### 5.1 New order

1. Customer selects a hosting package and billing period.
2. Customer supplies the requested domain and account details.
3. System creates an order and unpaid invoice.
4. Customer pays through a gateway or submits a manual-payment reference.
5. System verifies the payment server-side, or an administrator approves it.
6. Administrator approves the order if manual review is enabled.
7. System provisions the hosting account through the panel adapter.
8. Service becomes active and the customer receives the account email.

If provisioning fails, payment remains recorded, the service remains pending, and an administrator is alerted. The system must not silently retry actions that could create duplicate hosting accounts.

### 5.2 Renewal

1. Automation creates an invoice a configurable number of days before renewal.
2. Customer receives reminders according to the configured schedule.
3. Verified payment marks the invoice paid.
4. System advances the service's next due date by one billing period.
5. If the service was suspended for non-payment, the system attempts reactivation.

### 5.3 Overdue service

1. Invoice passes its due date without full payment.
2. System marks it overdue and sends a notice.
3. The configured grace period expires.
4. Automation suspends the linked active service.
5. Administrator and customer receive the result.
6. Termination remains a separate, manually confirmed action.

### 5.4 Refund or payment reversal

A refund must be stored as a separate financial transaction. It should not delete or rewrite the original payment. Any service effect requires explicit administrator action unless a later policy defines safe automatic behavior.

## 6. Status Models

### Order status

`pending -> awaiting_payment -> paid -> processing -> completed`

Alternative final states: `rejected`, `cancelled`, or `failed`.

### Invoice status

`draft -> unpaid -> paid`

Alternative states: `overdue`, `cancelled`, `refunded`, or `partially_refunded`.

### Service status

`pending -> active -> suspended -> active -> terminated`

Additional optional states: `provisioning`, `provision_failed`, and `cancelled`.

Payment status, invoice status, and service status must remain separate. A paid invoice does not prove that provisioning succeeded.

## 7. Proposed Data Model

### Core tables

| Table             | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `users`           | Authentication identity and role                     |
| `customers`       | Customer profile and billing information             |
| `products`        | Hosting packages and provisioning configuration      |
| `product_prices`  | Billing periods, prices, and currency                |
| `orders`          | Customer purchase requests                           |
| `order_items`     | Products included in an order                        |
| `services`        | Purchased hosting-service instances                  |
| `servers`         | Hosting servers and encrypted integration settings   |
| `invoices`        | Bill headers, totals, dates, and status              |
| `invoice_items`   | Historical billing line items                        |
| `payments`        | Captured, manual, refunded, or reversed transactions |
| `payment_events`  | Gateway callbacks and idempotency records            |
| `tickets`         | Support-ticket headers                               |
| `ticket_messages` | Customer and administrator ticket replies            |
| `email_logs`      | Email attempts and delivery information              |
| `activity_logs`   | Security and administrator audit events              |
| `automation_runs` | Scheduled-job executions and errors                  |
| `settings`        | Business-level configuration                         |

### Important data rules

- Store monetary values as integers in the currency's smallest unit, never floating-point values.
- Store an invoice item's description and price as a historical snapshot.
- Store dates in UTC and display them in the configured business timezone.
- Use database transactions when confirming payments or changing linked financial records.
- Never hard-delete invoices, payments, or audit records during normal operation.
- Encrypt external-service credentials at rest.
- Give each gateway event a unique provider event ID or idempotency key.

## 8. Integration Architecture

External systems should be accessed through replaceable adapters.

### Hosting-panel adapter

Suggested interface:

- Test connection
- Create account
- Suspend account
- Unsuspend account
- Terminate account
- Change package
- Change password
- Generate secure login URL, when supported
- Query account status

Only one adapter should be implemented initially, such as cPanel/WHM or DirectAdmin.

### Payment-gateway adapter

Suggested interface:

- Create payment request
- Redirect or return payment instructions
- Verify callback signature
- Query transaction status
- Normalize provider status into internal status
- Record refund information, if supported

The browser's success redirect must never be treated as proof of payment. Payment is confirmed only by a verified server callback or an authenticated server-to-server query.

### Email adapter

Start with SMTP. Queue emails so a temporary email failure does not break orders, payments, or provisioning.

## 9. Recommended Technical Architecture

### Application style

Use a modular monolith for the backend, with a separately deployed web frontend in the same TypeScript monorepo. This keeps business rules cohesive while supporting the polished administrator and customer interfaces shown in the approved mockups.

### Recommended stack

- **Backend:** NestJS REST API
- **Interface:** Next.js App Router with TypeScript
- **Database:** PostgreSQL with Prisma
- **Background work:** BullMQ workers
- **Scheduling:** Dedicated NestJS scheduler process with database-backed locking
- **Cache/queue store:** Redis
- **Web server:** Nginx
- **Repository:** pnpm TypeScript monorepo
- **Deployment:** Separate web, API, worker, and scheduler processes backed by PostgreSQL and Redis

This stack keeps the application end-to-end TypeScript while retaining a modular-monolith backend. PostgreSQL provides transactional integrity, Prisma manages the schema and database access, and BullMQ provides observable background execution for email, provisioning, renewal, and suspension workflows.

### Suggested internal modules

```text
Application
|-- Identity and Customers
|-- Catalog and Pricing
|-- Orders
|-- Billing and Payments
|-- Hosting Services
|-- Support
|-- Notifications
|-- Automation
|-- Reporting
`-- Integrations
    |-- Hosting Panel
    |-- Payment Gateway
    `-- Email
```

Modules should share one database but interact through application services and clearly defined events.

## 10. Security Requirements

- Use framework-provided password hashing and session security.
- Require email verification where appropriate.
- Add optional two-factor authentication for administrators.
- Apply authorization checks to every administrator and customer action.
- Prevent customers from accessing another customer's resources by changing an ID in a URL.
- Use CSRF protection and strict server-side validation.
- Rate-limit sign-in, password reset, payment callback, and ticket endpoints.
- Verify payment signatures and reject replayed callback events.
- Encrypt control-panel and gateway secrets.
- Never store raw card information.
- Record administrator actions involving invoices, payments, credentials, and service state.
- Sanitize ticket content and uploaded filenames; restrict attachment types and sizes.
- Back up the database and test restoration regularly.
- Avoid logging passwords, API secrets, callback signatures, or other sensitive values.

## 11. Billing Rules to Define Before Development

The owner should configure or decide:

- Business name, address, logo, and invoice numbering format
- Operating currency
- Applicable tax or VAT rules
- Supported billing periods
- Renewal-invoice creation date
- Reminder schedule
- Grace period before suspension
- Cancellation policy
- Refund policy
- Whether new orders require manual approval
- Whether partial payments are allowed
- How manual payments are verified
- Whether domain registration is in the first release

These rules should be explicit configuration, not scattered constants in the code.

## 12. Delivery Roadmap

### Phase 1: Manual operational core

- Authentication and roles
- Customers
- Products and prices
- Orders
- Services
- Invoices and invoice items
- Manual payments
- Administrator dashboard and audit log

**Result:** The owner can manage the full business lifecycle in one application, while provisioning and payment verification remain manual.

### Phase 2: Customer experience

- Customer portal
- Order form
- Invoice print/PDF view
- Email templates and queued notifications
- Password reset and profile management
- Basic support tickets

### Phase 3: Hosting automation

- One hosting-panel adapter
- Connection test
- Provision, suspend, unsuspend, and status checks
- Safe failure handling and administrator alerts

### Phase 4: Online payments

- One payment gateway
- Signed callback verification
- Idempotent payment processing
- Automatic invoice settlement and service renewal
- Manual reconciliation tools

### Phase 5: Renewal automation and hardening

- Renewal invoice scheduler
- Reminder and overdue notices
- Grace-period suspension
- Backup and restore process
- Security review, monitoring, and operational documentation

### Selected later addition

- UK2Group domain registrar integration through a dedicated registrar adapter, separate from cPanel/WHM hosting operations

### Other possible later additions

- Domain registrar integration
- Coupons
- Additional gateways or hosting panels
- Staff permissions
- Customer credit balance
- Tax reports and accounting exports

Add these only when an actual business need appears.

## 13. MVP Acceptance Criteria

The first usable release is complete when:

1. An administrator can create a customer and hosting product.
2. A customer or administrator can create an order.
3. The system generates an invoice with stable historical line-item values.
4. An administrator can record and audit a manual payment.
5. A paid order can become an active service without confusing financial and provisioning states.
6. The customer can view services and invoices in the portal.
7. The system can create renewal invoices and send reminders.
8. Administrators can suspend, reactivate, and manually terminate services.
9. Every important financial and service action has an audit trail.
10. A tested database backup can be restored successfully.

When panel and gateway automation are added, duplicated callbacks and repeated jobs must not produce duplicate payments, invoices, renewals, or hosting accounts.

## 14. Operational Safety Principles

- Prefer a visible pending state over pretending an external action succeeded.
- Make scheduled jobs safe to run more than once.
- Require confirmation for permanent termination.
- Keep payment records immutable and add correction transactions instead of rewriting history.
- Provide an administrator retry button for failed external actions.
- Alert the administrator when payment succeeds but provisioning or renewal fails.
- Use feature flags or configuration to disable individual automations quickly.

## 15. Recommended First Development Decision

Before implementation starts, choose the exact providers for:

1. Hosting control panel — **selected: cPanel/WHM only**
2. Payment gateway or manual-payment method
3. Email delivery
4. Domain registration — **selected for a later separately authorized integration: UK2Group**

The initial implementation should then optimize for one real business workflow:

> Create a customer, sell a hosting plan, issue and collect an invoice, activate the service, remind the customer before renewal, and safely suspend it when overdue.

If this workflow is reliable, the system already provides the most valuable part of a private WHMCS alternative.

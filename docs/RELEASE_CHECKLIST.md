# Release Readiness Checklist

## Audit result

- **Project:** Webhost Billing
- **Audit command:** Command 30 — Conduct the Release Audit
- **Audit date:** 2026-08-26
- **Audited source:** `7150080 feat: prepare production deployment` plus this audit documentation
- **Local release gate:** **PASS**
- **Staging recommendation:** **Proceed only after an authorized staging target and external secrets are ready**
- **Production recommendation:** **NO-GO**

The implemented modular monolith satisfies the ten MVP acceptance criteria with fictional data and fake providers. Formatting, lint, strict TypeScript, unit, integration, API E2E, browser E2E, production builds, Prisma checks, an empty-database migration, dependency audit, and encrypted backup/restore verification all pass.

Production remains blocked by credentialed provider acceptance, approved infrastructure and secrets, external monitoring/alert delivery, off-site backup configuration, final business policy decisions, and a staging deployment. Three non-critical plan gaps are also recorded below rather than concealed.

No production or staging system, real customer data, real credential, live payment, SMTP server, cPanel account, registrar, DNS record, certificate authority, registry, or external backup destination was accessed during this audit.

## Status legend

- **Complete** — implemented and covered by current local evidence.
- **Partial** — useful implementation exists, but the exact plan wording is not fully met.
- **Operational gate** — code exists, but deployment configuration or credentialed acceptance is still required.
- **Deferred** — explicitly outside the initial release by an accepted decision.

## Requirements audit

### Product, roles, and scope

| Plan requirement                                                                                                         | Status   | Release evidence or disposition                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| One private web-hosting business, intentionally smaller than WHMCS                                                       | Complete | One business settings document, one operating currency, two roles, no tenant/reseller/affiliate/marketplace framework      |
| Administrator and customer roles without a complex staff permission system                                               | Complete | Server-enforced `ADMIN`/`CUSTOMER` authorization, customer ownership checks, and role-aware web routing                    |
| Manage customers, products, orders, invoices, payments, hosting services, renewals, and support in one system            | Complete | NestJS modules and Next.js administrator/customer workspaces cover the intended business lifecycle                         |
| Modular-monolith backend and one PostgreSQL database                                                                     | Complete | NestJS modular monolith; shared PostgreSQL with transactional module boundaries and an outbox                              |
| Keep the product maintainable by one business owner                                                                      | Complete | pnpm TypeScript monorepo, shared contracts/configuration, focused provider adapters, runbooks, and one deployment topology |
| Worldwide tax/currency, marketplace, affiliate, reseller, native mobile, and multiple-panel features remain out of scope | Complete | None of these broader WHMCS features was introduced                                                                        |

### Administrator panel

| Plan requirement                                                              | Status   | Release evidence or disposition                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard: active services, pending orders, overdue invoices, recent payments | Partial  | Active services, pending orders, overdue balance, collected revenue, suspended services, tickets, failures, reports, and recent audit activity are present. Payment history is available at `/admin/payments`, but the dashboard has no dedicated recent-payments list. |
| Customer creation, search, editing, and status management                     | Complete | `/admin/customers` and customer detail workflows; API integration and component tests                                                                                                                                                                                   |
| Hosting product and price management                                          | Complete | Product lifecycle, provisioning mapping, append-only price versions, active/archived status, storefront-safe catalog                                                                                                                                                    |
| Order review, approval, rejection, and cancellation                           | Complete | Admin order creation/review/state controls with transactionally coordinated invoices and audit records                                                                                                                                                                  |
| Service activation, suspension, reactivation, and termination                 | Complete | Manual and adapter-backed lifecycles; exact `TERMINATE` confirmation; payment/provisioning state separation                                                                                                                                                             |
| Invoice creation, pre-payment editing, cancellation, and payment recording    | Complete | Editable drafts, immutable issued snapshots, manual/gateway settlement, PDF/print view, refund/reversal adjustments                                                                                                                                                     |
| Manual payment entry for cash, bank, or mobile-financial-service transactions | Complete | Customer pending references and administrator verified receipts, duplicate protection, partial-payment policy                                                                                                                                                           |
| Basic support-ticket management                                               | Complete | Filtering, assignment, priority, replies, four states, closing/reopening, audit and queued reply email                                                                                                                                                                  |
| Server and control-panel connection settings                                  | Complete | Encrypted server-scoped WHM token configuration, safe test operation, operation history and reconciliation                                                                                                                                                              |
| Email, automation, grace-period, and business settings                        | Complete | Typed settings for the exact Command 21 scope; SMTP authentication remains a deployment secret                                                                                                                                                                          |
| Email-delivery and administrator-activity logs                                | Partial  | Safe email delivery/attempt history has an admin view. Administrator actions are durably recorded and recent events are visible on the dashboard, but there is no paginated/searchable full activity-log page.                                                          |

### Customer portal

| Plan requirement                                                            | Status   | Release evidence or disposition                                                                                              |
| --------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Registration, verification, sign-in, password reset, and profile management | Complete | Cookie sessions, verification/reset tokens, session controls, profile/billing updates, optional admin MFA                    |
| Hosting-package ordering                                                    | Complete | Public catalog and authenticated checkout with server-authoritative pricing and idempotent order creation                    |
| Service list with status and renewal date                                   | Complete | Owned service list/detail with status, domain, package, recurring price, server and next due date                            |
| Invoice list, details, print, and PDF                                       | Complete | Ownership-bound list/detail, printable route, deterministic authorization-checked PDF                                        |
| Online and manual payment                                                   | Complete | Fake/test plus sandbox bKash/SSLCOMMERZ adapters and reviewed manual submission; live acceptance remains an operational gate |
| Ticket creation and replies                                                 | Complete | Ownership-bound plain-text conversations and idempotent replies                                                              |
| Secure hosting-panel login link                                             | Complete | Ephemeral cPanel URL for the owning customer; URL is validated, returned once, and never persisted                           |

### Automation and core workflows

| Plan requirement                                                                   | Status   | Release evidence or disposition                                                                                                                                                                               |
| ---------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create renewal invoices before the next due date                                   | Complete | Dedicated scheduler, business-date lock, idempotent outbox event and unique service/period invoice line                                                                                                       |
| Send invoice-created and renewal-reminder emails                                   | Complete | Queued typed templates and SMTP/preview adapters with durable delivery attempts                                                                                                                               |
| Mark unpaid invoices overdue                                                       | Complete | Idempotent renewal processor with audit and overdue notice                                                                                                                                                    |
| Suspend after a configurable grace period                                          | Complete | Invoice-linked, adapter-verified suspension request; no blind external mutation retry                                                                                                                         |
| Reactivate after verified payment                                                  | Complete | Due date advances only on verified settlement; unsuspension is restricted to the matching automation suspension invoice                                                                                       |
| Record every automation action and failure                                         | Complete | `AutomationRun`, outbox/job evidence, activity logs and `/admin/automation` operational view                                                                                                                  |
| Permanent termination remains manual                                               | Complete | No scheduled termination event; administrator reason and exact confirmation required                                                                                                                          |
| Customer receives provisioning/suspension/reactivation results                     | Complete | Service email templates and outbox producers                                                                                                                                                                  |
| Administrator is alerted on provisioning, payment, renewal, or hosting uncertainty | Partial  | Failures are durable and visible in the protected operational view, health signals, and documented alert policy. No alert destination is configured and the app does not directly contact an alerting vendor. |
| New-order workflow preserves payment when provisioning fails                       | Complete | Paid invoice/order evidence stays intact while the service becomes `PROVISION_FAILED` or the operation becomes inconsistent                                                                                   |
| Renewal and overdue workflows remain independently replay-safe                     | Complete | Scheduler, invoice, reminder, payment, suspension, and unsuspension idempotency are covered by the invariant suite                                                                                            |
| Refunds and reversals append transactions without rewriting original payments      | Complete | Original charge retained; successful negative adjustments change net paid/refund state without automatic service mutation                                                                                     |

### State, data, and financial rules

| Plan requirement                                                                                    | Status   | Release evidence or disposition                                                                                                        |
| --------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Separate order, invoice, payment, service, provisioning, and operation states                       | Complete | Independent database enums/transitions; paid never implies provisioned                                                                 |
| Preserve pending, failed, cancelled, rejected, overdue, refund, and termination states              | Complete | Explicit terminal/exceptional states and safe transition validation                                                                    |
| Store money as integer minor units and serialize safely                                             | Complete | PostgreSQL `BIGINT`, TypeScript `bigint`, canonical decimal strings, checked arithmetic; invariant tests pass                          |
| Snapshot invoice lines, prices, customer identity, and business identity                            | Complete | Issued snapshot fields and immutable historical invoice/order/service values                                                           |
| Store timestamps in UTC and present in a configured IANA timezone                                   | Complete | UTC database values and typed business timezone boundaries                                                                             |
| Use transactions for financial and linked workflow changes                                          | Complete | Invoice row locks, atomic payment/event/order/outbox changes, and concurrency tests                                                    |
| Do not normally hard-delete financial, provider-event, automation, ticket, email, or audit evidence | Complete | Schema deletion boundaries, restrictive relationships, state transitions and append-only corrections                                   |
| Encrypt integration credentials at rest                                                             | Complete | Provider-bound AES-256-GCM for gateway bundles and server-bound cPanel token encryption                                                |
| Unique provider event and idempotency keys                                                          | Complete | Database uniqueness, exact replay checks, deterministic background IDs and focused replay tests                                        |
| Proposed core tables                                                                                | Complete | All planned tables exist; additional tables support sessions/tokens, email attempts, outbox, credentials, operations, and queue safety |

### Integration architecture

| Plan requirement                           | Status           | Release evidence or disposition                                                                                                              |
| ------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider-neutral hosting-panel adapter     | Complete         | Test, create, query, suspend, unsuspend, terminate, package/password change and login URL contract                                           |
| One initial real hosting panel: cPanel/WHM | Operational gate | WHM API 1 implementation and mocks pass; real development-server acceptance still requires an approved token and disposable account          |
| Provider-neutral payment adapter           | Complete         | Session creation, instructions/redirects, callback proof, query/reconciliation, normalized status and refund/reversal information            |
| Browser redirect is never payment proof    | Complete         | Return routes cannot settle; authenticated callback/server query is mandatory and regression-tested                                          |
| bKash and SSLCOMMERZ sandbox support       | Operational gate | Sandbox-only BDT adapters, credentials, callback verification and reconciliation are implemented; credentialed sandbox acceptance is pending |
| Cash/bank deposit support                  | Complete         | Reviewed manual-payment workflow                                                                                                             |
| SMTP email adapter and queued delivery     | Operational gate | SMTP/preview adapter, BullMQ worker, templates and logs are complete; a real SMTP provider/credential acceptance is pending                  |
| UK2Group domain registrar                  | Deferred         | Explicitly selected as a later, separately authorized registrar adapter; no domain model or registrar code is in this release                |

### Technical architecture and deployment

| Plan requirement                                                                      | Status           | Release evidence or disposition                                                                                            |
| ------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| NestJS REST API, Next.js App Router, PostgreSQL/Prisma, BullMQ/Redis, TypeScript/pnpm | Complete         | Implemented in the required monorepo layout                                                                                |
| Dedicated scheduler with database-backed locking                                      | Complete         | Separate scheduler entry point, PostgreSQL advisory lock, lifecycle regression test                                        |
| Separate web, API, worker, and scheduler processes                                    | Complete         | Production Compose services plus isolated migration and Nginx images                                                       |
| Nginx HTTPS reverse proxy                                                             | Operational gate | Split-host template, headers, limits, trust boundary and local smoke evidence exist; trusted DNS/TLS deployment is pending |
| Provider-neutral boundaries and shared application events                             | Complete         | Typed adapters, transactional outbox and reference-only BullMQ jobs                                                        |

### Security requirements

| Plan requirement                                                   | Status           | Release evidence or disposition                                                                                                                     |
| ------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password hashing and secure sessions                               | Complete         | Argon2, opaque database sessions, HttpOnly cookies, idle/absolute expiry and session revocation                                                     |
| Email verification and password reset                              | Complete         | Encrypted, expiring, one-use action tokens and queued delivery                                                                                      |
| Optional administrator two-factor authentication                   | Complete         | RFC 6238 TOTP, encrypted secret, one-use hashed recovery codes and replay protection                                                                |
| Authorization and cross-customer ownership enforcement             | Complete         | Global role/session guards plus service-layer ownership; API and browser denial tests                                                               |
| CSRF protection and strict validation                              | Complete         | Signed CSRF, Origin/Fetch-Metadata checks, strict Zod contracts and safe error envelopes                                                            |
| Rate limiting for sign-in, reset, callbacks, and tickets           | Complete         | Redis-backed fail-closed limits on all listed entry points                                                                                          |
| Authenticated, replay-safe payment callbacks                       | Complete         | Provider-specific proof, merchant/invoice/amount/currency checks and event uniqueness                                                               |
| Encrypt panel and gateway secrets                                  | Complete         | Versioned AEAD ciphers, write-only configuration and redacted responses                                                                             |
| Never store raw card information                                   | Complete         | No card-data model or form; hosted/sandbox checkout only                                                                                            |
| Audit sensitive administrator actions                              | Complete         | Invoice, payment, credential, report, support, auth and service actions create safe activity records                                                |
| Safe ticket content and attachment handling                        | Complete         | Initial release has no upload endpoint/model; strict schemas reject markup and attachment-shaped input, so filename/MIME handling is not applicable |
| Back up and test restoration                                       | Complete locally | Encrypted fictional drill passed; production off-site scheduling and periodic restoration remain operational gates                                  |
| Avoid logging credentials and sensitive provider/customer payloads | Complete         | Structured safe-event logging, recursive redaction and reference-only jobs; deployment log access/retention remains an operational gate             |

### Billing policy decisions

| Plan decision                                                  | Status   | Release evidence or disposition                                                                                           |
| -------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| Business name, address, billing identity and invoice numbering | Complete | Typed settings and issued snapshots; final real values still require owner entry                                          |
| Business logo                                                  | Deferred | No uploaded/configurable logo is implemented; branding uses name and color                                                |
| Operating currency                                             | Complete | One configured ISO currency; default BDT; gateways restrict supported currency                                            |
| Tax/VAT rules                                                  | Partial  | Tax identifiers and exact per-line integer tax amounts exist, but no automatic jurisdiction/rate policy is configured     |
| Supported billing periods                                      | Complete | Monthly, quarterly, semiannual and annual product prices with historical versions                                         |
| Renewal lead date, reminder schedule and grace period          | Complete | Typed, validated business settings used by automation                                                                     |
| Cancellation policy                                            | Partial  | Safe order/service cancellation transitions exist, but owner policy text/rules are not configurable                       |
| Refund policy                                                  | Partial  | Append-only refund/reversal workflow exists, but owner policy text/rules are not configurable                             |
| Manual approval for new orders                                 | Partial  | The current release requires administrator approval; there is no configurable approval toggle                             |
| Partial-payment policy                                         | Complete | Explicit setting, disabled by default                                                                                     |
| Manual-payment verification                                    | Complete | Fixed administrator review workflow and customer instructions; final operational evidence criteria require owner approval |
| Domain registration in first release                           | Deferred | Explicitly excluded; UK2Group is a later addition                                                                         |

### MVP acceptance criteria

| Acceptance criterion                                                             | Status           | Evidence                                                             |
| -------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------- |
| Administrator creates a customer and product                                     | Complete         | API integration and web component coverage                           |
| Customer or administrator creates an order                                       | Complete         | API integration coverage and browser customer checkout               |
| Invoice retains stable historical values                                         | Complete         | Snapshot/concurrency tests and deterministic PDF                     |
| Administrator records and audits a manual payment                                | Complete         | Payment integration suite and admin interface tests                  |
| Paid order becomes active without conflating payment/provisioning                | Complete         | Focused invariant tests and full browser lifecycle                   |
| Customer views services and invoices                                             | Complete         | Browser lifecycle plus customer component/API tests                  |
| Renewal invoices and reminders are generated                                     | Complete         | Worker integration and scheduler tests                               |
| Administrator suspends, reactivates, and manually terminates                     | Complete         | Service/hosting API tests and browser termination confirmation       |
| Important financial and service actions have an audit trail                      | Complete         | Transactional activity records verified in module E2E suites         |
| Tested database backup restores successfully                                     | Complete locally | 30 tables and 21 migrations matched after encrypted isolated restore |
| Duplicate callbacks/jobs do not duplicate money, invoices, renewals, or accounts | Complete         | 75-test critical-invariant gate                                      |

### Operational safety principles

| Principle                                                | Status   | Release evidence or disposition                                                                                          |
| -------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| Prefer visible pending/failed/inconsistent state         | Complete | External uncertainty is durable and cannot silently become success                                                       |
| Scheduled jobs are idempotent                            | Complete | Daily keys, database locks, unique cycle evidence and replay tests                                                       |
| Permanent termination requires confirmation              | Complete | Administrator-only exact phrase and reason                                                                               |
| Payments are immutable; corrections append               | Complete | Original charges remain; refunds/reversals are separate rows                                                             |
| Administrator retry for failed external actions          | Complete | Bounded safe retries for temporary failures; inconsistent mutations cannot be retried blindly                            |
| Alert administrator when paid provisioning/renewal fails | Partial  | Protected operational signals and thresholds exist; external alert delivery is a production blocker                      |
| Disable individual automation quickly                    | Complete | Renewal enabled flag, active provider selection, manual gateway fallback and worker/scheduler operational stop procedure |

## Automated validation evidence

| Check                                      | Result | Evidence                                                                                                                                               |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository formatting                      | Pass   | `pnpm format:check`; all files matched Prettier                                                                                                        |
| Patch whitespace                           | Pass   | `git diff --check`                                                                                                                                     |
| ESLint                                     | Pass   | API, worker and web lint commands                                                                                                                      |
| Strict TypeScript                          | Pass   | Config/database/shared/queue, API, worker, web and browser-test typechecks                                                                             |
| Workspace unit/component/integration tests | Pass   | **191 tests:** shared 25, queue 3, API 88, worker 28, web 47                                                                                           |
| Critical business invariants               | Pass   | **75 tests:** contracts 25, money/API unit 12, selected API integration 36, renewal worker 2                                                           |
| Full API E2E                               | Pass   | **65 tests across 16 suites** with isolated fictional records                                                                                          |
| Browser E2E                                | Pass   | Sequential Chromium lifecycle passed all 14 workflow steps; a second correctly prepared trace run also passed                                          |
| Production builds                          | Pass   | API, web, worker, migration and Nginx images built from current source                                                                                 |
| Production image users                     | Pass   | API/web/worker/migration `10001:10001`; Nginx `nginx`                                                                                                  |
| Production Compose rendering               | Pass   | Example non-secret environment renders with the tools profile                                                                                          |
| Prisma                                     | Pass   | Format, validation, generation, current migration status and schema/fictional-seed verification                                                        |
| Empty database migration                   | Pass   | All **21 migrations** applied to a newly created isolated fictional database                                                                           |
| Dependency/security audit                  | Pass   | `pnpm audit --prod` reported **no known vulnerabilities**                                                                                              |
| Backup/restore                             | Pass   | Encrypted backup verified, deliberately corrupted ciphertext rejected, isolated restore matched all 30 table counts and 21 migrations, then cleaned up |

Expected test diagnostics that did not change pass/fail status:

- Jest uses Node's experimental VM-module mode.
- Database-backed tests emit a `pg` concurrent-query deprecation warning that becomes an upgrade risk for `pg` 9.
- Next.js emits a development diagnostic because smooth scrolling is enabled without its optional `data-scroll-behavior` hint.

One trace-capture attempt invoked Playwright directly without the required `pretest:e2e` environment reset. It correctly stopped on the existing fictional registration identity. The normal release command had already passed, and the trace run was repeated with the required schema preparation and passed. This was an operator invocation error, not a hidden product failure.

## Manual workflow inspection

The primary desktop workflows were inspected against the successful Chromium trace and the rendered UI/state transitions:

- anonymous `/admin` and `/portal` access redirects to `/login`;
- public plan selection and customer registration/verification;
- customer checkout with server-authoritative price summary;
- customer order, invoice, service, profile and support navigation;
- administrator dashboard navigation, order approval and service provisioning;
- renewal invoice, overdue suspension and verified-payment reactivation state visibility;
- customer ticket creation and administrator reply;
- termination warning, rejected wrong confirmation, and final terminated state;
- role switching redirects customers away from admin and administrators away from customer routes.

The exercised desktop screens had consistent workspace navigation, state badges, loading states, feedback messages and destructive-action treatment. The trace review is not a substitute for a dedicated mobile-device browser pass, screen-reader audit, or credentialed provider acceptance.

## Missing requirements and accepted deviations

These items are not concealed by the passing local gate:

1. The administrator dashboard does not show a dedicated recent-payments table; payment history is on `/admin/payments`.
2. The administrator dashboard shows recent safe activity and PostgreSQL retains the complete audit trail, but there is no paginated/searchable full activity-log interface.
3. The application exposes durable operational failure signals and alert thresholds but has no configured external alert destination.
4. A configurable business logo, automatic tax/VAT policy, cancellation/refund policy text, and a manual-order-approval toggle are not implemented.
5. Ticket attachments are intentionally excluded; no upload endpoint or storage exists.
6. UK2Group/domain registration is an explicitly deferred later project and is not part of this release.

Items 1 and 2 are non-critical operator convenience gaps because the underlying payment/audit evidence remains available and safe. Items 3 and 4 must be resolved operationally or explicitly accepted by the owner before production. Items 5 and 6 are accepted scope decisions.

## Known defects and test-coverage gaps

- Next.js reports the smooth-scroll route-transition diagnostic in development. No functional failure or layout break was observed.
- The current Prisma PostgreSQL adapter path can emit the `pg` overlapping-query deprecation warning during concurrent integration cleanup; current `pg` tests pass, but upgrade to `pg` 9 requires verification.
- Browser E2E covers the release-critical desktop lifecycle in Chromium. It does not yet provide separate mobile, Firefox, WebKit, MFA, settings, CSV, PDF, manual-payment, or every failure-path browser scenario; those boundaries have API/component tests instead.
- Real-provider behavior, provider account configuration, network policy and provider-version differences cannot be proven by fake/mocked local tests.

No release-blocking local data-integrity, authorization, financial-state, migration, backup, build, or primary-browser-workflow defect was found in this audit.

## Security risks requiring launch controls

- Enable TOTP for every production administrator and store recovery codes offline.
- Keep all production secret files outside the checkout; `.env`, the ignored fictional sample-user file, private keys and provider credentials must never be committed or copied into logs/tickets.
- Escrow the historical credential-encryption key separately. Losing it makes restored gateway/WHM/TOTP ciphertext unreadable; the initial release has no automatic dual-key migration.
- Restrict cPanel egress to approved public destinations. DNS preflight reduces SSRF risk but cannot alone eliminate DNS rebinding.
- Restrict and rate-limit public health routes at the edge, expose only 80/443, and never publish API/web/PostgreSQL/Redis ports directly.
- Docker root/daemon access and local Compose bind-mounted secrets remain privileged boundaries; use a supported secret manager where possible.
- Centralize logs over encrypted transport with access control and retention; local rotation alone is not durable or sufficient.
- Keep uploads disabled. Adding attachments requires a new threat model, private storage, authenticated retrieval, MIME/signature validation, limits, malware scanning and retention controls.
- Do not enable live gateway endpoints or production cPanel mutation privileges from sandbox/mock evidence.

## Operational risks and production blockers

- Production/staging host, capacity, OS patching, time sync, firewall and cPanel port/resource conflicts are not approved. A dedicated VPS is preferred.
- Billing/API DNS names and trusted TLS certificate issuance/renewal are not configured.
- SMTP provider, monitor/alert destination, centralized log store and escalation recipient are not selected.
- Off-site immutable backup storage, schedule, alerting and a timed staging-hardware restore drill remain pending.
- PostgreSQL/Redis use a single-host topology without high availability or point-in-time recovery.
- Final business identity, tax/VAT position, cancellation/refund policies, supported provider, reminder/grace values and operating decisions require owner approval.
- Container images have not been registry-scanned, signed, published or pinned by deployment digest.
- System clock accuracy is important for TOTP, sessions, callbacks and scheduler business dates and needs host monitoring.
- Exactly one scheduler replica must run; worker/scheduler/queue/outbox/provider evidence must be reconciled after outages.

## Credentialed external-provider tests still required

### bKash sandbox

- Store a complete sandbox bundle through the write-only settings interface and keep production endpoints disabled.
- Create one fictional BDT checkout; test callback success, cancellation/failure, duplicate delivery, query/reconciliation and amount/merchant mismatch rejection.
- Confirm the browser return alone cannot settle and no credential/provider response appears in logs or UI.

### SSLCOMMERZ sandbox

- Store the sandbox store ID/password and create one fictional BDT hosted checkout.
- Test IPN validation through the Order Validation API, duplicate IPN, failed/cancelled return, high-risk pending handling and reconciliation.
- Confirm a success return alone cannot settle and exact amount/currency/invoice identity is enforced.

### SMTP

- Configure certificate-validated authenticated TLS with approved sender/reply-to identities.
- Deliver verification, reset, invoice, reminder, overdue, service and ticket emails to controlled staging mailboxes.
- Test temporary failure, permanent failure, unknown outcome, retry limits, message IDs, safe administrator history and alerting.

### cPanel/WHM development server

- Use an approved dedicated reseller/API token, outbound-IP restriction, disposable packages/domain/account and mutation window.
- Test connection, create/idempotent replay, query, suspend, unsuspend, package/password change and ephemeral login.
- Reconcile after every result; terminate only after exact target review and separate explicit approval.
- Confirm TLS, hostname/port policy, least privileges, operation history redaction and token rotation.

### UK2Group

- Not part of this release. A future command must confirm the current official API, test environment and product identity before designing registrar contacts, availability, registration, renewal, transfer, nameserver, expiry, pricing and reconciliation workflows.

## Deployment steps

Use `docs/PRODUCTION_DEPLOYMENT.md` as the authoritative runbook. The release sequence is:

1. Authorize and identify the exact staging/production target; resolve cPanel/WHM port and capacity conflicts.
2. Approve host firewalling, patching, time sync, monitoring, alerting, centralized logs and off-site backup destinations.
3. Configure separate billing/API DNS names and a trusted certificate covering both.
4. Create the ignored non-secret production environment file with an immutable commit/image tag.
5. Create and verify independent protected secret files outside the repository; escrow the credential-encryption key separately.
6. Enter final safe business settings; keep external providers disabled until each acceptance test passes.
7. Re-run the release gate, render Compose, build/scan/sign images and record image digests.
8. Take and verify an encrypted off-site pre-migration backup.
9. Stop worker/scheduler, review pending SQL and run the one-shot forward-only migration exactly once; verify clean status.
10. Start the stack with one scheduler and wait for every health check.
11. Externally verify HTTPS, certificate chain, host rejection/redirects, security headers, size limits, liveness/readiness and private ports.
12. Smoke administrator/customer login/logout, authorization denial, CSRF mutation, PDF, support, SMTP and only explicitly authorized provider checks using fictional records.
13. Record commit, image digests, migration result, checks, operator, time and rollback owner before enabling traffic/providers.

## Rollback steps

1. Stop scheduler and worker first; preserve containers, volumes, logs, correlation IDs and provider evidence.
2. Classify the incident as application, configuration/secret, dependency, migration/data, or uncertain external-provider state.
3. For configuration-only failure, restore the prior protected configuration and recreate only affected services.
4. For code compatible with the current additive schema, select the previous immutable image tag/digest and recreate application processes.
5. Never improvise down migrations or rewrite invoices, payments, callback events, audit records or provider-operation evidence.
6. For incompatible schema/data failure, keep the failed database intact and restore the verified pre-migration backup into a new isolated database before an approved connection cutover.
7. Reconcile Redis/outbox plus every uncertain payment, hosting and email outcome against PostgreSQL and authenticated provider read-only evidence before any retry.
8. Restart exactly one scheduler and the worker only after database/API health and reconciliation are approved.
9. Re-run health, security and primary workflow checks; record the rollback and unresolved external effects.

## Launch recommendation

**Local release candidate:** approved for the next controlled staging step.

**Production launch:** not approved. Do not use the current public-IP development process as production and do not place the Compose edge beside cPanel/Apache without a separately reviewed port, firewall, capacity and backup design.

Authorize **Command 31 — Deploy to Staging** only after the staging host is explicitly identified, non-placeholder secrets are supplied outside Git, pre-deployment backup/rollback ownership is clear, and the intended provider mode is confirmed. Production approval requires successful staging smoke/acceptance, completed external monitoring/off-site backup controls, final business policies, and explicit acceptance or remediation of the documented plan gaps.

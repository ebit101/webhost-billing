# Webhost Billing Architecture Decisions

This document records durable technical and product decisions. New decisions should be appended and existing decisions superseded explicitly rather than silently rewritten.

## ADR-001 — TypeScript Modular Monorepo

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Use a pnpm TypeScript monorepo containing a NestJS REST API, Next.js App Router frontend, NestJS/BullMQ worker and scheduler processes, and shared packages.
- **Reason:** TypeScript is the preferred implementation language. A monorepo allows shared types and validation while keeping deployment boundaries explicit.
- **Consequence:** The frontend and API remain separate applications, but the backend remains a modular monolith rather than a microservice system.

## ADR-002 — PostgreSQL, Prisma, Redis, and BullMQ

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Use PostgreSQL as the system of record, Prisma as the database toolkit, Redis for queues, and BullMQ for background processing.
- **Reason:** The application needs transactions, constraints, safe concurrency, scheduled work, and observable retry behavior.
- **Consequence:** Local development and deployment require PostgreSQL and Redis. The cPanel server's MariaDB instance will not be used by this application.

## ADR-003 — Integer Money and Immutable Financial History

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Store monetary amounts in integer minor units and preserve immutable issued invoice and payment history.
- **Reason:** Floating-point calculations and rewritten financial history are unsafe for billing.
- **Consequence:** API serialization must safely handle large integers, and corrections use refund or reversal transactions.

## ADR-004 — Explicit Business State Separation

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Orders, invoices, payments, provisioning attempts, and hosting services have separate state machines.
- **Reason:** Payment settlement and external provisioning can succeed or fail independently.
- **Consequence:** Workflows must coordinate states without collapsing them into a single generic status.

## ADR-005 — Adapter-Based External Integrations

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Payment, hosting-panel, and email integrations use internal provider-neutral contracts. Fake adapters are implemented before real providers.
- **Reason:** External services need safe testing, normalized errors, and replaceable implementations.
- **Consequence:** Provider-specific behavior stays behind adapters and contract tests.

## ADR-006 — Development and Production Separation

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** The existing AlmaLinux cPanel/WHM server may run an isolated Docker Compose development or staging environment. Production should use separate infrastructure.
- **Reason:** The billing system will hold financial data and WHM provisioning authority. Hosting it on the same machine it controls increases compromise and availability risk.
- **Consequence:** Development containers use unique networks and volumes. PostgreSQL and Redis are not publicly exposed. Production deployment is deferred to a separate VPS or equivalent environment.

## ADR-007 — Command-Gated Development

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Follow `CODEX_DEVELOPMENT_COMMANDS.md` sequentially, update the progress report after every command, and request user authorization before starting the next command.
- **Reason:** The application contains high-risk financial and provisioning workflows and benefits from reviewable checkpoints.
- **Consequence:** No later command starts automatically, even when the previous command succeeds.

## ADR-008 — Canonical GitHub Delivery

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** `https://github.com/ebit101/webhost-billing.git` is the canonical repository. Every completed and validated development command is committed and pushed to `origin/main`.
- **Reason:** The user requires the GitHub main branch to stay synchronized with command-level development progress.
- **Consequence:** Each command ends with remote reconciliation, a focused commit, and a non-force push. Failing or incomplete work is not pushed as a completed command.

## ADR-009 — Command 1 Toolchain Baseline

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Use Node.js 24 LTS, pnpm 11.22, TypeScript 5.9, NestJS 11, Next.js 16 App Router, ESLint 9, Prettier 3, Jest for Nest applications, and Zod for runtime environment validation.
- **Reason:** Node.js 24 is the current LTS baseline and satisfies the supported runtime requirements of the selected NestJS and Next.js versions. Pinned package-manager and lockfile versions make local, container, and CI installs reproducible.
- **Consequence:** Developers use Node.js 24 or the supplied development Dockerfiles. Toolchain upgrades require an explicit dependency review and validation pass.

## ADR-010 — Isolated Local Infrastructure

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Run PostgreSQL 18.6 and Redis 8.10 in the dedicated `webhost-billing-dev` Docker Compose project, using named volumes, health checks, password authentication, and host ports bound only to `127.0.0.1`. Defer local SMTP capture until email functionality is implemented.
- **Reason:** The cPanel development server already hosts unrelated services. A named Compose project, private bridge network, unique volumes, and loopback-only ports isolate development data and avoid exposing infrastructure publicly.
- **Consequence:** Developers must create an ignored `.env` file before starting infrastructure. PostgreSQL uses its PostgreSQL 18 volume layout at `/var/lib/postgresql`; application services validate their database, Redis, and secret settings at startup.

## ADR-011 — Initial Relational Schema and Prisma Package

- **Status:** Accepted
- **Date:** 2026-08-23
- **Decision:** Place the database schema, migrations, generated-client boundary, fictional seed, and structural verifier in `packages/database`. Use Prisma ORM 7.9.1 with the PostgreSQL driver adapter. Use UUID keys, PostgreSQL `TIMESTAMPTZ(3)`, `BIGINT` minor-unit money, explicit state enums, restrictive foreign keys, immutable historical snapshots, and customized migration SQL for checks and a partial unique price index.
- **Reason:** Billing and provisioning workflows require database-enforced identity, monetary, state, idempotency, history, and relationship invariants. A dedicated workspace package gives the API and worker one database boundary without splitting the modular monolith.
- **Consequence:** Generated Prisma Client code is recreated during build and remains outside Git. Only users, customers, products, product prices, and servers have soft-deletion timestamps; financial, payment-event, email, activity, automation, support, and outbox records have no deletion marker and must not be normally hard-deleted. Migration SQL must be reviewed before application because some PostgreSQL constraints are not represented by Prisma Schema Language.

## ADR-012 — Runtime-Validated API Contracts and Stable Errors

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision:** Keep shared boundary schemas and their inferred types in `@webhost-billing/shared`, using Zod for runtime validation. Serialize `bigint` minor-unit money as canonical decimal strings. Use consistent success and error envelopes and a global NestJS exception filter with stable error codes and generic server-failure messages.
- **Reason:** Static types disappear at runtime, JSON cannot safely represent database-sized integers, and raw framework or provider errors can expose secrets and implementation details.
- **Consequence:** Untrusted boundary data must be parsed with a runtime schema. Clients branch on stable error codes rather than messages. Expected client errors use `ApplicationException`; original exception bodies, database failures, credentials, stack traces, and provider responses are never returned to clients.

## ADR-013 — Database-Backed Cookie Sessions and Opaque Action Tokens

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision:** Authenticate with Argon2id passwords and revocable, database-backed opaque sessions carried only by secure HttpOnly cookies. Protect unsafe requests with a signed double-submit CSRF token, enforce authentication by default, apply role and ownership guards at the API boundary, and use Redis-backed rate limits for login and reset flows. Store only SHA-256 token hashes for lookup; retain reset and verification token material only as AES-256-GCM ciphertext for pending outbox delivery.
- **Reason:** The private billing application needs immediate session revocation, server-authoritative roles and ownership, browser CSRF protection, credential-stuffing resistance, and safe single-use email actions without exposing durable bearer tokens to JavaScript or persistence logs.
- **Consequence:** PostgreSQL and Redis are required for authentication. Public registration creates customers only; administrators require a trusted provisioning process. Production must use HTTPS, an exact CORS origin, unique independent secrets, and shared rate-limit storage. Email delivery remains a future outbox consumer and must decrypt action tokens only at the delivery boundary.

## ADR-014 — Three-Surface Responsive Interface System

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision:** Organize the Next.js interface into public/store, customer-portal, and administrator route-group shells. Share a slate/cyan design-token system and accessible primitives for buttons, navigation, tables, statuses, feedback states, confirmation, and notifications while allowing the public surface to be more expressive and the operational workspaces to be denser.
- **Reason:** Customers, prospective customers, and the hosting owner have different tasks, but maintaining three unrelated component systems would create inconsistency and unnecessary maintenance for a small private product.
- **Consequence:** Future feature commands compose the shared shell and primitives rather than introducing new navigation or one-off state patterns. Command 6 module pages contain fictional layout previews only; API authorization remains the security boundary. Important client interactions are tested with Vitest and React Testing Library, and all UI work must retain descriptive page titles, visible focus, reduced-motion support, and sensible small-screen behavior.

## ADR-015 — Customer Access Is Separate From Email Verification

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision:** Keep customer business status, user access status, and email verification as separate facts. Administrator deactivation sets the customer to `INACTIVE`, disables the user, and revokes sessions. Administrator activation restores a verified user to `ACTIVE` but leaves an unverified user `PENDING_VERIFICATION`.
- **Reason:** Account access is an administrator policy decision, while email verification proves control of an address. Treating activation as verification would weaken the authentication boundary and make audit history ambiguous.
- **Consequence:** Administrator-created customers use the verification outbox flow. Customer detail exposes both customer and account status. Administrator mutations are audited atomically, and audit metadata contains field names/state only rather than submitted personal values.

## ADR-016 — Stateful Products and Append-Only Price Versions

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision:** Manage products through `DRAFT`, `ACTIVE`, and `ARCHIVED` states without catalog deletion. Store explicit public ordering, visibility, hosting-package mapping, and display features. Repricing retires the previous active product/period/currency row and appends a new active price row.
- **Reason:** Historical orders and services must retain stable product and price references, while the storefront needs only current saleable offerings. Appending prices makes changes auditable and avoids silently changing an existing purchase basis.
- **Consequence:** Activation validates provisioning/display completeness and a supported active price. Archiving forces public visibility off but preserves all rows. Public API responses omit package mapping and retired prices. Command 9 must validate the selected product and price again at order creation rather than trusting storefront query parameters.

## ADR-017 — Transactional, Idempotent Order and Invoice Creation

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision:** Create each hosting order, historical order item, unpaid initial invoice, invoice lines, and audit entry in one PostgreSQL transaction. Derive customer identity from the session for customer checkout, calculate every amount from the current eligible database price, and protect submission with a unique client-generated UUID. Use date-prefixed order/invoice numbers with 64 random bits plus database uniqueness.
- **Reason:** Browser amounts and redirects are untrusted, a failed partial write would leave inconsistent billing history, and network retries must not produce multiple invoices or hosting requests.
- **Consequence:** A matching repeated submission returns the original result, while reuse for different input conflicts. New orders begin `AWAITING_PAYMENT` with an `UNPAID` invoice. Direct administrator changes to `PAID` are forbidden; the later verified-payment workflow owns that transition. Rejection or cancellation also cancels a draft/unpaid initial invoice transactionally. The initial business-identity snapshot uses the `business.identity` setting when present and a minimal Webhost Billing name fallback until business settings are configured.

## ADR-018 — Editable Drafts and Immutable Issued Invoices

- **Status:** Accepted
- **Date:** 2026-08-25
- **Decision:** Administrator-created invoices begin as editable drafts. Calculate line totals, subtotal, discount, tax, total, credit, paid amount, and balance with checked integer minor-unit arithmetic and matching PostgreSQL constraints. Issuance permanently locks item and identity snapshots. Number invoices with a date prefix and 64 random bits, and protect creation with a unique submission key.
- **Reason:** The owner needs to prepare custom invoices without weakening issued financial history. Billing calculations must remain lossless at large values, retries must not duplicate documents, and a status click must not fabricate payment or refund evidence.
- **Consequence:** Only drafts may replace dates, currency, credit, and line items. Zero-balance drafts settle on issuance; positive-balance drafts become unpaid. Past-due unpaid invoices may become overdue, and unpaid invoices may be cancelled without deletion. Paid/refunded state changes remain reserved for verified payment/refund transactions in Command 11. The `business.identity` setting supplies future snapshots, while customer identity is captured from the selected customer at creation.

## ADR-019 — Reviewed Manual Payments and Append-Only Adjustments

- **Status:** Accepted
- **Date:** 2026-08-25
- **Decision:** Customer manual references begin pending; administrator-recorded receipts begin verified. Lock the invoice row and revalidate the current balance and partial-payment setting before applying any verified charge. Preserve verified originals and represent refunds/reversals as separate successful adjustment rows.
- **Reason:** Customer-entered proof is untrusted, retries and concurrent reviews must not double-settle an invoice, and financial corrections must retain the original evidence and audit trail.
- **Consequence:** Partial payments default to disabled and require an explicit billing setting. The API accepts structured text proof only, without files or URLs. Verified reference hashes and submission keys prevent duplicates. Adjustments reduce net paid amount and update invoice refund state without automatically changing service state. Gateway callbacks remain a separate provider-neutral workflow in Command 12.

## ADR-020 — Pending Gateway Sessions and Raw-Body Callback Settlement

- **Status:** Accepted
- **Date:** 2026-08-25
- **Decision:** Represent each online checkout attempt as an idempotent pending provider payment for the invoice's full current balance. Finalize it only from a provider adapter that verifies the exact raw callback bytes and normalizes the event. Persist the event, financial settlement, linked-order state, audit records, and an outbox handoff atomically under an invoice lock.
- **Reason:** Browser redirects and client totals are untrusted, provider callbacks can be duplicated or delivered concurrently, and slow follow-up work must not weaken or delay the durable financial decision.
- **Consequence:** Every callback verifies signature, merchant, payment, invoice, amount, currency, transaction uniqueness, and replay identity before settlement. Exact event replays are acknowledged without another mutation; mismatches retain a failed normalized event without changing money. The fake adapter is restricted to development/tests, while real provider selection, credentials, signature rules, reconciliation, and sandbox behavior remain Command 13.

## ADR-021 — Sandbox-Specific Payment Proof and Reconciliation

- **Status:** Accepted
- **Date:** 2026-08-25
- **Decision:** Integrate bKash Tokenized Checkout and SSLCOMMERZ Hosted Checkout as sandbox-only BDT adapters behind the provider-neutral gateway. Treat bKash browser returns as a trigger for authenticated server-side execute/query, and treat SSLCOMMERZ IPNs as untrusted until its Order Validation API confirms the exact transaction. Persist idempotent checkout metadata and route uncertain outcomes to administrator reconciliation.
- **Reason:** The providers expose materially different proof mechanisms, neither browser navigation nor a generic signature convention is sufficient, and retrying an uncertain financial mutation could create duplicates. The application must follow each provider's current official contract without weakening the shared settlement invariants.
- **Consequence:** Real adapters require complete runtime-validated sandbox credentials and BDT invoices. Mutating create/execute requests are not blindly retried, safe read-only validation/query requests have bounded retry and timeout policies, and raw credentials/provider responses never reach logs or interfaces. SSLCOMMERZ high-risk responses remain pending and are held from settlement. Cash/bank deposits remain the reviewed manual flow. Enabling production endpoints, production credentials, live charges, automated refunds, or provider-driven service changes requires a separately authorized command and review.

## ADR-022 — Paid-Order Fulfilment and Evidence-Based Service State

- **Status:** Accepted
- **Date:** 2026-08-25
- **Decision:** Create one hosting service idempotently from each eligible paid order item, assign it to an active capacity-checked server, and preserve product, price, domain, provisioning, and billing snapshots. Keep the service `PENDING` until explicit provisioning transitions supply the evidence required by each state. Require external account identity for activation, reasons for exceptional/final states, and exact administrator confirmation for permanent termination.
- **Reason:** Invoice payment, order fulfilment, external account creation, and ongoing hosting state can succeed or fail independently. Historical purchase details must survive catalogue changes, retries must not duplicate accounts, and destructive operational state must be attributable.
- **Consequence:** Payment may move an order to `PAID`, but never creates or activates a service by itself. A paid order moves through `PROCESSING` and reaches `COMPLETED` only when all its order items have active services. Order-item and server row locks protect duplicate creation and account-capacity decisions. Command 14 records manual outcomes only; provider calls, operation retry classification, and external consistency checks begin behind the hosting-panel adapter in Command 15.

## ADR-023 — Durable Hosting Operations and Separate Provider Domains

- **Status:** Accepted
- **Date:** 2026-08-25
- **Decision:** Use cPanel/WHM as the only hosting-panel provider and UK2Group as a separate future domain-registrar provider. Put hosting actions behind a provider-neutral `HostingPanel` contract and persist every attempt as a fingerprinted, idempotent operation with safe result/error evidence. Enable only `FakeHostingPanel` in Command 15.
- **Reason:** Hosting-account operations and registrar operations have different resources, credentials, failure ambiguity, and lifecycle effects. External mutations can time out after succeeding, so a generic retry loop or a shared "panel" credential would risk duplicate accounts, accidental domain actions, and secret exposure.
- **Consequence:** Command 16 implements cPanel/WHM only after reviewing current official documentation. UK2Group requires a separate registrar contract, domain data/workflows, test mode, credentials, and later explicit authorization. Hosting mutations receive no automatic retry; temporary failures allow bounded deliberate retry, while timeouts/inconsistent results require reconciliation. Passwords, credentials, raw responses, and login URLs are never persisted in operation history.

## ADR-024 — WHM API Tokens and Verified cPanel Mutations

- **Status:** Accepted
- **Date:** 2026-08-26
- **Decision:** Implement cPanel/WHM with WHM API 1 over certificate-validated HTTPS on port 2087 or 443, authenticated only by a scoped WHM API token. Store the token as AES-256-GCM ciphertext bound to the server UUID under the versioned `cpanel-token-v1` key context. Verify account creation and every later mutation with `accountsummary` before changing internal service state.
- **Reason:** WHM API tokens are revocable, expirable, IP-restrictable, and privilege-scoped, while passwords and access hashes carry unnecessary authority. A successful transport response alone does not prove the intended account identity or final state.
- **Consequence:** The adapter key is `cpanel-whm`; redirects, plaintext WHM ports, malformed/oversized responses, unexpected login hosts, and missing credentials fail safely. Exact existing accounts make provisioning idempotent. Network, timeout, `5xx`, and post-mutation verification uncertainty are held for reconciliation. Token rotation requires re-entry and creates an audit record; plaintext tokens, raw responses, passwords, and session URLs are never persisted or returned from configuration endpoints.

## ADR-025 — PostgreSQL Outbox Before BullMQ Delivery

- **Status:** Accepted
- **Date:** 2026-08-26
- **Decision:** PostgreSQL `OutboxEvent` rows are the durable background-work handoff. A dedicated worker claims due/stale rows with leases and `FOR UPDATE SKIP LOCKED`, then adds reference-only BullMQ jobs with deterministic IDs. Mark an event published only after Redis accepts the job. Apply per-queue bounded exponential retry; give hosting mutations one automatic attempt and use BullMQ unrecoverable classification for permanent/inconsistent failures.
- **Reason:** Redis cannot participate in the business transaction, job payloads are cleartext, and an external mutation can time out after succeeding. Publishing after commit without an outbox can lose work; retrying mutations blindly can duplicate accounts or service changes.
- **Consequence:** Seven queues have explicit names/policies. Redis contains UUID references and safe classification only, while PostgreSQL retains full event context. Dispatcher crashes are recovered through stale leases plus deterministic IDs. Redis must run as a durable no-eviction queue backend; local AOF uses `appendfsync always`. Failed jobs/outbox rows remain visible to administrators; only explicitly temporary jobs or recognized failed publications can be manually retried and each retry is audited. SMTP/renewal/hosting business consumers are registered only by their later authorized commands.

## ADR-026 — Trusted Queued Email Delivery With Conservative Uncertainty

- **Status:** Accepted
- **Date:** 2026-08-25
- **Decision:** Deliver transactional email from the BullMQ worker through a provider-neutral SMTP/preview adapter. Load reference-only outbox events from PostgreSQL, decrypt authentication action tokens only while resolving a message, HTML-escape typed template models, and persist one idempotent `EmailLog` plus append-only `EmailAttempt` evidence. Treat a lost/unknown SMTP outcome or an abandoned `SENDING` attempt as inconsistent and do not blindly resend it.
- **Reason:** Email failure must not roll back a financial or service transaction, Redis and logs must not become secret stores, and SMTP can lose the final acknowledgement after accepting a message. Retrying that uncertain boundary can duplicate customer communication.
- **Consequence:** Temporary pre-submission failures receive at most five exponential attempts; permanent and inconsistent failures stop. Every message uses a deterministic outbox-based `Message-ID`, but this identifier is investigation evidence rather than delivery proof. Development writes private RFC `.eml` previews; production requires SMTP, HTTPS links, and certificate-validated TLS. Renewal and ticket templates exist before their Command 19/20 producers.

## ADR-027 — Business-Date Renewal Cycles and Invoice-Linked Suspension

- **Status:** Accepted
- **Date:** 2026-08-25
- **Decision:** Run renewal scheduling in one dedicated Nest application-context process. Derive one daily key in a configurable IANA business timezone under a PostgreSQL advisory lock, persist an `AutomationRun` and outbox request atomically, and make each invoice, reminder, overdue transition, payment application, and hosting request independently idempotent. Link an automated service suspension to the exact overdue invoice that caused it.
- **Reason:** UTC instants cross business dates differently, delayed/repeated jobs are normal, concurrent schedulers must not duplicate financial documents, and a later payment must never reactivate a manual or unrelated suspension. A remote WHM mutation can succeed while its acknowledgement or local commit fails.
- **Consequence:** Renewal periods use UTC month-clamping and a partial unique service/period invoice-line index. Database-safe renewal jobs have bounded retries, while cPanel mutations have one attempt and require verified account state before local changes. Unknown hosting outcomes remain inconsistent. Full verified payment advances the due date and requests unsuspension only for the matching suspension invoice. Initial-release automation has no termination event or handler.

## ADR-028 — Plain-Text, Ownership-Bound Support Conversations

- **Status:** Accepted
- **Date:** 2026-08-25
- **Decision:** Keep support as one customer-owned queue with optional owned-service context, append-only plain-text messages, four explicit conversation states, administrator assignment/priority controls, and message-keyed reply email events. Use client-generated UUIDs as ticket/reply IDs for exact retry idempotency and exclude attachments from the initial release.
- **Reason:** A private hosting business needs reliable conversation history and fast queue ownership without the file-handling, department, SLA, or permission complexity of a general help desk. Ticket URLs and user-supplied markup are untrusted, while network retries must not duplicate messages or notifications.
- **Consequence:** Customer identity always comes from the session and every detail/reply enforces ownership in the application service. Strict schemas reject HTML-like and attachment-shaped input; React text rendering and email escaping provide independent output defenses. Closed tickets require administrator reopening. Administrator changes and replies are audited without bodies, and customer/staff reply emails use the transactional outbox without rolling back the conversation on delivery failure.

## ADR-029 — Typed Settings and Provider-Bound Credential Encryption

- **Status:** Accepted
- **Date:** 2026-08-25
- **Decision:** Store strict non-secret business configuration in categorized `Setting` JSON records, while storing complete bKash/SSLCOMMERZ bundles in a separate `IntegrationCredential` table encrypted with provider-bound AES-256-GCM. Keep cPanel tokens server-scoped and SMTP authentication deployment-scoped. Allocate configurable sequential invoice numbers under a PostgreSQL row lock.
- **Reason:** Billing rules must have one visible source of truth, while credentials have different access, masking, rotation, and recovery requirements. Provider secrets must never be serialized to the browser, logs, audit metadata, or queue payloads. Sequential financial identifiers require concurrency control rather than random presentation numbers.
- **Consequence:** The administrator settings API atomically validates and audits ordinary settings. Credential replacement is write-only, confirmed, and returns only status/masked identifiers. Online checkout activation requires a configured gateway and HTTPS callback origin; inactive configured providers remain available for callbacks/reconciliation. Business and renewal time zones stay aligned, email rendering reloads typed branding, and customer-visible manual-payment instructions have a separate safe endpoint. This ADR supersedes ADR-018's random invoice-number presentation rule without changing invoice immutability or idempotent submission keys. Master-key rotation is planned maintenance requiring re-entry of all encrypted bundles/tokens.

## ADR-030 — Transaction-Sourced Operational Reporting

- **Status:** Accepted
- **Date:** 2026-08-25
- **Decision:** Build the administrator dashboard directly from authoritative PostgreSQL financial and workflow states. Calculate selected-period revenue from successful charge/refund/reversal transactions at `verifiedAt`, keep current queue and balance metrics explicitly separate, and derive calendar boundaries from the configured IANA business timezone. Provide only administrator-authorized, audited CSV exports with bounded rows and spreadsheet-injection protection.
- **Reason:** Invoice totals do not prove collected cash, browser redirects do not prove settlement, historical refunds must remain visible, and mixing period metrics with current workflow counts creates misleading comparisons. CSV is sufficient for this private business without introducing a data warehouse or BI subsystem.
- **Consequence:** Cancelled/draft invoices and non-successful payments are excluded by state; successful refunds/reversals subtract without rewriting charges. Monetary JSON remains string-serialized integer minor units, including signed net revenue. The dashboard mixes no currencies and exposes freshness/timezone. Report creation is a CSRF-protected mutation with a safe audit record; secrets, proof/provider payloads, tax identifiers, and control-panel credentials are never exported. Historical multi-currency analysis, scheduled reports, forecasting, tax reports, and general report builders remain outside the MVP.

## ADR-031 — Deterministic PDFs From Authorized Invoice Snapshots

- **Status:** Accepted
- **Date:** 2026-08-25
- **Decision:** Generate invoice PDFs synchronously in the API from the ownership-checked serialized invoice contract. Reject drafts, embed local Latin/Bengali fonts, derive metadata dates from persisted invoice timestamps, and keep the renderer free of clock, random, network, and internal-identifier inputs.
- **Reason:** Customers and administrators need a stable printable artifact whose financial values match the authoritative invoice. Remote assets, browser-only rendering, or database identifiers would weaken reproducibility, privacy, and operational reliability.
- **Consequence:** The same serialized invoice produces byte-identical PDF bytes. Issued identity/items stay historically fixed, while legitimate append-only payments, credits, refunds, and status changes appear when the current invoice is downloaded. The raw private response contains human-facing invoice/order numbers only; customer ownership remains enforced before rendering, and editable drafts have no downloadable PDF.

## ADR-032 — Step-Up Administrator Authentication and Layered HTTP Trust

- **Status:** Accepted
- **Date:** 2026-08-26
- **Decision:** Add optional administrator RFC 6238 TOTP with encrypted secrets, hashed one-use recovery codes, short-lived source-bound login challenges, and atomic accepted-time-step replay protection. Combine it with idle session expiry, origin/fetch-metadata-aware signed CSRF, exact HTTPS production origins, security headers, pinned provider redirects, and public-address cPanel DNS preflight.
- **Reason:** Password-only administrator access has disproportionate authority over billing, payments, customer data, and hosting. Cookies, redirects, callbacks, and administrator-configured external hosts cross different trust boundaries and require independent controls; a successful browser/provider navigation or a syntactically valid URL is not proof of trust.
- **Consequence:** Enrolled administrators receive no session until a second factor is consumed. Enrollment/disable/recovery rotation require reauthentication and revoke affected sessions, while MFA state and failures are auditable without codes or secrets. API/web production deployments require exact secure origins and layered headers. Checkout/panel URLs and cPanel destinations fail closed outside approved hosts, protocols, ports, and public resolution. Production still needs outbound firewall policy because application DNS preflight cannot alone eliminate rebinding.

## ADR-033 — Executable Critical-Invariant Evidence Matrix

- **Status:** Accepted
- **Date:** 2026-08-26
- **Decision:** Maintain one focused `pnpm test:invariants` command that composes the authoritative shared-contract, integer-money, PostgreSQL API integration, and renewal-worker tests for the thirteen release-critical business invariants. Keep a documented matrix from each invariant to named regression evidence, and run the composed suite repeatedly when changing financial, provisioning, authorization, scheduler, or retry behavior.
- **Reason:** These guarantees cross module and process boundaries. A test buried in an individual feature suite is easy to miss during a later change, while copying all scenarios into one large test file would create competing fixtures and weaken the existing realistic integration coverage.
- **Consequence:** The focused suite intentionally reuses the owning module tests and local fake providers, with real PostgreSQL and Redis where the boundary requires them. It makes no external payment, SMTP, registrar, or WHM request. A change to any listed invariant must update both its owning regression test and `docs/CRITICAL_BUSINESS_INVARIANTS.md`; passing unit tests alone is insufficient for concurrency, replay, ownership, state-separation, and scheduler guarantees.

## ADR-034 — Isolated Sequential Browser Lifecycle

- **Status:** Accepted
- **Date:** 2026-08-26
- **Decision:** Maintain one sequential Playwright Chromium lifecycle for the twelve Command 26 customer/administrator workflows. Recreate a dedicated `command26_e2e` PostgreSQL schema for every run, use separate loopback API/web ports and Next.js output, seed only fictional data and fake providers, and execute the real renewal and hosting automation services at controlled business instants.
- **Reason:** The release-critical journey crosses browser routing, secure cookies, CSRF, API authorization, financial settlement, PostgreSQL state, and worker-owned automation. Module tests cannot prove those boundaries compose into a usable workflow, while live provider calls or shared development data would make the suite unsafe and nondeterministic.
- **Consequence:** `pnpm test:e2e` runs with one worker and retains traces, screenshots, and video only on failure. The PostgreSQL adapter must honor the URL `schema` parameter for runtime queries, not only Prisma migrations. Browser payment still requires an authenticated signed fake callback, provisioning remains distinct from payment, and wrong termination confirmation must preserve the active service. Real-provider acceptance and parallel/sharded browser suites remain separately authorized work.

## ADR-035 — Redacted Correlation and Split Liveness/Readiness

- **Status:** Accepted
- **Date:** 2026-08-26
- **Decision:** Emit one structured JSON record per application event through a shared fail-safe redactor, correlate HTTP requests and background jobs with UUIDs, and record only safe payment event identifiers. Keep dependency-free liveness separate from bounded PostgreSQL/Redis readiness. Aggregate administrator-only operational metrics from retained BullMQ, outbox, automation, payment, hosting, and email evidence.
- **Reason:** Operators need to connect API, worker, scheduler, and provider failures without placing credentials or sensitive payloads into a second data store. Process survival and ability to accept traffic are different questions, while financial and hosting uncertainty requires durable business evidence rather than browser redirects or generic uptime alone.
- **Consequence:** `/health` can remain up while `/ready` returns `503`; neither endpoint exposes topology or error details. `X-Request-ID` accepts UUIDs only, request logging omits queries/bodies/headers/cookies, and job logs carry reference-only correlation. Provider totals and retained failed counts are investigation signals, not authorization for blind retries. Deployment monitoring must implement the wake/business-hours thresholds in `docs/OBSERVABILITY.md`; no third-party alert destination is selected in this command.

## ADR-036 — Streamed Encrypted Logical Backups and Isolated Recovery

- **Status:** Accepted
- **Date:** 2026-08-26
- **Decision:** Create PostgreSQL custom-format dumps through the matching Compose PostgreSQL client and stream them directly into OpenPGP symmetric AES-256 encryption. Verify checksum, encrypted integrity, archive structure, and required tables before acceptance. Restore only into a new explicitly confirmed database with the `webhost_billing_restore_` prefix, then compare migration history, row counts, relationships, and financial invariants before any cutover.
- **Reason:** The database contains financial history, customer data, authentication state, and encrypted provider authority. A plaintext dump or untested backup creates a second breach surface and false recovery confidence, while overwriting an active/failed database destroys rollback and forensic options.
- **Consequence:** Backup keys remain separate from data and the database host; deployment secrets/roles are recovered from protected configuration rather than the dump. Migrations remain forward-only, and incompatible rollback uses an isolated pre-migration restore plus deliberate connection cutover. PostgreSQL recovery does not prove Redis/BullMQ recovery: lost published jobs and uncertain external mutations require evidence-based reconciliation, never bulk blind replay. The initial six-hour RPO/four-hour RTO and retention baseline remain subject to final infrastructure, legal, and business approval.

## ADR-037 — Single-Host Non-Root Compose With Split HTTPS Origins

- **Status:** Accepted
- **Date:** 2026-08-26
- **Decision:** Package the initial release as non-root API, standalone web, worker, dedicated scheduler, one-shot migration, and Nginx images in a single-host Docker Compose topology. Expose only Nginx on 80/443, use separate billing/API HTTPS hostnames, keep PostgreSQL/Redis on private networks with persistent volumes, inject secrets from mounted files, and require a reviewed manual migration before application cutover.
- **Reason:** The private business needs a reproducible deployment smaller than an orchestrator/microservice platform while preserving clear process isolation, cookie/origin rules, queue durability, TLS termination, and operator control over schema changes. Application configuration intentionally accepts origins without path prefixes, so distinct hostnames avoid weakening callback/CORS validation.
- **Consequence:** The web image is bound to its API origin at build time and must be rebuilt when that hostname changes. Only Nginx publishes host ports; forwarded headers are replaced and the API trusts one hop. Application filesystems are read-only, images use explicit unprivileged users, logs rotate locally, and Redis uses authenticated AOF/no-eviction configuration. Named volumes are persistence rather than backup, migrations remain forward-only, and production still requires approved infrastructure, SMTP/TLS/DNS/secrets/monitoring/off-site backups plus the Command 30 release audit. cPanel port ownership makes a dedicated VPS preferable to an unmanaged side-by-side install on the existing WHM host.

## ADR-038 — Local Release Gate Before Credentialed Staging

- **Status:** Accepted
- **Date:** 2026-08-26
- **Decision:** Treat the successful Command 30 local audit as approval for an explicitly authorized staging deployment, not as production launch approval. Require staging evidence for real infrastructure, SMTP, selected sandbox payment providers, and the cPanel development boundary before any production decision. Keep UK2Group outside this release.
- **Reason:** Mock/fake-provider evidence can prove local authorization, idempotency, accounting, state, build, migration, and recovery behavior, but it cannot prove credentials, network policy, third-party account permissions, TLS/DNS, alert delivery, off-site backups, or provider-version behavior. The full plan also retains minor interface/policy gaps that must be accepted or completed rather than hidden by a green test suite.
- **Consequence:** The release is a staging candidate with a production `NO-GO`. Command 31 requires an identified staging target, externally supplied secrets, backup/rollback ownership, and a reviewed action list. Production remains blocked until credentialed staging acceptance, monitoring/alerting, off-site recovery controls, final business policies, and the documented release-checklist gaps are resolved or explicitly accepted.

## ADR-039 — Isolated Shared-Host Staging With a Same-Origin Edge

- **Status:** Accepted
- **Date:** 2026-08-26
- **Decision:** Deploy staging as the isolated `webhost-billing-staging` Compose project under `/srv/webhost-billing-staging`, publish only loopback web/API ports, retain private PostgreSQL/Redis/Mailpit networks, and route selected API prefixes plus the web application through the existing host Nginx on the single HTTPS origin `my.speedhost.bd`. Keep all real providers disabled until separately authorized credentials and mutation limits are supplied.
- **Reason:** The authorized server already runs several important applications and its host Nginx owns ports 80/443. A dedicated project name, directories, ports, volumes, secrets, and graceful Nginx site addition prevent name/port collisions and avoid a second public edge. The application accepts a same-origin API URL, while the explicit route allowlist preserves the frontend invoice-print exception.
- **Consequence:** Staging is reachable at one HTTPS hostname and its seven containers can be operated without global Docker, firewall, or Nginx actions. Existing public applications and containers must be checked before and after every staging mutation. The Mailpit certificate copy needs a targeted refresh after certificate renewal. This shared-host exception does not supersede the dedicated-VPS production preference, and local encrypted backup evidence does not satisfy the off-site immutable-backup requirement.

## ADR-040 — Evidence-Gated Production Launch and One-Time Administrator Bootstrap

- **Status:** Accepted
- **Date:** 2026-08-26
- **Decision:** Keep production at `NO-GO` until every target, recovery, secret, DNS/TLS, communication, SMTP, monitoring, business-policy, provider-mode, and first-renewal gate has a named owner and linked evidence. Permit a manual-first launch only through explicit owner acceptance with online gateways and/or cPanel inactive. Create the first administrator through a confirmation-gated one-time utility that refuses an existing administrator/email, reads a protected password file, uses the application Argon2id profile, and writes an audit record.
- **Reason:** Command 31 proved the core stack with fictional data but did not establish production infrastructure or credentialed external behavior. A small private business can start with reviewed manual payments/provisioning, but untested integrations must never become implicit launch dependencies. Public registration cannot create an administrator, while running the development seed or silently upserting a privileged user would be unsafe.
- **Consequence:** Command 32 makes no production mutation and does not authorize launch. The final runbook has mandatory stop conditions, staged scheduler activation, exact owner/evidence records, and scoped rollback. The bootstrap utility works only for an empty administrator boundary, never prints the password, and must be followed by password-file removal and TOTP enrollment. bKash/SSLCOMMERZ production use, credentialed cPanel automation, SMTP, off-site recovery, and alert delivery remain separate gates.

## ADR-041 — Owner-Selected Shared-Host Production Exception Remains Evidence-Gated

- **Status:** Accepted
- **Date:** 2026-08-26
- **Decision:** Accept the owner's explicit choice to evaluate the current
  `my.speedhost.bd` shared host for this personal, low-traffic production deployment, using
  one same-origin web/API edge. Preserve project/directory/network/volume/port isolation and
  keep production `NO-GO` until the Command 34 audit's SSH, firewall, patching, encryption,
  backup/recovery, resource-limit, provider/cost, and named-owner findings have evidence.
- **Reason:** The observed six-vCPU, 11.68-GiB host has adequate current capacity and already
  runs the isolated staging project, while the owner does not want a separate VM. However,
  the server also runs important Nodewatch, RemotePilot, database, proxy, and RustDesk
  workloads. Low application traffic reduces capacity demand but does not reduce root,
  firewall, disk, provider-account, backup, or shared-daemon blast radius.
- **Consequence:** This owner exception supersedes ADR-006's separate-infrastructure
  preference and ADR-037's split-origin requirement only for the named bounded deployment;
  it does not supersede security or release gates. Command 34 made no server change and did
  not promote fictional staging data. Any later production work must be explicitly
  authorized, project-scoped, rollback-reviewed, and preceded by the missing evidence.
  Global Docker/Nginx/firewall/package operations remain prohibited without a separately
  audited shared-host maintenance window.

## ADR-042 — Apache-2.0 Public Project With Single-Business Scope

- **Status:** Accepted
- **Date:** 2026-09-30
- **Decision:** Publish Webhost Billing as an open-source project under the Apache License 2.0 while retaining `private: true` in workspace packages to prevent accidental npm publication. Accept contributions under the same inbound license, maintain public security/support/conduct/governance policies, and distribute official releases only through reviewed, versioned, traceable artifacts. Keep the application designed for one hosting business per installation.
- **Reason:** A public GitHub repository without a license grants no general right to use, modify, or redistribute the code. Apache-2.0 enables free personal and commercial adoption with explicit patent terms and preserved notices, while project governance and release controls establish safe contribution and distribution boundaries for security- and finance-sensitive software.
- **Consequence:** Repository metadata, documentation, packages, and official source releases use SPDX identifier `Apache-2.0`; third-party components retain their own licenses and require release-time notice/SBOM review. Public source availability does not authorize probing hosted installations, does not make a hosted service free, does not grant project trademark endorsement, and does not relax production evidence gates. Pre-1.0 releases remain alpha until the complete release gate passes.

## ADR-043 — Immutable Source-Only First Alpha

- **Status:** Accepted
- **Date:** 2026-09-30
- **Decision:** Publish `v0.1.0-alpha.1` as a source-only GitHub prerelease with Git-generated `.tar.gz` and `.zip` archives, complete and production-only CycloneDX 1.7 SBOMs, SHA-256 checksums, and GitHub's immutable-release attestation. Keep every workspace package private and publish no npm package, container image, `latest` tag, or deployment.
- **Reason:** The public project needs a verifiable evaluation snapshot without implying that the separately blocked production gates have passed. Draft-first immutable publication prevents later tag or asset replacement, while two dependency views make both build-time and runtime review possible.
- **Consequence:** The release tag and assets cannot be changed after publication. Corrections require a new version. The tagged release stays an alpha evaluation candidate with production `NO-GO`; external providers, production infrastructure, DNS, live data, and hosted applications remain untouched and separately authorized.

## ADR-044 — AI-Assisted Technical-Preview Positioning

- **Status:** Accepted
- **Date:** 2026-09-30
- **Decision:** Present Webhost Billing as an AI-assisted, open-source technical foundation developed through a documented human-directed and human-reviewed Codex workflow. Keep Webhost Billing as the product identity, state that the application has no current AI runtime or AI-powered billing behavior, disclose that it is independent and not endorsed by OpenAI, and display a prominent not-for-live-use warning while production remains `NO-GO`.
- **Reason:** The development process is a meaningful and transparent part of the project, but calling the application "AI-powered" would imply runtime capabilities it does not contain. Clear human review, authority, evidence, and readiness boundaries let the project share its AI-assisted work path without misleading evaluators or confusing development attribution with product functionality or endorsement.
- **Consequence:** Public descriptions may use "AI-assisted technical preview," "developed with a human-directed, human-reviewed Codex workflow," and similar accurate language. They must not claim production readiness, autonomous engineering authority, an OpenAI partnership, sponsorship, or embedded AI features unless separately implemented and documented. Each command remains human-authorized, every accepted change remains human-reviewed, validations remain inspectable, and live providers, data, deployments, costs, and destructive actions require explicit approval.

## ADR-045 — Loopback-Only Fictional Evaluation Stack

- **Status:** Accepted
- **Date:** 2026-09-30
- **Decision:** Provide one evaluator command that builds production-shaped web/API images, migrates and idempotently seeds a dedicated fictional PostgreSQL database, generates local credentials, and exposes a same-origin gateway only on `127.0.0.1:3100`. Keep the Compose network internal and omit workers, the scheduler, SMTP, payment gateways, and hosting providers.
- **Reason:** Public adoption needs a reproducible path that demonstrates real application boundaries without asking evaluators to configure secrets or creating a route to real external mutations. A separate demo topology is easier to reason about and safer than reusing development or production state.
- **Consequence:** Demo bootstrap refuses any non-demo database identity, runtime values remain Git-ignored, screenshots are generated from authenticated fictional journeys, and evaluator documentation distinguishes visible, implemented-but-disabled, unaccepted, and out-of-scope capabilities. Loopback HTTP is permitted only for this isolated demo; it does not relax production HTTPS, credential, provider, staging, backup, monitoring, MFA, or operator gates, and production remains `NO-GO`.

## ADR-046 — Read-Only Redacted Demo Preflight

- **Status:** Accepted
- **Date:** 2026-10-01
- **Decision:** Provide `demo:doctor` as a Node.js-only, cross-platform preflight that inspects Docker CLI and Compose versions, Docker Engine reachability, loopback port `3100`, and runtime-file metadata. Keep its output fixed and redacted, never read runtime-file contents or expose raw command errors, and perform no Docker or filesystem mutation. Treat a missing runtime file as normal first-run information because `demo:up` creates it.
- **Reason:** Evaluators need actionable prerequisite diagnostics before an expensive image build, but support output must not leak generated secrets or turn a diagnostic command into another lifecycle controller. A Node.js entrypoint behaves consistently from PowerShell and Unix-like shells without requiring platform-specific scripts.
- **Consequence:** Any failed prerequisite exits non-zero with a controlled remediation. A busy port is reported as a failure even when the existing safe demo owns it; `demo:status` remains the correct command for inspecting a running stack. Focused tests inject command and port outcomes, prove sensitive output is discarded, and run in the ordinary repository test gate.

## ADR-047 — Confirmation-Gated Dedicated Demo Reset

- **Status:** Accepted
- **Date:** 2026-10-01
- **Decision:** Provide `demo:reset` only behind the exact `--confirm-reset-demo` flag. Validate fixed canonical repository paths before Docker, refuse target overrides, symbolic links, and non-regular runtime paths, pin Docker calls to the built-in local `default` context, then remove and verify only the fixed `webhost-billing-demo` Compose project's containers, networks, and volumes before revalidating and unlinking the exact generated runtime file.
- **Reason:** Evaluators need a supported route back to first-run fictional state, but reset is destructive and must not become a generic Docker cleanup tool or gain authority over development, staging, production, providers, or arbitrary filesystem targets. Preserving credentials until Docker cleanup is confirmed keeps retained state usable when cleanup fails or is uncertain.
- **Consequence:** `demo:down` remains the normal non-destructive stop path. Reset captures and redacts Docker/filesystem failures, is idempotent when dedicated state is absent, retains cached images, accepts no path/project/context override, and requires `demo:up` to generate new fictional data and credentials. It does not change production `NO-GO` or the immutable alpha release.

## ADR-048 — Side-Effect-Free Safe-Demo Inspection Boundary

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decision:** Require `demo:credentials`, `demo:status`, `demo:logs`, and `demo:down` to validate an existing readable, regular, non-symbolic-link runtime file before Docker dispatch. Pin Docker to the dedicated local context, project, project directory, environment file, and Compose file; capture failures without raw output; and make logs a redacted, no-color, non-following snapshot capped at the latest 100 lines.
- **Reason:** Inspection and ordinary stop commands must not manufacture credentials or state simply because an evaluator asked what exists. Finite captured output is safer to review and report than an indefinite raw log stream, while explicit targeting prevents ambient Compose or Docker variables from broadening authority.
- **Consequence:** `demo:up` remains the ordinary lifecycle entrypoint that creates missing runtime state. Missing or unsafe runtime paths produce fixed remediation before Docker, `demo:down` retains fictional volumes and credentials, and the guarded reset/doctor/smoke contracts remain unchanged. Successful credentials output remains an explicit local operator action and must never be shared. Production remains `NO-GO`.

## ADR-049 — Offline Safe-Demo Screenshot Asset Contract

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decision:** Keep one repository-owned JSON contract for the four reviewed safe-demo screenshot identities, roles, capture widths/viewports, bounded output heights and byte sizes, and canonical-guide references. Require both Playwright capture and a Node.js offline validator to consume that contract. Validate only regular non-symbolic-link files canonically confined to the repository, Git tracking, PNG signature/IHDR dimensions, unique identities, and guide references.
- **Reason:** Local Markdown link checks prove only that an asset path exists; they cannot detect malformed, untracked, oversized, wrongly sized, duplicated, or undocumented screenshot replacements. A header-only offline gate catches those objective errors without authenticating to the demo or introducing browser, Docker, network, OCR, or visual-regression authority.
- **Consequence:** Ordinary CI runs the live asset check before application validation, and focused fixtures cover unsafe metadata and replacement cases. The validator reads only metadata and the first 24 PNG bytes and never regenerates or decodes an image. Pixel quality, fictional content, legibility, and sensitive-data review remain explicit human responsibilities; production remains `NO-GO`.

## ADR-050 — Fixed Offline Documentation Validation Aggregate

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decision:** Make `docs:check` the canonical ordinary documentation gate and
  dispatch exactly the four repository-owned link/anchor, contributor-path,
  issue-form, and safe-demo screenshot-asset validators in a fixed sequence. Emit
  deterministic pass/fail evidence, return the first failing child status, stop
  later work, and discard raw child output and non-allowlisted environment values.
- **Reason:** Contributors and CI need one discoverable cross-platform check without
  duplicating shell chains or hiding which bounded validator failed. Fixed dispatch
  and safe output handling preserve the offline security boundary while focused
  commands retain detailed diagnostics.
- **Consequence:** Ordinary CI and general contributor guidance use `docs:check`;
  the four focused commands and their tests remain available in the change-path map.
  The aggregate accepts no command input and cannot run formatting, application
  tests, Docker, browsers, network crawling, or arbitrary tasks. Production remains
  `NO-GO`.

## ADR-051 — Workflow-Led Product Benchmarking Without WHMCS Parity

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decision:** Improve Webhost Billing from observed single-business operator and
  customer jobs. Current official public WHMCS documentation may be used as a
  workflow-concept benchmark, but competitor feature count, screen structure, code,
  copy, assets, styling, trade dress and proprietary behavior are not requirements
  or source material.
- **Reason:** The repository already implements the core billing and hosting
  boundaries; the next quality risk is fragmented or misleading product experience,
  not absence of a large feature list. Workflow evidence keeps improvements tied to
  common hosting-business work while protecting the project's smaller scope and
  independent identity.
- **Consequence:** Command 75 must inspect the live fictional product and produce a
  prioritized, evidence-backed roadmap plus three separately gated implementation
  commands. Each adopted idea must map to a Webhost Billing user job, safety
  invariant and test route. WHMCS parity, copying and speculative breadth remain
  explicit non-goals; production remains `NO-GO`.

## ADR-052 — Journey Repair Before Product Breadth

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decision:** Start the first product-experience implementation set with an honest
  public storefront and available-price default, actionable administrator customer
  context, and an ownership-bound customer next-action overview. Keep core-ledger
  scale/search, workspace chrome, order/payment review, service-focused operations,
  and automation freshness as explicit P1 follow-on work rather than expanding any
  one of Commands 76–78.
- **Reason:** Live fictional review found complete business primitives behind several
  disconnected or misleading journeys: the public header targets a root route that
  redirects to login, the catalogue initially selects an unavailable price period,
  administrator customer history is unlinked and uses raw minor-unit wording, and
  the portal makes customers infer billing and renewal urgency from counts and recent
  records. These high-frequency problems have ready dependencies and bounded test
  paths, while combining all navigation/search/attention work would create an
  oversized and weakly reviewable change.
- **Consequence:** Command 75 changes no product behavior. Commands 76–78 remain
  separately authorized and must preserve role/ownership checks, server-authoritative
  money, immutable financial history, separate payment/provisioning states, fake
  provider evidence, and exact permanent-termination confirmation. Inactive workspace
  search/notification chrome, fixed first-100 ledgers, automation freshness, and
  financial-policy confirmation remain recorded roadmap work, not silently accepted
  limitations. Production remains `NO-GO`.

## ADR-053 — Server-Derived Ownership-Bound Portal Actions

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decision:** Give the customer portal a dedicated customer-only, ownership-guarded
  summary that derives outstanding invoices, the next active or suspended service,
  and support responsibility from the complete owned account. Keep the ten-record
  lists as secondary context only. Serialize money losslessly, never combine
  outstanding currencies, and treat payment, suspended service, and customer reply
  as actions while active renewal and staff-owned support remain informational.
- **Reason:** A recent-record list cannot safely answer whether older invoices are
  unpaid or which customer obligation comes next. Deriving those facts in the API
  prevents the browser from becoming an accounting authority and prevents a newer
  paid invoice from hiding a real overdue balance.
- **Consequence:** `/customers/:customerId/portal-summary` is unavailable to
  administrators and other customers, and mixed outstanding currencies fail closed
  as an internal consistency error. The portal has explicit attention, healthy,
  first-use empty, loading, and failure states with direct permitted links. This is
  read-only product guidance; it changes no invoice, payment, service, ticket,
  provider, deployment, or production-readiness rule. Production remains `NO-GO`.

## ADR-054 — Financial Policy Confirmation Before Workflow Expansion

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decision:** Make the partial-payment rule the next bounded product-experience
  change. Remove its duplicate one-click mutation from the payment ledger, keep one
  canonical settings workflow, and require an explicit current-to-proposed
  consequence review plus fixed confirmation at every API route that can change the
  persisted value. Do not require confirmation when the stored policy is unchanged.
- **Reason:** Commands 76–78 repaired three high-frequency journeys without changing
  business state. The remaining roadmap contains several useful workflow and scale
  improvements, but the partial-payment toggle is the only identified one-click
  financial-policy shortcut. Its current API paths are already role-protected and
  audited, so a server-enforced transition guard is high-risk reduction with ready
  dependencies and a bounded test surface.
- **Consequence:** Command 79 must prove both settings write paths cannot bypass the
  confirmation, preserve safe old/new audit evidence, and leave existing invoices,
  payments, pending references, balances, and gateway behavior unchanged. Connected
  order/payment review, ledger pagination, dashboard attention, automation freshness,
  service context, checkout continuity, and inactive workspace chrome remain
  separately gated P1 work. Production remains `NO-GO`.

## ADR-055 — Allowlisted Checkout Intent Without General Return Navigation

- **Status:** Accepted
- **Date:** 2026-10-03
- **Decision:** After reviewing the delivered partial-payment safeguard, make one
  bounded anonymous catalogue-to-customer-sign-in handoff the next product slice.
  Carry only a validated product/price UUID pair and reconstruct the fixed local
  checkout route. Keep same-browser login/register links connected, but retain
  normal role-derived landings when intent is absent or invalid and always send
  administrators to their own workspace. Treat missing and expired sessions alike.
- **Reason:** The catalogue already emits exact selection identifiers, but the
  proxy and authoritative session guard discard them at sign-in and the login form
  always sends customers to the portal home. Checkout also silently falls back to
  the first product/price when an explicit selection no longer matches. This breaks
  the core purchase journey for prospective customers and can replace their intended
  plan. Existing catalogue and order boundaries make it a focused, testable repair.
- **Consequence:** Command 80 remains separately gated. It must reject arbitrary
  return destinations, validate the current catalogue, show explicit unavailability
  rather than silently substituting a plan, and place no order until deliberate
  submission. Authentication, account verification, MFA, role/ownership enforcement,
  pricing, idempotency, and payment/provisioning separation remain unchanged. A
  general redirect framework, durable/cross-device intent, email/reset-link resume,
  guest checkout, schema changes, providers, deployments, and other P1 gaps are
  excluded. Production remains `NO-GO`.

## ADR-056 — URL-Bound Ownership-Safe Customer Invoice History

- **Status:** Accepted
- **Date:** 2026-10-04
- **Decision:** After reviewing Command 80, select one customer invoice-ledger
  slice: URL-bound search, status, page and bounded page size using the existing
  customer-only `/invoices/my` endpoint and its authoritative pagination metadata.
  Keep customer identity exclusively session-derived. Validate only those four
  query fields and reconstruct only fixed local ledger links; provide honest empty,
  invalid, out-of-range, loading and recoverable failure states.
- **Reason:** The customer can now reach the intended checkout safely and has a
  server-derived next-action home, but `CustomerInvoiceList` still requests a fixed
  first 100 invoices and discards response pagination. Older order and renewal
  invoices become unreachable from that ledger despite an existing searchable,
  status-filtered, deterministically ordered, ownership-bound API. A single read-only
  ledger repairs a recurring hosting-business task without broadening billing rules.
- **Consequence:** Command 81 is defined, not authorized or implemented by this
  review. It must prove histories larger than 100, isolated pagination metadata,
  safe URL restoration and stale-response handling, and zero browsing mutations.
  Counts refer to matching records, not account-wide balances. Other ledgers,
  general search/list frameworks, aggregates, cross-record workflows, financial
  mutations, schema/authentication changes, providers, releases and deployments
  remain excluded. Production remains `NO-GO`.

## ADR-057 — Read-Only Administrator Order Review With Existing Record Context

- **Status:** Accepted
- **Date:** 2026-10-04
- **Decision:** After reviewing Command 81, define one administrator order-workspace
  slice: an explicitly selected read-only review using the existing order-detail
  endpoint and runtime contract, with validated fixed local links to the returned
  customer and invoice. Show historical item/price snapshots and independent order
  and invoice facts; retain the existing creation and status-action rules.
- **Reason:** Customer invoice history now exposes older billing records safely,
  while administrator order rows still show unlinked customer text, only the first
  item's plan/domain, and no invoice review context beside approval. The existing
  protected order detail already supplies every order item, snapshot totals, customer
  identity and invoice number/state/balance. Connecting these facts closes a frequent
  operator lookup gap without a new detail route, read model or business mutation.
- **Consequence:** Command 82 is defined but not authorized or implemented. Selection,
  close, retry and navigation must remain read-only; delayed/mismatched responses and
  old context after filter or mutation changes cannot appear current. The order
  contract supplies no current service state, so payment/order state must never be
  presented as provisioning evidence. Other ledgers, general review frameworks,
  payment/service workflows, schema/authentication changes, providers, deployments
  and releases remain excluded. Production remains `NO-GO`.

## ADR-058 — Credential-Form Readiness Before Further Workflow Expansion

- **Status:** Accepted for next-command definition; implementation separately gated
- **Date:** 2026-10-04
- **Decision:** After reviewing Command 82, prioritize the four existing auth form
  components (login including its MFA challenge, registration, forgot password and
  reset password). Define an auth-only readiness boundary that blocks native
  credential submission before handlers are attached or when JavaScript cannot
  load, retains an explicit non-GET native method as defense in depth, and preserves
  all existing CSRF-protected API requests and server authentication policy.
- **Reason:** Command 82's first cold browser run recorded native registration GET
  navigation containing fictional form fields. Source confirms omitted native
  method attributes and initially enabled named inputs/submit buttons that depend
  on client `preventDefault`. HTML defaults to GET with fields in the URL; hydration
  is the inferred trigger, not a proven sole cause. A passing rerun does not repair
  the fallback boundary. This credential risk takes precedence over further P1
  lookup/scale features. See [HTML form submission](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/form#method)
  and [Playwright hydration guidance](https://playwright.dev/docs/navigations#hydration).
- **Consequence:** Command 83 is defined, not authorized or implemented here.
  Deterministic blocked-script and JavaScript-disabled tests must prove no native
  payload or navigation before readiness; normal ready, busy, retry, MFA, reset and
  exact checkout-intent journeys must remain intact. A native POST alone or a test
  delay is not a fix. No auth backend/policy, general form framework, provider,
  worker cleanup, dependency, release or deployment expansion is permitted. This
  boundary does not remove legitimately tokenized reset/verification links, nor
  claim to close all security gates. Production remains `NO-GO`.

## ADR-059 — Auth-Only Hydration Guard With Disabled Successful Controls

- **Status:** Accepted and implemented by authorized Command 83
- **Date:** 2026-10-04
- **Decision:** Use one `AuthForm` in the existing auth controls module. A stable
  `useSyncExternalStore` server snapshot is false both on the server and in the
  first hydration render; its client snapshot enables the fieldset after commit.
  All named controls, not only the button, remain disabled before readiness. The
  form always declares POST as defense in depth, cancels handled submissions and
  invokes the unchanged caller only when ready. No native POST route is added.
- **Reason:** Disabled fieldset descendants are not successful submission controls,
  including autofilled values and implicit Enter. Consistent initial markup avoids
  hydration mismatch; no credential storage, effect lint exemption, timing
  wait or global form framework is required. Accessible status and noscript copy
  explain preparation and the JavaScript requirement. Consulted the installed
  Next.js server/client boundary guide, [React server snapshots](https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering),
  [disabled fieldsets](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/fieldset#disabled)
  and [Playwright hydration](https://playwright.dev/docs/navigations#hydration).
- **Streaming feedback:** A real no-JavaScript browser initially exposed only the
  shared loading shell, because streamed form segments require an inline script to
  reveal them. Add the same noscript explanation to that existing fallback; no
  route, rendering configuration or server-auth behavior changes. Tests inspect
  disabled controls even in hidden streamed HTML through public DOM APIs, rather
  than changing user agents or waiting for unavailable scripts.
- **Consequence:** Only the four requested entry components use the wrapper; the
  MFA settings panel retains its effect-loaded workflow and original shared controls.
  Password and challenge branches have distinct React keys: strengthened body
  assertions exposed uncontrolled email input reuse as the code field. Remounting
  clears that value without changing MFA policy or API bodies. Browser tests mock
  only isolated-page auth POSTs, compare auth/business record counts and record
  booleans rather than observed credentials; their traces/video/screenshots are off.
  The complete existing real-API fictional lifecycle remains unchanged. This does
  not provide no-JavaScript authentication, change allowed token/intent links,
  close unrelated security/operations gates or authorize further work. Production
  remains `NO-GO`.

## ADR-060 — Bounded Read-Only Administrator Manual Payment Context

- **Status:** Accepted for next-command definition; implementation separately gated
- **Date:** 2026-10-04
- **Decision:** After reviewing Command 83, define one explicit read-only review in
  the administrator manual-payment ledger using its existing protected detail and
  runtime schema. Present proof, independent transaction state, server-derived
  adjustment capacity and business-zone dates, with fixed validated customer and
  invoice links. Preserve every existing deliberate financial mutation.
- **Reason:** The credential readiness boundary now has SSR/first-hydration,
  no-JavaScript and delayed-script evidence plus preserved real-API lifecycle
  coverage. No corrective auth change was found. Operator payment investigation
  still starts from unlinked invoice/customer text; existing detail already exposes
  the required facts without a new backend dependency. This complements Command
  82's order context while keeping financial-policy changes out of a lookup repair.
- **Consequence:** Command 84 is defined, not authorized or implemented. Review,
  retry, close and navigation must not mutate records; malformed, mismatched or stale
  responses cannot become current context. Proof remains plain text, snapshot names
  do not claim current profile identity, refundable capacity is not invoice balance,
  and payment is not provisioning evidence. Original-payment navigation, financial
  histories, pagination/search, gateway work, service operations, workers, schema,
  dependencies, cleanup, releases and deployments remain separately gated. Command
  83's local parallel-worker limitation/raw-SQL isolation risk remains unresolved;
  successful hosted checks do not establish its local repair. Production stays `NO-GO`.

## ADR-061 — Selected Manual Payment Facts Without Financial Mutation

- **Status:** Accepted and implemented by authorized Command 84
- **Date:** 2026-10-04
- **Decision:** Add one selection-keyed review to the existing administrator manual-
  payment workspace, with a runtime-validated payment envelope and the existing
  settings endpoint narrowed to business time zone. Validate requested and returned
  UUID/context, use abortable cookie/no-store GETs, and expose only fixed customer
  and invoice destinations after validation. A filter-keyed workspace clears stale
  customer selection; a successful existing mutation immediately clears the review.
- **Reason:** The existing manual detail is already ownership-protected and supplies
  safe proof, independent transaction state and server-derived adjustment capacity.
  There is no need for a new route, financial read model, global review framework or
  new approval gate. Immediate invalidation also prevents successful financial
  mutation followed by failed invoice refresh from leaving old review context visible.
- **Consequence:** Review focuses its heading and restores the originating trigger
  on explicit close. Nullable facts remain explicit; proof is escaped plain text,
  capacity is not invoice balance, names are historical invoice snapshots and payment
  does not establish provisioning. Adjustment rows explain the returned original ID
  without fetching a history chain. Existing mutation bodies, keys, policy, gateway
  attention and financial/service rules remain unchanged. Browser evidence uses one
  pending fictional reference in the guarded test schema, not a new settlement.
  Worker/schema/dependency/cleanup/deployment and production gates remain outside
  this command. Production remains `NO-GO`.

## ADR-062 — Administrator Invoice Lookup Before Broader Workflow Expansion

- **Status:** Accepted for next-command definition; implementation separately gated
- **Date:** 2026-10-04
- **Decision:** After reviewing Command 84, define one URL-bound administrator
  invoice-ledger slice with search, status, bounded pagination and preserved optional
  customer context. Use the existing protected invoice list and runtime envelope,
  fixed local destinations, deterministic server ordering and matching-record metadata.
- **Reason:** The manual-payment review now exposes validated invoice/customer
  context without changing financial behavior. Operators still cannot browse older
  invoices through the first-100 administrator ledger, although its existing API
  supports the required search/filter/page boundary. This frequent billing lookup
  is ready without new service relationships, financial policy or provider authority.
- **Consequence:** Command 85 is defined, not authorized or implemented. Queries
  must not silently mislabel customer scope or display stale rows/metadata; counts
  are not balances. Existing draft/identity forms, bodies and retry keys remain intact,
  and query changes must preserve unrelated unsaved form input. Successful creation
  must reconcile the selected ledger without injecting a nonmatching draft or turning
  a refresh failure into a duplicate write. Customer-picker scale, other ledgers,
  service context, attention/freshness, global search and financial/provider work
  remain separately gated. Local worker/isolation and dependency/branch-policy risks
  are not repaired by a read-only ledger. Production remains `NO-GO`.

## ADR-063 — Independent Read-Only Administrator Invoice Ledger

- **Status:** Accepted
- **Date:** 2026-10-04
- **Decision:** Implement Command 85 using the existing protected invoice list.
  Parse URL ledger fields and customer scope separately, block reads for invalid
  ledger filters, validate complete response rows and authoritative pagination,
  and key only the abortable read-only ledger subtree. Keep financial forms mounted.
- **Reason:** URL changes must not discard an unfinished draft or business identity,
  and a successful draft is not necessarily part of the current search/status/page.
  A separate read revision refreshes the latest applied query after creation without
  injecting a row or converting a read failure into a duplicate write.
- **Consequence:** Invalid customer context retains its warning and explicit all-
  customer wording, never inferred ownership. Clearing ledger filters retains valid
  customer context; clearing customer scope is separate and returns to page one.
  Counts are records, not financial aggregates; historical identity and lossless
  money remain unchanged. No per-row/detail/PDF preloads, new endpoints, billing
  rules or global list framework. First-100 customer options and other workflows
  remain separately gated. Production remains `NO-GO`.

## ADR-064 — Selected Service Facts Before Broader Fulfilment Work

- **Status:** Accepted for next-command definition; implementation separately gated
- **Date:** 2026-10-04
- **Decision:** After reviewing Command 85, define one explicit read-only
  administrator service inspection using the existing protected detail and runtime
  contract. Show application service/account facts, business-zone lifecycle dates,
  historical product references and current customer context; preserve every existing
  deliberate service and panel action.
- **Reason:** Administrator invoice history now reaches older records without
  discarding financial forms. Service rows still hide exceptional/final-state reasons
  and lifecycle facts beside consequential operations, although the protected detail
  already supplies them. This operational lookup has ready dependencies without a
  new backend relationship model, financial rule or provider authority.
- **Consequence:** Command 86 is defined, not authorized or implemented. Selected
  context must be runtime-validated and invalidated on filter/selection/close and
  mutation dispatch, including uncertain follow-up reads. Current profile identity
  is not an invoice snapshot. Nullable order references do not supply invoice,
  payment, current order or remote-panel state; only the fixed returned customer
  detail link is added. Review is not an approval gate, remote check or operation
  retry. First-100/service setup limits, broader fulfilment, other ledgers,
  attention/freshness/chrome, worker/isolation, dependency/governance, cleanup,
  releases and deployments remain separate. Production remains `NO-GO`.

## ADR-065 — Selected Application Service Facts With Dispatch Invalidation

- **Status:** Accepted and implemented by authorized Command 86
- **Date:** 2026-10-04
- **Decision:** Add one selection-keyed, abortable cookie/no-store service review
  using the existing runtime detail and narrowed business-zone settings envelopes.
  Invalidate it synchronously on customer-scope change and at creation/panel/status
  mutation dispatch, without remounting financial or operational forms.
- **Reason:** Old application state must not survive a begun operation whose remote
  or follow-up read outcome may be uncertain. Clearing only on successful refresh
  would retain stale evidence. Explicitly disabling review while a mutation runs
  also prevents an immediate re-read from appearing to certify its outcome.
- **Consequence:** Review supplies safe current-profile identity, historical product
  facts and nullable account/lifecycle evidence, with only a fixed validated customer
  link. No inferred invoice/payment/order state, chain fetch, operation history,
  external hostname link, login session or provider verification. Original requests,
  retry keys, confirmations and failure handling remain intact; review is not a
  prerequisite for an action. New browser evidence owns a loopback-only fictional
  connection with explicit search_path and verifies it before fixtures; the shared
  database/worker isolation risk is not thereby repaired. Production stays `NO-GO`.

## ADR-066 — Page-Local Invalidation Across Service and Panel Workspaces

- **Status:** Accepted; Command 86 phase-review correction
- **Date:** 2026-10-04
- **Decision:** Compose the existing service and panel managers in one small client
  workspace. A panel-dispatch revision clears selected review synchronously; a
  pending count blocks inspection until every begun panel request finishes. Keep
  both managers/forms mounted and leave their original requests and policy intact.
- **Reason:** Command 86 cleared review for creation and lifecycle calls in the
  service manager, but its sibling panel tools/configuration/retry did not signal
  dispatch. Those deliberate operations can change stored facts or have uncertain
  outcomes; old application evidence must not remain visible as current context.
- **Consequence:** Connection tests, configuration, all account tools and manual
  retry clear/abort review before CSRF/request dispatch and never restore it on
  success or failure. A later inspection requires deliberate selection. No global
  event bus, provider call on review, new approval gate, form remount or mutation
  body/key/confirmation change. This extends ADR-065 to the complete page boundary.

## ADR-067 — Read-Only Service Inventory Scale Before Broader Fulfilment

- **Status:** Accepted for next-command definition; implementation separately gated
- **Date:** 2026-10-04
- **Decision:** Define Command 87 as URL-bound administrator service search/status
  and bounded pagination using the existing protected list and runtime envelope,
  preserving independent customer scope, selected review and original operations.
- **Reason:** Service inspection now exposes existing facts safely, but operators
  cannot reach services older than the first 100 through this inventory. The API
  already supplies bounded search/filter inputs, deterministic ordering and counts;
  one ledger has ready dependencies without new relationships or provider authority.
- **Consequence:** Command 87 is defined, not authorized or implemented. Queries
  must preserve unfinished operational forms, discard stale rows/counts/reviews and
  reconcile the latest query after deliberate writes without injecting a wrong-scope
  service or retrying a mutation after read failure. Matching counts are not money
  or remote-state evidence. Setup/tool/history scale, other ledgers, fulfilment
  relationships, action redesign, freshness/chrome and production gates remain
  separate; production remains `NO-GO`.

## ADR-068 — Independent Read-Only Administrator Service Inventory

- **Status:** Accepted and implemented by authorized Command 87
- **Date:** 2026-10-04
- **Decision:** Use the existing protected service list with independently parsed
  customer scope and bounded URL search/status/page/page-size inputs. Runtime-check
  every row, applied scope and authoritative pagination; key only the abortable
  inventory subtree, keeping operational forms and original action targets mounted.
- **Reason:** Older service lookup must not lose unfinished operational evidence,
  mislabel stale results or change which service an existing confirmation targets.
  List reconciliation after a deliberate write is a new read of the latest query,
  not insertion of a potentially nonmatching service or a retry of that write.
- **Consequence:** Query navigation and retry clear/abort selected review. Page-local
  sibling dispatch invalidation and pending inspection blocks remain intact. Search
  retains domain, historical product name, current customer email and external
  account ID semantics; ordering is createdAt descending then ID descending, not a
  frozen history across requests. Counts are records, not financial or remote-state
  evidence. No new API, policy, relationship, provider call, schema or worker change.
  Setup/tool/history scale remains separate and production remains `NO-GO`.

## ADR-069 — Administrator Order Lookup Before Broader Workflow Expansion

- **Status:** Accepted for next-command definition; implementation separately gated
- **Date:** 2026-10-05
- **Decision:** After reviewing Command 87, define one URL-bound administrator
  order ledger using existing search/status/customer filters and paginated runtime
  contracts. Preserve independent creation inputs, submission keys, selected review
  and deliberate operations; reconcile the latest query rather than injecting rows.
- **Reason:** Service inventory now reaches older records without resetting forms
  or weakening operation safeguards. The administrator order list still discards
  pagination beyond its fixed first 100, although its protected API supplies search,
  counts and deterministic ordering. This is a frequent operator lookup with ready
  dependencies, not a new fulfilment or financial relationship model.
- **Consequence:** Command 88 is defined, not authorized or implemented. Search is
  order number, historical email and any item's domain; ordering uses createdAt/ID,
  not placedAt. URL/customer changes must not reassign the creation customer, lose
  its unfinished fields/key, resurrect stale review or retarget a begun status write.
  Counts are records, not financial/provisioning evidence. Other ledgers, setup scale,
  relationships, attention/freshness/chrome, worker/isolation and dependency/governance
  risks remain separate. No release, cleanup, deployment or production approval;
  production remains `NO-GO`.

## ADR-070 — Independent Read-Only Administrator Order Ledger

- **Status:** Accepted and implemented by authorized Command 88
- **Date:** 2026-10-05
- **Decision:** Use existing protected order contracts with independently validated
  customer scope and bounded URL search/status/page/page-size. Validate every item,
  invoice and pagination fact, and key only the abortable ledger subtree.
- **Reason:** Older-order lookup must preserve independent creation inputs and
  submission keys, avoid stale review/counts and retain the original clicked status
  target. Existing deliberate mutations reconcile the latest query through a new
  read; failed reconciliation must never repeat a write or erase its success notice.
- **Consequence:** Query/retry and mutation dispatch invalidate selected review;
  pending writes block inspection. Search stays order number, historical customer
  email and any item domain; order stays createdAt then ID descending, not placedAt
  or a frozen cross-page history. Current profile names are distinct from snapshots.
  Counts are records, not balances, settled cash or provisioning proof. No new API,
  schema, worker, provider or approval prerequisite; production remains NO-GO.

## ADR-071 — Ownership-Bound Customer Order History Before Richer Relationships

- **Status:** Accepted for next-command definition; implementation separately gated
- **Date:** 2026-10-05
- **Decision:** After reviewing Command 88, define one customer order-history
  slice with bounded URL search/status/pages using existing customer-only
  `/orders/my` and complete runtime order/pagination contracts. Never forward
  identity or arbitrary return navigation; customer scope remains session-derived.
- **Reason:** Administrator order lookup now reaches older records without losing
  drafts or retargeting operations. The customer order screen still discards pages
  beyond its first 100, despite an existing ownership-bound searchable API. This
  recurring self-service lookup is ready without a new financial/service read model.
- **Consequence:** Command 89 is defined, not authorized or implemented here.
  Search remains historical email/order number/any item domain; sorting is
  createdAt/ID, not placedAt. Matching counts are not balances or provisioning
  evidence. Reject stale/malformed results and provide honest GET-only recovery.
  First-item summaries must not imply all-item review. Existing invoice text and
  checkout routes remain; new cross-record links/review, other ledgers, general
  frameworks, workers/isolation, dependencies/governance, providers, cleanup,
  releases and deployments remain separately gated. Production stays `NO-GO`.

## ADR-072 — Read-Only Customer Order History With Session-Derived Scope

- **Status:** Accepted and implemented by authorized Command 89
- **Date:** 2026-10-05
- **Decision:** Keep customer order history on the existing customer-only list API.
  Narrow URL/request builders to search/status/page/page-size, validate complete
  order/item/invoice and pagination facts, and key only abortable history reads.
- **Reason:** Older-order lookup needs authoritative owned counts, restored URL
  state and honest recovery without passing customer identity or introducing a new
  billing/service relationship. Query/retry must never resurrect stale results.
- **Consequence:** Identity remains session-derived at the API. Existing historical
  search and createdAt/ID ordering remain; counts are records, not money or service
  evidence. First-item summaries identify additional items rather than claiming full
  review. Existing checkout links, invoice text and financial rules remain intact.
  No other ledger, new detail/navigation framework, schema, provider, worker,
  dependency, release or deployment change. Production stays `NO-GO`.

## ADR-073 — Ownership-Bound Customer Service Lookup Before Workflow Expansion

- **Status:** Accepted for next-command definition; implementation separately gated
- **Date:** 2026-10-05
- **Decision:** After reviewing Command 89, define one read-only customer service
  inventory slice using existing customer-only `/services/my`, bounded URL search/
  status/pages and complete service/pagination runtime contracts. Keep customer
  identity session-derived; never forward customer/server scope or redirects.
- **Reason:** Customer order history now reaches older purchases safely. Customer
  service cards still discard pagination after their first 100 records even though
  the protected API supplies search, deterministic ordering and matching counts.
  This recurring self-service lookup has ready dependencies; support lookup also
  carries creation/reply/selection state and should remain a separate command.
- **Consequence:** Command 90 is defined, not authorized or implemented here.
  Search stays domain, historical product name, current customer email and external
  account ID; sorting stays createdAt/ID, not due/start date. Counts and stored
  application state do not verify remote hosting or finances. Preserve existing
  cards and validated detail links, nullable facts, lossless money and deliberate
  panel login without preloads/provider calls or writes during browsing. Detail/
  return-intent/relationship work, other ledgers, pickers/setup/tool scale,
  attention/freshness/chrome, worker/isolation, dependency/governance, cleanup,
  releases and deployments remain separate. Production stays `NO-GO`.

## ADR-074 — Read-Only Customer Service Inventory With Session-Derived Scope

- **Status:** Accepted and implemented by authorized Command 90
- **Date:** 2026-10-05
- **Decision:** Keep customer service lookup on the existing customer-only API.
  Narrow URL/request builders to search/status/page/page-size, validate complete
  service/server/money/nullable lifecycle facts and authoritative pagination, and
  key only abortable inventory reads. Never forward customer/server identity.
- **Reason:** Older-service lookup needs owned counts, restored URL state and
  honest recovery without inventing a financial relationship or contacting a panel.
  Superseded query/retry/unmount reads must not restore stale cards or counts.
- **Consequence:** The API derives ownership from the session. Existing domain,
  historical product, current email and external-account search and createdAt/ID
  ordering remain. Counts are records, not financial or live-hosting evidence.
  Preserve lossless recurring money, nullable placeholders, text server facts,
  validated fixed detail links and deliberate panel login. No backend behavior,
  schema, provider, worker, dependency, other ledger, relationship, release or
  deployment change; production remains `NO-GO`.

## ADR-075 — Customer Support History With Independent Ticket Drafts

- **Status:** Accepted for next-command definition; implementation separately gated
- **Date:** 2026-10-05
- **Decision:** After reviewing Command 90, define one customer ticket-history
  slice on existing session-owned `/tickets/my`, exposing only bounded URL search,
  status and pages. Keep creation and ticket-bound reply drafts independent of
  history reads; conversations require explicit selection and validated detail.
- **Reason:** Customer invoice/order/service lookup now reaches older records.
  Customer support still discards pagination beyond 100 despite ready protected
  contracts. Unlike service cards, support shares creation, reply and selection
  state; blindly remounting the workspace or prepending write results would lose
  drafts, retarget replies or misrepresent the latest applied query.
- **Consequence:** Command 91 is defined, not authorized or implemented. Preserve
  original write targets/bodies/keys and success notices; reconcile latest history
  by GET without mutation replay, stale conversation restoration or draft transfer.
  Search retains ticket number/subject/current email/company/linked domain; order
  retains status/priority/updatedAt/ID, not chronological or frozen history. Counts
  are ticket records, not unread/SLA evidence. Other ledgers, service-picker and
  message scale, workflow/relationship changes, workers/isolation, dependencies/
  governance, providers, cleanup, releases and deployment remain separate.
  Production stays `NO-GO`.

## ADR-076 — Opt-In Build-Time Installation Web Branding

- **Status:** Accepted and implemented by the explicitly authorized Command 33 branding follow-up
- **Date:** 2026-10-06
- **Decision:** Add a strict shared public-branding contract and explicit build-time web
  variables for name, local PNG dimensions/path, tagline and public contacts. Reuse one
  brand renderer across storefront, authentication and operational shells, and one title
  helper for root/administrator/customer metadata. Keep generic Webhost Billing defaults.
- **Reason:** The owner supplied an existing portal logo and approved Speed Host contacts,
  but hard-coded web chrome prevented installation branding. A local, confined PNG avoids
  remote dependencies, tracking, image-proxy authority and CSP exceptions. Build-time
  validation checks file/metadata boundaries rather than claiming full image decoding.
- **Consequence:** Owner assets and local configuration remain ignored, while Docker accepts
  explicit public build arguments and excludes raw release artifacts/local environment files.
  Changing branding requires a new web build, not only runtime variables. Existing fictional
  warnings remain; email settings and immutable invoice identity/PDF behavior are independent.
  Anonymous loopback browser checks require no API/database/provider authority. No policy
  approval, migration, deployment or cutover is inferred; production remains `NO-GO`.

## ADR-077 — App-wide sentence case without changing stored facts

- **Status:** Accepted and implemented by the owner-authorized presentation follow-up
- **Date:** 2026-10-06
- **Decision:** Use sentence case for app-authored interface and generated invoice labels.
  Remove forced uppercase styling and explicitly format human enum labels with a shared,
  browser-safe presentation helper. Keep reusable badges content-preserving so an invoice
  or customer identifier is never transformed implicitly.
- **Reason:** The owner clarified that the writing rule applies to the entire application,
  including existing screens, not just future chat replies or branding.
- **Consequence:** Protocol enums, submitted values, currency/country codes, case-sensitive
  confirmation tokens, immutable snapshots, user content and original assets retain their
  exact case. Technical acronyms retain conventional spelling. No global lowercase style,
  database rewrite or business-rule change is introduced. Source-wide style regression,
  component checks, invoice text/determinism tests and anonymous computed-style browser
  checks protect the rule. No deployment or operating-policy approval is inferred.

## ADR-078 — Fixed staff roles with backend enforcement and protected account changes

- **Status:** Accepted by explicit owner implementation authorization
- **Date:** 2026-10-06
- **Decision:** Keep `UserRole` administrator/customer identity unchanged and add a
  fixed role to administrator profiles. Existing profiles migrate to full
  administrator; billing operators manage invoices/manual-payment collection with
  read-only customer context; support operators manage the existing single queue.
  Use explicit shared grants and API metadata, defaulting unannotated administrator
  actions to full-only. Missing/unknown staff roles fail closed. Customer ownership
  checks and financial/provider boundaries remain unchanged.
- **Safeguards:** Current role/status/MFA are read from PostgreSQL per authenticated
  request. Restricted business access and full-administrator staff mutations require
  MFA. Invitations reuse encrypted verification/reset tokens and the existing outbox;
  no temporary password is exposed. An email-verified invitation without a password
  remains visibly pending and recoverable by resending the missing setup step. Staff
  changes revoke sessions and login challenges. Disable consumes invitation/reset
  tokens; email verification cannot
  reactivate a disabled account. A transaction-scoped advisory lock serializes staff
  mutations, rechecks the actor and protects against self-lockout/last-owner loss.
- **Consequence:** The UI filters navigation and guards administrator pages, but
  backend checks are authoritative. Billing has a separate read-only customer view
  and cannot alter business identity or invoke refunds/reversals/provider/hosting
  actions. Full-administrator legacy MFA behavior is retained outside staff changes;
  production still requires administrator MFA under the existing launch gates.
  Session revocation does not claim to cancel already admitted in-flight operations.
  Deploy the migration and matching API/web contracts together, only after separate
  deployment authorization. No custom roles, multi-department router, API-user role,
  hosting operator, actual appointments, remaining D5–D8 approval or production
  readiness is implied. Command 91 remains separately gated.

## ADR-079 — Repair acceptance gates before progressing beyond staff roles

- **Status:** Accepted sequencing decision; owner-authorized Command 93 source repair
  delivered on 2026-10-06 with required local and exact-source hosted acceptance passing
- **Date:** 2026-10-06
- **Decision:** Retain ADR-078's three-role access system, but do not treat local checks
  or successful CodeQL as complete release acceptance. Exact source head `7797bc7` passed
  hosted package/API/invariant checks but failed three lifecycle journeys on obsolete
  all-caps display expectations; its staff browser, audit, license and build steps were
  skipped. Align tests with ADR-077 rather than restoring all-caps UI or weakening checks.
- **Evidence:** A read-only loopback check using the unmodified browser environment
  reported model scope `command26_e2e` and raw `current_schema()` as `public`. URL model
  schema alone does not establish raw-SQL isolation. No fixture preparation, worker run,
  schema reset or business write was performed by the review.
- **Security gate:** The fresh production audit reports critical `proxy-addr` 2.0.7 and
  high `source-map-js` 1.2.1. Primary advisories identify patched 2.0.8 and 1.2.2:
  [proxy-addr advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) and
  [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
  These are affected dependency findings, not evidence of compromise or a proved live
  exploit. The inspected API uses bounded numeric proxy hops rather than the advisory's
  subnet configuration; this does not waive the dependency audit or justify suppression.
- **Consequence:** Define one bounded Command 93 to repair only these dependency and
  test-acceptance boundaries while retaining supply-chain policies and business behavior.
  No production database-client/worker rewrite, authorization relaxation or unrelated
  upgrade is included. Require fresh complete validation and exact-head hosted evidence.
  D1–D4 remain approved, D5–D8 and real appointments remain open, Command 91 stays gated,
  and no source review authorizes deployment, migration, provider activation or launch.

## ADR-080 — Separate currency scope, exact pricing and immutable financial history

- **Status:** Owner-authorized scope and design; implementation/activation not authorized
- **Date:** 2026-10-06
- **Decision:** The explicit owner direction supersedes the earlier single-currency-only
  target. Design one BDT base/default with USD preferred secondary and reviewed major
  currencies. Separate browsing preference, sale eligibility, invoice/service currency,
  collection capability, provider settlement and reference reporting. Retain one business
  per installation; no worldwide tax, wallets, trading or WHMCS parity is implied.
- **Design:** [Multi-currency billing design](MULTI_CURRENCY_DESIGN.md) proposes versioned
  minor-unit metadata, lossless exact-rational conversion, bounded half-even arithmetic,
  fixed/derived append-only price publication, ownership-bound quotes and preserved
  contracted renewal money. Accepted rates and historical financial evidence are immutable;
  provider base currency does not have to equal installation base currency. Base changes
  after financial history exists are not a settings edit.
- **Evidence:** Existing currency fields/string money do not establish complete support:
  provider helpers assume two decimals, real adapters here reject non-BDT, the dashboard
  selects one configured currency and the portal rejects mixed outstanding currencies.
  Read-only legacy UI inspection reports WHMCS 8.1.3 and BDT/USD, with USD indicated as base.
  Export field lists are available but invoice lines are absent from invoice report fields.
  No customer export was downloaded, sample supplied or importer implemented.
- **Safeguards:** Issued invoices, applied payments/refunds and service renewals retain
  original money/currency. Mixed-currency sums and automatic cross-currency payment
  settlement are forbidden. Reconcile WHMCS counts AND money/links per currency; absent
  historical FX remains unknown. Never scrape/export passwords or treat a public staging
  hostname as a protected real-data replica destination.
- **Consequence:** Command 94 delivers documentation only. Provider selection/licensing,
  operational thresholds, prices/routes, legacy credits and implementation require later
  review/authorization. ExchangeRate-API is an evaluation candidate, not an activated
  provider or purchase. No fetched provider datasets belong in public source artifacts.
  Command 93 remains the next implementation gate; Command 91, D5–D8, real-data rehearsal,
  deployment and production cutover remain separately gated.

## ADR-081 — Make browser acceptance explicitly fictional and disposable

- **Status:** Implemented and delivered under owner-authorized Command 93; complete local
  acceptance and exact-source hosted CI/CodeQL passed for 63643a3
- **Date:** 2026-10-06
- **Decision:** Test-only launchers generate a fresh nonce-qualified schema on loopback
  PostgreSQL. Use the same model schema and explicit raw-SQL search path for preparation,
  API, test clients and automation. Reject connection-target overrides, reused runner
  scopes and live schema/path mismatches. Verify fictional ownership and model/raw
  agreement before fixture or automation writes; no public fallback is allowed.
- **Cleanup:** Never reset an existing schema. Drop only the current invocation's
  successfully prepared, validated, marked fictional schema after subprocess completion.
  Interrupted/incomplete preparation can retain a fictional schema for inspection; do
  not adopt or reset it on a later run. Ordinary application schemas remain untouched.
- **Validation:** Keep concrete sentence-case UI expectations separate from raw enums.
  Build the browser API before launch and run compiled code after the preflight, retaining
  existing deadlines, zero retries and all business assertions. Local package/API/invariant
  checks use fresh fictional scopes, with the canonical ownership fixture added only
  for the legacy API suite and sequential processes to limit RAM.
- **Boundary:** Patch only the two advisory-affected transitive dependencies; retain
  provenance, release-age and build allowlists. Production client/worker behavior,
  currency implementation, operating approvals and deployment remain outside this repair.
- **Follow-up:** Supplemental full audit identifies development-only `braces` and
  `sprintf-js` advisories; production audit is clean. These are outside the authorized
  two patches. Review package/advisory conflicts and authorize a bounded tooling-security
  repair before progressing to currency implementation; do not suppress the findings.

## ADR-082 — Separate unpatched tooling mitigation from audit closure

- **Status:** Accepted sequencing decision from the owner-authorized Command 93 phase
  review; Command 95 defined only, implementation and residual-risk acceptance not authorized
- **Date:** 2026-10-06
- **Evidence:** Command 93 report head `ceb40ca` passed exact-head CI and CodeQL; fresh
  production audit is clean. Full audit still reports high `braces` 3.0.3 through Next
  lint tooling and moderate `sprintf-js` 1.0.3 through Jest/Istanbul/YAML/argparse.
  Official registry metadata for [braces](https://registry.npmjs.org/braces) and
  [sprintf-js](https://registry.npmjs.org/sprintf-js) lists latest 3.0.3/1.1.3 and contains neither suggested
  fixed floor 3.0.4/1.1.4. Both primary advisories list no patched release:
  [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and
  [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).
- **Decision:** Define one bounded Command 95. Prefer verified published compatible fixes
  if released; otherwise permit, after separate authorization, narrowly attributed
  exact-version local pnpm patches with bounded installed-consumer regressions, frozen
  reproducibility and removal criteria. No unmerged-branch installation, invented version,
  package rename, broad dependency migration or audit suppression is permitted. The open
  [sprintf-js proposal](https://github.com/alexei/sprintf.js/pull/238) is evidence to review,
  not an accepted/released fix; a parse-time exception alone does not establish safe
  caller behavior for the installed version.
- **Acceptance:** Preserve the production audit and existing complete acceptance gates.
  Verify local mitigation independently and report full audit failures honestly; patches
  do not necessarily clear version-based alerts. Retain upstream findings and require a
  separate owner-authorized phase review of remaining exposure before currency work.
  [pnpm patch documentation](https://pnpm.io/cli/patch) supports registered patch files;
  use exact versions and keep unused-patch tolerance disabled.
- **Limitations:** Individual repository Dependabot alert states could not be read without
  authenticated security-alert permission (HTTP 401). The two-finding GitHub push notice
  and local audit agree in count, but are not proof of alert-by-alert closure. No evidence
  of live compromise or a proved application exploit was found in this review. Retain
  the trusted-local/isolated-CI boundary, direct-main governance risk and launch inputs.
- **Consequence:** Review delivery changes documentation only. Command 94 remains design
  only; Command 91, Command 33 D5–D8, private-data rehearsal, provider activation and
  production/deployment approval remain separately gated.

## ADR-083 — Bound local tooling traversal and preserve invalid precision literally

- **Status:** Implemented and validated locally and by exact source-head CI/CodeQL; remaining audit exposure not accepted
- **Date:** 2026-10-06
- **Decision:** Register only exact-version `braces` 3.0.3 and `sprintf-js` 1.0.3 pnpm
  patches, preserving registry identity/integrity and all existing policy/override values.
  Retain source/license attribution in `patches/README.md` and `patches/LICENSES.txt`.
  No unpublished version, unmerged branch or renamed substitute is installed.
- **Behavior:** Iteratively verify bounded, acyclic brace trees/ancestry before recursive
  compile/expand/stringify entry points. Bound parser nesting and nested-array helpers;
  preserve legitimate stale parent links from upstream imbalanced-pattern flattening.
  Unsupported input raises a controlled `SyntaxError` that callers must catch. Out-of-range
  numeric formatter precision renders the original directive literally, preserves argument
  position and invokes no native numeric formatter; valid formats are unchanged. Do not
  silently clamp a numeric result or merely move the same uncaught exception to parsing.
- **Verification:** Resolve installed libraries through actual Next lint and Jest coverage
  consumers. Check registered patch hashes and normal/adversarial cases in resource-bounded
  subprocesses, including an asynchronous precision call without an exception handler.
  Add this verification to root package acceptance and an early hosted CI step.
- **Limitations:** This is a local mitigation, not complete untrusted-tooling isolation,
  upstream advisory closure or owner acceptance of residual risk. Retain separate full
  audit status and the existing production audit gate; broader expansion, executable
  config/getter, format-width/cache and other resource paths remain outside this repair.
  Remove patches only after verified upstream/consumer replacement and equivalent tests
  under separate authorization. Currency, deployment, D5–D8 and migration remain gated.

## ADR-084 — Separate currency arithmetic from operational activation

- **Status:** Command 95 review completed; Command 96 defined only, implementation not authorized
- **Date:** 2026-10-06
- **Evidence:** Report head `67ea491` passed exact-head CI/CodeQL including full acceptance.
  Fresh frozen-install and ten installed mitigation checks pass; production audit exits 0.
  Full audit still exits 1 for one high braces and one moderate sprintf-js finding. Registry
  metadata has no suggested fixed releases; local patches do not close those findings.
- **Decision:** Accept Command 95's bounded engineering delivery, not all development
  risk or production readiness. Define Command 96 as pure, unused shared metadata and
  exact-rational conversion primitives with fictional tests. Keep current money contracts
  and every application consumer unchanged. Metadata context is not a sales/collection
  policy or a maintained production currency registry; dataset distribution rights remain
  a separate gate. Half-even library tests do not approve a live billing policy.
- **Boundary:** New authorization is required to implement the foundation. Later schema,
  catalogue/quote, provider, reporting and migration slices require their own approvals.
  Retain visible full-audit exposure, trusted development/isolated CI guidance, patch-removal
  criteria and production audit. Reassess changed exposure before activation; do not treat
  passing tests, this review or a currency request as a residual-risk waiver. Command 33,
  Command 91, real providers, releases/deployment and production approval remain gated.

## ADR-085 — Explicit historical unit context and bounded exact currency arithmetic

- **Status:** Accepted for Command 96; unused pure foundation delivered with local and exact source-head hosted validation
- **Date:** 2026-10-07
- **Decision:** Add an unused `@webhost-billing/shared/currency-arithmetic` subpath without
  modifying root exports or existing money contracts. Require explicit code/version unit
  definitions with provenance/status; reject ambiguous identities and unknown contexts.
  Historical precision never falls back to today's metadata. This is not a currency
  registry or display/sales/collection policy.
- **Arithmetic:** Parse positive plain decimal strings losslessly, reduce bounded positive
  rational rates with BigInt, verify target-major/source-major direction, scale explicit
  exponents and round once by half-even quotient/remainder. Same-currency identity needs
  matching metadata and no external rate. Return canonical string money and exact
  calculation evidence; reject final BIGINT overflow rather than clip or reinterpret units.
- **Limits:** 32 definitions, exponent 0–4, ratio components 96 digits, decimal tokens
  64 whole/32 fractional digits, bounded metadata and 19-digit database-safe source money.
  Validate length/array budgets before integer construction/member traversal. Scientific
  notation, numeric JSON and executable-input isolation are not supported by this slice.
- **Boundary:** All rates and synthetic unit histories are fictional tests; no provider
  data, maintained dataset, application integration, database change or live price effect.
  Source rights, capability policy, provider contracts, operational rounding/quotes,
  migration, residual tooling risk, deployment and production approval remain separate.

## ADR-086 — Separate explicit currency capabilities from metadata and history

- **Status:** Command 96 review accepted; Command 97 defined only, implementation not authorized
- **Date:** 2026-10-07
- **Evidence:** Delivered report head `4bf8b06` passed exact-head CI/CodeQL including
  complete acceptance. Fresh shared 67 tests, build/types, compiled entry boundary,
  frozen install and ten installed mitigation checks pass. Production audit is clean;
  full audit retains one high braces/one moderate sprintf-js finding. No Command 96
  arithmetic defect or connected application consumer was found.
- **Decision:** Define one unused shared-contract slice before policy persistence:
  explicit revision, one base, default browsing choice, optional secondary and independent
  per-code display/new-sales/collection flags with pinned unit metadata. Reject ambiguous,
  unknown, missing and oversized context; never infer support from code syntax,
  metadata, preferences, rates or provider coverage. BDT/USD target fixtures are not
  an installation default or live collection permission.
- **History:** Exact historical code/version resolution stays independent of enabled
  capabilities; no latest-precision fallback or hidden/converted financial history.
  Current/display-enabled metadata is required for browsing defaults; historical
  definitions cannot enable new browsing/sales. Collection eligibility still needs
  separately approved, tested same-currency routes and original-unit evidence.
- **Transitions:** Pure revision/base-lock tests use explicit trusted current policy
  and history facts. Lock the base code after history exists; changing a browsing
  preference is not changing the base or original money. Pure helpers cannot prove
  database history, prevent concurrent writes, enforce roles/MFA/CSRF or approve
  operational transitions; those remain future server responsibilities.
- **Boundary:** No persisted registry/policy, maintained dataset, application consumer,
  provider route, FX feed, price/quote, mixed-currency aggregate, migration or deployment
  is introduced by this review or the defined slice. Retain tooling/governance risks
  without a waiver. Provider rights, live policies, Command 33, Command 91 and protected
  WHMCS rehearsal remain separately gated. Ask for authorization before Command 97.

## ADR-087 — Bounded unused policy facts and authoritative transition boundaries

- **Status:** Accepted for Command 97; unused contracts delivered with complete local and exact source-head CI/CodeQL validation
- **Date:** 2026-10-07
- **Decision:** Add only the separate `@webhost-billing/shared/currency-policy` entry.
  Require an explicit revision, base, default browsing choice, optional distinct secondary
  and unique per-code entries with three explicit independent capability booleans. Bind
  selected references to exact caller-supplied code/version definitions. Reject unknown,
  mismatched, duplicate and oversized data; use no dataset, global/default policy or rate.
- **Bounds and validation:** Limit policy entries and definitions to 32 before member
  traversal, revision tokens to 64 ASCII identifier characters and unit identifiers to
  the existing arithmetic bounds. Full policy/context parsing requires every selected
  reference to match an entry and definition. Browsing choices require current,
  display-enabled units. Historical units cannot enable display/new sales; independent
  collection flags still prove neither tested routes nor settlement. Invalid input throws;
  a valid omitted/unknown code returns all-false capabilities, never an inferred permission.
- **History:** Exact unit resolution takes definitions independently of policy enablement.
  No implicit latest precision, conversion, hidden history or original money update.
  Returned JSON-safe objects are copied plain facts, not immutable database records,
  authorization tokens, payable quotes or authenticated metadata/provider evidence.
- **Transitions:** Reject stale expected revision, equal current/replacement revision and
  a changed base code when the explicit history fact is true. Same-code version changes
  may pin new metadata without changing old-unit interpretation. Global revision-history
  uniqueness, authoritative history, atomic concurrency, roles/MFA/CSRF and confirmation
  require a future server transaction; these pure helpers cannot enforce those controls.
- **Boundary:** Fictional BDT/USD target policies and synthetic historical precision only.
  No root/money/arithmetic change, app consumer, schema, dependency, provider, FX feed,
  price/quote, operational setting, import or deployment. All activation, source rights,
  residual tooling/governance risks, Command 33 and Command 91 remain separately gated.

## ADR-088 — Persist immutable unit identity before authoritative policy writes

- **Status:** Command 97 phase review accepted; Command 98 defined only, implementation not authorized
- **Date:** 2026-10-07
- **Evidence:** Delivered report head `34b50da` passed exact-head CI/CodeQL, including
  every Validate step. Fresh shared 93 tests, build/types, compiled entry/unknown-code
  denial and ten installed mitigation tests pass. Production audit is clean; full audit
  retains one high braces/one moderate sprintf-js finding. No in-scope contract defect or
  app consumer was found; metadata/provenance/history facts are not authenticated authority.
- **Decision:** Define one unused additive unit-definition store before policy persistence.
  Pin exact code/version, exponent, provenance and captured current/historical facts;
  enforce bounds, unique identities and ordinary database immutability. Permit idempotent
  identical replay, reject conflicts without overwriting, and return exact bounded contexts.
  No current-version pointer, maintained dataset, app integration or live registry is added.
- **History:** Referenced precision must not be rewritten. Immutable version status is
  captured evidence, not a mutable global lifecycle/eligibility flag. Database-owner powers
  can bypass ordinary protections; those are not closed by an immutable table. Do not
  fabricate legacy metadata or populate policy from existing localization/settings.
- **Boundary:** The next definition requires fictional guarded database and full acceptance
  tests, including direct SQL, concurrent replay, rollback and unchanged financial rows.
  Authoritative policy revision/history/concurrency, roles/MFA/CSRF/confirmation and
  financial provenance remain later slices. Dataset/provider rights, live currencies/routes,
  mixed-currency reporting, operational policies, Command 33/91, rehearsal and deployment
  remain gated. Retain tooling/governance exposure without waiver; ask before Command 98.

## ADR-089 — Empty immutable unit persistence without application authority

- **Status:** Command 98 delivered with complete local and corrected-head hosted acceptance; phase-reviewed on 2026-10-07
- **Date:** 2026-10-07
- **Decision:** Add only an empty unit-definition store with exact code/version identity,
  bounded unit facts and UTC creation evidence. Reuse shared schemas and full-string ASCII
  validation. PostgreSQL checks and statement triggers reject ordinary update, delete and
  truncate. Database owners can bypass controls; this is not absolute immutability.
- **Repository:** Separate unused entry with explicit client/transaction injection.
  Duplicate-safe insertion followed by exact comparison admits identical replay and
  rejects conflicting exponent/status/provenance without overwrite. Bound exact reference
  lists before traversal/queries; return complete copied facts or error, never latest/global
  registry data or capabilities. Captured current/historical status is not a current pointer.
- **Transactions:** Read Committed supports concurrent identity replay. Do not catch a
  unique/SQL error inside an aborted PostgreSQL transaction; stronger isolation failures
  need whole-transaction retry by the caller. Propagate compound-write conflicts to roll back.
- **Acceptance:** Mandatory source and guarded PostgreSQL tests, including direct SQL,
  concurrency/rollback, terminal-newline bounds and unchanged prior-migration fictional
  history. Use only newly owned marked loopback scopes, never reset an application schema.
- **Boundary:** No policy writes, live metadata dataset, app consumer, inferred legacy unit,
  financial backfill, provider/rate/pricing effect, import, operational approval or deployment.
  Preserve tooling/governance/launch risks and require a separately authorized phase review.

## ADR-090 — Capture immutable policy revisions before selecting an active policy

- **Status:** Command 98 phase review accepted; Command 99 defined only, implementation not authorized
- **Date:** 2026-10-07
- **Evidence:** Corrected delivery head `8aab8d4` passed all 28 CI Validate steps and
  CodeQL. Fresh database source 10/shared 93 tests, builds/types, compiled unused entry,
  frozen install and ten mitigation checks pass. Production audit is clean; full audit
  retains one high braces/one moderate sprintf-js finding. No in-scope storage defect or
  app consumer was found. Initial browser timeout and secret-scan false positive remain
  recorded rather than replacing their evidence with later passing results.
- **Decision:** Define one empty unused policy-revision snapshot store, reusing Command 97
  contracts and exact persisted Command 98 units. Capture the complete policy atomically,
  enforce unique immutable revision facts and copied exact reads, and canonicalize entry
  order by code for equivalent replay. Database constraints must preserve valid context
  and complete snapshots, including preventing late child inserts if using related rows.
- **Authority:** A stored snapshot is not the selected installation policy. Do not infer
  an initial/current revision from existing localization or accept browser-supplied unit
  definitions/history facts. Global revision uniqueness is storage identity, not sequence
  ordering, stale-edit protection, live base locking, authentication or collection authority.
  Different-base candidate snapshots do not change existing money or an installation base.
- **Reason:** Active selection/initialization must coordinate authoritative existing history,
  legacy writers, expected revision, role/MFA/CSRF/confirmation and audit. An isolated unused
  store cannot establish those guarantees. Keep that transaction/activation work separate
  from immutable evidence instead of trusting a caller boolean or a metadata status.
- **Acceptance:** Mandatory guarded SQL/concurrency/rollback/history tests and complete
  local/exact-head hosted acceptance. Extend migration-count assumptions without weakening
  Command 98's prior-history comparisons, fictional ownership or existing verifier assertions.
- **Boundary:** No selected pointer, policy application, app consumer, registry seed, financial
  provenance/backfill, price/quote/rate/provider, real-data rehearsal or deployment. Preserve
  database-owner, tooling/governance, operational/source-rights and launch gates without waiver.
  Ask for explicit Command 99 authorization; this review defines but does not implement it.

## ADR-091 — Complete immutable policy evidence without selection authority

- **Status:** Accepted; Command 99 passed complete local and exact-head hosted acceptance and was phase-reviewed on 2026-10-07
- **Date:** 2026-10-07
- **Decision:** Store each complete bounded policy as one JSONB snapshot with a globally
  unique explicit revision. No mutable parent or extensible children can admit partial or
  late policy facts. Database INSERT validation binds strict shape and selected references
  to exact stored unit versions; ordinary UPDATE/DELETE/TRUNCATE are rejected.
- **Replay:** Canonicalize entries by code independently of JSON property order. Default
  and secondary preferences remain explicit. Duplicate-safe append then exact comparison
  accepts matching replay and rejects conflict without overwrite. Read Committed is
  supported; stronger isolation requires caller-owned whole-transaction retry. Compound
  conflicts must propagate for rollback; no aborted SQL statement is swallowed.
- **Repository:** Separate unused injected-client entry reuses shared contracts and exact
  database unit reads; copied JSON-safe context has no active/current/latest authority.
  SQL context/function lookup uses the snapshot table's schema, not the caller search path.
  Different-base candidates are not installation base changes or operational transitions.
- **Acceptance:** Preserve the original prior-22-to-23 comparison and add prior-23-to-24
  comparison of all old fictional rows including unit metadata and financial/settings facts.
  Mandatory source/SQL/concurrency/rollback/browser and full validation gates stay intact.
- **Boundary:** No selected pointer, initialization, app integration, financial backfill,
  currency dataset/activation, price/FX/provider, import or deployment. Database-owner
  bypass, executable-input/resource risks, tooling findings and operating/launch gates remain.
  Stop for a separately authorized phase review after verified Command 99 delivery.

## ADR-092 — Design authoritative selection against real writers before integration

- **Status:** Accepted for the owner-authorized Command 99 phase review; Command 100 is defined only, not authorized
- **Date:** 2026-10-07
- **Review:** Command 99 at `15539ee14a08ed02b64a9d9155dc13f61e4d08b1` satisfies its
  bounded immutable-evidence contract. Exact-head CI Validate passed every mandatory
  step; CodeQL passed. No connected runtime consumer or in-scope defect was found.
  Matching replay, direct SQL immutability, complete snapshots, exact unit context and
  old-row preservation are evidenced, not installation-policy selection or live base locking.
- **Decision:** Define **Command 100 — Design authoritative currency policy selection
  and legacy-history safeguards** as documentation-only work requiring separate owner
  authorization. Specify initialization, exact selection binding, authoritative history,
  stale-edit protection, coordinated writers and security/audit before adding a live pointer.
- **Reason:** Existing order/invoice/payment/service and renewal writers do not coordinate
  with an installation policy. An existence query plus a new row lock can race legacy
  writes. Existing monetary rows have currency codes but no immutable unit/policy linkage;
  localization and mixed invoice history do not prove a base or original precision.
  The pure transition helper checks base code only; same-code precision/version treatment
  needs an explicit authoritative compatibility rule, not an implied storage guarantee.
- **Deliverable boundary:** Inventory concrete writer paths; design a lock/adoption or
  maintenance prerequisite, existing-history/provenance treatment, full-administrator
  MFA/CSRF/confirmation and atomic audit, and fictional concurrency/security acceptance.
  Define one proposed follow-on slice but do not implement or automatically authorize it.
- **Consequence:** No selected policy, guessed legacy metadata, backfill, changed financial
  writer, aggregate/formatting repair, dataset, provider, import or deployment. Existing
  mixed-currency portal/report limitations remain future work. Tooling advisories, wider
  executable-input/resource risk, database-owner bypass, direct-main rule bypass and
  skipped PR-only review remain explicit; operating and launch approvals are not waived.

## ADR-093 — Guard-first selection, permanent history and explicit legacy adoption

- **Status:** Accepted as Command 100's owner-authorized design; exact-head CI/CodeQL and phase review passed on 2026-10-07; protocol not implemented, no activation or operating approval
- **Date:** 2026-10-07
- **Source:** `dc49182356b73a1bbe65a997521fff1c3f591c48`. Concrete writer/security map
  and acceptance matrix are in `docs/MULTI_CURRENCY_DESIGN.md` section 3a. Existing
  invoice/service/numbering locks and submission keys do not coordinate currency policy;
  all seven money-bearing tables lack immutable currency-unit/policy linkage.
- **Selection:** One schema-local singleton with exact selected revision, CAS generation,
  original base anchor and permanent history latch; append-only receipt/selection ledger
  tied to atomic activity audit. Missing state/context denies, never localization/latest
  fallback. Distinguish empty initialization, replacement and explicitly reviewed existing-
  history adoption; reject superseded revision reactivation and stale preview/new requests.
- **History:** Any committed order/item/service/invoice/item/payment, including drafts,
  cancelled/failed/zero/terminated states, locks base code and exponent. Latch only actual
  successful insertion in its transaction; cancellations/deletion attempts cannot clear it.
  Product prices block incompatible empty initialization/base switches even though they
  are configuration, not the history latch. Same-code/exponent metadata replacement
  requires reviewed compatibility; exact original references/anchor remain unchanged.
- **Concurrency:** Choose a schema-scoped exclusive transaction advisory lock, guard-first
  writer ordering and future BEFORE STATEMENT/row SQL safeguards, including settings,
  direct/nested/COPY/upsert/MERGE and status-only completion paths. Require explicit Read
  Committed and post-lock fresh queries/VOLATILE guard functions. Reject stronger-isolation
  mutations until separately proved. Preserve staff mutex before currency coordination,
  existing business lock order, bounded deadlines and classified whole-transaction retries.
- **Adoption:** Selection cannot activate until all writer versions are adopted/drained,
  exact provenance and normal-SQL privilege/guard controls are verified, and the owner
  authorizes maintenance/target/recovery. Direct control/ledger DML is not a normal writer
  permission. Database-owner credentials can bypass protections and remain a separate risk.
- **Legacy:** Unknown units/policy stay unknown; no conversion, rescaling, relabelling or
  backfill. Later additive reviewed evidence may bind original facts without rewriting
  historical money. New records pin exact units and creation policy; renewal/payment/refund
  obligation lineage stays distinct from the policy authorizing the later operation.
  Per-currency/compatible-unit reads and approved same-currency routes are later consumers.
- **Security:** Full-administrator route/service checks, enrolled and verified MFA/current
  session, re-read locked auth facts, signed CSRF and proposed password/fresh-factor
  step-up proof bound to actor/session/revisions/generation/digest/assessment. One-use
  proof, CAS, ledger and redacted activity audit commit atomically. No new endpoint,
  grant, confirmation token or proof is implemented by accepting this design.
- **Next slice:** Propose an unused read-only adoption preflight with consistent-snapshot,
  bounded per-code counts and explicit unknown/uncovered blockers; no money totals,
  base inference, ready-to-activate verdict or selection writes. Do not assign/authorize
  its command number here. Stop for separately authorized Command 100 phase review.
- **Boundary:** Existing source/financial facts, tooling mitigations/acceptance and schema
  remain unchanged. Metadata/provider/source rights, D5–D8, protected WHMCS/credit,
  maintenance/recovery and production gates are not approved; no provider/import/deployment.

## ADR-094 — Inspect currency history without selecting or certifying adoption

- **Status:** Accepted for the owner-authorized Command 100 phase review; Command 101 was subsequently authorized on 2026-10-07
- **Date:** 2026-10-07
- **Review:** Command 100 at `c15117c0974f3bbb3b5ab68812182ad6d58ed196` satisfies its
  documentation-only design scope. Exact-head CI Validate passed all 28 steps and CodeQL
  all eight; PR-only Dependency review skipped on push. No runtime correction is required.
  Guard-first coordination, permanent base code/exponent history, unknown legacy facts,
  writer drain/privileges and security/audit are designed, not installed or tested protocols.
- **Decision:** Define **Command 101 — Build a read-only currency adoption preflight**
  requiring separate implementation authorization. Keep it an unused injected-client
  entry owning a bounded top-level Repeatable Read/READ ONLY transaction, fixed qualified
  source queries, transaction-local deadlines and fail-closed permission/visibility checks.
  No root/app/CLI consumer, caller-owned transaction, connection discovery or schema change.
- **Observation:** Exact string all-row counts for seven money tables, six-table history
  distinction, deterministic bounded code groups with explicit omitted rows, UTC database
  observation time and aggregate-only gateway-evidence counts. No amounts, customer IDs,
  code support/precision/base inference, provenance resolution or readiness verdict.
  Missing selection implementation and unestablished writer/adoption/evidence coverage
  remain explicit even when empty; results never replace a later locked assessment.
- **Acceptance:** Source/mock and mandatory new guarded fictional SQL tests prove snapshot
  consistency, database-enforced read-only, budgets/cancellation, no pooled-setting leak,
  RLS/permission/search-path safety and unchanged historical/audit/outbox facts. Keep all
  24 migrations and prior-22/23 history tests; complete local and exact-head hosted gates.
- **Boundary:** This review only defines that slice. No preflight implementation/live query,
  selection/latch/guard/proof/ledger, writer integration, backfill/registry, provider/import,
  operating approval, cleanup or deployment. Tooling/governance/database-owner and launch
  risks are unchanged; ask for explicit Command 101 authorization and stop.

## ADR-095 — Own a bounded read-only currency observation, not adoption authority

- **Status:** Command 101 delivered at `1795160` with complete local/exact-head hosted acceptance; owner-authorized phase review accepted the scope on 2026-10-07
- **Date:** 2026-10-07
- **Decision:** Add only the unused `currency-adoption-preflight` database entry with
  injected transaction-capable client and explicit bounded schema/limits. Own one Repeatable
  Read transaction; set/verify READ ONLY, local search path/row-security and database/client
  deadlines. No caller-owned transaction, root/app/HTTP/CLI consumer or connection discovery.
- **Scope:** Fixed qualified ordinary-table counts across seven money tables and aggregate-
  only event evidence presence. Use canonical PostgreSQL BIGINT strings and BigInt arithmetic;
  deterministic maximum 32 displayed groups with exact omitted/unresolved row counts.
  No amounts, identities, policy/metadata inference, hidden unknown codes or readiness verdict.
  Empty observations still expose missing selection/writer/adoption/provenance assessment.
- **Failures:** Unknown input fields, identifiers or budget values reject before work.
  Missing sources/permissions, restrictive RLS, unverified transaction state, corrupt counts
  and timeouts fail without partial result or raw SQL/connection causes. No retry. Local
  settings/roles revert; statement/transaction deadlines bound work beyond client waiting.
  LIMIT does not bound count/group scans or guarantee zero disk/resource impact.
- **Acceptance:** Source tests and mandatory guarded SQL tests verify actual read-only
  rejection, exact counts, snapshot races, limits/acquisition/timeout/reuse, RLS/permissions,
  decoys/missing tables and unchanged historical/settings/unit/policy/audit/outbox rows.
  Existing prior-22/23 comparisons, scope guards and all 24 migrations stay intact.
  Restricted-role tests use existing roles locally; no global role/grant mutation.
- **Boundary:** No selected pointer, history latch, SQL privilege/guard adoption, security
  proof/ledger, legacy linkage/backfill, registry publication, provider/import/live query,
  operating approval, release or deployment. Trusted injected clients and database-owner
  bypass remain residual powers; observation is not a complete obligation/provenance audit.
  Stop after verified delivery for a separately authorized Command 101 phase review.

## ADR-096 — Prove cooperative coordination before installing selection authority

- **Status:** Accepted for the owner-authorized Command 101 phase review; Command 102 subsequently authorized on 2026-10-07
- **Date:** 2026-10-07
- **Review:** Command 101 at `17951608eae4622bd88033e44b02bcb5bc467bbe` satisfies its
  unused read-only observation scope. Fresh thirty database source and thirty actual SQL
  cases, seed/verifier, 93 shared tests, builds/types and ten mitigation checks passed.
  Source-head CI passed all 28 Validate steps and CodeQL all eight; PR-only review skipped.
  No in-scope implementation defect or runtime consumer found. This does not certify
  provenance, writer coverage, initialization eligibility or safe live-data access.
- **Decision:** Define **Command 102 — Build an unused currency coordination transaction
  primitive** before selection state or writer integration. Own a bounded explicit Read
  Committed/read-write transaction, verify modes/deadlines, derive one fixed qualified
  schema/database-scoped transaction advisory key and run a trusted database-only body
  after acquisition. Later statements must see the previous participant's committed facts.
  No supplied keys, caller-owned transaction, session lock, callback retry or external I/O.
- **Composition:** Where explicitly required by trusted server configuration, acquire
  existing staff mutex `920006` before currency coordination. This choice authenticates
  nobody; later locked session/MFA/role facts, CSRF, proof, control/business order and atomic
  audit remain required. No arbitrary pre-lock callback or auth row lock is introduced.
- **Acceptance:** Mandatory new owned fictional source/SQL tests for serialization, fresh
  post-wait reads, staff ordering, independent schemas, mode/decoy/deadline refusal,
  rollback/connection/lock release and no pool leakage. Demonstrate nonparticipating SQL
  bypass; advisory locking is cooperative, not normal-SQL currency enforcement. Preserve
  24 migrations, prior history and read-only preflight acceptance; complete local/hosted gates.
- **Boundary:** No primitive is implemented by this review. No control/latch/selection/
  ledger/proof/SQL guard or privilege installation, writer/auth adoption, legacy linkage,
  registry, live query/import, policy activation, operating approval or deployment.
  Database-owner powers, unknown provenance, stale observations, retained tooling/wider
  input-resource risk, direct-main governance and launch gates remain without waiver.
  Ask for explicit Command 102 authorization and stop after review delivery.

## ADR-097 — Owned cooperative coordination without currency or actor authority

- **Status:** Command 102 delivered at `fdcaea6` with complete local/exact-head hosted acceptance; owner-authorized phase review accepted its scope on 2026-10-07
- **Date:** 2026-10-07
- **Decision:** Add only the unused `currency-coordination` database entry. Require
  injected transaction-capable client, explicit bounded schema, explicit trusted staff
  composition and shorter positive limits. Own Read Committed/read-write transaction;
  verify local modes/visibility/deadlines and schema USAGE/identity. No caller-owned
  transaction, root/application consumer, discovery, external effects or retries.
- **Key:** Freeze two-int `hashtext('webhost-billing.currency-coordination.v1:' ||
current_database()), hashtext(schema)` computed by qualified PostgreSQL functions;
  no client key or search-path fallback. Collisions over-serialize, never bypass locking.
  Required staff composition takes existing single-bigint mutex `920006` first, before
  currency coordination; it authenticates nobody. Future guards must use identical keys.
- **Body:** Trusted database-only callback after lock acquisition and verified granted
  locks, with fresh subsequent statements. Verify modes/identity/locks again after body;
  caught aborted SQL cannot acknowledge a rolled-back commit. Return void only after
  commit; runtime body return values reject. No handle, release function or policy token.
  Safe errors redact causes; no statement/transaction/callback retry or partial result.
- **Limits:** Helper-owned locks/local settings end with the transaction; no session lock/
  unlock. Trusted clients/body/getter code is not sandboxed; deadlines do not cancel
  JavaScript or external effects. Violating transaction/session control is unsupported.
  Unobserved commit transport failures can have uncertain outcome, not automatic rollback;
  future financial receipts/idempotency remain necessary before integration.
- **Acceptance:** Mandatory source and actual owned fictional SQL tests cover real waits,
  fresh reads, staff-first ordering, rollback/deferred commit refusal, wrong modes/roles,
  acquisition/lock/statement/transaction failure and pool/lock reuse, independent schemas/
  decoys, no returned authority and demonstrable nonparticipating SQL bypass. Probe-only
  writes/verified cleanup preserve prior rows, 24 migrations and seed/verifier assertions.
- **Boundary:** Cooperative unused infrastructure, not writer adoption or ordinary-SQL
  currency enforcement. No selection/control/latch/proof/ledger/grants, financial/auth/
  worker consumer, provenance/registry, live-data access/import, operating approval or
  deployment. Retain tooling/governance/database-owner and launch risks without waiver.
  Stop after verified delivery for separately authorized Command 102 phase review.

## ADR-098 — Prove statement-level SQL coordination only in fictional scopes

- **Status:** Accepted for the owner-authorized Command 102 phase review; Command 103 subsequently authorized on 2026-10-07
- **Date:** 2026-10-07
- **Review:** Command 102 at `fdcaea6b086593260b71c198efc99f18d373f769` meets its unused
  cooperative transaction scope. Exact-head CI passed all 28 Validate steps; CodeQL all
  eight, PR-only review skipped. No in-scope source correction or runtime consumer found.
  Ordinary SQL bypass is an explicit tested limit, not a missing promised policy guard.
- **Decision:** Define **Command 103 — Build an unused SQL currency coordination guard
  prototype**. Add only a pure separate-entry SQL renderer; the guarded mandatory tests
  alone may install its fixed functions/triggers in newly owned nonce fictional schemas.
  No migration, executing installer, existing-scope installation or application consumer.
- **Contract:** VOLATILE SECURITY INVOKER, fixed qualified catalog context, actual trigger
  schema/table/OID checks and Command 102's identical two-int transaction key. Statement
  DML coordination for seven money tables plus settings/events; reject prototype TRUNCATE.
  Verify caller-established Read Committed/read-write and bounded deadlines before work,
  preserve shorter limits and never set an in-flight statement's timeout as a safety claim.
  No session lock, staff/auth lock, automatic retry, SECURITY DEFINER or global grants.
- **Limits:** Statement serialization is not policy/row/provenance validation or an
  initialization race solution. It cannot refresh the initiating statement's snapshot or
  undo earlier row locks. Guard-first application adoption, post-lock volatile validation,
  singleton/latch/selection/ledger/proof, reviewed privileges and writer drain remain future.
  Non-owner trigger tests do not establish deployed role hardening; owner bypass remains.
- **Acceptance:** Future mandatory owned PostgreSQL tests must prove both SQL/helper wait
  directions, real locks, release/reentrancy, all target/statement forms, actual non-owner
  operation and inability to disable triggers, mode/deadline/decoy refusal, snapshot limits
  and safe reversed-order failure. Keep prior rows/migrations/seed/verifier intact and
  remove test-only objects under marker checks. Complete local/exact-head hosted gates.
- **Boundary:** No prototype is implemented by this review. No policy activation, writer
  adoption, real-data query/import, provenance/registry publication, provider, operating
  approval, cleanup or deployment. Retained tooling/governance/resource and launch risks
  remain without waiver. Ask for explicit Command 103 authorization and stop.

## ADR-099 — Test-only statement coordination is not runtime policy or timer authority

- **Status:** Command 103 delivered at `2c05dce` with complete local/exact-head hosted acceptance; owner-authorized phase review accepted its unused scope on 2026-10-08
- **Date:** 2026-10-08 (owner authorization began 2026-10-07)
- **Decision:** Add a separate pure fixed SQL renderer, unused by the product. Only the
  mandatory test process may install it atomically in nonce scopes it newly creates and
  marker/model/raw/loopback verifies. No application installer, schema/migration or
  global roles, grants, owner changes or adopted writer. Reject collisions/unsupported
  target contexts before installation; qualify catalog objects and actual context.
- **Contract:** VOLATILE SECURITY INVOKER before-statement guards on nine ordinary targets,
  Command 102's identical two-int transaction key, Read Committed/read-write, positive
  caller-established settings bounded by 500/2000/10000 ms. No late statement-timeout
  rewrite, widening/retry, policy/history lookup, latch or row/currency join validation.
  Reject truncate. Reentrant locks last through commit/rollback; errors in the function
  are redacted and rethrown, while native errors/fatal disconnects retain server semantics.
- **Proven limits:** Statement waiting retains the initiating snapshot; later Read Committed
  reads can see the commit. Row-first ordering can fail and must roll back, not swallow
  failure or partially commit. Current settings do not certify an internal timer:
  PostgreSQL does not rearm an active transaction timer when lowering its positive
  setting. Trusted callers establish the first active deadline correctly or use independent
  bounded client control. No claim that the SQL function certifies earlier setup or prevents
  later privileged settings changes. Future adoption requires connection/deadline controls.
- **Acceptance distinction:** Actual existing non-owner `pg_write_all_data` permits DML/copy
  but lacks SELECT. Exercise its permitted writes on all nine targets without new grants;
  owner fixtures cover read-dependent conflict/merge/nested/snapshot/row-lock cases.
  Non-owner refusal to disable/drop/replace triggers or set replication bypass is tested;
  owner/superuser bypass remains. This is not production runtime-role hardening.
- **Boundary:** Keep all prior acceptance/24 migrations/seed/verifier, compare existing rows
  and remove exactly owned test objects after marker verification. Preserve the incomplete
  unmarked scope and recoverable ignored cache backup. Tooling/governance/resource and
  operating/import/launch risks remain without waiver. Stop after validated delivery for
  **Phase review — Review Command 103 SQL coordination guard prototype and define the next
  bounded currency command**; do not define/implement the next command automatically.

## ADR-100 — Stage unknown control facts before allowing assessed currency authority

- **Status:** Accepted for the owner-authorized Command 103 phase review; Command 104 subsequently authorized on 2026-10-08
- **Date:** 2026-10-08
- **Review:** Command 103 at `2c05dce1e5bbfe542cb1bba479b799187140c073` meets its pure
  unused renderer/test-only installation contract. Fresh 42 source/56 SQL cases and
  seed/verifier passed. Exact-source-head CI passed all 28 Validate steps and CodeQL all
  eight; PR-only review skipped. No runtime consumer or in-scope source repair found.
- **Decision:** Define **Command 104 — Stage unselected currency control storage**.
  One future additive empty key-1 singleton store and unused explicit stage/read entry.
  The only legal staged shape is generation zero, null selected revision/base-anchor
  fields and a null history latch meaning unknown. A new row is not history-free.
  No migration seed, history scan, assessment or selected-state transition is permitted.
- **Integrity:** SQL enforces exact null/unassessed shape and uniqueness; denies ordinary
  update/delete/truncate, including no-op statements. Insert/replay creates uncertainty
  only. Same Command 102 owned coordination, fresh qualified reads after acquisition,
  strict inputs/identity/budgets and copied commit-only results; no authority or handle.
  Preserve the 24 migrations and prior-22/23 rows; add prior-24 comparisons and mandatory
  fictional/non-owner/concurrency/mutation/recovery acceptance. Complete local/hosted gates.
- **Refinement:** Unknown staging is an intermediate state before the final proposed
  permanent boolean history latch. A later separately authorized migration must open
  assessed/selected states with reviewed transition/security/SQL/writer/drain/evidence
  controls. NULL must never silently coerce to false or become initialization eligibility.
- **Recovery qualification:** Command 103's caught-error evidence covers JavaScript catch
  without SQL recovery. Raw savepoints/outer PLpgSQL handlers may recover an error and
  keep earlier work; triggers cannot promise irrevocable whole-transaction abort. This
  review documents the primary-source boundary, not a newly executed recovery test.
  Future mandatory storage tests include it; adopted workflows need complete atomicity.
- **Boundary:** No storage is implemented by this review. No history/latch activation,
  selection/ledger/proof, existing-financial-table guard/row/provenance or adopted writer,
  global privilege changes, registry/pricing/FX, live-data query/import/provider, operating
  approval, existing-scope/cache cleanup, release or deployment. Timer/snapshot/row-first,
  trusted-caller/owner, uncertain commit, tooling/resource/governance and launch risks
  remain without waiver. Request explicit Command 104 authorization after review delivery.

## ADR-101 — An unassessed control row records uncertainty, never selection authority

- **Status:** Delivered at `73e31bd` with complete local/exact-head hosted acceptance; owner-authorized Command 104 phase review accepted its scope on 2026-10-08
- **Date:** 2026-10-08
- **Security continuation:** The published storage head's CI subsequently failed on newly
  reported Next.js production advisories. After an explicit repair question, the owner
  authorized pinned Next.js/matching lint configuration `16.3.8` and full renewed gates.
  Preserve patches/overrides and all acceptance; no audit waiver, currency expansion or
  deployment. Complete renewed local tests/browser/build passed and production audit
  reports no known vulnerabilities. Two retained development-tooling advisories remain
  without waiver; installed mitigation tests pass. The repair was committed, passed
  the cached pinned full-history scan (208 commits, no leaks), and was non-force pushed.
  Exact-head CI passed all 28 Validate steps and CodeQL all eight. PR-only review skipped,
  not passed. The phase review reverified both hosted runs and renewed local database/
  security acceptance; retained advisory/governance risks are not waived.
- **Decision:** Add exactly one empty additive `currency_controls` migration and Prisma
  model. Key 1, integer generation zero, null selected revision/history latch/exact anchor
  fields are the only legal state. SQL checks use explicit null predicates; nullable exact
  policy/unit references restrict update/delete. Neither absence nor uncertainty means
  history-free, eligible or initialized. Seed creates no row; no history scan is performed.
- **Immutability:** Invoker/fixed catalog-path before-statement guards deny ordinary
  update/delete/truncate, including no-row statements, only on this new table. Constant
  insert/conflict-do-nothing/COPY can create uncertainty only. Conflict-do-update denies.
  Owner/superuser DDL bypass remains; no global roles, grants or privilege installation.
- **Entry:** Separate unused `currency-control` exports bounded read and explicit constant
  stage, composed inside Command 102's owned transaction/key and trusted staff ordering.
  Strict explicit schema/limits; unknown supplied authority rejects before work. Qualified
  catalog/raw facts and actual model relation locks establish identity even when two
  stores are empty. Restrictive RLS/unsupported targets/missing privileges/corrupt rows
  fail closed. Read never inserts; copied JSON facts escape only after successful commit.
  No root/application/CLI/worker adoption, discovery, retry, callback or transaction handle.
- **Recovery:** Actual savepoint/outer PLpgSQL acceptance proves an outer raw transaction
  may retain earlier fictional work after recovering denied DML. The control facts still
  cannot mutate. Do not claim every SQL error necessarily aborts all outer work. Trusted
  client/owner powers, uncertain commit transport, deadlines and snapshot limits remain.
- **Preservation:** Keep all 24 prior migrations byte-for-byte and prior gates; add
  prior-24 all-row comparisons and update total expectations to 25. Extend the guarded
  verifier for the new shape/guards/empty seed, without weakening old seed/money checks.
  Mandatory source and newly owned fictional SQL cover identity, concurrency, post-wait
  facts, real deadlines/non-owner/mutation/recovery and historical preservation.
- **Boundary:** No assessment/latch activation, selected-state transition, security ledger/
  proof, adopted writer, existing-financial-table enforcement, provenance or runtime-role
  hardening. No live migration/import/query/provider, operating approval, release/deploy
  or existing-scope/cache cleanup. Later reviewed migration/transition/writer/drain and
  privilege/evidence controls are still required before selection. Retained tooling,
  governance/resource and launch risks are not waived. Stop for the Command 104 phase review.

## ADR-102 — Specify the assessed-state enforcement boundary before relaxing storage

- **Status:** Accepted for the owner-authorized Command 104 phase review; Command 105 subsequently authorized on 2026-10-08, documentation-only
- **Date:** 2026-10-08
- **Review:** No in-scope Command 104 source defect found. Fresh 51 source/70 fictional
  PostgreSQL cases and guarded seed/verifier passed, including actual COMMIT failure,
  non-owner/RLS/context refusal, concurrency/deadlines, recovery and prior-24 preservation.
  The additive verifier retains old money/seed checks and all 24 old migrations are
  unchanged. No application consumer or selected state is introduced.
- **Decision:** Define **Command 105 — Specify assessed-state transitions and activation
  prerequisites**, a documentation-only implementation specification. Command 100 already
  designed the protocol; now resolve exact legal tuples, whether assessed-unselected facts
  persist, the ordered migration/privilege/proof/ledger/SQL/writer dependencies and concrete
  fictional acceptance using the delivered 25-migration baseline. Identify one smallest
  later implementation candidate; do not start it or repeat generic currency design.
- **Reason:** Opening the zero/null storage shape alone would permit claimed history or
  selected policy without complete guard-first writers, exact-unit/state validation,
  current human authorization and atomic proof/ledger/audit. A second unused helper cannot
  supply those missing guarantees. Preserve unknown semantics until the complete transition
  boundary and maintenance/drain/recovery prerequisites are explicitly specified and tested.
- **Boundary:** This review changes five documentation files only. No migration/runtime
  repair, assessment/history query, selected fixture in an existing scope, role/grant,
  proof/ledger/executor, financial guard, writer adoption, provenance/backfill, registry,
  live query/import/provider, operating approval, cleanup, release or deployment.
  SQL recovery, initiating snapshots/internal timers/row-first order, trusted clients/
  owner DDL, uncertain commits, retained tooling and launch/governance risks remain.
  Ask for explicit Command 105 authorization after review delivery; stop.

## ADR-103 — Assessment is transaction-local and authority opens only with complete protection

- **Status:** Delivered at `64c1713` with local/exact-head acceptance; owner-authorized phase review accepts the documentation scope, not runtime implementation or activation
- **Date:** 2026-10-08
- **Baseline:** `3fd2defb54c7b3956225a0cbb1f54744b9691fcc`, 25 unchanged migrations.
  Its exact-head CI/CodeQL freshly reverified: all 28 Validate/eight CodeQL steps passed;
  PR-only review skipped. Current source shares database-secret configuration and has
  no proven hardened transition/proof role. No live privilege or history query performed.
- **State:** Only unknown zero/null or fully selected boolean/anchor tuples are proposed
  durable states. Assessment without selection exists only inside a trusted transaction.
  Explicit initialize/adopt sets generation 1; replacement increments it once with CAS/
  superseded-revision tracking. Generation exhaustion denies selection, not valid same-unit
  history work. First committed financial insertion latches and freezes the original base
  without incrementing selection generation; full tuple/evidence digest invalidates earlier
  false-history proof. False latch plus observed history is inconsistent, never base-switch
  permission. No null coercion, default metadata or preflight-based authority.
- **Trust:** Separate minimal non-owner business/proof/executor duties and non-login
  function owners; deny runtime direct authority DML/private proof reads/EXECUTE/escalation.
  Narrow qualified SECURITY DEFINER boundaries where required, restricted ACLs atomic
  with installation, actual login/temporary-shadow/owner-membership acceptance. Trusted
  proof-issuer compromise and privileged DDL remain residual powers, not human approval.
- **Atomicity:** Actor/session/action/body-bound five-minute-maximum opaque one-use proof,
  transaction-bound factor consumption at issuance, locked current authorization and
  fresh wall-clock/evidence at confirmation. CAS/ledger/activity/consumption commit together;
  matching authenticated replay returns the original receipt, not current-selection fiction.
  The initial implementation has no automatic retry, refining Command 100's proposed
  three-attempt default. Recoverable outer SQL cannot persist a partial transition;
  uncertain COMMIT acknowledgment stays unknown until authorized receipt inspection.
- **Coverage:** Refresh all nine SQL targets and all API/worker/settings/numbering/provider
  completion paths. Add renewal-policy localization rewrites and invoice business identity;
  explicitly retain standalone gateway claim/failure/reconciliation writes. Preserve exact
  legacy/new lineage and draft/issued boundaries. Draft currency-context edits need their
  own append-only context/compatibility implementation or explicit guarded-operation gate;
  do not claim their current behavior is already covered.
- **Opening:** Inert records/nullable links may precede activation, but shape relaxation,
  authorized update guard, exact anchor FK and complete row/latch/ACL manifest are one
  later protected installation unit under approved drain and write-blocking locks. Never
  commit an unguarded intermediate state or resume old writers. Preserve every old row;
  live migration/roles/metadata/adoption/maintenance/recovery approvals remain separate.
- **Sequence:** Section 3d specifies dependency slices P1–P9 with targets/acceptance/stops.
  The smallest next implementation candidate is **Build an isolated currency privilege
  acceptance harness**: fresh disposable loopback cluster and actual non-owner logins,
  no roles/grants on the shared cluster or selected product state. It is not implemented,
  numbered or authorized by Command 105; the next phase review decides the exact command.
- **Boundary:** Five documentation files only. Proposed concurrency/security/adoption
  scenarios are designed, not executed here. Frozen install/security/doc checks and hosted
  gates validate documentation delivery, not installed enforcement. No dependency/schema/
  runtime change, existing-scope/cache cleanup, Docker pull, live query/import/provider,
  operating approval, release or deployment. Stop for the Command 105 phase review.

## ADR-104 — Prove privileges with fresh-cluster login tests before authority prototypes

- **Status:** Accepted for the owner-authorized Command 105 phase review; Command 106 defined, not authorized or implemented
- **Date:** 2026-10-08
- **Review:** No blocking in-scope specification defect found. Exact control tuples,
  transaction-local assessment, first-history/full-state invalidation, stable replay
  intent versus assessment binding, atomic proof/CAS/ledger/audit, writer/drain and
  opening dependencies are explicit. Current source still permits only zero/null;
  all 25 migrations and runtime/tests/workflows are unchanged by Command 105. Current
  shared connection configuration/predefined-role tests are not hardened live roles.
- **Evidence:** Freshly verified `64c17136e1029ee8fd35a9883144b289a070e6f7` CI aggregate/
  all 28 Validate steps and CodeQL aggregate/all eight steps. PR-only dependency review
  skipped, not passed. Review's 51 source tests, ten mitigation tests and production
  audit passed; full audit retains braces high/sprintf-js moderate findings, not a waiver.
  No new SQL/production privilege proof is claimed by this documentation review.
- **Decision:** Define **Command 106 — Build an isolated currency privilege acceptance
  harness**, P1 only. Installed tools, one nonce-owned loopback disposable container,
  verified cached immutable PostgreSQL image, bounded tmpfs/resources/deadlines and
  exact ownership cleanup. Mandatory database/root/CI wiring keeps every old test.
  Distinct authenticated fictional login roles plus non-login minimal owners test
  actual ACL/EXECUTE/membership/DDL/temporary-shadow boundaries. Clearly fictional
  probe functions are not currency transition/proof implementations or human approval.
- **Preservation:** All 25 migrations remain byte-for-byte; product stores stay empty
  or explicitly zero/null. No data-volume reuse, existing-cluster role DDL, shared
  connection fallback, image pull, optional skip or broad cleanup. Missing cache,
  resources, ownership or cleanup proof fails closed. No secret SQL/URLs/raw errors.
- **Qualification:** Docker/admin compromise remains outside fictional SQL separation.
  ACL denial is not row-policy validation; a probe success is not installed production
  authority, provider readiness or launch approval. P2–P9 remain separately gated;
  exact legacy lineage/draft compatibility/auth races/writers/drain/atomic opening
  still need implementation and acceptance. No nine-command completion forecast.
- **Boundary:** Five documentation files only. No PostgreSQL container/role/probe creation in this
  review, no source/schema/dependency/workflow change, no current database/history
  query, import/provider/operating approval, existing-scope/cache cleanup, release or
  deployment. Retained tooling/resource/governance and outstanding business/activation
  approvals remain. Ask for explicit Command 106 authorization after review delivery.

## ADR-105 — Keep privilege acceptance in an independently owned memory-only cluster

- **Status:** Delivered at `fb86cca` with local/exact-head acceptance; owner-authorized phase review accepts P1 engineering scope on 2026-10-09
- **Date:** 2026-10-08
- **Decision:** Implement only P1 under database test files, with installed pg/tsx tools
  and mandatory package/root/CI wiring. One nonce-labelled container/network,
  approved cached Linux/amd64 PostgreSQL 18.6 digest, immutable image ID, no pull/fallback,
  127.0.0.1 dynamic port, bounded tmpfs/CPU/memory/PIDs/logs/connections and separate
  startup/SQL/child/whole-run/cleanup deadlines. Require Docker Engine 28+ for the documented
  localhost publication boundary; no engine update or ceiling increase is implied.
- **Ownership:** Verify full returned IDs, labels/image/mount/network/port manifest,
  server version/data/database/user/address and an out-of-product nonce marker before
  migrations/login DDL. Reverify before exact-ID cleanup; foreign/uncertain ownership
  or failed client closure fails the gate. Never adopt leftovers or prune shared data.
- **Secrets:** Independent generated SCRAM credentials are not inherited, returned,
  logged, written to host files or placed in Docker arguments/Config.Env. Bootstrap
  bytes travel through captured child stdin into the verified bounded memory-only tmpfs;
  all captured raw Docker/SQL causes are replaced by fixed phases/codes/validated SQLSTATE.
  Persistent container logging is disabled and inspected (`--log-driver=none`), rather
  than relying on severity settings to prevent credential SQL from reaching host logs.
- **Acceptance:** All 25 original migrations and raw-byte checks remain intact. Only
  an operator-staged key-1 zero/null control is allowed. Four real fictional login
  connections and two minimal non-login owners test precise denial versus authorized
  fictional positive probes, default/PUBLIC ACLs, escalation, guard DDL, temporary/overload
  decoys and restrictive RLS. Every denied query rechecks trusted facts/objects/role/ACL
  snapshots; existing guard no-ops are separate integrity, not ACL, evidence.
- **Correction:** PostgreSQL function PUBLIC defaults require creator-global default
  revocation; per-schema revocation cannot remove a global default. Fixture creation and
  explicit grants remain atomic and probe transactions always roll back.
  The initial hosted image-cache preflight failed before resource creation. The correction
  inspects the approved digest directly and prepares only that pinned Linux/amd64 image
  in CI before ordinary package tests; the harness itself never pulls or falls back.
  Corrected exact-head CI passed all 29 Validate steps; CodeQL all eight. PR-only
  dependency review skipped, not passed. No existing acceptance was relaxed.
- **Boundary:** No dependency/runtime/export/schema/migration change, real issuer/
  transition/latch/ledger, selected policy, shared-cluster role grant or production action.
  SQL deadlines do not sandbox arbitrary JavaScript, Docker administrators or privileged
  recovery. Retained development advisories, disk/governance risks and P2–P9 prerequisites
  remain unwaived. Stop for the Command 106 phase review; no automatic P2 authorization.

## ADR-106 — Repair new tooling advisories before extending currency authority

- **Status:** Accepted for the owner-authorized Command 106 phase review; Command 107 defined only, not authorized or implemented
- **Date:** 2026-10-09
- **Review:** No blocking in-scope P1 source defect found. Mandatory actual-login evidence,
  exact image/nonce/tmpfs ownership, separate cleanup deadline, cached failed closes,
  pending acquisition refusal and secret redaction remain test-only boundaries. All 25
  migrations and application exports/consumers remain unchanged. Docker administrator,
  privileged DDL and detached trusted JavaScript are not sandboxed; no production grant
  or complete writer/selection enforcement is certified by this harness.
- **Evidence:** Freshly reverified `fb86ccaaab831596c76e73d899ffcb6089df6b12` CI aggregate/
  all 29 Validate steps and CodeQL aggregate/all eight. Fresh 68 source and ten mitigation
  tests passed; no new actual-login SQL run is claimed by this documentation review.
- **Security gate:** Fresh production audit exited 0/no known findings. Full audit exited
  1 with five development advisories: retained braces high/sprintf-js moderate plus
  Handlebars `4.7.9` AST type confusion and own-property bypass (critical), and unsafe
  inline precompiled output (moderate). Actual dependency paths are ts-jest in API,
  worker and queue. Published maintainer [release 4.7.10](https://github.com/handlebars-lang/handlebars.js/releases/tag/v4.7.10)
  addresses all three; registry version/integrity were verified read-only. This is not
  evidence of production exploitability or compromise, nor permission to dismiss tooling.
- **Decision:** Define **Command 107 — Repair newly disclosed Handlebars tooling advisories**:
  narrow exact patched resolution, installed real-consumer security/compatibility tests
  and complete renewed acceptance. Keep both exact-version local patches and all ten
  existing mitigation checks; braces 3.0.4/sprintf-js 1.1.4 registry lookups still returned
  no matching version. No upgrade, new patch, override, audit suppression or waiver is
  performed by this review. A different required repair needs explicit authority.
- **Currency handoff:** P2 inert authority records remain a dependency candidate, not
  Command 107, a defined P2 command or an authorization. After security acceptance and
  its phase review, define the next smallest currency slice. Do not persist proofs,
  receipts or assessed state, relax controls, create roles, adopt writers or activate now.
- **Boundary:** Five documentation files only. No dependency/lockfile/runtime/schema/
  workflow change, SQL/container/role creation, live query/import/provider, broad cleanup,
  release or deployment. The known full audit remains failed; document-only hosted success
  cannot close it. Stop and ask for explicit Command 107 authorization after review delivery.

## ADR-107 — Pin the patched Handlebars tooling release and test installed consumers

- **Status:** Delivered at `ecfdd16`; owner-authorized phase review accepts engineering scope on 2026-10-09
- **Date:** 2026-10-09
- **Resolution:** One exact global `handlebars: 4.7.10` override, with the regenerated
  lockfile changing only that resolution/snapshot and the ts-jest edge. The published
  registry integrity matches the lockfile. No new runtime dependency, major upgrade,
  install workaround or unrelated override. Resolve through each actual API/worker/
  queue package's ts-jest entry rather than a guessed pnpm store path.
- **Acceptance:** Five mandatory bounded-child groups supplement the ten unchanged
  registered-patch/container/installed-mitigation checks. Each child verifies all three
  real consumers before testing. Precise AST validation and known-node rejection,
  own prototype constructor denial under permissive prototype defaults, inline
  precompiled script/comment escaping, and positive AST/render/precompile/partial/
  escaping/Map/Set/generator behavior are tested against installed code.
  Map iteration now yields entry pairs, as documented by the maintainer release;
  the positive fixture records that behavior rather than restoring an old assumption.
- **Safety:** Same sanitized environment, 128 MiB heap, 512 KiB stack, 15-second
  child deadline, 20-second parent deadline and 64 KiB output limit. Canaries change
  an in-memory boolean only; no probe executes a subprocess, network operation or
  filesystem mutation. Invalid ASTs require the specific expected validation error,
  not an arbitrary exception. Only compiler output from known positive templates
  is evaluated in a separately time-bounded VM. Failed new probes emit fixed errors,
  never raw templates/generated JavaScript/contexts/stacks or credentials.
- **Security state:** Post-repair production audit exits 0 with zero known findings.
  Full audit exits 1 with retained braces high and sprintf-js moderate findings only;
  all three newly disclosed Handlebars findings are absent. This is not a clean
  full audit, a waiver, evidence of compromise or a production-readiness approval.
  Both original registered patches/hashes, all ten prior checks and every Docker
  patch-copy/install gate remain unchanged and mandatory.
- **Boundary:** No application behavior, currency contract/export/schema/migration,
  proof/ledger/evidence storage, writer/role adoption, selected/assessed state, live
  query/import/provider, release/deployment or unrelated cleanup. Complete local
  validation is serial under host resource constraints. Freshly reverified exact-head
  CI 37901445001 passed ordinary root acceptance and all 29 Validate steps; CodeQL
  37901445054 passed all eight. PR-only dependency review skipped, not passed. Neither
  hosted success nor this review waives remaining advisories or activates currency.

## ADR-108 — Prepare strict selection requests before authority storage

- **Status:** Accepted for the owner-authorized Command 107 phase review; Command 108 subsequently authorized on 2026-10-09
- **Date:** 2026-10-09
- **Review:** No blocking in-scope Command 107 defect found. Narrow real-consumer resolution,
  precise repaired-boundary tests, bounded sanitized child execution, positive compatibility,
  unchanged ten original checks/patches/container gates and unchanged runtime/migrations
  satisfy its authorized scope. The maintainer identifies 4.7.10 for all three advisories.
  Fresh frozen install, 15 tooling and 68 database source tests passed; full audit still
  exits 1 with the two retained findings, production audit exits 0/zero known findings.
- **Decision:** Define **Command 108 — Build unused currency selection request contracts**,
  P2a only: a separate unused shared entry for bounded JSON-text parsing and six strict
  confirmation fields. Explicit null, canonical BIGINT generation, exact revision/key/
  opaque token shape, action/state consistency, copied facts and fixed redacted failures.
  Do not expose raw validation errors or log accepted bearer-containing requests.
- **Reason:** P2 combines request contracts with security-sensitive proof/ledger/evidence
  storage. Isolate the already specified input boundary first, so a later storage design
  cannot confuse client claims with server assessment. No new authority object, session/
  credential retention dependency, privileged mutation surface or schema opening is needed
  for this slice. Server installation identity, ordered stable-intent/assessment digests,
  evidence lifecycle and exact protected storage references remain separately reviewed.
- **Qualification:** Syntactic success is not a valid proof, authorized actor, selected
  revision, empty-history verdict or receipt. Request generation maximum can parse but
  future selection must deny increment overflow. P2a does not complete P2 or reduce the
  P3–P9 writer/auth/lineage/activation prerequisites. No completion-date/count promise.
- **Boundary:** Five documentation files only in this review; no source/dependency/schema/
  workflow/role/PostgreSQL container/database change, new actual-login SQL, live query/import/provider,
  operating approval, release/deploy or unrelated cleanup. Fresh exact delivery evidence is
  distinct from rerunning complete local acceptance. Stop for explicit Command 108 authority.

## ADR-109 — Decode selection request syntax without exposing authority or diagnostics

- **Status:** Delivered at `a1fcbb6` with local/exact-head acceptance; owner-authorized phase review accepts request-syntax scope on 2026-10-09
- **Date:** 2026-10-09
- **Entry:** Separate unused `@webhost-billing/shared/currency-selection-request` subpath;
  no root or application export/consumer. One bounded primitive JSON-text decoder,
  private Zod schemas, copied/frozen six-field successes or one fixed frozen failure.
  Caller object graphs are never inspected/coerced. UTF-16 length rejects huge strings
  before encoder allocation; actual 4 KiB UTF-8 bytes are checked before JSON parsing.
- **Syntax:** Reuse existing policy revision grammar/ceiling with full-input ASCII
  matching; exact UUID grammar/case, 43-character base64url bearer shape, canonical
  generation strings through PostgreSQL BIGINT maximum. Bounded grammar/length checks
  precede BigInt comparison. Initialize/adopt require explicit null/zero; replace requires
  non-null/positive and a different case-sensitive proposed revision. Maximum syntax
  permits no increment. No floating-point money/generation conversion or inferred state.
- **Ambiguity and redaction:** Strict unknown/nested/authority rejection; additionally
  reject duplicate JSON member names, including escaped aliases, which JSON.parse would
  otherwise overwrite. Only after valid JSON and a flat six-field shape, a bounded quoted-
  token walk checks decoded key uniqueness; it is not a general-purpose JSON parser.
  No raw syntax/Zod issues, inputs, causes or bearer values appear in failure results.
  Accepted requests intentionally contain the opaque bearer and must never be logged.
- **Qualification:** Success is syntax only, never an authenticated actor, valid/issued
  proof, history verdict, selected revision, receipt or replay permission. No randomness,
  clock, hashing, persistence, environment/network/provider operation or transaction handle.
  Existing UUID nil/max shapes remain syntactically accepted, not meaningful request authority.
- **Boundary:** No existing contract behavior, database model/migration, P2 store/digest,
  proof/executor/role, selected/assessed state, control guard, writer/lineage, endpoint/UI,
  live query/import/provider, operating approval, deployment/release or unrelated cleanup.
  Retained advisories, local resource limits and all later activation gates remain.
  Stop after complete validated delivery for the Command 108 phase review.

## ADR-110 — Resolve authority identity and canonical bindings before inert storage

- **Status:** Accepted for the owner-authorized Command 108 phase review; Command 109 subsequently authorized on 2026-10-09, documentation only
- **Date:** 2026-10-09
- **Review:** No blocking in-scope Command 108 defect found. Bounded primitive JSON text,
  strict six-field action/state checks, canonical exact generations, complete-match
  revisions, duplicate/escaped-key rejection, copied frozen facts and fixed redaction
  match the command. Root/runtime consumers and all 25 migrations are unchanged.
  Bearer shape and UUID nil/max syntax are not authority; accepted requests must not be logged.
- **Evidence:** Freshly reverified exact `a1fcbb6` CI aggregate/all 29 Validate steps,
  CodeQL aggregate/all eight steps and hosted logs, first attempts. Ordinary root/shared
  112, database source 68/actual-login 11/retained SQL 70, API 107/worker 29/web 572,
  API integration 81, invariants and browser 19/four passed. PR-only review skipped.
  Fresh local shared 112/build/types, source 68 and tooling 15 passed. Production audit
  exited 0/zero known findings; full audit exited 1 with the same two unwaived findings.
  Prior local resource/automation failures remain recorded, not diagnosed or fixed here.
- **Decision:** Define **Command 109 — Specify canonical currency authority bindings**,
  documentation only. Make Command 105's domain-separated stable-intent and assessment
  tuples, identity authority, bounds, fictional vectors and future reference lifecycle
  precise before implementation/storage. Do not repeat the overall currency protocol.
- **Reason:** No persistent installation identifier or dedicated authorization epoch is
  present in the inspected schema. Session heartbeat and general updatedAt are mutable;
  password reset revokes sessions, MFA disable deletes the credential/recovery rows and
  regeneration replaces recovery rows. Currency evidence must neither retain secrets nor
  block those operations. Runtime logout revokes, not deletes, sessions; deletion appears
  in fictional integration teardown. Historical references and UUID text/database aliases
  must be specified without confusing current authorization with replay fingerprints.
- **Qualification:** Proposed identity/version/evidence storage is not installed or
  approved live data. Digests cannot certify human intent, empty history or successful
  selection. Complete tuple/first-history binding and original-intent replay stay separate.
  P2 authority records and P3–P9 adoption/activation remain gated; no count/date forecast.
- **Boundary:** Five documentation files only. No source/schema/dependency/workflow/role/
  PostgreSQL container/database change, new SQL/live history query, digest/proof/selection,
  import/provider/operating approval, release/deploy or unrelated cleanup. Existing
  direct-main governance, tooling risks and business/activation approvals remain.
  Stop after validated delivery and ask for explicit Command 109 authorization.

## ADR-111 — Bind original intent separately from fresh state and non-secret auth evidence

- **Status:** Delivered at `3c4606c`; owner-authorized phase review accepts documentation scope on 2026-10-10, not runtime implementation
- **Date:** 2026-10-09
- **Baseline:** Clean `c3b7dff50ae66da08275878466abc992ac9ee5d9`, 25 unchanged migrations.
  Command 108 and its final review's exact-head CI/CodeQL metadata/jobs were freshly
  verified, all 29/eight steps and first attempts; PR-only dependency review skipped.
  Fresh source/shared/tooling checks and production audit passed; full audit retains two
  unwaived development findings. No current database/history/privilege query occurred.
- **Identity:** Retained logical installation plus immutable execution-domain/placement
  incarnation and trusted operator-owned read-only pin. Restart preserves domain; reviewed
  restore/relocation rotates domain, preserves history and revokes old auth/proof before
  resume. Names/coordination keys/arbitrary UUIDs do not attest identity. Privileged copying
  of original pin/credentials and lost-history restoration remain P9/operational risks.
- **Auth:** Future dedicated positive auth/recovery-set epochs and usable state, not
  heartbeat/updatedAt or a hash of password material. Atomic security changes invalidate
  proofs; exhaustion blocks currency authority, never ordinary reset/logout/disable.
  Immutable public factor/credential/recovery identities have no FKs to deletable secret
  rows. Actor/profile/session history remains restricted; current auth is always rechecked.
- **Bytes:** Exactly ordered bounded UTF-8 primitive tuples S/A, domain-separated SHA-256,
  canonical string integers/nulls and ASCII sorting. Proposed/prior contexts each retain
  the 32-entry budget; full immutable units/anchor, ten-field auth snapshot and typed
  immutable evidence references bind assessment. Duplicate/unsupported/incomplete authority
  denies. Preserve request-key text but reserve one SQL UUID slot; aliases conflict rather
  than silently normalize into replay. No jsonb::text, locale order or browser digest authority.
- **History and replay:** Full C/state/first-history/evidence changes invalidate new proof
  even at unchanged generation. Current authorized matching original S returns only the
  committed receipt after later state changes/expiry; no second proof consumption/CAS.
  Restored-domain receipts are historical only, not replay authority. Uncertain commit is
  resolved by authorized receipt inspection, not automatic retry or assumed rollback.
- **Records:** Future exact intent/proof/H/E/policy/unit/activity references; separate
  immutable proof-consumption link and one deferred NO ACTION reciprocal FK resolve
  insertion ordering. Necessary links do not prove selection; qualified atomic P4 function,
  direct-write denial and transactional audit are still mandatory. Ordinary security
  deletion/revocation works without retaining passwords, bearer/factor/recovery secrets.
- **Qualification:** Ten fictional UTF-8/SHA-256 vectors independently agree in Node and
  .NET. This proves those literal byte calculations only, not a codec/SQL/privilege/approval
  implementation. Evidence payload/coverage, actual epochs/pin, SQL parity and P3–P9
  runtime/legacy/drain/recovery remain separately gated. No live approval or launch forecast.
- **Handoff:** Smallest candidate is empty inert installation/execution-domain storage
  with preservation and P1 distinct-login acceptance, not an issuer/helper/seed/open shape.
  No command number or implementation authorization assigned. Stop for Command 109 review.

## ADR-112 — Stage empty identity records without initializing currency authority

- **Status:** Review delivered at `b7d43af`; Command 110 delivered at `756b02e` with exact-head acceptance; engineering scope accepted on 2026-10-10
- **Date:** 2026-10-10
- **Review:** No blocking in-scope specification defect found. Stable S preserves exact
  original request identity separately from full fresh C/policy/unit/H/E assessment A;
  completed receipt reads still require current authorization. Domain recovery and
  dedicated auth versions cannot be replaced by mutable heartbeat or credential secrets.
  Ten persisted fictional vectors freshly match Node/.NET UTF-8/SHA-256 calculations;
  this is byte evidence, not codec/SQL/proof acceptance. Runtime and 25 migrations unchanged.
- **Evidence:** Fresh exact `3c4606c` CI aggregate/all 29 Validate steps and CodeQL
  aggregate/all eight passed, first attempts; PR-only dependency review skipped.
  Prior hosted root/source/actual-login/SQL/API/invariant/browser/build/audit acceptance
  was inspected, not rerun locally by this review. Fresh frozen/tooling 15/source 68/
  shared 112/build/types passed; production audit zero known findings, full audit still
  fails with the same two unwaived development advisories. No live database/role query.
- **Decision:** Define **Command 110 — Stage inert currency installation identity
  storage** only. Two explicit empty immutable models/tables, exact singleton/UUID/FK/
  placement grammar/digest shape, no defaults/active selector and one additive migration.
  Mandatory new source/owned SQL checks plus P1 non-owner denials, fixed migration pins
  and prior-25 all-row preservation retain all earlier acceptance. No runtime read/write
  helper, public consumer, seeding, pin, auth or proof/ledger authority.
- **Privilege qualification:** New statement guards protect UPDATE/DELETE/TRUNCATE,
  including zero-row statements. PUBLIC revocation and fictional non-owner denials do
  not remove owner/superuser INSERT/DDL powers or prove production role separation.
  Explicit fixture-owner inserts in new owned scopes are not active installation approval.
  Current shared production database credentials remain a later P3/P6/P9 adoption gate.
- **Review boundary:** Five documentation files only. No new model/migration/test code,
  PostgreSQL fixture/role, identity/token/proof, current history query/import/provider,
  operating approval, release/deployment or old-resource cleanup. Cached network-disabled
  secret-scanner tooling remains required for delivery. Stop for Command 110 authorization.

### Command 110 implementation qualification

The owner subsequently authorized the inert slice. Docker restoration cleared the
connection blocker; preceding review scan/main/exact-head CI/CodeQL passed before
implementation. Two unused explicit models, one empty additive migration, six fixed
invoker statement guards and new-object PUBLIC revokes preserve existing authority
boundaries. Three new text columns use explicit pg_catalog C collation for locale-independent
ASCII checks. Finite explicit timestamps exclude PostgreSQL infinity values; no default
or approval time is invented. Stored VARCHAR facts are checked, not text already
truncated by an explicit privileged cast. Private test qualification and P1 actual-login
denials are not a runtime identity reader or deployed duty attestation. The initial
SQL assertion misclassified FK-before-trigger TRUNCATE refusal; actual failure and
corrected acceptance belong in the progress report. All prior pins, control shape and
historical tests remain. Renewed local root/source/SQL/P1/API/invariant/browser/build
and static gates passed; earlier root and staff failures are preserved in the report.
Production audit has no known findings; the two retained development advisories remain
unwaived. Own commit/scan/main/exact-head CI/CodeQL closure passed and was freshly
reconciled by the owner-authorized review. Initial failed attempts remain failures.

## ADR-113 — Keep stable-intent encoding private and separate from currency authority

- **Status:** Accepted by the owner-authorized Command 110 review; Command 111 subsequently authorized and completed on 2026-10-10; corrective delivery `8f3adfd` passed exact-head acceptance
- **Review:** No blocking in-scope storage defect found at `756b02e`. Explicit empty
  models, restrictive references, finite C-collated facts, six fixed invoker guards and
  new-object PUBLIC revokes match Command 110. Existing pins/control/seed/runtime remain;
  owner/superuser powers and shared deployed credentials do not become non-owner adoption.
- **Evidence:** Fresh exact-head CI aggregate/all 29 Validate steps and CodeQL aggregate/
  all eight passed, first attempts. Logs confirm source 74, actual-login 12, owned SQL 79,
  seed/prior-25 preservation, root/API/invariant/browser 19/staff four/build/audit/cleanup.
  Hosted scan 219/no leaks is separate from implementation's local 225/no leaks. PR-only
  dependency review skipped. Fresh review frozen install/tooling 15/source 74/shared 112/
  package builds/types passed; full local SQL/API/browser acceptance was inspected, not rerun.
- **Decision:** Define **Command 111 — Build an unused private stable-intent codec**.
  Implement only section 3e's arity-9 S from bounded primitive JSON tuples, fresh canonical
  arrays and exact UTF-8 SHA-256. Internal input/canonical-S ceilings remain 65,536/1,024;
  original key/revision case and canonical BIGINT text are preserved. Five persisted S
  vectors plus parser-rule differential/budget/redaction/boundary tests are mandatory.
- **Placement:** Future `packages/database/src/private/currency-selection-intent.ts`
  is server-only, test-imported and unexported from every package entry. No shared/browser
  codec or runtime request-parser consumer. This follows the existing private-codec
  decision; it does not introduce an endpoint or trust caller-supplied actor/domain facts.
- **Security qualification:** Full audit still fails with the same two retained unwaived
  tooling findings; production audit has none known. Configured registry lookups of the
  audit-suggested braces 3.0.4 / sprintf-js 1.1.4 returned package-not-found, not installable
  repair targets. Existing patches/15 checks stay; no suppression or unrelated upgrade.
- **Boundary:** This review changes five trackers only. S excludes token/hash, current
  control/assessment/auth context and incidental times. Its digest is not human approval,
  a signature, placement attestation or SQL byte parity. Initialization/pin/auth/evidence,
  A encoding, SQL parity, proof/ledger and P3–P9 writer/privilege/adoption/activation stay
  separately gated. No new fixture/role/query/provider/import/deployment or old cleanup.
  Stop after review delivery and ask for explicit Command 111 authorization.

The owner subsequently authorized Command 111. After review delivery at `a484475` and
fresh exact-head confirmation, the private module and 15 mandatory tests implement S
syntax/encoding only. No public export or runtime request-parser reuse. Differential
tests preserve the installed UUID v1–v8/variant/nil/max grammar exactly, including the
existing rejection of uppercase max UUID spelling; ordinary request-key case remains
preserved. Server UUIDs must be lowercase. Maximum valid S is 396 bytes, independently
checked with .NET UTF-8 counting; the defensive 1,024-byte ceiling remains enforced.
No identities, pin, proof, approval or selected state are established. Serialized complete
local acceptance, API/invariants/browser/build passed; two ordinary local root invocations
failed and are not relabeled as passes or permanently fixed. Supported concurrency flags
retain every suite/assertion/deadline. Final tracking checks passed; own delivery remains
required. Failures and retained unwaived advisories stay in the report.

Initial delivery `b281819` passed its pinned local scan (227 commits/no leaks) and normal
main reconciliation, but exact-head CI failed the old tracked-file consumer grep because
the required `currency-selection-request-v1` literals contain the decoder filename text.
CodeQL passed. This was not a production parser import; untracked new source escaped the
pre-commit local grep. The minimal shared boundary-test correction retains every scanned
runtime path and allows only the two exact private protocol-label lines. Negative cases
still reject imports/calls, duplicates, other labels/paths and malformed inventories.
Fresh tracked-source shared 113/source 89/types passed. No runtime/dependency change;
the published failure is preserved, not amended or relabeled. Corrected-head delivery
must pass before completion; no next implementation is authorized. That corrective
delivery subsequently passed its pinned scan (228/no leaks), normal main reconciliation
and first-attempt exact-head CI 38043902016 / CodeQL 38043902076, all 29/eight steps.
Logs confirm ordinary full root, P1/SQL/seed/prior preservation, API/invariants, lifecycle
19/staff four, audit/license/build and cleanup. No retained advisory is waived. This
report-only update must pass its own delivery gate; stop for the recommended phase review.

## ADR-114 — Isolate policy-context encoding before full assessment authority

- **Status:** Accepted design boundary by the owner-authorized Command 111 review on
  2026-10-10; Command 112 defined only, not authorized or implemented.
- **Review:** No blocking codec defect or ordinary consumer at `1f4d92a`. Exact arity,
  grammar/case/BIGINT, pre-parse budgets, fresh bytes/hash and fixed frozen results match
  Command 111. The shared guard allows two exact private label lines only, rejects actual
  decoder imports/calls/other hits and retains old scan targets. Widened the S test to
  queue source/scripts and .js/.mjs/.cjs; no runtime/business-rule change.
- **Evidence:** Fresh base-head CI 38044593386 aggregate/all 29 Validate steps and CodeQL
  38044593404 aggregate/all eight passed, first attempts. Logs confirm full root/P1/SQL/
  seed/preservation/API/invariant/browser/audit/build/cleanup. Hosted scan 223/no leaks
  is separate from implementation local 229. Fresh review frozen install/tooling 15/
  source 89/shared 113/build/types passed; full local SQL/browser was inspected, not rerun.
- **Decision:** Define **Command 112 — Build an unused private currency policy-context
  codec**: the already specified Context=[P,U] component, before full control/auth/evidence
  composition. Primitive bounded text, exact arities/references, independent 1–32 lists,
  Command 97 semantics, ASCII sorting and 24,576 canonical bytes. No hash/domain, new
  registry, public entry or consumer; future A still owns assessment hashing/binding.
- **Qualification:** Current/display browsing and historical display/newSales denial
  do not approve collection routes or imply newSales=>display. Exact version/provenance/
  status matter, not only equal exponent. Full-input ASCII is the stricter codec boundary,
  not shared-schema modification. Separate prior/proposed contexts, anchor and qualified
  acquisition remain future A duties, not an enlarged existing context API.
- **Security:** Production audit exits zero/no known findings; full audit exits one with
  the same unwaived braces high/sprintf-js moderate. Fresh configured-registry lookups of
  3.0.4/1.1.4 return package-not-found. Primary
  [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and
  [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) advisories list no patched
  versions; audit-suggested ranges alone are not installable repair evidence. Existing
  patches/15 mitigation tests stay; no waiver/dependency/unrelated repair.
- **Boundary:** Five trackers and one widened existing test only. No next codec,
  store/migration/role/fixture/query/SQL parity, identity/pin/auth/evidence/proof/ledger,
  selection/adoption/consumer/provider/import, operating approval or release/deploy.
  Review delivery gates remain required; stop and request explicit Command 112 approval.

## ADR-115 — Encode complete policy context without consuming or activating currency

- **Status:** Owner-authorized Command 112 implemented and delivered on 2026-10-10;
  complete local and `2a9a938` exact-head CI/CodeQL acceptance passed. Final report delivery
  also requires its own scan/main/hosted gates before handoff.
- **Delivery evidence:** Pinned cached scan 233/no leaks; normal non-force main push with
  existing owner PR/status-rule bypass, no protection changes. CI 38050083708 aggregate/
  all 29 Validate steps and CodeQL 38050083717 aggregate/all eight passed, first attempts.
  Retrieved CI logs confirm the full retained matrix and cleanup; hosted scan 225/no leaks
  is a distinct inventory. Two retained tooling advisories remain unwaived.
- **Decision:** One private zero-import module accepts only primitive bounded JSON text,
  exact Context/P/reference/capability/definition tuples and independent 1–32 lists.
  Fresh dense arrays and ASCII sorting retain revision, exact metadata case, exponent,
  printable provenance, status, every independent capability and explicit secondary null.
  U equals exactly the capability-referenced set. Equal exponents do not substitute units.
- **Rules:** Retain Command 97 membership, current/display browsing, different secondary
  code and historical display/newSales denial; historical collection remains independent.
  The existing shared schemas/exports are unchanged, used only for fictional differential
  tests. Installed schemas also reject tested final-newline cases; extra definitions are
  still accepted there but intentionally rejected by this exact-set codec.
- **Budgets/results:** UTF-16 pre-allocation and 65,536 actual UTF-8 pre-parse checks;
  24,576 canonical bytes after escaping. Maximum valid escaped fixture is 22,627 bytes;
  defensive platform fault injection tests the otherwise unreachable output ceiling.
  Independently frozen successes carry only success/canonicalText; failures are one fixed
  frozen redacted result. No hash, object handle, diagnostics, logging or implicit approval.
- **Boundary:** Mandatory source test appended; two old list-tail assertions updated only.
  S/five vectors, shared decoder boundary and every old source/P1/SQL/root/API/browser gate
  remain. No dependency, migration/schema/seed/pin/role/selected fixture, query/registry,
  A/C/H/E composition, S consumption, auth/evidence/proof/ledger, consumer/provider/import,
  production privilege adoption, operating approval or deployment. Stop for the Command
  112 phase review, not another implementation. Two retained tooling advisories are unwaived.

## ADR-116 — Consolidate pure assessment encoding without opening currency authority

- **Status:** Accepted definition by the owner-authorized Command 112 phase review on
  2026-10-10; Command 113 is not authorized or implemented.
- **Review:** No blocking Command 112 defect found. Exact-set/capability/reference rules,
  full ASCII/case, raw/canonical budgets, fresh copied tuples and frozen redacted results
  match its scope. Private filesystem scans include untracked source/queue/scripts and
  JavaScript variants; no ordinary consumer/export/hash/database effect. Shared extra-U
  permissiveness and defensive ceiling fault injection are intentional, not relaxed rules.
- **Evidence:** Final report `11f552b` local pinned scan 234/no leaks; fresh main 0/0 and
  exact-head CI 38050900237 aggregate/all 29 Validate steps and CodeQL 38050900248
  aggregate/all eight passed, first attempts. Retrieved full CI matrix/cleanup and hosted
  scan 226/no leaks inspected, distinct from local inventory. Fresh review frozen install,
  tooling 15/source 108/shared 113/build/types passed. Full local SQL/browser/build was
  inspected in predecessor evidence, not rerun by this documentation review.
- **Decision:** Define one complete unused private A codec with companion S text: C/H/E
  validation, separately encoded proposed/prior Context and anchor, exact S bindings,
  bounded canonical bytes and SHA-256. Consolidate these pure pieces instead of separate
  per-tuple commands. Preserve all existing component contracts and no public entry.
- **Composition:** Two independently bounded primitive text arguments; supplied A digest
  must match computed S. Bounded parse-owned subarrays may enter the existing private
  Context text validator only after prescribed shape/list/depth checks; final arrays are
  fresh from successful canonical components. No caller-object helper or general serializer.
  Same immutable unit identity cannot carry contradictory facts across components.
- **Boundary:** Date use is supplied UTC calendar validation only, not a clock. Evidence
  roots/UUIDs/epochs are syntax, not payload/ownership/coverage/current auth. Latched base
  code/exponent and exact anchor facts remain; no stored selected fixture or transition.
  Existing consumer tests may allow only the exact new private composition, with negative
  regressions; strict shared decoder isolation remains. All 26 migrations and old gates stay.
- **Security:** Production audit zero; full audit one with the two retained unwaived
  braces high/sprintf-js moderate findings. Fresh suggested-version registry lookups fail;
  primary advisory pages still list no patched versions. Existing patches/mitigation tests
  remain; no unrelated repair/dependency/lock changes or clean full-audit claim.
- **Stop:** Review changes five trackers only. Its scan/main/exact-head hosted gates are
  required before handoff. No next implementation, SQL parity, authority/auth/evidence/
  proof/ledger store, pin initialization, writer/privilege/history adoption, ordinary
  consumer, live access/import, operating approval or release/deployment. Request explicit
  Command 113 authorization; no fixed remaining-command count or go-live promise.

## ADR-117 — Bind complete private assessment syntax without issuing currency authority

- **Status:** Owner authorized Command 113 on 2026-10-11; private implementation and
  full local acceptance passed. Final commit delivery gates must pass before handoff.
  Preceding review `4d8704d` passed pinned scan/main
  and exact-head CI/CodeQL before implementation.
- **Decision:** Consolidate C/H/E and A composition in one unused private component,
  with two independently bounded primitive texts and computed companion S binding.
  Reuse only the reviewed private S/Context validators; retain their exact grammar,
  budgets and runtime behavior. No public entry, ordinary consumer or database effect.
- **Rules:** Absent/unassessed remain unknown; selected tuples bind exact action/R/g,
  full anchor, prior/proposed revisions and cross-component immutable definitions.
  False latch requires whole prior-base/anchor equality; true latch locks code/exponent.
  H binds exact non-secret factor/epoch and domain/actor/session syntax. E has fixed
  registered pairs, unique kind/id, required roots and copied ASCII sorting.
- **Limits/results:** Input guards precede allocation/parse; prescribed depth/list/arity
  checks precede private component serialization. Supplied UTC Date round trip is not
  a clock. Component escaped bytes and final A ceiling precede canonical-only SHA-256.
  Frozen minimal success/fixed redaction is not approval and must not be casually logged.
- **Boundary:** All old S/Context/shared/source/P1/SQL/root/API/browser gates remain;
  exact composition scan allowances do not admit other consumers or request decoder use.
  All 26 migrations/pins/schema/seed/empty identities/zero-null controls are unchanged.
  No selected SQL fixture, SQL parity, authority/auth/evidence/proof/ledger store, pin
  initialization, history/writer/privilege adoption, provider/live access/import,
  operating approval, release or deploy. Two retained tooling advisories remain unwaived.
- **Next:** Stop after validated delivery and request **Phase review — Review Command
  113 private assessment codec and define the next bounded currency command**.

## ADR-118 — Prove canonical SQL bindings without duplicating raw request authority

- **Status:** Accepted next-command definition by the owner-authorized Command 113
  phase review on 2026-10-11. Command 114 is not authorized or implemented.
- **Review:** No blocking private assessment defect found. Computed S binding, exact
  C/H/E, separately validated Contexts, anchors/immutable identities, budgets/calendar,
  copied ASCII sorting and frozen redaction match scope. Existing S/Context runtime,
  shared isolation, migrations/pins/seed/workflows/dependencies and ordinary consumers
  remain unchanged. Defensive ceiling injection does not widen valid fields.
- **Evidence:** `120038d` local pinned scan 236/no leaks and main 0/0; exact-head CI
  38079601663 aggregate/all 29 Validate and CodeQL 38079601655 aggregate/all eight passed,
  first attempts. Full CI log inspected, including hosted scan 228/no leaks and all old
  SQL/P1/package/API/browser/build gates. Hosted inventory is distinct from local history.
  Fresh review frozen install/tooling 15/source 131/shared 113/build/types passed.
- **Decision:** Consolidate test-only canonical S/Context/A SQL validation/reconstruction
  and SHA-256 parity before any protected authority use. Reuse P1's fresh disposable
  cluster/logins unchanged; install fixed SECURITY INVOKER functions only in its probe
  schema, with private ACLs and no product data query/write or authority objects.
- **Domain:** SQL input must already be canonical, and SQL independently verifies it.
  Node raw whitespace/escape/order/number aliases normalize first; their canonical
  outputs must pass SQL. This does not change existing codecs or assert identical
  arbitrary raw-JSON parser behavior. Exact canonical exponents avoid IEEE754/numeric
  representation disagreement; supplied calendar year 0000 needs explicit parity.
- **Security:** Production audit clear; full audit exit one retains braces high and
  sprintf-js moderate. Fresh exact suggested-version registry lookups returned not found;
  both primary advisory pages still list no patched version. Mitigations/patches remain,
  with no suppression, dependency repair or full-audit waiver.
- **Stop:** Five documentation trackers only. Review delivery has its own scan/main/
  exact-head hosted gates. No new SQL/test implementation, product migration/store,
  auth/proof/ledger/pin initialization, writer/privilege/history adoption, ordinary
  consumer, live access/import or release/deploy. Request explicit Command 114 authority.

## ADR-119 — Independently verify canonical currency bytes in disposable SQL probes

- **Status:** Owner authorized Command 114 on 2026-10-11; test-only implementation and
  complete local acceptance passed. Post-commit scan/main/exact-head CI/CodeQL are
  verified before owner handoff, not assumed here. Preceding review `b1e6d89` freshly
  verified: pinned history scan 237/no leaks, main 0/0, CI 38106967664/all 29 Validate
  and CodeQL 38106967686/all eight successful at that exact full SHA.
- **Decision:** Three fixed immutable SECURITY INVOKER functions in one newly owned
  P1 probe schema, one atomic private/default ACL installation and minimal non-login
  owner. Existing P1 ownership/login/migration/snapshot/cleanup helpers are unchanged.
  No product reads, writes, registry, clock, extension, dynamic SQL or authority.
- **Domain:** Canonical S/A only; independently validate every component/binding and
  reconstruct printable ASCII quoting/C ordering, then compare exact UTF-8 bytes.
  Built-in SHA-256 recomputes S and binds A; Node hashes are comparison oracles only.
  Raw aliases normalize in unchanged Node codecs before SQL. Gregorian year 0000,
  request key case, null/false distinctions and string BIGINT maximum remain exact.
- **Safety:** Bounded byte-index nesting scan precedes JSON conversion; prescribed
  grammar/list/arity/field checks precede reconstruction. Cancellation/transport errors
  escape as failures; only representation errors receive fixed no-hash redaction.
  Each comparison uses a separate bounded read-only transaction without increased limits.
- **Evidence boundary:** Actual login/ACL/TEMP/DDL tests and product/role/guard snapshots
  are fictional engineering evidence, not deployed privileges/current auth, coverage,
  compatibility, human confirmation or production readiness. Executed local source/P1/
  parity/SQL/preservation/package/API/invariant/browser/build acceptance is recorded in
  progress; delivery has its own exact-head gates. Failed attempts and both unwaived
  tooling advisories remain explicitly recorded.
- **Stop:** No runtime SQL/store/migration/export/consumer, identity/auth/proof/ledger,
  selected product state, live query/import, provider, release/deploy or cleanup expansion.
  After delivery request **Phase review — Review Command 114 isolated PostgreSQL
  canonical parity and define the next bounded currency command**; no automatic next slice.

## ADR-120 — Persist closed intent facts before enabling authority operations

- **Status:** Accepted next-command definition by the owner-authorized Command 114
  phase review on 2026-10-11; Command 115 is not authorized or implemented.
- **Review:** No blocking in-scope canonical parity defect found. Independent qualified
  invoker reconstruction/SHA-256, canonical-only input, bounded pre-parser scan, exact
  S/C/Context/H/E bindings, fixed redaction and real private-ACL/TEMP/deadline denials
  match the authorized scope. Product stores/migrations/runtime consumers remain unchanged.
- **Delivery evidence:** `49105c3` reconciled with canonical main; local pinned scan
  238 commits/no leaks. Exact-head CI 38110135055 aggregate/all 29 Validate steps and
  CodeQL 38110135042 aggregate/all eight passed on first attempts. PR-only dependency
  review skipped, not passed. Full CI log inspected; hosted scan 230/no leaks is a
  different inventory. Fresh review acceptance is recorded in progress.
- **Decision:** Define one closed empty intent table rather than more codecs or full
  authority activation. Preserve exact S text/digest and UUID request-slot identity,
  original domain, actor/session ownership and exact policy references. A redundant
  AuthSession `(id,user_id)` key permits the required compound ownership FK. Use SQL
  equality against independently reconstructed S; no jsonb::text/raw-input hashing.
- **Closed boundary:** Statement INSERT/UPDATE/DELETE/TRUNCATE always deny, including
  no-op statements; new-object PUBLIC privileges are revoked. Positive constraints
  are exercised on an exact catalog-derived fictional probe, never by opening the
  installed product table. No issuer/executor bypass, source write API, seed, record,
  receipt, auth epoch, current placement/MFA check or control transition. Historical
  RESTRICT references become consequential only after separately approved issuance;
  ordinary security updates remain required and owner DDL powers are not prevented.
- **Limits:** This completes only another P2 prerequisite, not P2 or P3–P9. Evidence
  payload/coverage, auth adoption, proof/ledger/atomic consumption and guarded writer/
  installation/recovery remain separate. Two tooling advisories remain unwaived.
- **Stop:** Five documentation trackers only in this review. Review delivery needs
  its own scan/main/exact-head hosted acceptance. Request explicit Command 115 authority;
  no store/code/test/migration implementation, production access or deployment here.

## ADR-121 — Keep durable selection-intent storage unconditionally closed

- **Status:** Implemented on 2026-10-11; required local acceptance passed. Exact-head
  source delivery belongs to the owner handoff; this is not activation approval.
- **Decision:** One atomic additive migration after 26 unchanged pinned migrations stores
  only stable S scalar facts, exact case-preserved request text, UUID slot, canonical text
  and SHA-256. Six RESTRICT/RESTRICT foreign keys bind installation/domain, actor/session
  ownership and expected/proposed revisions. The existing AuthSession receives only a
  redundant `(id,user_id)` key and inverse relations; security behavior is unchanged.
- **Canonical boundary:** One private immutable SECURITY INVOKER helper is strictly needed
  to share bounded scalar validation before UUID cast/S reconstruction across CHECKs.
  Qualified built-ins and fixed search path; no state reads, dynamic SQL, time, auth or
  entire assessment verifier. Exact UTF-8 reconstruction and SHA-256 reject JSON aliases.
- **Closed boundary:** Four unconditional BEFORE statement triggers reject all writes,
  including no-ops; PUBLIC privileges on table/functions are revoked atomically. Trusted
  migration owners retain DDL powers. No application repository/export/initializer/seed,
  proof, receipt, current-auth certification, deployed privilege adoption or selection.
- **Acceptance:** Fictional probe clones actual catalog columns/CHECKs/unique indexes and
  redirects actual FKs only to its own copied fictional parents. Catalog manifests are
  compared; no product trigger is disabled and the product table remains empty. Positive
  probe insertion is never an operational reservation or owner approval.
- **Stop:** P2 and P3–P9 remain incomplete. Preserve both unwaived tooling advisories and
  all launch/provider/operating approvals. After verified delivery request **Phase review —
  Review Command 115 closed currency selection-intent storage and define the next bounded
  currency command**; no automatic activation, import, release or deploy.

## ADR-122 — Stage historical authorization evidence without certifying current access

- **Status:** Defined by the owner-authorized Command 115 phase review on 2026-10-11;
  Command 116 is not authorized or implemented.
- **Review:** Command 115's empty closed intent storage, independently reconstructed S,
  UUID slot and restrictive ownership/policy references match scope. Strengthen only
  the temporary-grant acceptance branch to compare probe/product catalogs and rows,
  global security facts, migration pins and owned resources after every denial.
- **Next boundary:** One empty closed authorization-evidence table stores exact ten-field
  H plus installation and explicit creation time. Compound installation/domain,
  AdminProfile/actor and AuthSession/actor references are restrictive. Only the redundant
  AdminProfile ownership unique key and inverse relations extend existing models.
- **Historical factor boundary:** Credential/recovery UUIDs are non-secret copied history,
  never foreign keys to deletable secret rows. Epochs are positive exact BIGINT facts,
  not current versions. Recovery identity is null exactly for totp; no default enrollment,
  usable/approval flag, secret, new digest protocol or issuer is introduced.
- **Acceptance:** Keep the installed store closed and empty. Catalog-derived fictional
  probes prove ownership/shape/constraints, H parity and preserved ordinary security/MFA
  updates and deletion. Real distinct duty logins and full per-denial snapshots prove
  refusal, not production privilege adoption or verified human intent.
- **Stop:** Proof issuance/consumption/ledger, protected payload coverage, auth adoption,
  lineage/writers/recovery and P2/P3–P9 remain incomplete. Keep both tooling advisories
  unwaived and all operating/provider/launch approvals separate. Request Command 116
  authorization only after the review's own verified source delivery.

## ADR-123 — Keep historical factor evidence unconditionally closed and independent of secrets

- **Status:** Delivered at `118ecc3` and phase-reviewed on 2026-10-11; local and exact-head
  source acceptance passed. Review evidence is recorded in progress, not activation approval.
- **Decision:** One atomic 28th migration retains all 27 old bytes. H's ten fields plus
  installation UUID and explicit finite TIMESTAMPTZ(3) time are the entire record. UUID
  grammar retains versions 1–8/variant 89ab/nil/max through typed lowercase output;
  epochs are positive exact BIGINT, not current auth versions. Factor kind/null recovery
  identity is exact. No secrets, defaults, approval flags or standalone H digest.
- **References:** Five RESTRICT/RESTRICT edges bind installation/domain, actor and
  compound profile/session ownership. Only the redundant AdminProfile key is added;
  the existing session key is reused. Credential/recovery IDs deliberately have no
  secret-row FK, so normal revocation, MFA disable/re-enrollment and recovery replacement
  can proceed while historical public identities remain retained.
- **Boundary:** Four fixed invoker statement triggers deny all product writes, including
  owner/no-op paths; PUBLIC revocations are atomic. Product storage stays empty. Only
  fresh owned catalog-derived fictional probes exercise positive CHECK/FK/key cases and
  reconstruct H into the unchanged A codec/golden vectors. No issuer, reader, initializer,
  API/worker/seed/consumer, enrollment certification or production privilege adoption.
- **Stop:** P2/P3–P9, both unwaived tooling findings and operating/provider/launch approvals
  remain open. After verified delivery request **Phase review — Review Command 116 closed
  authorization-evidence storage and define the next bounded currency command**. No
  automatic next implementation, current-version establishment, proof/ledger/consumption,
  selection, live data/import/provider/release/deployment or unrelated resource cleanup.

## ADR-124 — Resolve protected authority-evidence payload coverage before staging its roots

- **Status:** Defined by the owner-authorized Command 116 phase review on 2026-10-11;
  Command 117 is not authorized or implemented.
- **Review:** Delivered `118ecc3` matches the empty closed H storage boundary. Exact
  non-secret facts, restrictive owner references, positive epochs and factor/null rules
  do not certify current access. Guards deny all statements and ordinary secret/security
  replacement remains possible. No blocking in-scope defect or code correction found.
- **Next boundary:** One documentation-only contract resolves protected history,
  compatibility and adoption root payloads and coverage together. Existing S/Context/A/H/E
  bytes/kind-version protocols stay unchanged. Exact payload schemas, budgets, acyclic
  binding, bounded membership commitments, retention and restrictive references must
  precede sensitive root storage; arbitrary JSON/digests are not approval or completeness.
- **Source coverage:** Inspect all seven money tables plus settings/payment evidence,
  exact units/parent lineage, existing draft edits and unsupported legacy/credit classes.
  Separate immutable observations from fresh trusted acquisition and explicit adoption
  approval. Current count-only preflight and cooperative locks do not certify coverage.
- **Limits:** Protected acquisition/issuance stays unavailable until its lineage/writer/
  SQL-duty dependencies pass. Auth-version establishment, proof/ledger/consumption and
  P2/P3–P9 remain incomplete; no selected state or operating/provider/launch approval.
- **Stop:** Five documentation files only. Preserve both unwaived tooling advisories;
  request explicit Command 117 authorization after this review's verified delivery.
  No implementation, current data inspection, import, release/deploy or resource cleanup.

## ADR-125 — Hold further currency development and retain the staging deployment boundary

- **Status:** Owner-directed on 2026-10-11. The owner stopped further currency development
  and separately requested deployment of all completed changes.
- **Decision:** Command 117 and later currency proposals remain on hold unless explicitly
  reopened. Earlier next-command recommendations are historical, not authorization. Keep
  existing foundations inactive and preserve current billing behavior; no new currency
  implementation, selection, conversion, adoption or history backfill belongs to deployment.
- **Deployment scope:** Update only the established isolated `my.speedhost.bd` staging
  installation from verified canonical source. Review pending additive migrations, verify a
  fresh encrypted backup, retain the prior application release/config, and check business-row
  preservation, provider safety, both roles, browser behavior and unrelated-service isolation.
  Preserve approved Speed Host branding. No real customers, WHMCS import, provider activation,
  production promotion, host-wide reconfiguration or Docker/disk/cache cleanup is authorized.
- **Required edge correction:** The existing staging API-prefix allowlist omitted the
  newly implemented `/staff` family. Add only that prefix in the owned staging site/template,
  with a route-boundary regression, protected prior configuration, full syntax validation
  and graceful reload. Preserve the Nginx master and every unrelated configuration file;
  do not restart Nginx or replace other sites. Application-image source remains separately
  identified from this operational routing correction.
- **Clean-build correction:** The web container recipe must generate existing Prisma
  client types before its ordinary TypeScript gate. Add that prerequisite and a regression
  test; retain frozen dependencies and validation. This is build repair, not new currency
  behavior. Record the base source and the small deployment-repair overlay separately.
- **Next focus:** Core hosting operations and protected migration rehearsal/launch readiness,
  only after a separately authorized bounded command. Command 33 inputs, sandbox/provider
  acceptance, off-site recovery and final production approval remain unresolved.

## ADR-126 — Design resell.biz sandbox registration as one complete guarded workflow

- **Status:** Command 49 design on 2026-10-11, following owner confirmation of resell.biz
  and sandbox intent. Specification: [StarGate/UK2 registrar design](LOGICBOXES_REGISTRAR_DESIGN.md).
  Owner resumed final design delivery on 2026-10-12; no implementation is included.
- **Decision:** Go for one complete fake/mock-tested Command 50 vertical workflow,
  including provider-sourced availability/cost pricing, fixed separate BDT selling
  prices, ordinary one-year domain offers, existing verified-payment ledger, explicit
  enrolled full-administrator approval and ownership-bound register-once reconciliation.
  Domain state and credentials are separate from hosting/WHM. No automatic renewal,
  FX, live mode, generic provider proxy or WHMCS import.
- **Safety:** A test URL is not a demo account. Persist the dispatch claim before remote
  work; unknown outcomes reconcile instead of retrying mutations. NoInvoice omits some
  identity/money evidence. A read-before-write cost check is not an atomic charge ceiling.
  Contact/consent/account ownership and fresh payment eligibility must be independently
  proven; no screenshot or generic status setter supplies that proof.
- **Limits:** No-go for credentialed sandbox/live execution until genuine demo identity,
  protected credentials/IP access, agreements/contacts, TLD/prices/currency/charge controls
  and exact operation/window approval are supplied. Official-contract transport is
  mocked and network-disabled in Command 50. This design changes no runtime, schema,
  credentials, customer/payment records, deployment or provider resources.
- **Next:** Command 50 requires explicit authorization after this design's verified
  delivery; Command 51 separately covers approved demo acceptance. Currency stays held.
- **Local reference inspection:** Owner-supplied `stargate.zip` is structurally a WHMCS
  registrar module whose metadata declares a proprietary license. Both PHP files contain
  ionCube markers; source business logic cannot be reviewed from this archive. Do not
  execute, decode, copy or redistribute it as our adapter. Exact root archive/directory
  names are Git-ignored; implementation uses independently written TypeScript and public
  official API contracts. No credential or real provider test was performed.

## ADR-127 — Keep the initial registrar workflow fictional and register-once

- **Status:** Authorized Command 50 implementation, 2026-10-12. Delivery requires
  the validation recorded in [progress](PROGRESS.md).
- **Decision:** Implement one complete local customer quote, immutable order/invoice,
  verified manual payment, full-administrator approval, dedicated outbox/worker,
  ownership-bound registration observation and truthful mobile UI. Keep nine registrar
  tables separate from hosting services and preserve all 28 prior migration contents.
  [Implementation guide](LOGICBOXES_REGISTRAR_IMPLEMENTATION.md) records the flow and limits.
- **Safety:** SQL ownership/history guards, authenticated encrypted account/mode/version
  bindings, a durable single dispatch claim, immutable contact mappings and code-only
  append-only evidence. Before dispatch, recheck customer, approver and verified payment;
  after dispatch, refunds retain financial attention without pretending to undo registration.
  Redelivery, ambiguous contact creation and lost responses never retry mutations.
  Production mode closes simulated offers/write routes and does not start the registrar
  consumer; readable history is not authority to execute simulated purchases in production.
- **Official adapter:** Injected HTTP mock only, no socket client, real credentials or
  production fallback. Reconcile explicitly bound fictional customer/contact IDs; do not
  implement unapproved real signup or adopt existing accounts by email. `NoInvoice`,
  HTTP success, the test hostname and price preflight are not account/registration/charge
  guarantees. Native USD cost convention is fictional, independent of BDT sale snapshots.
- **Interface:** The owner's administrator domain screenshot is a layout reference, not
  consent to copy its real customer data, business prices or enable all visible actions.
  Show request/registration/expiry/financial outcomes separately; no invented renewal
  price, registration date or next billing date. Use sentence-case app-authored labels.
- **Limits:** Latest 100 authenticated requests, .com/.net, ordinary ASCII, one year,
  fixed fictional nameservers and explicit fictional consent. No renewal, transfer,
  authorization code, nameserver/contact editor, delete, privacy, import, production
  promotion or currency development. Existing tooling advisories remain unwaived.
- **Next:** Stop after verified Command 50 delivery. Command 51 requires separate
  protected genuine-demo identity/isolation, credentials/IP access, contracts/contact
  policy, all-in charge controls and exact operator/mutation authorization.

## ADR-128 — Separate live registrar implementation from purchase and launch acceptance

- **Status:** Owner-authorized Command 51 replacement completed in source and deployed,
  2026-10-12; genuine provider and production-launch acceptance remain separate.
- **Decision:** Independently implement live resell.biz registration and deploy verified
  source to my.speedhost.bd. This is the final Speed Host portal address, not WHMCS
  integration. Existing WHMCS customers remain there; no import or synchronization.
  New-customer operation is the target, subject to unresolved operating/launch gates.
- **Boundary:** .com, one year, no auto-renewal/privacy/cancellation/transfer/delete.
  Automatically prepare registrar customers/contacts, reusing only fully matching
  directly owned identities. Create only after a complete empty customer search;
  separately persist customer/contact claims before POST, retain unknown outcomes,
  use an independent policy-compliant random provider password, and never retry a
  creation after a lost response. Explicit customer terms/privacy consent is required.
  Actual provider agreement, customer consent, verified manual bank payment and full
  administrator MFA approval are required before a durable register-once dispatch.
  The owner's later completion request includes nameserver/lock management, replacement
  contact association without in-place shared-contact edits or IRTP/lock bypass,
  administrator-only transient authorization-code access, and manual paid one-year
  renewal with a separate immutable invoice. Local unsent-action cancellation is not
  registrar/API cancellation. WHMCS remains a workflow reference, not feature parity.
- **Costs:** USD with two decimal places must be explicitly confirmed by the operator
  from the account; the unlabeled cost API does not prove currency or all-in charges.
  BDT sale prices remain separate. A preflight threshold is not an atomic provider cap;
  explicitly acknowledge price-change risk. No automatic refund or assumed cancellation.
- **Delivery:** Preserve prior migrations/history and fake production gates. Tests use
  injected mocks only. Deployment leaves the account unconfigured/disabled, preserves
  WHMCS and unrelated shared-server services, and needs verified backup/rollback/gates.
  The agent will not register MessageDock.com, supply secrets or waive launch blockers.
- **Next:** Finish Command 51 and report deployment. cPanel/WHM is next, separately
  bounded and confirmed; do not automatically create a hosting account.

## ADR-129 — Configure SMTP privately and activate it separately from saving

- **Status:** Owner-authorized Command 52 accepted, delivered and deployed as `ce5a062`,
  2026-10-12; inactive credential/sender saving and requested owner-administrator creation
  remain pending owner MFA enrollment. Custom SMTP not activated.
- **Decision:** Add a separate settings panel/API for a single custom SMTP transport.
  Store the entire host/TLS/auth/enabled bundle in the existing integration-credential
  store using a server-only AES-256-GCM cipher and dedicated key domain/version. No schema
  migration or plaintext password setting. Only full administrators with enrolled MFA
  can read masked status or mutate it; session/CSRF protections remain in place.
- Saving/replacing credentials always leaves custom SMTP inactive. Activation requires
  an explicit confirmation and the exact reviewed ciphertext revision under row locking.
  Restore the deployment transport explicitly, not by silently clearing secrets. Neither
  saving nor activation sends a test message or certifies authentication/inbox delivery.
- Workers select the protected transport afresh for each eligible send. Existing queued
  attempts can use it after activation, but sent/ambiguous histories are not replayed or
  rewritten. In-flight sends retain their chosen transport. Missing/inactive configuration
  uses the existing environment; corruption/read failure never silently changes destination.
- Only public IPv4 DNS SMTP hosts and the fixed encrypted pairs STARTTLS/587 or TLS/465
  are supported by this form. Reject private/reserved/mixed DNS answers, pin the checked
  IP for connection, and validate certificates against the original hostname. No debug
  logging, certificate bypass, URL/proxy/custom port or plaintext connection options.
  Existing deployment transport can still use a protected internal Mailpit boundary.
- Branding remains the separate existing sender/reply-to source. A transport login is
  not a verified sender identity; SMTP acceptance is not evidence of inbox placement.
  SMTP API acceptance refuses an unmarked/normal database; CI uses the same fresh,
  loopback, marker-verified API test runner rather than the ordinary CI schema.
  Follow [Nodemailer's transport contract](https://nodemailer.com/smtp) for required TLS,
  certificate servername on pinned IPs, timeouts and disabled diagnostic logging.
- The owner's local credential file is ignored, never copied into code/history/logs.
  Connection authentication and one owner-addressed test email are separately requested
  tests, not permission to activate these credentials for customer email. The owner
  subsequently approved source deployment and saving these credentials inactive with
  the supplied sender. Saving must still pass authenticated full-administrator MFA;
  initial live read-only inspection found no enrolled full administrator. Do not create
  a synthetic MFA/session approval or bypass the service with direct credential SQL.
  No currency, registrar, WHMCS, cPanel, DNS or unrelated infrastructure changes.

## ADR-130 — Separate domain catalogue pricing from immutable registrar execution

- **Status:** Owner-authorized Command 118 source implemented and locally validated,
  2026-10-12; Git delivery recorded in progress. No live deployment or purchase authorized.
- **Decision:** Credentials-only disabled LogicBoxes connections are independent of
  integer BDT TLD price revisions, installation DNS defaults and reviewed central policy
  links. Multiple upstream accounts belong to one business, not a multi-tenant reseller
  platform. One SQL-enforced installation default and optional TLD preference only
  preselect the administrator's registrar; payment never dispatches registration.
- New quotes retain their original account provenance and snapshot catalogue revision,
  immutable price reference, nameservers, central policy revision and exact eligible
  account identities disclosed during customer consent. A stale/unreviewed scope denies
  quote/order creation. Legacy requests remain limited to their originally accepted account.
- At approval, fresh native cost/payment/ownership/MFA checks precede immutable actual
  account, credential and contact-fingerprint selection. Registered-domain management,
  customer/contact preparation, cost checks and renewals follow that executed account.
  No changed default, rotation, disabled account or uncertain response reroutes a purchase.
- Existing account configurations, offers, quotes and invoices are not rewritten. New
  catalogue prices use the existing ProductPrice store as immutable inactive versions
  selected by an explicit catalogue pointer, preserving the global one-active-price
  rule and hosting pricing. Additive SQL guards retain ownership and history while
  distinguishing quote provenance from executed provider ownership.
- **Limits:** Supported live ordinary .com/one year only; transfers, premium domains,
  additional provider modules/TLDs, paid privacy/DNS/email add-ons, auto-registration,
  FX, WHMCS connection and cPanel work are not enabled. Policies are operator-reviewed
  link/revision snapshots, not an archive or certification of remote legal content.
  Command 53 mandatory administrator enrollment remains a separate unfinished task.

## ADR-131 — Manual-first administrator domain orders

- **Status:** Owner-directed, 2026-10-12; Command 120 source implemented.
- **Decision:** Most customers discuss a domain request with staff before any
  order exists. A full administrator with MFA may enter the customer's registrant
  details and record prior phone, in-person or written consent with a timestamp,
  internal reference and staff actor on the immutable domain quote. The admin
  then creates an unpaid one-year domain order and invoice for that customer.
  Online customer ordering remains available as a secondary route.
- The customer views the resulting order and invoice in the portal. No automatic
  email is sent by this path. Payment can follow later; only verified payment
  permits the separate domain approval that leads to registration dispatch.
  Generic order approval cannot bypass domain review.
- **Current implementation limit:** The admin-assisted path accepts only
  simulated registrar offers in non-production environments. This phase does
  not authorize real registrar reads/writes, transfer, deployment or price
  override. The consent record is administrative evidence of a prior customer
  discussion, not a claim that the customer used the online form.

## ADR-132 — Manage WHM server lifecycle without losing service evidence

- **Status:** Accepted
- **Date:** 2026-10-17
- **Decision:** Create cPanel/WHM servers disabled with encrypted API tokens. A successful connection test after the latest server edit is required before activation. An assigned server cannot change WHM hostname, port or username; token rotation pauses new provisioning until a fresh test. Maintenance stops new accounts while permitting management of existing ones. Retirement is a confirmed soft deletion that clears the token and username, preserves historical service/operation rows, and is refused while a non-final service or unresolved operation remains.
- **Reason:** Changing an assigned server's identity could redirect destructive account actions. Deleting service or operation history would remove the evidence needed to reconcile external WHM state. A saved credential is not proof of a working or approved connection.
- **Consequence:** The administrator server screen and API provide add/edit/test/status/remove controls with audit records and no token disclosure. The database permits credential-free retired cPanel servers but keeps complete configuration mandatory for active records. A real WHM test or mutation and deployment still need separate authorization and credentialed acceptance.

## ADR-133 — Combine hosting and simulated domain registration on one invoice

- **Status:** Accepted for local fake-provider testing
- **Date:** 2026-10-18
- **Decision:** Customer checkout offers an existing domain or a new simulated `.com`/`.net` registration. The new-domain path consumes a customer-owned, unexpired fake quote and creates one hosting item, one domain item, and one unpaid BDT invoice. Verified payment precedes domain approval and hosting activation. A combined order completes only after the domain is registered in the simulation and the hosting service is active. Public shared-hosting plans use the current Speed Host annual BDT catalogue as the test reference; the active product catalogue remains the source of orderable prices.
- **Reason:** Customers need one order and invoice when buying hosting with a domain, while payment, registrar result, and hosting provisioning remain separate evidence.
- **Consequence:** Existing-domain orders remain hosting-only. Domain transfers, USD display or collection, real registrar/WHM calls, and deployment are outside this source command. The combined-order database migration must pass isolated PostgreSQL tests before the command can be delivered.

## ADR-134 — Guest hosting selection and renewable administrator sessions

- **Status:** Accepted by owner
- **Date:** 2026-10-18
- **Decision:** The public hosting plan button opens a guest order step for domain selection and plan review. The exact plan, price, domain and existing/new choice are held in browser local storage for 24 hours; sign in or registration is requested only when continuing to protected checkout. This draft contains no credentials or authoritative price, and is cleared after successful order placement. Availability, registration pricing, registrant consent and order submission remain server-validated. Administrator sessions have no idle cutoff and renew a 365-day cookie and database expiry while in use; customer session policy is unchanged.
- **Reason:** Customers should configure hosting and a domain before account entry. The owner also wants administrators to remain signed in during normal work until they sign out.
- **Consequence:** Clearing browser storage can discard an unfinished guest selection; anyone using the same browser could see the unsubmitted domain for up to 24 hours. A browser may delete the cookie or enforce a lifetime cap, so a fresh administrator login can still be required. Sign out, revocation, password reset and MFA continue to end or restrict access. No live provider operation or deployment is authorized by this source change.

## ADR-135 — Show the complete public order path before account entry

- **Status:** Accepted by owner
- **Date:** 2026-10-19
- **Decision:** Public hosting ordering uses four visible steps: choose a domain, configure the active BDT hosting price, review the cart, and enter customer account details at checkout. Guests can see all four steps without a session. Checkout offers inline registration or sign-in; placing an order remains an authenticated operation. An administrator with a selected existing domain can continue through the administrator customer-order form, which revalidates the active product and price. A new-domain selection cannot silently become a hosting-only administrator order.
- **Reason:** The guest flow reached sign-in before showing checkout, while an administrator session diverted to the dashboard. The owner supplied a WHMCS order-flow reference and expects the chosen plan and domain to remain visible through configuration, cart review and checkout.
- **Consequence:** Browser drafts remain temporary and non-authoritative. Domain availability, registration price and registrant consent are checked after customer authentication. The administrator form remains separate for new-domain requests with offline consent and separate invoices. No transfer, optional add-on, additional currency, live provider operation or deployment is authorized by this UI change.

## ADR-136 — Create a guest account and unpaid hosting order in one checkout

- **Status:** Accepted by owner
- **Date:** 2026-10-19
- **Decision:** For an anonymous customer using an existing domain, the final
  checkout action creates a pending-verification customer account, a hosting
  order and one unpaid invoice in the same database transaction. The public
  endpoint retains CSRF and registration rate limits, validates the active
  server price, and uses a submission key to make retries idempotent. A retry
  returning order details must also verify the new account's password.
  Account verification remains required before portal sign-in or payment.
- **Reason:** The previous checkout created only an account and sent the
  customer through email verification and sign-in before order placement. The
  owner wants the WHMCS-style final checkout action to create the account and
  unpaid order together.
- **Consequence:** A failed price or order check rolls back account creation.
  The receipt shows the order and unpaid invoice immediately, while activation
  still waits for verified payment and successful provisioning. A new-domain
  checkout continues through authenticated fake quote and registrant-consent
  checks before a combined order can be placed. This decision does not enable
  live registrar, WHM or payment operations or authorize deployment.

## ADR-137 — Remember the administrator session without bypassing MFA

- **Status:** Accepted by owner clarification
- **Date:** 2026-10-24
- **Decision:** Add an unchecked “Remember this device” option to administrator password and MFA sign-in. Selecting it creates an HttpOnly cookie and a fixed 30-day session; leaving it unchecked creates a browser-session cookie with a maximum one-day database deadline (or the configured shorter limit) and a one-hour-or-shorter idle cutoff. All new sign-ins still require the enrolled factor. Customer session policy and already issued administrator sessions retain their existing behavior.
- **Reason:** The owner requested longer sign-in persistence and explicitly declined skipping two-factor codes on future sign-ins. Device trust under Command 53 is a separate feature.
- **Implementation:** New administrator opaque tokens include a session-policy prefix covered by the existing SHA-256 token hash. Changing the prefix invalidates authentication against that exact stored hash. The authenticated token determines idle/renewal policy, and `expiresAt` remains the database authority. This avoids adding storage or a second browser credential. Existing unprefixed sessions retain their prior policy. Refreshing `/auth/me` must neither persist an unchecked browser cookie nor extend the remembered session's absolute deadline.
- **Consequence:** Sign-out, logout-all, password reset, disabled access, session revocation and MFA protections continue to use the same session rows. No remembered-factor token, localStorage credential, migration, live deployment or provider operation is added. Some browsers restore session cookies after restart; the server's absolute and idle limits still apply. Existing sessions are not shortened retroactively; sign out and sign in again to choose the new policy.

## ADR-138 - Organize hosting products with administrator catalogue groups

- **Status:** Accepted for local implementation by owner
- **Date:** 2026-10-26
- **Decision:** Add optional group UUID membership, named group headings and
  separate group/product display order in administrator catalogue management.
  Existing products remain ungrouped; cPanel identifiers remain independent.
- **Reason:** The owner wants useful WHMCS-style organization within the focused
  hosting catalogue and existing product editor.
- **Consequence:** Groups organize administration only. Public sale visibility
  and order eligibility remain product properties. Renaming/reordering groups
  never rewrites prices or historical records. Names are trimmed and exact-name
  unique. Membership is optional and protected by a restrictive foreign key.
  There is no delete endpoint. Import, other product types, operating plans/prices
  and deployment require separate authorization.

## ADR-139 - Table-first record management

- **Date:** 2026-10-26
- **Status:** Accepted
- **Decision:** Follow the owner-provided WHMCS client-record example: compact filters and result summaries, colored column headers, dense rows and explicit record actions. Record collections are tables; creation/editing/operational forms open separately in accessible dialogs. Dedicated settings, account security, checkout and individual record documents retain their appropriate form/detail layouts.
- **Constraints:** Reuse existing API queries, server pagination and authorization. Never infer a successful payment/provisioning operation from a UI action. Preserve exact identifiers, integer money, historical snapshots, mutation guards and confirmation requirements. Native modal dialogs isolate focus and support nested confirmations; closing creation dialogs preserves mounted drafts.
- **Consequences:** Narrow screens scroll each table horizontally within the page. Existing bounded endpoints remain explicitly labeled; this presentation command does not introduce new bulk mutations or API pagination semantics. The local environment, logo, business database and providers remain untouched.

## ADR-140 — Administrator-requested customer verification resend

- **Date:** 2026-10-27
- **Status:** Accepted for the owner-requested local implementation.
- **Decision:** Expose a recipient-confirmed resend beside pending verification for active customers, using full-administrator/CSRF guards and the existing encrypted token/outbox/template flow. The API resolves the stored recipient; callers cannot supply an address or token. A UUID request key prevents duplicate queueing after lost responses, per-customer row locks enforce a one-minute cooldown, and a separate IP limit bounds administrator requests.
- **Constraints:** Resending changes no account, session, MFA, financial or access state. Verified, deleted, disabled, inactive and suspended targets are ineligible. Tokens retain the configured verification lifetime. Previously emailed links keep their expiry; the existing verification transaction allows activation only once while the account remains pending. This avoids invalidating a link already in a customer's inbox or changing the verification lock order. Queue acceptance is not delivery proof.
- **Consequences:** A new audit records actor/customer/request/token-record IDs without a raw token or recipient. Tests use fictional accounts and preview delivery. No schema migration, deployment, SMTP activation or actual customer resend is authorized by this source command.

## ADR-141 — Account notification catalogue and important WhatsApp previews

- **Date:** 2026-10-27
- **Status:** Accepted for local implementation by owner.
- **Decision:** Provide separate Admin/Client catalogues and paginated account-owned histories. Keep the twelve transactional email templates and their existing delivery settings. Project missing notices from committed business outbox/audit/operation records into an idempotent notification ledger. Use the existing dedicated scheduler and a reference-only retryable notification queue.
- **WhatsApp:** The owner explicitly includes invoice creation and overdue notices and requires no opt-in. Important alerts default on for valid account numbers or encrypted overrides; muting cancels queued WhatsApp alerts. Routine notices, password/verification links, receipts and daily digests remain email-only. Full-administrator operational alerts never fan out to restricted staff; staff can receive their own security notices.
- **Safety:** New delivery defaults disabled; preview mode writes private local email/WhatsApp artifacts and never calls a live provider. Historical source cutover is the migration epoch, so migration does not replay old events. Canonical invoice/channel/recipient keys prevent duplicates; an anti-join catches late committed sources. Current account, role, recipient fingerprint and mutable business state are checked again at delivery. Job payloads contain references only; responses expose masked contacts and safe statuses, not tokens, ciphertext, metadata or provider errors.
- **Consequence:** New notification tables need a separately authorized guarded staging migration. New alert emails and WhatsApp have no live delivery until a future explicitly authorized integration. Existing transactional SMTP remains independent. No financial/provisioning action, deployment or real customer message is part of this command.

## ADR-142 — Complete invoice contact display and preserve due calendar dates

- **Date:** 2026-10-28
- **Status:** Accepted for local implementation by owner; not deployed.
- **Decision:** Render optional issuer phone/country and complete locality from the existing historical identity. Include current, runtime-validated manual payment instructions in authorized detail and post-mutation responses, and show one block in the shared web/print document and server PDF. Reuse the existing instruction reader and fallback; do not duplicate the customer payment panel's text or expose credentials/settings bundles.
- **Date rule:** Due dates use the existing persisted UTC calendar day in ISO date-only form, matching the draft editor and PDF across browser/business time zones. Preserve stored timestamps, invoice states, money, overdue/reminder timing and all other event-date rules. No migration or historical backfill is needed.
- **Consequence:** Instructions remain current collection guidance, not a new financial snapshot; changing the installation instructions can change a later download's guidance without changing its historical identity or money. Existing authorization, draft PDF restrictions and payment-proof rules remain in force. Staging SMTP stays active and payment/hosting/registrar/WhatsApp disabled. Deployment and acceptance of the new release require separate authorization.
- **Operational follow-up — 2026-10-29:** The owner authorized deployment under Command 140. The correction is included in staging release `b13d72f`, with financial snapshots and the fictional unpaid/unissued draft preserved. The owner confirmed phone, country, manual instructions and matching editor/document due dates in Speed, closing rendered-draft acceptance. No invoice was issued or paid to test it.

## ADR-143 — Keep administrator domain and hosting records in client context

- **Date:** 2026-10-28
- **Status:** Accepted; deployed to staging under Command 140 on 2026-10-29, with owner-assisted client-workspace acceptance passed.
- **Decision:** Use `/admin/customers/{customerId}` as the parent workspace, with Summary, Profile, Products/services and Domains navigation. Nested service/domain detail URLs retain the client header and provide an owned record selector. Global names link to these URLs; a legacy administrator domain detail alias resolves its saved owner. Customer domain links use their authenticated portal and existing API ownership checks.
- **Boundary:** Optional expected-client UUIDs on domain list/detail and service detail reads are validated at the controller and enforced before detail serialization. Domain filtering happens in PostgreSQL before the existing 100-record limit. Invalid or mismatched client/record responses never render record controls; switching clients discards record selection. New nested routes retain domain/service full-administrator authorization rather than inheriting the broader customer-read permission.
- **Consequence:** Client and record selectors remain bounded to 100 recent choices, retaining the current client and individually fetched selected older record. Domains keep the existing list bound; this does not implement all-history registrar search. The client service table retains its existing search, status, counts and pagination with a fixed parent scope. Existing guarded service operations remain on that client table; selected service details show saved application facts. Existing registrar forms are reused with their original explicit operation/payment/MFA guards. No schema, financial state, provisioning policy, live networking, migration/import or unsupported WHMCS feature is introduced.

## ADR-144 — Read client billing and communication records in profile tabs

Command 141 (2026-10-29) adds Orders, Invoices, Payments, Support and Email history
beside the existing profile tabs. Client identity persists while collections use
compact, customer-scoped tables with server-side search, status filters and paging.
Record dialogs are read-only; existing global workflows retain their permissions
and write controls. Expected client IDs are validated by detail APIs before record
serialization, and browser responses are runtime-validated for scope and shape.
Each server entry independently checks its existing resource permission.
Restricted staff retain the existing client context and global billing/support
workspaces; these expanded client-profile components remain full-administrator UI.

Email history uses the stored customer foreign key, never an email-address match.
Unlinked historical logs are excluded; changing an address does not transfer
history between accounts. Expose only bounded delivery metadata and safe attempt
codes, with no message bodies, tokens, raw diagnostics or send/retry controls.
Sent means mail-provider acceptance, not proof of inbox delivery. No provider,
database-schema, staging configuration or deployment change is authorized here.

Operational follow-up (2026-10-29): the owner separately authorized deployment under
Command 142. Release `9d1bcba` is installed after exact-release checks and encrypted
backup verification, with automated preservation and security-boundary acceptance
passed. After browser input timeouts, the owner confirmed all five tabs, search/clear
and read-only-dialog checks in Speed. SMTP stays active and other providers disabled; this rollout does not
authorize new provider operations or existing-domain adoption.

## ADR-145 — Verify and link existing domains without registration billing

- **Date:** 2026-10-29
- **Status:** Accepted for owner-authorized local implementation under Command 143.
- **Decision:** A full administrator with MFA selects an explicit client and registrar
  connection and confirms the exact existing .com domain. GET-only discovery must
  independently verify the provider order/domain, active direct reseller customer,
  active registrant contact, nameservers and unexpired registration. Availability,
  public DNS, manually entered remote IDs and an administrator status override are
  not ownership proof. Network/account gates remain mandatory.
- **Storage:** Existing links have an immutable origin, encrypted identity/contact
  evidence, credential binding and initial ownership-check timestamp. They have no
  registration quote, order item or invoice. SQL preserves the current combined
  hosting/domain billing guard for ordinary registrations while enforcing the
  distinct no-billing link shape. Client/account/order identity cannot be reassigned;
  linked records cannot enter registration processing or be deleted.
- **Management:** Revalidate current reseller/domain/contact ownership before linked
  management, retaining existing confirmations, durable claims and reconciliation.
  Nameserver, lock and contact actions reuse current guarded workflows. No renewal
  billing terms, historical amounts or registration periods are invented; linked
  renewals remain unavailable. No transfer, import/synchronization or premium pricing
  workflow is added. A link is not a new registration or a payment event.
- **Delivery boundary:** Validate with fictional PostgreSQL scopes and mocked HTTP
  only. This source command authorizes no deployment, actual domain adoption, real
  provider calls, purchases, activation or messages. Preserve active staging SMTP and
  disabled payment/hosting/registrar/WhatsApp settings. Credentialed ownership and
  real management acceptance require separate authorization after deployment.

## ADR-146 — Pin existing website/email preservation to hosting provisioning

- **Date:** 2026-10-30.
- **Scope:** Owner-authorized local Command 146; no deployment or real operation.
- **Decision:** An administrator may select Keep existing website and email for a
  hosting-only order. Snapshot `PRESERVE_EXISTING`; normal/guest/customer orders
  snapshot `STANDARD`. Clients cannot inject the administrator choice or raw panel
  parameters. Preserve the exact package and selected mode across order replay,
  paid-order service creation and durable operation retries; a changed-mode replay
  is a conflict. SQL freezes the new snapshots, rejects invalid modes and requires
  a service to retain its source order snapshot. Existing snapshots without the
  key remain valid and are not backfilled. Standard response shapes stay unchanged.
- **Provider behavior:** Explicit `forcedns=0` on creation forbids overwriting an
  existing DNS zone. Preservation adds `mxcheck=remote`; standard mail behavior is
  unchanged. Verify the remote/nonaccepting setting for the exact account/domain
  after creation and before accepting an existing deterministic account as replay.
  Failed or ambiguous evidence holds the operation Inconsistent, with no automatic
  retry, routing correction, second creation or deletion. Existing durable claims,
  disabled-server checks, verified-payment gate and credential redaction remain.
- **Narrow verification read:** WHM's authenticated API 2 bridge is permitted only
  for exact `Email/getalwaysaccept`, one user/domain and no extra parameters or
  mutation flag. Share TLS/public-host validation, timeout/size bounds and error
  redaction with the WHM transport. Validate the response identity and remote mode.
  [cPanel documents this read](https://api.docs.cpanel.net/cpanel-api-2/cpanel-api-2-modules-email/cpanel-api-2-functions-email-getalwaysaccept)
  as deprecated but with no equivalent UAPI function. Unsupported/malformed reads
  fail closed; no write fallback is allowed.
- **Operating limit:** These are requested and verified server mail settings and a
  no-overwrite policy, not proof of unchanged authoritative DNS across a real
  cluster. Fresh domain/alias/zone/cluster checks and public DNS/mail baselines remain
  prerequisites for an authorized live trial. No website/email migration, registrar
  action, public nameserver change or external provider acceptance is implied.

## ADR-147 — Separate combined domain billing from registrar dispatch

- **Date:** 2026-10-30. Owner-authorized local Command 149.
- **Decision:** Add an explicit optional domain line to the administrator hosting
  order. Send registration to registrar starts unchecked. Existing mode selects
  this client's registered, unexpired, ownership-verified link and the current
  enabled TLD catalogue's immutable annual BDT price. Billing requires no registrar
  connection or availability call. It creates no registration/renewal request,
  automatic renewal date or provider action. Missing prices are never zero prices.
- **History:** Store the new initial billing association in append-only
  `existing_domain_orders`; retain the original domain's absent registration
  quote/order/invoice fields, encrypted link evidence and observed registry expiry.
  Domain details separately show combined billing. Do not retrofit old manual
  invoices, paid orders or linked domains. A linked domain has at most one initial
  combined billing association; future renewal billing remains separate work.
- **Registration:** Explicit checked mode requires an administrator quote with
  recorded client consent and current catalogue/DNS/policy scope. Support the
  existing live adapter only behind its existing account/network gates. One unpaid
  combined invoice does not authorize a registrar operation: verified payment,
  separately selected/approved registrar, cost ceiling and durable dispatch gates
  still apply. Customer/guest routes cannot supply the administrator choice;
  their existing simulated combined route retains its limits.
- **Integrity:** Full administrator MFA, fresh actor/client checks, row/catalogue
  locks, strict request shapes, integer totals and submission replay identity are
  required. SQL freezes new action snapshots, validates matching billing/domain
  associations at commit and forbids historical adoption/deletion. Hosting and
  domains remain separate fulfillment states; a verified link never substitutes
  for an active hosting service. The earlier domain-only simulated form remains
  unchanged. No real provider setting or record changes in this command.
- **Coordination and rollback:** Use the existing registrar lock order: quote
  when present, catalogue, then actor/client and domain. Waiting for catalogue
  coordination must not hold actor/client locks needed by ownership linking.
  Recheck the submission key after acquiring the locks: an exact concurrent
  retry returns the committed order before testing its consumed domain/quote.
  Earlier application versions do not fulfill the new existing-domain billing
  association; rollback after creating these orders requires a compatible plan
  that preserves the association and all financial history.

## ADR-148 — Preserve hosting account-creation retry history across submission keys

- **Date:** 2026-10-31. Command 156 local fictional lifecycle acceptance.
- **Finding:** The dedicated retry route rejects uncertain results and bounds
  attempts, but a fresh Create account submission could start again from a failed
  service, losing the retry chain and bypassing the uncertain-result hold.
- **Decision:** After locking the service row and honoring exact replay, reject
  a fresh account-creation key if any earlier creation attempt exists. Subsequent
  attempts must use the existing safe retry action. Under that same lock,
  revalidate the original service/type, Failed and retryable state, five-attempt
  bound and incremented attempt number; allow only one child per attempt and
  reject creation while an uncertain creation remains. Existing history is not
  rewritten or adopted. A recorded payment remains separate from fulfillment.
- **Acceptance and limits:** Test a complete fictional BDT 3,090 combined order
  through sample payment and the actual fake hosting adapter, including temporary
  failure recovery and a response lost after account creation. Keep an existing
  linked domain Registered with registration off and no registrar dispatch. This
  local change does not authorize deployment, real payment or provider activation.

## ADR-149 — Matching-release recovery and explicit production-readiness gates

- **Date:** 2026-10-31. Command 158.
- **Decision:** Verify all current tables and exact trusted migration names/checksums,
  rejecting unfinished history. Accept only raw/LF/CRLF variants computed from the
  matching reviewed SQL; never rewrite applied history or normalize historical SQL.
  Compare complete row-content fingerprints as well as counts. Hash rows inside
  PostgreSQL using one read-only repeatable-read transaction per database; retain
  duplicates and no plaintext customer rows in comparison files.
- **Evidence:** Eight fast inventory/checksum tests and the actual isolated encrypted
  recovery drill passed, including missing newer tables, equal-count alteration,
  corruption, migration tampering and destructive-target refusals. An encrypted
  Office PC copy was retrieved and restored into a network-isolated temporary
  database: 56 tables and 39 migrations matched; data-only restore took 14 seconds.
  This is not full application RTO, managed immutable storage or secret escrow.
- **Operating target:** The owner selected bank receipts with controlled WHM and
  registrar APIs, and 200 customers who may own multiple services. A fictional
  600-service/600-domain, two-admin profile is an assessment assumption, not a
  production limit. Keep SMTP active and other live providers disabled. The old
  suggested bank-reconciliation Command 158 was declined and superseded by this
  review. No particular unpaid invoice must be paid to finish the review.
- **Limits:** Production remains NO-GO pending recovery/monitoring/access/capacity,
  separately approved provider actions and final operating sign-off. The global
  domain inventory's 100-record cap is a remaining functional scale gap. Review
  results do not authorize deployment, provider purchases or host access changes.

## ADR-150 — Consumer-scoped toolchain security remediation

- **Date:** 2026-10-31. Command 159.
- **Decision:** Use supported Vite/Vitest patches and align lint Zod with existing
  runtime 4.6.6. Upgrade modern named-API glob/minimatch consumers with compatibility
  acceptance while retaining legacy callable/callback APIs. Enforce an exact 4.3.1
  deepmerge patch for source, CommonJS and UMD target/source prototype-key guards.
- **Evidence:** Resolve actual build-tool consumers and run bounded security and
  compatibility probes, including filesystem cancellation and mock code/path
  safety. Require complete frozen-install, lint/type/package/API/browser/build
  acceptance before delivery; do not change business rules to make tools pass.
- **Audit limits:** Raw scanner warnings remain visible for locally patched
  deepmerge and legacy minimatch without the reported optimization routine.
  Preserve version identity and specific applicability evidence; no advisory
  suppression, blanket exception or zero-full-graph claim. Prefer reviewed upstream
  fixes when available. No deployment or production approval follows from this work.

## ADR-151 — Complete global domain reads without expanding sensitive detail lists

- **Date:** 2026-11-01. Command 160.
- **Decision:** Add a canonical full-administrator inventory read model with
  validated pagination/search/state/origin/client filters, complete matching counts
  and six bounded status totals. Preserve the legacy portal/client detail-array
  contract and existing individual ownership/MFA/provider checks.
- **Consistency:** Read an explicit SQL projection and grouped counts in one
  read-only Repeatable Read transaction. Use requested time and UUID descending
  for deterministic ties; bind all values and treat search metacharacters literally.
  No per-row detail expansion, decryption, provider read or record mutation.
- **Semantics:** Match existing effective Awaiting approval behavior for a paid
  awaiting-payment registration without changing stored registration state. Show
  associated invoice balance as exact minor units, including linked-domain billing;
  do not infer new prices, renewals or provider success.
- **Interface and limits:** Persist filters in a fixed local URL, fail closed on
  malformed selection/payloads, ignore stale reads and link into client-owned
  detail routes. Validate complete fictional multi-service inventory and responsive
  browsing. Offset pages may change between reads. This source repair does not
  deploy, establish a production capacity limit or close unrelated operating gates.

## Open Decisions

The following decisions are intentionally unresolved and must be selected before their related implementation commands:

1. Production approval, credentials, and go-live runbook for bKash and/or SSLCOMMERZ after sandbox acceptance.
2. Dedicated cPanel development reseller/token, hostname, outbound-IP allowlist, disposable packages/account/domain, and explicitly approved manual mutation window. WHM API-token authentication is selected and implemented.
3. Staging SMTP is configured and selected delivery was accepted. Production sender
   reputation, SPF/DKIM/DMARC, quotas, bounce handling, rotation and incident routing
   still require evidence; keep staging SMTP active.
4. Resell.biz/StarGate/UK2 is the owner-selected LogicBoxes brand (ADR-126). Genuine
   demo identity and API/IP access, account-specific contracts/status vocabulary,
   contact/registrant agreements, TLD/prices/charge controls and exact sandbox acceptance
   inputs remain open for mutating acceptance. Later commands implemented the
   adapter and verified saved-account reads and ownership-bound existing-domain
   links; registration/renewal/management mutations are not fully accepted.
5. Remaining Speed Host operating inputs and `DRAFT-OPS-1` D5–D8 decisions in
   `docs/PRODUCTION_BUSINESS_POLICIES.md`. Existing identity, currency, optional-tax,
   renewal defaults and D1–D4 rules are owner-approved; actual catalogue/legacy mapping,
   production mapping, operators/staffing, cancellation safeguards, retention, contacts,
   windows, gap evidence and final launch approval remain open. No approved value is applied
   to production by the policy record. Staging identity/manual destinations and
   annual .com initial pricing were separately accepted; renewal stays unconfigured.
6. Exact shared-server provider/account ID, plan/region/cost, recovery controls, named
   infrastructure/rollback owners, and off-site immutable backup destination.
7. Currency implementation/activation under ADR-080: exact enabled sale/collection
   currencies, catalogue fixed/derived prices, provider/plan/terms and rate evidence rights,
   freshness/deviation/override/quote/rounding policies, reporting valuations and protected
   WHMCS source/target/credit treatment. BDT default and USD preferred secondary are the
   owner-directed target, not approved live collection or a completed implementation.

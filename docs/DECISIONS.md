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

## Open Decisions

The following decisions are intentionally unresolved and must be selected before their related implementation commands:

1. Production approval, credentials, and go-live runbook for bKash and/or SSLCOMMERZ after sandbox acceptance.
2. Dedicated cPanel development reseller/token, hostname, outbound-IP allowlist, disposable packages/account/domain, and explicitly approved manual mutation window. WHM API-token authentication is selected and implemented.
3. SMTP delivery provider for staging and production.
4. UK2Group API product/brand, current official documentation, test environment, contact policy, supported TLDs, pricing/renewal behavior, and the separately authorized registrar-command position.
5. Final business identity values, supported operating currency, VAT/tax rules, reminder schedule, suspension grace period, cancellation policy, and refund policy.
6. Production VPS/provider and backup destination.

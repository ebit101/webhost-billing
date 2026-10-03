# Product Experience Roadmap

## Status and purpose

- **Established:** 2026-10-03 by Command 75
- **Product:** Webhost Billing, one web-hosting business per installation
- **Evidence boundary:** local fictional safe demo, repository source and tests, and
  current official public WHMCS documentation used only as a workflow-concept
  benchmark
- **Production status:** **NO-GO**

This roadmap moves the project from a sound technical foundation toward a coherent
hosting-business product. It does not promise WHMCS parity. Local user jobs, safety
invariants, dependency readiness, and bounded evidence decide the sequence.

## Review method and evidence

The Command 75 review used the generated fictional administrator and customer
identities. No reset, order, payment, ticket, provider, service-lifecycle, settings,
or other business mutation was performed.

- `pnpm demo:doctor` passed Docker CLI, Compose, Engine, fixed loopback port, and
  redacted runtime-file checks.
- The first cold `demo:up` build encountered registry latency and repeated package
  retrieval errors while API and web images built concurrently. The API image was
  rebuilt sequentially, and the existing current web/initializer images were used
  because no application source affecting them had changed since they were built.
- Initial seeding encountered one transient PostgreSQL transaction-start timeout.
  A non-destructive retry completed; all six runtime services became healthy.
- `pnpm demo:smoke` passed `/ready`, `/hosting`, `/portal`, and `/admin` without a
  business or Docker-state mutation.
- Every page route in `apps/web/src/app` was opened in the running demo. Dynamic
  customer, service, and invoice routes used seeded fictional record identifiers.
- Public store, customer portal, and administrator customer-context screens also
  received live visual review. DOM-based route evidence was used for the complete
  inventory; repository screenshots were not substituted for live review.
- API controller routes, shared pagination/filter contracts, worker/scheduler
  modules, the capability matrix, release checklist, and the primary browser
  lifecycle test were reconciled with the observed UI.

The supported non-destructive `pnpm demo:down` stop is part of the completion
evidence recorded in `docs/PROGRESS.md`.

## Safety invariants used by this roadmap

| ID  | Invariant                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Administrator roles and customer ownership are enforced at the service/API boundary, never only in navigation or presentation.               |
| S2  | Prices and totals remain server-authoritative integer minor units and use safe string serialization at boundaries.                           |
| S3  | Order, invoice, payment, provisioning, and service states remain separate; payment never proves provisioning.                                |
| S4  | Issued financial records and original payments remain immutable; refunds and reversals are new transactions.                                 |
| S5  | External and retryable operations remain authenticated, idempotent, evidence-led, and explicit about uncertain results.                      |
| S6  | Permanent termination remains an explicitly confirmed administrator action and is never scheduled automatically.                             |
| S7  | Integration credentials and sensitive evidence remain encrypted or redacted and are never returned through product search or summaries.      |
| S8  | Visible controls must either perform their stated bounded job or be clearly unavailable; decorative controls must not claim live capability. |

## Route and capability inventory

### Public and account entry

| Route              | Observed capability                                                                  | Supporting boundary                                             | Product-experience finding                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/`                | Public entry, product explanation, account routes, and local Why us/Support sections | Static App Router page in the existing public shell             | Command 76 replaced the login redirect; every displayed public navigation target now resolves locally.                             |
| `/hosting`         | Public product comparison and period selection                                       | Public product API and append-only price versions               | Command 76 selects the first supported period with an active price and exposes a valid checkout action on the first priced render. |
| `/login`           | Secure cookie sign-in; administrator challenge when configured                       | CSRF, rate limiting, sessions, role routing, administrator TOTP | Functional and clear; it does not preserve an anonymous product selection for post-login checkout.                                 |
| `/register`        | Customer registration                                                                | Runtime validation, password hashing, verification token        | Functional; product/price intent is not carried into registration.                                                                 |
| `/forgot-password` | Enumeration-resistant reset request                                                  | Single-use expiring token and safe response                     | Functional and appropriately cautious.                                                                                             |
| `/reset-password`  | Token-bound password replacement                                                     | Session revocation and password policy                          | Incomplete-link state is clear.                                                                                                    |
| `/verify-email`    | Token-bound customer verification                                                    | Single-use verification token                                   | Incomplete-link state is clear.                                                                                                    |
| `/account`         | Identity, role, session revocation; administrator TOTP                               | HttpOnly session, ownership/role checks                         | Functional but visually separate from the main workspace, adding context switching.                                                |

### Customer portal

| Route                          | Observed capability                                                   | Supporting boundary                             | Product-experience finding                                                                                       |
| ------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/portal`                      | Authenticated account counts, recent service, invoice, and ticket     | Ownership-bound customer detail                 | Real data replaced fixtures, but totals and “recent” items do not clearly answer what the customer must do next. |
| `/portal/orders`               | Order, invoice, and fulfilment states in one table                    | Paginated ownership-bound order API             | Related order, invoice, and service identifiers are not navigable; the UI fetches only the first 100 records.    |
| `/portal/checkout`             | Product, price, domain, server-authoritative total and order creation | Idempotent checkout; product/price revalidation | Strong financial boundary; selection continuity from an anonymous catalogue visit is missing.                    |
| `/portal/services`             | Service cards with state, server, account, and renewal data           | Ownership-bound service API                     | Useful overview; first-100 loading and inactive workspace search limit growth.                                   |
| `/portal/services/[serviceId]` | Service detail and short-lived fake-panel login action                | Ownership check and provider-neutral operation  | Clear detail; the panel action has no nearby invoice/order context.                                              |
| `/portal/invoices`             | Invoice status, due date, total, balance                              | Ownership-bound invoice API                     | Clear ledger; first-100 loading and no search/filter/pagination controls.                                        |
| `/portal/invoices/[invoiceId]` | Immutable invoice, PDF/print, payment instructions/references         | Snapshot and payment-state rules                | Strong invoice view; customer payment action appears only when invoice state allows it.                          |
| `/invoices/[invoiceId]/print`  | Ownership-bound printable invoice                                     | Server-fetched invoice detail                   | Useful dedicated output; browser print is the only mutation-like action and remains user initiated.              |
| `/portal/profile`              | Contact/address update and password change                            | Ownership, audit, session revocation            | Functional and appropriately separates password change.                                                          |
| `/portal/support`              | Open, select, read, and reply to plain-text tickets                   | Ownership-bound tickets and service association | Functional; list is first-100 and has no visible search/filter/pagination despite API support.                   |

### Administrator workspace

| Route                           | Observed capability                                                                  | Supporting boundary                                                     | Product-experience finding                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `/admin`                        | Period metrics, revenue graph, CSV exports, recent audit events                      | Transaction-sourced reports and audited bounded exports                 | Summary cards are not links to work queues; login events dominate recent activity; there is no recent-payment/attention list.   |
| `/admin/customers`              | Search, status filter, add customer, pagination                                      | Server-side query and pagination                                        | This is the strongest scalable directory pattern and should be reused elsewhere.                                                |
| `/admin/customers/[customerId]` | Operational identity, linked navigation, profile/billing/access and bounded history  | Role guard, bounded customer aggregate, and validated ledger filters    | Command 77 puts actionable context first, formats money/dates safely, and links direct invoice or customer-filtered ledgers.    |
| `/admin/products`               | Product lifecycle, public visibility, cPanel mapping, price versions                 | Append-only price definitions                                           | Capable but dense; amounts are entered and described as raw minor units, increasing operator error risk.                        |
| `/admin/orders`                 | Create order/invoice and approve workflow states                                     | Server pricing, snapshots, separate states                              | No order detail route or related-record navigation; fixed first-100 fetch despite API search/filter/pagination.                 |
| `/admin/services`               | Create/provision/suspend/reactivate/terminate; panel configuration and operation log | Fake provider, evidence-led transitions, exact termination confirmation | Core lifecycle exists, but service, customer, order, invoice, and panel evidence are fragmented on a very dense page.           |
| `/admin/invoices`               | Draft creation, business identity, invoice list/detail                               | Immutable issued invoices and snapshots                                 | Fixed first-100 list; customer/order links and URL-bound filters are missing.                                                   |
| `/admin/invoices/[invoiceId]`   | Invoice detail and PDF                                                               | Role guard and immutable financial model                                | Clear document, but customer/order/payment context is not navigable.                                                            |
| `/admin/payments`               | Gateway attention, manual receipts, review, refund/reversal, settlement policy       | Append-only adjustments and reconciliation                              | Fixed first-100 ledger; the global partial-payment policy changes from a single click without an explicit review step.          |
| `/admin/support`                | Search/filter, assignment, priority/status and replies                               | Paginated ticket API and audit                                          | Filters exist, but the fetched page is fixed at 100 and the selected ticket has no direct customer/service navigation.          |
| `/admin/automation`             | Queue/outbox/provider health, renewal policy, run/failure evidence                   | Retained job/outbox evidence and scheduler records                      | No “last healthy scheduler run” freshness statement; zero failures can look healthy even when no renewal run has ever occurred. |
| `/admin/email`                  | Safe delivery and attempt metadata                                                   | Redacted append-only delivery evidence                                  | Useful but fixed latest set with no recipient/status/time filter.                                                               |
| `/admin/settings`               | Billing, renewal, adapter, branding and encrypted credential configuration           | Role guard, encrypted write-only secrets                                | High-impact settings share one long page; save boundaries and consequences require careful operator reading.                    |

### API, jobs, and test support

The repository already has more backend support than several screens expose:

- Customer, order, service, invoice, payment, and ticket list contracts support
  bounded pagination. All except customer additionally expose relevant ownership or
  customer filters; all core ledgers expose server-side search/status filters.
- Detail endpoints exist for orders, services, invoices, payments, tickets, and
  customers even where the administrator UI has no dedicated detail route.
- Provider-neutral payment, hosting-panel, and email boundaries already exist, with
  fake providers for tests and guarded real-adapter configuration.
- The worker and scheduler implement renewal invoices, reminders, conservative
  suspension/reactivation, durable outbox delivery, and retained failures. The safe
  demo intentionally omits those processes.
- The primary Playwright lifecycle proves registration, verification, login,
  checkout, fake payment callback, administrator approval, provisioning, renewal,
  overdue suspension, payment-triggered reactivation, support, and exact-confirmed
  termination. It does not prove navigation, pagination, search, empty/large data
  sets, or the operator’s normal cross-record investigation path.

## Public workflow benchmark

The following current official public documentation was verified on 2026-10-03.
It supplies workflow questions, not requirements or design source material.

- WHMCS [client summary](https://docs.whmcs.com/9-1/clients/client-profile/summary-tab/)
  groups client details, billing/service statistics, linked records, and common
  actions. Webhost Billing should improve its own customer-context navigation
  without copying that screen or its breadth.
- WHMCS [product and service context](https://docs.whmcs.com/9-0/clients/client-profile/products-services-tab/)
  keeps order, service, invoice, and lifecycle relationships close to the operator.
  The useful concept is connected context, not module-command parity.
- WHMCS [order management](https://docs.whmcs.com/9-0/orders/order-management/)
  retains a reviewable pending-order boundary even when downstream automation can
  run. Webhost Billing already separates payment and provisioning and should make
  that review path easier to follow.
- WHMCS [billing logic](https://docs.whmcs.com/9-1/billing-and-invoicing/billing-logic/)
  describes ordering, invoicing, payment, and provisioning as distinct stages. That
  matches Webhost Billing invariant S3 and does not authorize combining states.
- WHMCS [automation settings](https://docs.whmcs.com/9-0/system/automation/automation-settings/)
  makes scheduling and nonpayment consequences explicit.
- WHMCS [automation status](https://docs.whmcs.com/9-1/system/automation/automation-status/)
  distinguishes recent successful execution from configured automation and links
  failures to evidence. Webhost Billing needs equivalent clarity in its own smaller
  scheduler model.
- WHMCS [support tickets](https://docs.whmcs.com/9-1/support/support-tickets/)
  emphasizes queue filtering and the related customer/service context. Departments,
  attachments, SLAs, notes, merges, and other breadth are not implied for this
  project.

No licensed instance, proprietary code, private material, product copy, screenshots,
styling, or trade dress was accessed or used.

## Workflow-led gap matrix

Priorities are:

- **P0:** first product-experience set; frequent or trust-breaking journey with high
  readiness and bounded evidence.
- **P1:** important next-phase work after Commands 76–78.
- **P2:** useful later improvement with lower present frequency or larger dependency.
- **OUT:** deliberate non-goal for this product scope.

| Area and gap                                                                         | Local evidence                                                                                                                                 | Role and business job                                                         | Friction or risk                                                                                 | Desired outcome                                                                                 | Safety invariant | Test/evidence route                                                                  | Dependencies                                                                 | Priority                                               |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| Product discovery: public entry and navigation contradicted each other               | Command 75 observed `/` redirecting to `/login` while public navigation targeted root fragments; Command 76 added the local entry and sections | Prospective customer compares the business and available hosting              | Resolved: header, footer, catalogue, registration, sign-in, Why us, and Support targets are real | Keep the entry small, independent, and limited to supported local journeys                      | S8               | Public-storefront component test plus Playwright `/`, fragments, and `/hosting`      | Existing public shell/catalogue                                              | Completed / Command 76                                 |
| Product discovery: first catalogue view selected an unavailable period               | Command 75 observed yearly selected with no price; Command 76 derives the first supported priced period from active API data                   | Prospective or returning customer selects a plan                              | Resolved: a valid CTA appears on the first priced render; unavailable periods remain explicit    | Preserve deterministic selection and server-side product/price/total revalidation               | S2, S8           | Catalogue component states plus anonymous and authenticated browser assertions       | Public product response already contains active prices                       | Completed / Command 76                                 |
| Checkout continuity: anonymous selection is not retained through account entry       | Catalogue CTA targets protected `/portal/checkout`; login always routes customer to `/portal`                                                  | Prospective customer signs in before buying                                   | Product/price intent is lost and must be rediscovered                                            | Preserve only a validated internal checkout selection or give an explicit resume path           | S1, S2           | Anonymous catalogue-to-login-to-checkout E2E                                         | Bounded internal return-target design                                        | P1                                                     |
| Customer self-service: overview reports counts and recency, not next action          | `/portal` shows totals, one paid invoice with `BDT 0.00`, one service, and latest ticket                                                       | Customer checks whether anything needs payment, renewal, or support attention | Customer must open multiple pages to infer urgency                                               | Ownership-bound balance, overdue, next-renewal, and support-attention summary with direct links | S1–S4            | API aggregate tests, portal component states, customer E2E with paid/unpaid fixtures | Existing invoice/service/ticket queries; bounded aggregate contract          | P0 / Command 78                                        |
| Customer records: orders and lists are not connected                                 | `/portal/orders` displays invoice/order/domain text without links; service detail lacks invoice/order context                                  | Customer traces purchase, payment, and service                                | Manual cross-page matching by identifiers                                                        | Links between permitted order, invoice, and service records without exposing other customers    | S1, S3           | Ownership tests and customer navigation E2E                                          | Existing detail endpoints; route design                                      | P1                                                     |
| Administrator customer context is read-only text after long edit forms               | Command 77 reordered the bounded customer aggregate, removed raw minor-unit presentation, and added validated navigation                       | Administrator answers a customer or investigates account history              | Resolved: identity, status, counts, and recent records precede edits and open protected context  | Retain bounded context, safe money/time display, and explicit customer filters                  | S1–S4            | Customer-detail component tests, API filter tests, and admin customer-to-record E2E  | Existing customer aggregate and list `customerId` filters                    | Completed / Command 77                                 |
| Order/payment review lacks a connected detail path                                   | `/admin/orders` and `/admin/payments` use fixed first-100 tables; invoice/customer/service context is plain text                               | Administrator reviews paid order, receipt, and fulfilment readiness           | State relationships must be reconstructed across screens                                         | Searchable review context with links and explicit independent states                            | S2–S5            | Component/API query tests and paid-order review E2E                                  | Existing detail/list endpoints                                               | P1                                                     |
| Financial policy toggle is a one-click mutation                                      | `/admin/payments` enables/disables partial payments directly; the same policy also appears in settings                                         | Administrator changes settlement rules                                        | Accidental policy change affects future payment acceptance                                       | Review the current/new policy and consequence before audited save                               | S2, S4           | Component confirmation test and API audit assertion                                  | Existing settings endpoint and audit                                         | P1                                                     |
| Provisioning/service work is concentrated on one dense page                          | `/admin/services` combines fulfilment, inventory, server credentials, tools, operation log, suspend and terminate                              | Administrator provisions and troubleshoots an account                         | Context fragmentation and dense inline actions raise wrong-record risk                           | Service-focused context with related order/invoice/customer and evidence-led actions            | S1, S3, S5–S7    | Fake-provider service E2E and role tests                                             | Existing service/panel detail endpoints                                      | P1                                                     |
| Destructive service controls need consistent context, although the core gate is safe | Live inventory exposes Suspend/Terminate inline; source and E2E confirm reason plus exact `TERMINATE` gate                                     | Administrator stops a service                                                 | Dense rows can initiate the wrong intent even though confirmation prevents immediate termination | Retain exact confirmation and show customer/domain/state/impact in every action review          | S3, S5, S6       | Existing termination E2E plus contextual dialog assertions                           | No backend dependency                                                        | P1                                                     |
| Invoices/renewals lack customer-facing urgency and operator freshness                | Portal prioritizes the most recent invoice even when paid; automation page can show zero failures and “no cycle has run yet”                   | Customer pays on time; operator verifies renewal health                       | Quiet displays can hide missing work                                                             | Distinguish no action from no execution and link due items/runs to records                      | S2–S5            | Portal aggregate tests; scheduler freshness fixtures                                 | Scheduler run timestamps and invoice aggregates                              | P0 customer portion in Command 78; operator portion P1 |
| Support context is not navigable and customer list controls lag API capability       | Customer support loads first 100 without visible filters; admin ticket detail shows customer/service as text                                   | Customer finds a ticket; administrator responds with account context          | Longer histories become hard to search and operators manually look up services                   | URL-bound search/paging plus customer/service links while retaining plain-text safety           | S1, S7           | Ticket component pagination/search tests and role E2E                                | Existing ticket query contracts                                              | P1                                                     |
| Operational attention is activity-heavy rather than action-led                       | Dashboard metrics do not link; login events dominate recent activity; no recent-payment queue                                                  | Administrator starts the day and triages work                                 | High-value exceptions are hidden behind navigation and low-value audit noise                     | Direct attention links for pending orders, overdue invoices, payments, tickets, and failed work | S3–S5, S7        | Dashboard component/API tests with mixed fixtures                                    | Existing metrics and list filters; payment summary may need bounded API work | P1                                                     |
| Automation health does not prove freshness                                           | `/admin/automation` can show all zero queues/failures while stating no renewal cycle has run                                                   | Administrator confirms billing automation actually executed                   | “No failures” can be mistaken for “healthy and current”                                          | Last-run/freshness state with never/stale/healthy/failed semantics                              | S3, S5           | Scheduler/API time-fixture tests and admin UI states                                 | Existing renewal run records and business time zone                          | P1                                                     |
| Workspace search and notification chrome is inactive but visually live               | `WorkspaceShell` has an unbound search input and bell with a red dot for both roles                                                            | Any authenticated user searches or checks alerts                              | Controls invite action but do nothing, eroding trust and accessibility predictability            | Remove them until supported or implement bounded role-safe search/attention behavior            | S1, S7, S8       | Shell component tests and keyboard/browser smoke                                     | Search APIs exist per module; no notification model exists                   | P1                                                     |
| Core ledgers silently cap at 100 in the UI                                           | Orders, services, invoices, payments, customer tickets, panel operations use `pageSize=100` without controls                                   | Customer or administrator finds older records                                 | Records beyond the first page become invisible                                                   | Reuse the customer-directory pattern for URL-bound search, filters, page size and pagination    | S1, S7           | Large-fixture component/API tests and navigation E2E                                 | Existing pagination contracts                                                | P1                                                     |
| Configuration is a single broad high-impact surface                                  | `/admin/settings` combines identity, renewals, gateway/panel mode, email, and credentials                                                      | Administrator configures the business safely                                  | Easy to miss save scope or downstream effect                                                     | Section-level save evidence, change summaries, and clear activation consequences                | S2–S7            | Component tests and audit assertions using fake values                               | Existing settings contracts                                                  | P2                                                     |

## Explicit affordance, navigation, scale, and shortcut findings

### Misleading or inactive affordances

- Public Home, Why us, and Support links target a root route that redirects to login.
- Workspace search accepts text but has no event, query, or results behavior.
- The notification bell has a red indicator but no action or notification model.
- Navigation badges show fixed aggregate counts, not necessarily the operator's
  actionable or filtered queue.
- An automation page with zero failures can still have no successful run history.

### Missing cross-record navigation

- Command 77 connected administrator customer history to direct invoice detail and
  explicit customer-filtered order, service, invoice, payment, and ticket ledgers.
- Order and payment tables do not provide a coherent path among customer, invoice,
  service, and fulfilment context.
- Service and ticket views show related identities as text rather than safe links.
- Customer order rows do not link the order to its permitted invoice or service.

### Scale, search, and pagination limits

- The API already exposes bounded query contracts for all core ledgers.
- Only the administrator customer directory exposes complete page controls.
- Administrator support exposes filters but requests a fixed first page of 100.
- Core admin and customer record lists silently request the first 100 and discard
  pagination metadata.
- Email delivery, panel operations, renewal runs, and audit activity are latest-only
  views with no user-controlled time/status query.

### Unsafe or insufficiently reviewed shortcuts

- Permanent termination is not an unsafe shortcut: it requires a reason and the
  exact `TERMINATE` phrase, and the E2E lifecycle proves the wrong phrase fails.
- Refunds and reversals preserve the original payment and require a second form, but
  the adjustment review should retain full invoice/customer context as lists grow.
- Customer access deactivation and product archival have explicit confirmation.
- The partial-payment global policy is the observed exception: it changes from a
  single button without a consequence review. That is a P1 financial-control fix.
- No roadmap item may turn a paid invoice into automatic proof of provisioning or
  weaken the exact termination gate for convenience.

## Deliberate non-goals

The following are not gaps and must not be pulled into Commands 76–78:

- reseller or multi-tenant operation;
- marketplaces, affiliates, promotions, or cross-selling systems;
- multi-currency accounting or worldwide tax engines;
- domain registrar integration, TLD pricing, WHOIS, or transfer automation;
- automatic permanent termination;
- ticket attachments, departments, SLA engines, knowledgebase, or guest ticketing;
- copied WHMCS navigation, information architecture, text, styling, trade dress,
  breadth, or compatibility claims;
- real provider credentials, customers, production data, hosted probing, staging or
  production deployment;
- changes to the immutable `v0.1.0-alpha.1` source release.

## Prioritization and first product-experience set

The first set favors visible broken trust, frequent support/operator work, ready
backend dependencies, and deterministic fictional evidence:

1. **Command 76 — Repair the Public Storefront Entry and Plan Selection.** The
   anonymous first impression currently contains dead navigation and initially
   hides the only purchasable price. This is frequent, externally visible, and
   testable without financial mutation.
2. **Command 77 — Make Administrator Customer Context Actionable.** Support and
   billing work starts from a customer; current raw minor-unit text and disconnected
   records cause repeated manual lookup. Existing aggregates and filters make this a
   bounded, high-readiness admin slice.
3. **Command 78 — Turn the Customer Portal Overview Into a Next-Action Home.** The
   overview is authenticated and real but still makes the customer infer balances,
   renewals, and support urgency. A bounded ownership-safe aggregate improves daily
   self-service without changing money or service states.

These commands require separate authorization. Command 75 implemented none of them;
delivery status is recorded below. Search/pagination, workspace chrome,
order/payment review, automation freshness, and service-focused operator context
remain P1 work for the next phase review.

## Delivery update

- **Command 76 completed the first public-storefront slice:** `/` is now an honest
  public entry with valid local navigation; `/hosting` selects the first supported
  period with an active price, preserves exact product/price identifiers, and shows
  explicit unavailable states. Authenticated checkout still revalidates catalogue
  selection and calculates authoritative totals on the server.
- General post-login return navigation remains the separate P1 checkout-continuity
  gap recorded above. Command 76 did not place an order, change a price, or alter a
  financial, authentication, provider, or database rule.
- **Command 77 completed the administrator customer-context slice:** operational
  identity, status, linked totals, and bounded recent records now precede optional
  edit forms; money uses the safe formatter and dates use the configured business
  time zone. Existing invoice detail is linked directly, while the other ledgers
  receive validated, visible, clearable `customerId` context through their existing
  API filters. Malformed values are not used to infer a customer.
- Command 77 added no record-detail routes, schema changes, business mutations, or
  production approval. The broader P1 ledger pagination and cross-record review
  work remains separate.
- **Command 78 completed the customer next-action home:** the ownership-bound portal
  summary now derives full-account outstanding balance, overdue invoice, next due
  active or suspended service, and customer/staff support responsibility on the
  server. The portal prioritizes payment, suspended-service, and customer-reply work,
  provides direct permitted links, and distinguishes healthy, first-use empty,
  loading, and failure states before bounded recent activity.
- Paid zero-balance history cannot become a primary action, multi-currency
  outstanding state fails closed, and all monetary values remain lossless strings at
  the API boundary. Command 78 added no mutations, schema changes, real providers,
  deployments, or production approval. The next bounded work must be selected by a
  phase review from the remaining P1 gaps.

## Readiness boundary

This roadmap improves evaluation and product coherence only. It does not close the
credentialed provider, SMTP, monitoring, off-site recovery, policy, infrastructure,
or operator-pilot gates in `docs/RELEASE_CHECKLIST.md`. Production remains
**NO-GO** until those gates receive separate evidence and approval.

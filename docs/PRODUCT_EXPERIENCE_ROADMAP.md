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
| `/login`           | Secure cookie sign-in; administrator challenge when configured                       | CSRF, rate limiting, sessions, role routing, administrator TOTP | Command 80 preserves only validated customer checkout IDs and retains normal role/MFA landings; no arbitrary return URL is used.   |
| `/register`        | Customer registration and bounded same-browser checkout continuity                   | Runtime validation, password hashing, verification token        | Command 80 retains validated IDs in login/register and post-registration sign-in links; verification emails remain unchanged.      |
| `/forgot-password` | Enumeration-resistant reset request                                                  | Single-use expiring token and safe response                     | Functional and appropriately cautious.                                                                                             |
| `/reset-password`  | Token-bound password replacement                                                     | Session revocation and password policy                          | Incomplete-link state is clear.                                                                                                    |
| `/verify-email`    | Token-bound customer verification                                                    | Single-use verification token                                   | Incomplete-link state is clear.                                                                                                    |
| `/account`         | Identity, role, session revocation; administrator TOTP                               | HttpOnly session, ownership/role checks                         | Functional but visually separate from the main workspace, adding context switching.                                                |

### Customer portal

| Route                          | Observed capability                                                   | Supporting boundary                             | Product-experience finding                                                                                              |
| ------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/portal`                      | Server-derived billing, service-renewal and support next actions      | Ownership-bound full-account portal summary     | Command 78 distinguishes attention, healthy, empty, loading and failure states before bounded recent history.           |
| `/portal/orders`               | Order and linked invoice states in one table                          | Paginated ownership-bound order API             | Invoice reference is unlinked; current service state is not supplied; the UI fetches only the first 100 records.        |
| `/portal/checkout`             | Product, price, domain, server-authoritative total and order creation | Idempotent checkout; product/price revalidation | Command 80 restores exact account-entry selection and requires deliberate replacement of unavailable intent.            |
| `/portal/services`             | Service cards with state, server, account, and renewal data           | Ownership-bound service API                     | Useful overview; first-100 loading and inactive workspace search limit growth.                                          |
| `/portal/services/[serviceId]` | Service detail and short-lived fake-panel login action                | Ownership check and provider-neutral operation  | Clear detail; the panel action has no nearby invoice/order context.                                                     |
| `/portal/invoices`             | Invoice status, due date, total, balance                              | Ownership-bound invoice API                     | Command 81 adds URL-bound search/status/paging and authoritative matching counts; broader ledger work remains separate. |
| `/portal/invoices/[invoiceId]` | Immutable invoice, PDF/print, payment instructions/references         | Snapshot and payment-state rules                | Strong invoice view; customer payment action appears only when invoice state allows it.                                 |
| `/invoices/[invoiceId]/print`  | Ownership-bound printable invoice                                     | Server-fetched invoice detail                   | Useful dedicated output; browser print is the only mutation-like action and remains user initiated.                     |
| `/portal/profile`              | Contact/address update and password change                            | Ownership, audit, session revocation            | Functional and appropriately separates password change.                                                                 |
| `/portal/support`              | Open, select, read, and reply to plain-text tickets                   | Ownership-bound tickets and service association | Functional; list is first-100 and has no visible search/filter/pagination despite API support.                          |

### Administrator workspace

| Route                           | Observed capability                                                                   | Supporting boundary                                                      | Product-experience finding                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin`                        | Period metrics, revenue graph, CSV exports, recent audit events                       | Transaction-sourced reports and audited bounded exports                  | Summary cards are not links to work queues; login events dominate recent activity; there is no recent-payment/attention list.                                                      |
| `/admin/customers`              | Search, status filter, add customer, pagination                                       | Server-side query and pagination                                         | This is the strongest scalable directory pattern and should be reused elsewhere.                                                                                                   |
| `/admin/customers/[customerId]` | Operational identity, linked navigation, profile/billing/access and bounded history   | Role guard, bounded customer aggregate, and validated ledger filters     | Command 77 puts actionable context first, formats money/dates safely, and links direct invoice or customer-filtered ledgers.                                                       |
| `/admin/products`               | Product lifecycle, public visibility, cPanel mapping, price versions                  | Append-only price definitions                                            | Capable but dense; amounts are entered and described as raw minor units, increasing operator error risk.                                                                           |
| `/admin/orders`                 | Create order/invoice, searchable paginated ledger and explicit read-only order review | Server pricing, validated historical snapshots, separate states          | Commands 82 and 88 connect all-item review and older-order lookup; creation drafts and original action targets stay independent, while service state is not inferred.              |
| `/admin/services`               | Create/provision/suspend/reactivate/terminate; searchable inventory, review and tools | Fake provider, protected paginated reads, exact termination confirmation | Commands 86–87 add selected application facts and URL-bound inventory; forms/targets remain independent, while setup/tool/history scale and broader relationships remain separate. |
| `/admin/invoices`               | Draft creation, business identity, searchable paginated ledger/detail                 | Protected query contract, immutable invoices and historical snapshots    | Command 85 adds URL-bound search/status/pages/customer scope without resetting financial forms; customer chooser and richer relationship navigation remain separate.               |
| `/admin/invoices/[invoiceId]`   | Invoice detail and PDF                                                                | Role guard and immutable financial model                                 | Clear document, but customer/order/payment context is not navigable.                                                                                                               |
| `/admin/payments`               | Gateway attention, manual receipts, review, refund/reversal, read-only policy context | Append-only adjustments and reconciliation                               | Command 79 replaces the direct policy toggle with effective context and a protected link to the canonical settings review.                                                         |
| `/admin/support`                | Search/filter, assignment, priority/status and replies                                | Paginated ticket API and audit                                           | Filters exist, but the fetched page is fixed at 100 and the selected ticket has no direct customer/service navigation.                                                             |
| `/admin/automation`             | Queue/outbox/provider health, renewal policy, run/failure evidence                    | Retained job/outbox evidence and scheduler records                       | No “last healthy scheduler run” freshness statement; zero failures can look healthy even when no renewal run has ever occurred.                                                    |
| `/admin/email`                  | Safe delivery and attempt metadata                                                    | Redacted append-only delivery evidence                                   | Useful but fixed latest set with no recipient/status/time filter.                                                                                                                  |
| `/admin/settings`               | Billing, renewal, adapter, branding and encrypted credential configuration            | Role guard, encrypted write-only secrets                                 | High-impact settings share one long page; save boundaries and consequences require careful operator reading.                                                                       |

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
  termination, plus the bounded storefront, customer-context and checkout-navigation
  additions in Commands 76–80. It does not yet prove invoice-ledger pagination,
  search or large histories, or every operator cross-record investigation path.

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

| Area and gap                                                                         | Local evidence                                                                                                                                     | Role and business job                                                         | Friction or risk                                                                                 | Desired outcome                                                                                 | Safety invariant | Test/evidence route                                                                   | Dependencies                                                                 | Priority                                               |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| Product discovery: public entry and navigation contradicted each other               | Command 75 observed `/` redirecting to `/login` while public navigation targeted root fragments; Command 76 added the local entry and sections     | Prospective customer compares the business and available hosting              | Resolved: header, footer, catalogue, registration, sign-in, Why us, and Support targets are real | Keep the entry small, independent, and limited to supported local journeys                      | S8               | Public-storefront component test plus Playwright `/`, fragments, and `/hosting`       | Existing public shell/catalogue                                              | Completed / Command 76                                 |
| Product discovery: first catalogue view selected an unavailable period               | Command 75 observed yearly selected with no price; Command 76 derives the first supported priced period from active API data                       | Prospective or returning customer selects a plan                              | Resolved: a valid CTA appears on the first priced render; unavailable periods remain explicit    | Preserve deterministic selection and server-side product/price/total revalidation               | S2, S8           | Catalogue component states plus anonymous and authenticated browser assertions        | Public product response already contains active prices                       | Completed / Command 76                                 |
| Checkout continuity: exact plan survives customer account entry                      | Command 80 carries only validated product/price IDs through proxy/server guards and login/register links                                           | Prospective customer signs in before buying                                   | Resolved: exact available selection resumes; unavailable intent cannot substitute another plan   | Fixed checkout destination, role-derived landings, catalogue membership and explicit submission | S1, S2           | Validator, proxy/server, login/register, checkout tests and anonymous browser journey | Existing session, catalogue, and authoritative order boundaries              | Completed / Command 80                                 |
| Customer self-service: overview reports counts and recency, not next action          | `/portal` shows totals, one paid invoice with `BDT 0.00`, one service, and latest ticket                                                           | Customer checks whether anything needs payment, renewal, or support attention | Customer must open multiple pages to infer urgency                                               | Ownership-bound balance, overdue, next-renewal, and support-attention summary with direct links | S1–S4            | API aggregate tests, portal component states, customer E2E with paid/unpaid fixtures  | Existing invoice/service/ticket queries; bounded aggregate contract          | P0 / Command 78                                        |
| Customer records: orders and lists are not connected                                 | `/portal/orders` displays invoice/order/domain text without links; service detail lacks invoice/order context                                      | Customer traces purchase, payment, and service                                | Manual cross-page matching by identifiers                                                        | Links between permitted order, invoice, and service records without exposing other customers    | S1, S3           | Ownership tests and customer navigation E2E                                           | Existing detail endpoints; route design                                      | P1                                                     |
| Administrator customer context is read-only text after long edit forms               | Command 77 reordered the bounded customer aggregate, removed raw minor-unit presentation, and added validated navigation                           | Administrator answers a customer or investigates account history              | Resolved: identity, status, counts, and recent records precede edits and open protected context  | Retain bounded context, safe money/time display, and explicit customer filters                  | S1–S4            | Customer-detail component tests, API filter tests, and admin customer-to-record E2E   | Existing customer aggregate and list `customerId` filters                    | Completed / Command 77                                 |
| Order/payment review lacks a connected detail path                                   | Commands 82 and 84 link explicit order/manual-payment review to validated customer/invoice detail; first-100 lists remain separate gaps            | Administrator reviews paid order, receipt, and fulfilment readiness           | Order/manual-receipt lookup repaired; broader service relationships remain separate              | Retain independent states and bounded links; gate other review and search work separately       | S2–S5            | Component/API query tests and read-only order/manual-payment navigation E2E           | Existing detail/list endpoints                                               | Order/payment review completed / Commands 82, 84       |
| Financial policy transition requires explicit review                                 | Command 79 replaces the ledger toggle with settings review and guards both API write routes                                                        | Administrator changes settlement rules                                        | Resolved: draft edits require consequence review and fixed server confirmation                   | Preserve unchanged saves and one safe old/new transition audit                                  | S2, S4           | Component confirmation/retry tests and cross-route API audit/concurrency assertions   | Existing settings endpoint and audit                                         | Completed / Command 79                                 |
| Provisioning/service work is concentrated on one dense page                          | `/admin/services` combines fulfilment, inventory, server credentials, tools, operation log, suspend and terminate                                  | Administrator provisions and troubleshoots an account                         | Context fragmentation and dense inline actions raise wrong-record risk                           | Service-focused context with related order/invoice/customer and evidence-led actions            | S1, S3, S5–S7    | Fake-provider service E2E and role tests                                              | Existing service/panel detail endpoints                                      | P1                                                     |
| Destructive service controls need consistent context, although the core gate is safe | Live inventory exposes Suspend/Terminate inline; source and E2E confirm reason plus exact `TERMINATE` gate                                         | Administrator stops a service                                                 | Dense rows can initiate the wrong intent even though confirmation prevents immediate termination | Retain exact confirmation and show customer/domain/state/impact in every action review          | S3, S5, S6       | Existing termination E2E plus contextual dialog assertions                            | No backend dependency                                                        | P1                                                     |
| Invoices/renewals lack customer-facing urgency and operator freshness                | Portal prioritizes the most recent invoice even when paid; automation page can show zero failures and “no cycle has run yet”                       | Customer pays on time; operator verifies renewal health                       | Quiet displays can hide missing work                                                             | Distinguish no action from no execution and link due items/runs to records                      | S2–S5            | Portal aggregate tests; scheduler freshness fixtures                                  | Scheduler run timestamps and invoice aggregates                              | P0 customer portion in Command 78; operator portion P1 |
| Support context is not navigable and customer list controls lag API capability       | Customer support loads first 100 without visible filters; admin ticket detail shows customer/service as text                                       | Customer finds a ticket; administrator responds with account context          | Longer histories become hard to search and operators manually look up services                   | URL-bound search/paging plus customer/service links while retaining plain-text safety           | S1, S7           | Ticket component pagination/search tests and role E2E                                 | Existing ticket query contracts                                              | P1                                                     |
| Operational attention is activity-heavy rather than action-led                       | Dashboard metrics do not link; login events dominate recent activity; no recent-payment queue                                                      | Administrator starts the day and triages work                                 | High-value exceptions are hidden behind navigation and low-value audit noise                     | Direct attention links for pending orders, overdue invoices, payments, tickets, and failed work | S3–S5, S7        | Dashboard component/API tests with mixed fixtures                                     | Existing metrics and list filters; payment summary may need bounded API work | P1                                                     |
| Automation health does not prove freshness                                           | `/admin/automation` can show all zero queues/failures while stating no renewal cycle has run                                                       | Administrator confirms billing automation actually executed                   | “No failures” can be mistaken for “healthy and current”                                          | Last-run/freshness state with never/stale/healthy/failed semantics                              | S3, S5           | Scheduler/API time-fixture tests and admin UI states                                  | Existing renewal run records and business time zone                          | P1                                                     |
| Workspace search and notification chrome is inactive but visually live               | `WorkspaceShell` has an unbound search input and bell with a red dot for both roles                                                                | Any authenticated user searches or checks alerts                              | Controls invite action but do nothing, eroding trust and accessibility predictability            | Remove them until supported or implement bounded role-safe search/attention behavior            | S1, S7, S8       | Shell component tests and keyboard/browser smoke                                      | Search APIs exist per module; no notification model exists                   | P1                                                     |
| Other core ledgers silently cap at 100 in the UI                                     | Order/payment and customer service/ticket lists plus panel history lack controls; invoice ledgers and administrator service inventory are repaired | Customer or administrator finds older records                                 | Records beyond the first page become invisible                                                   | Use bounded URL-bound queries and authoritative metadata, one separately gated ledger at a time | S1, S7           | Large-fixture component/API tests and navigation E2E                                  | Existing pagination contracts                                                | P1 remainder; Commands 81, 85, 87 completed            |
| Configuration is a single broad high-impact surface                                  | `/admin/settings` combines identity, renewals, gateway/panel mode, email, and credentials                                                          | Administrator configures the business safely                                  | Easy to miss save scope or downstream effect                                                     | Section-level save evidence, change summaries, and clear activation consequences                | S2–S7            | Component tests and audit assertions using fake values                                | Existing settings contracts                                                  | P2                                                     |

## Explicit affordance, navigation, scale, and shortcut findings

### Misleading or inactive affordances

- Command 76 resolved the public root redirect and dead Home, Why us, and Support
  navigation; the local storefront and anchor targets now resolve.
- Workspace search accepts text but has no event, query, or results behavior.
- The notification bell has a red indicator but no action or notification model.
- Navigation badges show fixed aggregate counts, not necessarily the operator's
  actionable or filtered queue.
- An automation page with zero failures can still have no successful run history.

### Missing cross-record navigation

- Command 77 connected administrator customer history to direct invoice detail and
  explicit customer-filtered order, service, invoice, payment, and ticket ledgers.
- Commands 82 and 84 connect administrator order/manual-payment review to
  customer/invoice detail using validated returned IDs. Broader service and
  fulfilment context remain separate gaps; no current service state is inferred
  from an order, payment or paid invoice.
- Command 86 links selected service facts to the validated current customer; ticket
  identities and broader service billing/order relationships remain separate gaps.
- Customer order rows do not link the order to its permitted invoice or service.

### Scale, search, and pagination limits

- The API already exposes bounded query contracts for all core ledgers.
- The administrator customer directory and customer invoice history expose page controls.
- Administrator support exposes filters but requests a fixed first page of 100.
- Other core admin and customer record lists still request the first 100 and
  discard pagination metadata.
- Command 81 implements the customer invoice ledger only, using the existing
  ownership-bound search/status and deterministic pages. Other ledgers remain
  separately gated.
- Command 87 implements administrator service inventory search/pagination with
  preserved customer scope, unfinished operational forms and original action targets.
  Setup options, tools and operation history retain their independent scale limits.
- Command 88 implements administrator order search/pagination without discarding
  independent creation drafts/keys or retargeting existing status operations.
  Customer order history remains a separate first-100 limit.
- Command 85 implements administrator invoice search/pagination with preserved
  customer context and unchanged draft/identity forms. Validation/delivery evidence
  is recorded in `docs/PROGRESS.md`; customer chooser scale and all other ledgers
  remain separate.
- Email delivery, panel operations, renewal runs, and audit activity are latest-only
  views with no user-controlled time/status query.

### Unsafe or insufficiently reviewed shortcuts

- Permanent termination is not an unsafe shortcut: it requires a reason and the
  exact `TERMINATE` phrase, and the E2E lifecycle proves the wrong phrase fails.
- Refunds and reversals preserve the original payment and require a second form, but
  the adjustment review should retain full invoice/customer context as lists grow.
- Customer access deactivation and product archival have explicit confirmation.
- Command 79 resolves the observed partial-payment shortcut with canonical settings
  review, stored-value comparison, and exact confirmation at both API write routes.
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
- Command 80 completes the bounded customer checkout-continuity handoff. General
  post-login return navigation remains excluded. Command 76 did not place an order,
  change a price, or alter a financial, authentication, provider, or database rule.
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
- **Commands 76–78 phase review completed:** the three delivered slices satisfy
  their acceptance and safety boundaries with component, API, and fictional browser
  evidence. No corrective application change was required.
- **Command 79 implements the partial-payment policy safeguard:** the payment ledger
  shows the effective policy and links to its canonical settings section. Settings
  keeps the persisted value separate from the draft, reviews current/proposed values
  and future submission/recording/verification consequences, and permits cancellation
  without losing unrelated edits. Both API write routes require the same exact
  confirmation for a real stored transition and serialize concurrent saves so one
  old-to-new audit entry is retained. Unchanged saves require no confirmation.
- At Command 79 delivery, order/payment connectivity, URL-bound ledger pagination,
  dashboard attention, automation freshness, service-focused context, checkout continuity, and inactive
  workspace chrome remained P1 gaps. Command 80 subsequently closed the bounded
  checkout-continuity gap; the other items remain separately gated.
- **Command 79 phase review completed:** source and regression review confirmed the
  canonical settings review, both strict guarded API write paths, serialized safe
  transition audits, unchanged-save compatibility, and preserved financial records.
  No corrective application change was identified. The delivered head's hosted CI
  and CodeQL passed; focused shared, API, and component tests also passed again.
- **Command 80 implements the customer checkout-continuity slice:** one validated
  product/price pair survives anonymous and expired-session sign-in plus same-browser
  login/register navigation. The proxy replaces forged context before the server
  guard uses it, and checkout also verifies the authoritative customer session at
  page render. Customer sign-in returns only to the fixed local checkout; absent or
  invalid intent retains the normal role-derived landing and administrators still
  land at `/admin`, including MFA. The current catalogue must contain the exact
  product/price relationship; unavailable intent leaves the selection empty until
  deliberate replacement rather than silently substituting a plan. No order is
  created by navigation, registration, or sign-in. General return navigation and
  durable, cross-device, verification-email or reset-link resume remain excluded.
  Other P1 gaps require the next separately authorized phase review.
- **Command 80 phase review completed:** fixed-route intent, duplicate/malformed
  rejection, forged-header replacement, authoritative page/session/role checks,
  registration/retry continuity, current-catalogue membership, explicit unavailable
  selection, and zero orders before deliberate submission match the authorized
  scope. Fresh focused web and order API tests passed; the delivered head's hosted
  CI and CodeQL also passed. No corrective application change was identified.
- **Command 81 implements customer invoice history search and pagination:** four
  validated URL fields preserve committed search/status/page/size across reload and
  history navigation. Bounded requests retain authoritative matching counts and
  distinguish empty history, filter-empty results, out-of-range pages, loading and
  retryable failure. Stale responses cannot overwrite a newer query. Fictional
  histories larger than 100 and API cross-customer checks cover the ownership
  boundary. Browsing creates no invoice/payment mutation and computes no
  account-wide financial aggregate. Order/payment connectivity, other ledger
  pagination, dashboard attention, automation freshness, service context and inactive
  chrome remain P1 work for the next separately authorized phase review.
- **Command 81 phase review completed:** four-field query narrowing, server-derived
  ownership, bounded/deterministic pages and isolated counts, response validation,
  stale-response protection, recovery states and read-only browser continuity match
  the command. Fresh shared/web and invoice API regressions passed; the delivered
  head's hosted CI and CodeQL passed. No corrective application change was found.
  Rows and counts are two queries in one API transaction, not a promised frozen
  snapshot across pages; this review corrects the earlier report wording.
- **Command 82 implements administrator order review and context links:** a listed
  order opens one protected, runtime-validated read with all historical item
  snapshots, lossless money, configured-time-zone dates, independent order/invoice
  facts and fixed links to its returned customer and invoice. Review is explicit,
  read-only and not an approval gate; delayed responses are discarded and existing
  successful mutations invalidate it. The order contract supplies no current service
  state, so no service link or provisioning claim is invented. The first-100 list,
  payment/service workflows, attention, freshness and inactive chrome remain separate.
  A phase review is required before defining the next bounded command.

## Readiness boundary

### Security sequencing after the Command 82 review

- The read-only order panel, all-item snapshots, fixed customer/invoice links,
  independent states and unchanged deliberate mutations meet Command 82. Fresh
  focused web/shared and order/invoice API checks passed; delivered-head hosted CI
  and CodeQL also passed. No corrective order implementation was identified.
- Command 82 also recorded an earlier native registration GET with fictional form
  fields on a cold development route. At that review, auth forms omitted a native
  method and rendered named fields/submit controls before client handlers were ready.
  [HTML's default GET behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/form#method)
  puts submitted fields in URLs. Hydration is the inferred trigger, not a confirmed
  sole cause; a successful rerun is not a security fix.
- **Command 83 completed with local and hosted validation:** an
  auth-only disabled fieldset keeps all named controls out of native submissions
  through server rendering and initial hydration. An explicit native POST is backup,
  not a fallback sign-in route. Preparation/no-JavaScript feedback explains the
  boundary; the existing protected POSTs, MFA/reset/verification and checkout intent
  remain unchanged. Separate password/challenge form identities clear reused input.
  Fictional no-JavaScript and controlled withheld/released-script checks cover all
  five entries. [Playwright's guidance](https://playwright.dev/docs/navigations#hydration)
  supports disabling controls until handlers are functional. See `docs/PROGRESS.md`
  for executed evidence. Backend policy, deployments and other workflows remain
  excluded; a separate phase review was required before defining further work.

### Command 83 phase-review outcome and next bounded slice

- The auth-only fieldset and stable SSR/initial-client snapshot, explicit POST,
  streaming/no-script feedback and separate password/MFA identities match the
  authorized command. Fresh auth/order component checks (51), shared contracts (29)
  and baseline payment components (3) passed. The delivered head's CI and CodeQL
  were reverified successful; no corrective application change was found. Prior
  browser/API/full-suite/build results are retained evidence, not claimed reruns.
- **Command 84 defined, not authorized:** Connect Administrator Manual Payment
  Review to Customer and Invoice Context. Existing `GET /payments/:paymentId` and
  `manualPaymentSchema` already support a bounded read-only review; customer/invoice
  text is unlinked and payer proof/details are not exposed for inspection in the
  ledger. Add explicit selection and validated fixed local links, separate
  transaction/adjustment facts, safe money/time presentation and stale-response
  protection without changing recording, verification, rejection or adjustment rules.
- This closes neither first-100 ledger limits nor broader financial/service context.
  Original-payment navigation, histories, dashboard attention, automation freshness,
  inactive workspace chrome and other P1 gaps remain separate. The local worker
  timeout and model/raw-SQL schema-isolation limitation also remain tracked, not
  silently repaired or approved. No cleanup or later-command implementation is
  authorized by this review; production stays **NO-GO**.

- **Command 84 implements the bounded manual-payment review:** explicit selection
  fetches a protected, runtime-validated payment plus the configured business time
  zone. Customer and invoice destinations are fixed local links; payer proof remains
  plain text and independent transaction/adjustment facts cannot imply invoice balance
  or hosting state. Filter changes, close and successful mutations invalidate old
  context. Existing financial actions, first-100 limits and gateway attention remain
  unchanged. Executed validation and delivery status are in `docs/PROGRESS.md`; a
  separate phase review is required before defining further work.

### Command 84 phase-review outcome and next bounded slice

- The selected manual-payment read boundary matches Command 84: requested/returned
  identifiers and settings are validated, proof is plain text, amounts are lossless,
  dates use business time zone, and only fixed customer/invoice destinations are
  exposed. Kind/state, adjustment capacity, invoice balance and provisioning are
  explicitly separate. Filter/selection/close/mutation invalidation and original
  financial request bodies/keys are covered. No corrective application change was found.
- Fresh focused payment/order/filter components passed **54 tests** and shared
  contracts passed **29 tests**. Delivered-head CI and CodeQL were reverified
  successful; recorded complete package/API/browser/build evidence is not a fresh
  local rerun in this documentation-only review. Production is still **NO-GO**.
- **Command 85 defined, not authorized:** Make the Administrator Invoice Ledger
  Searchable and Paginated. The existing administrator-only list already searches
  invoice numbers, snapshot customer identity and line descriptions, supports status/
  customer filters and returns deterministic pages. Expose that bounded capability
  while preserving draft/identity forms and retry semantics; successful creation
  must reconcile current filters and metadata rather than prepend an unmatched row.
- Service inspection/fulfilment, original-payment history, other ledgers, customer-
  picker scale, attention, automation freshness and inactive chrome remain separate.
  No worker cleanup, dependency/policy repair, release or deployment is authorized
  by this review. A new implementation requires explicit Command 85 authorization.

### Command 85 bounded implementation

- Exposes the protected administrator invoice list through validated URL search,
  status and pagination while retaining optional customer context. Invalid ledger
  filters block reads; malformed customer context is never inferred or labelled
  as an account filter. Matching counts are invoice records, not money aggregates.
- Runtime-validated pages use independent abortable reads and honest recovery
  states. Historical identities, lossless amounts and fixed invoice destinations
  remain intact; browsing adds no financial actions or detail/PDF preloads.
- Only the read-only ledger resets on URL changes. Unsaved creation/identity forms
  stay mounted and retain original bodies/CSRF/retry keys. Successful draft creation
  refreshes the latest selected query without injecting a mismatching draft or
  reclassifying a subsequent read failure as a failed write.
- Query/component/API/browser validation and delivery status are recorded in
  `docs/PROGRESS.md`. Other ledgers, first-100 customer chooser, service/attention/
  freshness work and production gates remain separate. A phase review must be
  authorized before defining later work.

### Command 85 phase-review outcome and next bounded slice

- URL narrowing and offset bounds, explicit customer scope, runtime page/row
  validation, historical identity/lossless money, stale-read protection and honest
  recovery match Command 85. Only the read subtree resets; original financial bodies,
  retry keys and unsaved forms remain intact. No corrective application change was
  identified. Matching counts are records, not balances; transactional rows/counts
  do not promise a frozen snapshot across navigation.
- Fresh focused web regressions passed **155 tests across 11 files** and shared
  contracts passed **29 tests**. The completed head's CI and CodeQL were reverified
  successful. Earlier complete local API/browser/package/build results are retained
  evidence, not reruns by this documentation-only review.
- **Command 86 defined, not authorized:** Add Read-Only Administrator Service
  Inspection. Explicitly selected `GET /services/:serviceId` can show lifecycle
  facts/reasons, account/server metadata, historical product references and current
  customer identity with a fixed customer link. Preserve deliberate operations and
  exact termination confirmation; invalidate review when a mutation begins, even
  when its subsequent refresh fails. No remote panel check or new approval gate.
- The service contract has nullable order references but no invoice/payment/current
  order state or operation history. These remain unavailable rather than inferred;
  broader relationships, service pagination/setup scale, attention, freshness and
  inactive chrome require separate commands. Known local worker/raw-SQL isolation,
  dependency and direct-main governance risks remain unresolved. No deployment,
  cleanup or later implementation is authorized by this review.

### Command 86 bounded implementation

- Adds explicit read-only inspection to each administrator service row, including
  final states. Protected runtime-validated detail and business-zone settings expose
  application state, account/server metadata, historical product/price references,
  current customer identity and nullable lifecycle dates/reasons.
- Only the returned customer detail is linked. Order references are text, not
  current order/billing evidence; no invoice/payment relationship or remote-panel
  verification is inferred. Inspection itself makes no provider call or mutation.
- Selection/filter/close/unmount invalidate obsolete reads. Every existing mutation
  dispatch clears review and blocks inspection until it finishes, including failed
  follow-up reads. Unrelated forms, action bodies, CSRF, keys, evidence reasons and
  exact termination confirmation remain unchanged; review is not an approval gate.
- Validation and delivery evidence are in `docs/PROGRESS.md`. The first-100 list,
  setup-option scale, broader service relationships, attention/freshness/chrome,
  worker/isolation and production gates remain separate. A newly authorized phase
  review is required before defining the next command.

### Command 86 phase review and next bounded slice

- The review found one missed page boundary: sibling panel configuration, connection
  tests, account tools and manual retry could leave selected service facts visible
  after dispatch. A small page-local coordinator now clears/aborts review and pauses
  inspection until requests finish, without remounting forms or changing bodies,
  CSRF, keys, reasons, retry classification or the exact termination gate.
- The remaining first-100 administrator service inventory prevents lookup of older
  services despite existing API search/status/pagination and deterministic counts.
  Define **Command 87 — Make Administrator Service Inventory Searchable and
  Paginated** as the next bounded slice; do not implement it in this review.
- Query changes must preserve independent forms/action targets and customer scope,
  invalidate stale rows/counts/review, and refresh the latest query after deliberate
  mutations without injecting a nonmatching service or retrying a write after read
  failure. Counts remain records, not balances or remote-account proof.
- Service setup/options, account tools and operation-history scale, other ledgers,
  richer relationships, action redesign, automation freshness, dashboard/chrome,
  worker/isolation and dependency/governance risks remain separately gated.
  Validation and delivery evidence is in `docs/PROGRESS.md`; production is `NO-GO`.

### Command 87 bounded implementation

- Replaces only the administrator inventory's fixed first-100 read with validated
  URL search/status/page/page-size and independently validated customer context.
  Existing service contracts and deterministic API ordering supply older records
  and authoritative matching counts without new routes or business rules.
- Abortable cookie/no-store reads discard stale rows/counts; invalid, empty,
  out-of-range, malformed/context-mismatched and recoverable failures stay explicit.
  Query/retry clears selected inspection without resetting creation, action or
  panel forms. An open action retains its original target, reason and confirmation.
- Existing service/status/panel requests, keys, CSRF, eligibility and termination
  safeguards remain unchanged. Deliberate operation completion refreshes the latest
  query without injecting wrong-scope rows or retrying a write after read failure.
- Validation/delivery are recorded in `docs/PROGRESS.md`. Setup/tool/history scale,
  customer service history, other ledgers, richer relationships and production gates
  remain separate. Next: separately authorize **Phase Review — Review Command 87
  and define the next bounded command**; no Command 88 is defined here.

### Command 87 phase review and next bounded slice

- Source and regression review confirmed URL narrowing/offset bounds, independent
  customer scope, row/metadata validation, stale-read discard, honest recovery and
  latest-query reconciliation. Existing forms, original action targets, service/panel
  bodies, CSRF/keys, pending inspection blocks and exact termination gate remain
  intact. No corrective application change was identified.
- Fresh focused regressions passed **197 tests across 11 files**; shared contracts
  passed **29 tests**. Command 87's delivered-head CI and CodeQL were reverified
  successful. Earlier complete API/browser/package/build results are retained
  evidence, not fresh local reruns in the initial documentation-only review stage.
- Final hosted review validation exposed a test-only synchronization gap: the
  delayed-read fixture captured a request before its effect dispatched. Wait for
  actual first/back request calls with the existing default deadline while keeping
  all abort/discard/restoration assertions. No application behavior or timeout change;
  **26 focused** and **363 complete web tests** passed after the correction, along
  with web lint, strict application/browser types and documentation checks. Hosted
  correction delivery status is verified separately before handoff.
- **Command 88 defined, not authorized:** Make Administrator Order Ledger Searchable
  and Paginated. Existing API search covers order number, historical customer email
  and any item's domain; createdAt/ID ordering and matching metadata already exist.
  Replace only the administrator first-100 list while preserving independent creation
  fields/key, customer scope, explicit review and original deliberate status targets.
- Customer order/service histories, other ledgers, picker/setup/tool/history scale,
  richer relationships, action redesign, attention/freshness/chrome, local worker/
  isolation and dependency/governance risks remain separate. No implementation,
  provider, cleanup, release or deployment is authorized by this definition.

### Command 88 bounded implementation

- Replaces only the administrator order list with runtime-validated URL search,
  status, page/page-size and independent customer scope. Existing protected order
  contracts supply older records and authoritative counts; search remains historical
  email/order number/any requested domain, with createdAt/ID ordering.
- Query/retry discards stale rows/counts/review without remounting independent
  creation fields/key or reassigning its customer. Existing deliberate writes retain
  original targets/bodies/CSRF and refresh the latest query after completion, never
  inject a nonmatching row, restore selected review or repeat a write after read failure.
- All-item historical review and fixed customer/invoice links remain deliberate,
  read-only and separate from service/provisioning evidence. Validation/delivery are
  recorded in `docs/PROGRESS.md`; other ledgers, pickers/setup/tool/history scale,
  relationships and production gates remain separately authorized work.
- Next: separately authorize **Phase Review — Review Command 88 and define the
  next bounded command**. No Command 89 is defined or implemented here.

### Command 88 phase review and next bounded slice

- Reviewed the delivered query/server-entry/ledger/manager changes, original order
  review and mutation boundaries, runtime/API contracts and fictional large-history
  fixtures against Command 88. No corrective application change identified.
- Confirmed independent customer/ledger validation, safe fixed navigation, complete
  row/metadata validation, stale-read discard and honest GET-only recovery. Creation
  drafts/keys and original clicked targets remain mounted; query/retry/dispatch
  invalidates review and post-write reads reconcile the latest query without replay.
- Fresh focused regressions: **184 tests across 11 files passed**; shared contracts:
  **29 passed**; complete fresh web regressions: **419 tests across 41 files passed**.
  Delivered report head's CI/CodeQL were reverified successful;
  original full API/browser/build evidence remains retained, not fresh local reruns.
- **Command 89 defined, not authorized:** Make Customer Order History Searchable
  and Paginated. `CustomerOrderList` still requests `/orders/my?pageSize=100` and
  discards metadata. Existing customer-only API injects authenticated scope and
  supplies historical-email/order-number/any-item-domain search and createdAt/ID
  ordering. Repair that one read-only history, not invoice/service relationships.
- Customer invoice linking/all-item review, service/support/payment history,
  setup/picker/tool scale, attention/freshness/chrome and existing worker/isolation/
  dependency/governance risks remain separate. No implementation, release, cleanup
  or deployment is authorized by this review. Next: separately authorize Command 89.

### Remaining production gates

This roadmap improves evaluation and product coherence only. It does not close the
credentialed provider, SMTP, monitoring, off-site recovery, policy, infrastructure,
or operator-pilot gates in `docs/RELEASE_CHECKLIST.md`. Production remains
**NO-GO** until those gates receive separate evidence and approval.

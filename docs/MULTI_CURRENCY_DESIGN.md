# Multi-currency billing design

## Status and authority

- Command: 94 — Design multi-currency billing and WHMCS migration rules.
- Date: 2026-10-06.
- Status: Design completed; Command 96's unused arithmetic foundation delivered and
  phase-reviewed. Command 97's unused policy contracts passed complete local and exact
  source-head hosted acceptance and was phase-reviewed. Command 98's unused immutable
  unit storage passed complete local/corrected-head hosted acceptance and was phase-reviewed.
  Command 99's unused policy-revision snapshots passed complete local and exact-head
  hosted acceptance and were phase-reviewed on 2026-10-07. The owner separately authorized
  Command 100's authoritative-selection/legacy-history design on 2026-10-07; that
  source-grounded design passed exact-head CI/CodeQL and was phase-reviewed on 2026-10-07.
  Command 101's unused read-only adoption preflight is defined only, not implemented or
  authorized. The selection protocol is not implemented or activated.
  Application integration and activation remain separately gated.
- Owner direction: BDT is the default; USD is the preferred secondary currency;
  support major currencies with automatic conversion through a suitable provider.
- Design interpretation: BDT is the single base/reporting currency and default for new
  browsing sessions. USD is the first alternate choice, not a second base currency.
  A customer's choice does not change an existing financial record.
- Proposed technical defaults below require review before activation. No provider
  account, subscription, credential, customer export, database migration or live setting
  is created by this document. This is not approval of outstanding operating policies.

This explicitly expands the earlier single-currency product scope. It does not add
multi-tenancy, reseller accounting, foreign-exchange trading, worldwide tax rules,
customer wallets, cryptocurrency payments or WHMCS feature parity. See
[business policy record](PRODUCTION_BUSINESS_POLICIES.md),
[architecture decisions](DECISIONS.md) and [command tracking](../CODEX_DEVELOPMENT_COMMANDS.md).

## 1. Separate the currency responsibilities

| Responsibility               | Target behavior                                                 | Must not imply                                                       |
| ---------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| Base/reporting currency      | BDT for this installation; fixed after financial history exists | Relabelling imported USD amounts as BDT                              |
| Default browsing currency    | BDT, with USD first in the alternate list                       | Changing already issued invoices                                     |
| Customer preference          | Optional validated choice for future browsing and orders        | One mandatory currency for all that customer's historical records    |
| Invoice currency             | One currency for the header, every line and applied payment     | Mixing BDT and USD in one balance                                    |
| Service currency             | Contracted currency and recurring amount retained for renewals  | Daily repricing of existing services                                 |
| Gateway presentment currency | Must match the invoice and a tested gateway capability          | A conversion feed authorizing collection in every currency           |
| Gateway settlement currency  | Separately evidenced by the provider/bank, if available         | Using a reference FX rate as actual bank settlement proof            |
| Reference/display conversion | Clearly labelled estimate with source and timestamp             | A second legally payable total or authoritative accounting statement |

BDT and USD are the first functional rollout targets. Proposed subsequent choices are
EUR, GBP, CAD, AUD, SGD, AED, SAR, INR, JPY and CHF. This is a rollout shortlist, not a
definition of every major currency or owner approval of each checkout method. Add other
current fiat codes through a reviewed registry and capability tests, not a hard-coded
two-currency switch. Provider support alone never enables a currency.

Track three independent installation capabilities per currency: display, new sales and
collection. Imported/historical records remain readable even when all three are disabled.
Disabling sales must not disable renewal history or hide outstanding invoices. Disabling
collection leaves visible manual review, not automatic cancellation or suspension.

## 2. Current foundation and implementation gaps

The following are inspected source facts, not a claim that multi-currency works today:

- `packages/shared/src/contracts/money.ts` already serializes integer minor units as
  strings. Its three-letter regex is not a supported-currency or decimal-unit registry.
- `packages/database/prisma/schema.prisma` already has currency on product prices,
  orders, order items, services, invoices, invoice items and payments. Preserve those
  values and existing snapshot/transaction relations.
- `packages/shared/src/contracts/settings.ts` has one `business.localization.currency`.
  It does not distinguish default browsing currency from base currency or capabilities.
- Product contracts already accept period/currency pairs, but the initial create request
  caps the price array at three. Review limits and uniqueness deliberately before expansion.
- `apps/api/src/modules/orders/order.service.ts` selects a price ID and snapshots its
  currency/amount. Extend that existing flow with server-owned quote validation.
- `apps/worker/src/renewal/renewal-processor.service.ts` uses the service's stored
  recurring amount and currency. Preserve that contract; the FX job must not reprice it.
- `apps/api/src/modules/payment-gateways/payment-money.ts` assumes two decimal places.
  Existing bKash and SSLCOMMERZ adapters explicitly reject non-BDT invoices. Do not
  remove those guards to advertise USD collection.
- `apps/api/src/modules/dashboard-reports/dashboard-report.service.ts` filters financial
  totals to the configured currency. The customer next-action home in
  `apps/api/src/modules/customers/customer.service.ts` rejects multiple outstanding
  currencies. Both need explicit contracts/UI changes before mixed-currency rehearsal.
- There is no WHMCS importer or exact-decimal FX adapter in the repository.

## 3. Money and conversion arithmetic

Maintain a versioned currency registry sourced from the
[ISO 4217 maintenance agency, SIX](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html).
Validate code, current/historical status and minor-unit exponent. Recheck source/licensing
before distributing metadata. Do not infer payment precision from a symbol, locale or
provider's list. Preserve the exponent/metadata version used by historical money;
never reinterpret saved amounts after a metadata change.

For conversion, store a positive exact rational rate `n / d`: target major units per
one source major unit. Integers and decimal strings at financial boundaries remain
lossless; use BigInt for the calculation. Parse provider numeric JSON tokens losslessly
before converting them to ratios. Ordinary JSON parsing followed by stringifying a
JavaScript number cannot establish exact source precision.

```text
targetMinor = roundHalfEven(
  sourceMinor * n * 10^targetExponent,
  d * 10^sourceExponent
)
```

Reduce ratios; reject zero/negative/invalid rates and bound token length, precision,
exponents and response size. Intermediate BigInt arithmetic may exceed database range;
the final financial amount must fit the existing PostgreSQL BIGINT limit. Reject overflow
instead of clipping, wrapping or choosing a different unit. Same-currency conversion is
exact identity and does not need an external rate.

Proposed rounding: half-even once per independently priced line component in target
minor units, then multiply its integer unit price by quantity. Calculate discounts and
optional tax through existing explicit rules in that invoice currency. Sum stored lines
to produce the header; never separately convert the header and introduce a difference.
Record the calculation-policy version. Do not add a markup without owner approval.

Fictional acceptance examples, not market rates:

- BDT `125000` minor units at USD/BDT `1/125`, with both exponents two, becomes USD `1000`.
- USD `1000` at JPY/USD `150/1`, with exponents two and zero, becomes JPY `1500`.
- USD `1000` at KWD/USD `3/10`, with exponents two and three, becomes KWD `3000`.
- At a deliberately chosen half-unit boundary, round `2.5` to `2` and `3.5` to `4`.
  Conversion is not reversible after rounding; a refund uses original transaction money,
  not a fresh reverse conversion.

Read-only verification of SIX's [current XML list](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml)
on 2026-10-06 confirmed BDT/USD exponent two, JPY zero and KWD three for these examples.
Reverify at implementation and preserve the referenced metadata version. Examples alone
are not a maintained registry.

### Command 96 arithmetic foundation

The owner authorized the pure shared foundation on 2026-10-07. It is available only
through `@webhost-billing/shared/currency-arithmetic`; the existing root entry and money
contracts remain unchanged. No API, UI, worker, financial record or provider consumes it.
This implements arithmetic, not sales/collection support, quotes or a live rounding policy.

- `currencyUnitDefinitionSchema` requires code, integer exponent, metadata version,
  provenance and current/historical status. `currencyUnitContextSchema` validates a
  caller-supplied bounded list, rejecting duplicate/conflicting code/version identities.
  There is no built-in currency registry, latest-version fallback or network lookup.
  A conversion explicitly references each currency's metadata version. Historical
  versions stay usable only when the caller supplies their actual unit definitions.
- `parseExactDecimalRate` accepts positive plain decimal strings with canonical whole
  parts, including trailing fractional zeroes. Signs, whitespace, scientific notation,
  missing whole/fraction parts and numeric JSON values are rejected. This is not a
  provider JSON parser: a future adapter must retain original numeric tokens losslessly.
- `normalizeExactRatio` validates positive canonical integer strings and reduces them
  with BigInt Euclidean arithmetic. Both ratio components must be nonzero. No monetary
  or rate value passes through JavaScript Number or floating-point parsing.
- `convertCurrencyMinorUnits` requires a matching target-major/source-major directed
  rate for different currencies. It scales explicit exponents, rounds once by integer
  quotient/remainder and returns source/target money, copied metadata, reduced rate,
  `currency-half-even-v1` and exact rounding evidence as JSON-safe strings. Same-currency
  identity requires the same explicit metadata version and no supplied external rate;
  conflicting versions fail closed rather than reinterpreting historical units.
- Zero monetary amounts are valid. Inputs/results must fit the existing non-negative
  PostgreSQL BIGINT money range; final overflow, including a rounding carry, is rejected.
  Signed reporting totals, discounts/tax rules, quantity multiplication and invoice
  issuance remain with their existing owners, not this unused conversion helper.

Technical limits, not operational approval:

| Input                     | Limit                                                    |
| ------------------------- | -------------------------------------------------------- |
| Explicit definitions      | 1–32, checked before traversing members                  |
| Minor-unit exponent       | Integer 0–4; no configurable unbounded powers            |
| Metadata version          | 1–64 ASCII identifier characters                         |
| Provenance                | 1–256 printable ASCII characters, no edge whitespace     |
| Source minor-unit amount  | Canonical string, at most 19 digits and BIGINT maximum   |
| Rational component        | Positive canonical string, at most 96 digits             |
| Decimal rate token        | At most 97 characters, 64 whole and 32 fractional digits |
| Calculation intermediates | At most 119 numerator and 100 divisor decimal digits     |

The bounds are validated before constructing BigInts/powers, and runtime limits are
not caller-overridable. Plain-data schemas do not sandbox arbitrary getters/proxies or
executable configuration. Results are calculation evidence, not authenticated provider
evidence or payable quotes. Never use a fresh inverse conversion to reconstruct refunds.

Fictional tests cover BDT/USD, USD/JPY and USD/KWD; every rate is authored, not fetched.
Read-only SIX XML verification on 2026-10-07 (list published 2026-09-17) reconfirmed their
2/2/0/3 exponents. Only these example facts are used; the XML/dataset is not redistributed,
and its distribution rights are not approved. Synthetic historical codes exercise unit
changes without asserting a real currency changed precision. A maintained registry,
source rights and capability policy remain separate gates.

Tests also show why rounded unit amounts are multiplied and summed: fictional source
units `5` (quantity three) and `7` (quantity one), at rate `1/2` with equal exponents,
produce stored target lines `6` and `4`, totaling `10`. Converting the source header `22`
would instead produce `11`. This is an arithmetic regression, not a new invoice policy.

### Command 97 explicit currency policy contracts

The owner-authorized Command 96 phase review on 2026-10-07 found no arithmetic repair
necessary and defined **Command 97 — Build explicit currency policy and capability
contracts**. The owner separately authorized implementation on 2026-10-07.

The unused `@webhost-billing/shared/currency-policy` entry describes revisioned
base/default/secondary choices and explicit independent display, new-sales and collection
flags, pinned to supplied unit metadata. It rejects ambiguity and unsupported references without a built-in dataset,
live default or application consumer. A rate, browsing choice or metadata definition never
enables collection or proves a payment route. Historical code/version resolution remains
available independently of disabled flags; it never adopts current precision implicitly.

`currencyPolicyContextSchema` validates a policy and its explicit definitions together;
`currencyPolicySchema` checks shape/identity only. `readCurrencyPolicyCapabilities` returns
all-false flags for a valid omitted/unknown code, but throws for malformed context/input.
`resolveHistoricalCurrencyUnit` takes an exact unit reference and definitions only, never
an enablement policy. Parsers return copied JSON-safe facts, not immutable stored history.
Lists are bounded to 32 entries/definitions before member traversal; revision tokens are
bounded to 64 ASCII identifier characters. Unit identifiers inherit the arithmetic bounds.
Historical units cannot enable display or new sales; collection remains an independent
flag, including for historical units, without proving any approved payment route.

`validateCurrencyPolicyTransition` rejects stale expected revisions, a replacement equal
to the current revision and base-code changes after an explicit history-exists fact.
It does not prove global revision uniqueness or numeric ordering. Same-code metadata
version changes do not reinterpret original-unit history. Future server services must
obtain that fact authoritatively and enforce
concurrency, authorization and confirmation; these contracts do not do so. Fictional
BDT/USD target examples do not approve actual sales/collection capabilities. Persisted
metadata/policy, per-currency portal/report reads and prices/quotes remain later slices.

### Command 98 immutable currency unit storage

The owner-authorized Command 97 phase review on 2026-10-07 found no in-scope policy
contract defect and defines **Command 98 — Persist immutable currency unit definitions**
only. The owner separately authorized implementation on 2026-10-07.

Start with an empty, unused additive unit-definition store and exact code/version lookup,
not an installed currency list or policy. Reuse bounded shared contracts, enforce unique
identities and immutable version facts in PostgreSQL, and test identical/conflicting
concurrent replay in owned fictional scopes. No legacy financial value or unit is inferred
from today's metadata. A captured current/historical status is version evidence, not a
mutable current pointer or today's sale/collection eligibility. Metadata lifecycle remains
separate, as do database-owner privileges that can bypass ordinary immutability controls.

This splits the proposed persistence step deliberately: unit identity/immutability first;
authoritative policy revision/history/concurrency services and financial provenance later.
The next slice does not migrate application consumers, fix mixed-currency reporting,
establish real metadata/source rights, select live prices/routes or authorize a rehearsal.

The separate unused `@webhost-billing/database/currency-units` entry takes an explicitly
injected Prisma client or transaction. `appendCurrencyUnit` parses shared unit facts,
uses `createMany` with `skipDuplicates` (no overwrite), then reads and compares the exact
code/version. Matching replay returns copied facts; differing exponent, status or
provenance rejects. PostgreSQL checks enforce the same ASCII/length/exponent/status
bounds, and a statement trigger rejects ordinary update, delete and truncate, including
empty/no-op statements. Database owners can disable these controls; no privilege
hardening or absolute immutability is claimed. The server supplies UTC `created_at`
by default; it is not a caller field or part of returned unit facts.

`readExactCurrencyUnits` requires 1–32 unique code/version references, validating the
budget before members and before database work. It returns all requested validated
definitions in requested order or fails with no partial success. No global enumeration,
latest-version fallback, network lookup, capability flags or lifecycle mutation exists.
Captured current/historical status never identifies today's preferred version.
The storage boundary additionally rejects terminal newlines allowed by JavaScript's
`$` anchor, without changing existing shared arithmetic/policy contracts.

Append/replay is supported at PostgreSQL Read Committed: duplicate-safe insertion waits
for a competing identity, and the following read uses a new statement snapshot. A
caller using Repeatable Read/Serializable must retry the **whole transaction** after
serialization failure or an unavailable snapshot, not retry a statement in an aborted
transaction. Propagate conflicting-facts errors out of compound writes so the caller's
transaction rolls back. No database error is swallowed and no automatic retry is added.
See PostgreSQL's [insert behavior](https://www.postgresql.org/docs/current/sql-insert.html)
and [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).

The database package's mandatory `test` runs source-level checks and a dedicated
test-only launcher using the existing marked nonce schema and model/raw-path guards.
Both root package acceptance and guarded sequential acceptance include it. Its tests
create only fresh loopback fictional scopes and never migrate/reset an application
schema. An additional scope applies the prior 22 SQL migrations, creates fictional
history, then checks every existing row before/after migration 23 and store operations.
The launcher also runs the existing fictional seed and schema verifier in its marked
scope. Each tool independently repeats scope validation before work; normal operation
remains unchanged, no units are seeded and existing schema/seed assertions are retained.
An incomplete unmarked preparation is retained, not adopted or automatically removed.

### Command 98 review and bounded policy-revision storage

The owner-authorized phase review on 2026-10-07 accepted Command 98's engineering scope
at corrected delivery head `8aab8d4`: complete local validation and all exact-head CI/CodeQL
gates passed. No in-scope storage defect or connected application consumer was found.
Ordinary SQL immutability is not protection against a database owner disabling controls;
stored provenance/status and default creation time are not authenticated external evidence.
Stronger transaction isolation still requires caller-owned whole-transaction retry.
The exact fictional invoice submission-key exception retains every secret-scanning rule.

Define **Command 99 — Persist immutable currency policy revisions** only. Start with an
empty unused store of complete Command 97 policy snapshots validated against exact
stored Command 98 units, not caller-supplied metadata. Bound entries/revision identifiers,
enforce unique immutable revision facts and complete atomic snapshots, and canonicalize
entries by code for identical replay. Exact reads return copied validated facts; missing
revisions fail closed. No latest/current lookup, active pointer or implicit unit creation.
If related rows are used, later inserts must not extend a completed snapshot.

Different-base snapshots are candidates/history, not installation base changes. Policy
selection and initialization need authoritative history and coordinated legacy writers,
expected-revision concurrency, role/MFA/CSRF/confirmation and audit. These are not supplied
by an unused store or a caller history boolean. Do not initialize policy from localization,
guess legacy precision, enforce selection with a pure helper alone or advertise live support.

The owner separately authorized Command 99 on 2026-10-07. It requires full fictional database/
application/browser acceptance. Extend migration-count scaffolding while preserving the
original Command 98 history test; compare prior-23-migration unit and financial/settings
facts before/after the additional migration. Financial provenance, per-currency reads,
price/quote/provider integration and actual policy activation remain later bounded work.

### Command 99 complete immutable policy snapshots

The empty `currency_policy_revisions` table stores a globally unique explicit revision,
one complete JSONB policy and server-default UTC creation time. A single snapshot row has
no extensible children; ordinary UPDATE/DELETE/TRUNCATE are rejected even for no-op/empty
statements. INSERT validation enforces strict policy/reference/capability fields, 1–32
unique codes, full-string ASCII bounds, exact stored-unit context, selected bindings and
current/display browsing versus historical display/new-sales denial. Lookup functions and
unit tables are resolved in the target snapshot table's schema, not a caller search path.
Unit immutability preserves referenced precision/status/provenance. Database owners can
still disable controls; stored policy/status/timestamps prove no external authentication.

`@webhost-billing/database/currency-policies` is a separate unused entry with explicit
client/transaction injection, no module-load I/O and no root/application export or consumer.
`appendCurrencyPolicyRevision` parses Command 97 contracts, resolves exact Command 98
database definitions, sorts a copied entry list by code and validates context. Entry order
is not a preference; default/secondary are explicit fields. Duplicate-safe append then
exact comparison admits equivalent facts independent of property/entry order and rejects
different facts without overwrite. SQL also canonicalizes entries. Returned context is
copied, runtime-validated JSON-safe evidence; it contains exact pinned unit facts, not dates,
active-policy authority, a rate/price or permission to collect.

`readExactCurrencyPolicyRevision` accepts one exact revision only. Missing or invalid
context fails closed, with no global/latest/current fallback. Different-base snapshots
are candidate/history facts and do not initialize/select an installation base. At Read
Committed, duplicate-safe INSERT followed by a new SELECT snapshot supports concurrent
replay. Stronger isolation requires caller-owned whole-transaction retry; conflicts must
propagate out of compound writes for rollback. No automatic retries or transition helper
based on invented current/history facts are introduced. Plain-data parsing does not
sandbox getters/proxies. Mandatory tests use fresh marked fictional scopes and compare
all prior financial/settings rows plus existing unit facts across migration 24.

### Command 99 review and the next design boundary

The owner-authorized phase review on 2026-10-07 accepted the engineering scope at
`15539ee14a08ed02b64a9d9155dc13f61e4d08b1`. Source-head CI Validate passed all mandatory
steps and CodeQL passed; PR-only Dependency review was skipped on push, not passed.
Fresh local repository/contract/mitigation checks also passed. No in-scope storage defect
or runtime application consumer was found. Owner bypass and stronger-isolation retries
remain explicit, and storage is still not selection authority or permission to transact.

Define **Command 100 — Design authoritative currency policy selection and legacy-history
safeguards** only. The existing financial writers and money rows make initialization more
than adding a pointer: history must be authoritative and coordinated with writers that
currently know nothing about that pointer. The pure transition helper's code-only base
check does not decide same-code precision/version compatibility. Localization, mixed
BDT/USD debts or a browser flag cannot supply missing base/unit provenance.

That separately authorized design must inventory concrete writers and produce an
initialization/replacement state table, lock/writer-adoption protocol, legacy compatibility
and provenance rules, full-administrator MFA/CSRF/confirmation and atomic audit contract,
and fictional concurrency/security acceptance matrix. This review does not produce that
design, implement its protocol, choose a live policy or repair current mixed-currency
portal/report reads. Existing-history, per-currency presentation and operational approval
gates remain visible; see [command tracking](../CODEX_DEVELOPMENT_COMMANDS.md).

## 3a. Authoritative selection and legacy-history safeguards — Command 100

### Authority and inspected baseline

The owner authorized this design on 2026-10-07. Source baseline:
`dc49182356b73a1bbe65a997521fff1c3f591c48`. Everything described as a selection
control, ledger, guard, proof or adoption mechanism below is proposed, not installed.
No table, endpoint, permission, token or financial writer changes in Command 100.
Technical safety rules are not approval of a live base, metadata dataset, collection
destination, maintenance window, WHMCS mapping or remaining operating inputs.

`packages/database/prisma/schema.prisma` contains seven money-bearing tables:
`product_prices`, `orders`, `order_items`, `services`, `invoices`, `invoice_items`
and `payments`. They store BIGINT amounts and currency codes, but no unit-version
or currency-policy foreign keys. Refunds/reversals are `payments.kind`, not separate
tables. `invoices.credit_total` exists; there is no customer credit ledger to adopt.
`payment_events` stores normalized JSON callback evidence, not another balance.

`packages/database/src/client.ts:createPrismaClient` specifies no isolation override.
Inspected production transactions specify no isolation level or general serialization/
deadlock retry wrapper. Do not assume the server's configured default: future guarded
transactions must explicitly select and verify Read Committed. Existing invoice/service
locks and submission keys protect local workflows, not policy selection or legacy units.

### Writer-path map

Paths are repository-relative. These are current source facts; the last column is
required future adoption, not a claim that those callers have been changed.

| Path and symbol                                                                                                                                                                                                              | Current write/coordination and failure boundary                                                                                                                                                                                                                                                         | Required adoption                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/products/product.service.ts`: `create`, `definePrice`                                                                                                                                                  | Nested initial prices; replacement retires active rows then inserts a price. Transactional activity log, partial unique active-price index, unique-conflict handling.                                                                                                                                   | Guard before price reads/writes; pin units and publication policy, never reinterpret retired prices.                                                                                              |
| `apps/api/src/modules/orders/order.service.ts`: `create`, `updateStatus`                                                                                                                                                     | Submission-key replay; reads active price, creates order/items and issued invoice/items, allocates number, writes audit/outbox in one transaction. Status cancellation can cancel an unpaid invoice.                                                                                                    | Currency guard before price/customer/numbering work; preserve replay before new-sale eligibility and retain original receipt money.                                                               |
| `apps/api/src/modules/invoices/invoice.service.ts`: `create`, `updateDraft`, `applyAction`                                                                                                                                   | Draft creation; draft item delete/recreate; optimistic `updatedAt`/state predicates for editing and issuance/cancellation, audit in transaction. Number setting row lock on creation.                                                                                                                   | Guard before authoritative reads/CAS; draft creation already locks base history. Only draft line replacement remains permissible; issued unit facts stay fixed.                                   |
| `apps/api/src/modules/payments/payment.service.ts`: `submitManual`, `recordManual`, `review`, `adjust`                                                                                                                       | Invoice `FOR UPDATE` on charge/approval/adjustment; adjustment appends payment and updates balances, cumulative limits, unique keys/references and audit/outbox. Rejection uses conditional update.                                                                                                     | Guard before invoice lock; inherit invoice/original-payment unit, not browsing policy; keep verified same-currency and cumulative limits.                                                         |
| `apps/api/src/modules/payment-gateways/payment-gateway.service.ts`: `createSession`, `processWebhook`, `reconcilePayment`                                                                                                    | Creates pending payment under invoice lock; provider session call happens afterward. Authenticated/normalized event creates unique event then locks invoice; validation, settlement and outbox/audit are transactional. Session claims/failures also update payments outside that callback transaction. | Guard all payment writes, including claims/failures; preserve signature/merchant/amount/currency/replay checks. No provider call while currency lock is held.                                     |
| `apps/api/src/modules/services/service.service.ts`: `create`, `transition`                                                                                                                                                   | Locks order item/server to create service from paid order, copies recurring amount/currency. Transition locks service and can update order state, with audit/outbox.                                                                                                                                    | Guard before existing locks; inherit order-item unit and preserve hosting/payment state separation.                                                                                               |
| `apps/worker/src/renewal/renewal-processor.service.ts`: `createRenewalInvoice`, `markOverdue`, `applyRenewalPayment`                                                                                                         | Service lock, period/submission uniqueness, stored recurring money, invoice numbering; overdue CAS; service-period advancement under service locks; audit/outbox.                                                                                                                                       | Guard before service/invoice reads and numbering; exact original unit for renewal even when new sales are disabled. Sort multiple service locks by ID.                                            |
| `apps/api/src/modules/hosting-panels/hosting-panel.service.ts`: `executeServiceOperation`, `completeSuccess`, `completeFailure`, `applyServiceSuccess`; `apps/worker/src/renewal/hosting-automation.service.ts`: `complete`  | Provider call separated from preparation/completion; completion changes service and sometimes order status, operation evidence and audit/outbox.                                                                                                                                                        | Guard database completion transactions too: they touch money-bearing rows although they do not change money. Never repeat external operations as a transaction retry.                             |
| `apps/api/src/modules/settings/settings.service.ts`: `update`; `apps/api/src/modules/payments/payment.service.ts`: `updateSettings`; `apps/api/src/modules/payments/partial-payment-policy.ts`: `updatePartialPaymentPolicy` | Business settings upserts include localization and numbering. Both payment-policy routes use the shared partial-payment advisory lock and explicit confirmation, audit in transaction. Localization currently accepts one currency without a history check.                                             | Currency guard first, then partial-policy/numbering locks. Prevent legacy localization from becoming a second authoritative base/default writer.                                                  |
| `apps/api/src/common/identifiers/invoice-number.ts`, `apps/worker/src/renewal/invoice-number.ts`: `allocateInvoiceNumber`                                                                                                    | Upsert then lock numbering setting, increment in caller's transaction.                                                                                                                                                                                                                                  | Both callers acquire currency guard first; retain numbering uniqueness/rollback.                                                                                                                  |
| `packages/database/prisma/seed.ts`: `seed`; `apps/web/e2e/prepare-environment.ts`: `prepareEnvironment`                                                                                                                      | Fictional upserts/nested writes; dedicated E2E scope checks, model/raw guards and nonce ownership. Seed is also a direct development command when no E2E marker is supplied.                                                                                                                            | Explicit fictional selection/unit fixtures only in owned test scopes after adoption; no seed exemption or production invocation. Adapt old-history fixtures deliberately, not by removing guards. |
| `apps/worker/src/renewal/renewal-scheduler.service.ts`: `scheduleCurrentCycle`; future importer/direct SQL                                                                                                                   | Scheduler advisory lock creates automation/outbox, not financial rows; queued policy is not a current currency authorization. No importer exists. Ordinary SQL currently checks money/code shape, not currency selection.                                                                               | Financial worker rechecks under guard when executing. Importer requires separate authority, exact source evidence and same guard; SQL triggers enforce the currency boundary.                     |

Review `apps/api/src/modules/payment-gateways/payment-money.ts`, provider BDT guards,
`apps/api/src/modules/customers/customer.service.ts:getPortalSummary`,
`apps/api/src/modules/dashboard-reports/dashboard-report.service.ts` and
`apps/web/src/components/orders/order-ui.tsx:formatMinor` before consumer adoption.
Their two-decimal/provider, mixed-summary rejection, localization-filtered totals and
current Intl precision behaviors are not repaired by this design.

### Selection identity, history and states

Propose one schema-local singleton control identified by internal key `1`, not tenant
IDs or mutable localization. It records a nullable exact selected revision, monotonic
selection generation, permanent history latch and original base anchor (exact unit
reference plus code/exponent). An append-only selection ledger binds previous/new
revision, generation, actor/request identity, assessment evidence and activity-log ID.
Foreign keys bind existing immutable policy/unit rows; no policy JSON copy is mutable.
Missing control, missing selected revision or invalid exact references means unavailable,
never greatest revision, newest timestamp, first entry, BDT fallback or localization.

Before history, the anchor is provisional and follows a valid selected-base replacement.
The first successful financial commit freezes the then-selected exact base reference/code/
exponent with its latch. Existing-history adoption establishes that anchor once from the
reviewed adoption decision. After locking, even a compatible metadata replacement leaves
the frozen anchor unchanged; selection history retains earlier provisional choices too.

Financial history means **any committed row** in orders, order items, services, invoices,
invoice items or payments, regardless of status, amount, dates, soft-deleted customer,
pending/failed payment, draft/cancelled invoice or terminated service. Use per-table
`EXISTS`, not financial sums. Also treat linked normalized gateway evidence or reviewed
adoption/import evidence as a blocking obligation even if a source row is missing.
Rejected/unlinked webhook evidence alone does not prove money, but is reviewed at adoption.
Product prices are configuration, not the permanent-history latch; existing prices still
block an empty-install initialization/base switch until exact unit compatibility is reviewed.

At the first successful financial insertion set the latch in the same transaction,
using an AFTER successful-row insert boundary rather than attempted BEFORE insert
side effects (ON CONFLICT DO NOTHING may insert no row).
Rollback of the insertion rolls back that latch; a successful commit makes it permanent.
Deployment bootstrap computes history under a drained writer boundary; thereafter it is
`stored latch OR observed history`, never reset to false. Cancellation, refund, draft-item
replacement, zero balance, deletion attempts, cleanup or currency disabling cannot unlock
the base. Reject normal financial DELETE/TRUNCATE except the existing validated draft-line
replacement workflow; even that cannot clear the latch. Failed/no-op inserts must not
fabricate history. Normal SQL cannot delete/truncate/reset control or ledger.

| State                                                                                       | Allowed selection action                                                                                                | Financial boundary                                                                                                                       |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Control not installed                                                                       | None; current legacy application behavior only                                                                          | No claim of coordination or currency activation.                                                                                         |
| Control installed, selection absent, history/price context unresolved                       | No empty-install initialization or ordinary replacement                                                                 | Fail closed for new money writes; protected raw/history reads remain visible. Only separately approved legacy adoption may resolve this. |
| Control installed, selection absent, all seven money tables empty, no unresolved obligation | Confirmed initialization to one exact candidate, expected selection explicitly absent and expected generation unchanged | New financial writes cannot win before initialization; they fail and may be retried only after valid selection.                          |
| Selected, history false, no price/other compatibility blocker                               | Confirmed replacement with exact expected revision/generation; base may change                                          | First financial write and replacement serialize. Writer must re-read/revalidate selected context after acquiring guard.                  |
| Selected, history true                                                                      | Confirmed capability/default/compatible metadata replacement only                                                       | Base code and exponent fixed; originals keep their exact units and revision lineage.                                                     |
| Selected reference, adoption evidence or controls invalid/missing                           | No fallback or ordinary mutation                                                                                        | Stop new financial writes, surface review-required state; do not hide debts or make a new policy automatically.                          |

Initialization and replacement are distinct operations; browser input selects an existing
exact revision and expected state, not definitions, history flags or computed eligibility.
Future requests need strict bounded runtime parsing, request/body budgets and server-owned
canonical fingerprints independent of object field order; reject unknown authority fields.
Use a new selection generation on every actual replacement and reject exhaustion rather
than wrapping. A superseded selected revision cannot be selected again; equivalent facts
need a new revision, preventing A-to-B-to-A stale confirmation. Candidate snapshots may
be appended without selection authority; they do not change this state machine.

### Coordinated transaction protocol

**Design choice:** one schema-scoped exclusive transaction advisory lock for all relevant
financial/configuration writes and selection transitions. Start with serialization for
one hosting business, not a distributed cache or multiple independent policy locks.
Compute the lock identity from a fixed namespace and database/schema identity consistently
in SQL and application access; hash collisions can over-serialize but must not bypass
locking. Do not copy the partial-payment or scheduler key or use session-level locks.
Every data lookup/control/function reference is schema-qualified or resolved against the
guarded table schema, not a caller-controlled search path.

Advisory locks alone are cooperative. Future normal-SQL enforcement requires BEFORE
STATEMENT INSERT/UPDATE/DELETE guards on all seven money tables and relevant settings
writes, with row validation for exact units, policy/adoption lineage and joins. Include
COPY, nested writes, ON CONFLICT, MERGE and no-op statements in acceptance. Financial
TRUNCATE is rejected. Control/ledger direct DML must be revoked from ordinary writer roles;
only a reviewed narrow transition function may perform checked CAS plus ledger/audit.
Runtime roles cannot disable guards, use replica trigger bypass, own these tables or call
unrestricted migration functions. Current shared credentials do not prove these privileges:
role/function hardening is a future activation prerequisite, not performed here.

Guard-trigger helpers that set the latch need narrowly privileged execution because normal
writers cannot update control directly. Future SECURITY DEFINER functions must have reviewed
owners, fixed safe search paths/qualified objects, restricted EXECUTE grants and allowed
trigger-table checks; runtime writers cannot create/attach replacement triggers. A caller
GUC, claimed actor ID or public function invocation cannot substitute for selection authority.
Verify these grants/functions under actual non-owner roles before enabling the protocol.

The settings statement guard coordinates all settings DML; row rules restrict the relevant
keys, rather than trying to inspect rows before a statement runs. Draft-line deletion checks
the locked parent's genuine draft state; neither a caller-set exemption flag nor changing
an issued parent back to draft may bypass historical protections.

The SQL guard is required even when a client bypasses application services. It is not
proof of an administrator's human intent: service authorization and a trusted selection
executor remain necessary. Arbitrary SQL with owner/migration credentials can bypass
controls. Record that residual power; never advertise absolute immutability.

Order for future adopted writers: currency advisory lock, control row, existing business
locks/settings, business writes, audit/outbox. Preserve existing relative invoice/item/
server/numbering order; sort multi-row locks deterministically. Selection does not lock
financial rows to count history. Where staff authorization is required, acquire the
existing staff mutex (`StaffService.lockAndAuthorize`, key `920006`) **before** currency
coordination. After currency coordination/control lock, re-read/lock session/user/profile/
MFA/proof records in a fixed order. Do not hold auth row locks while waiting for currency
coordination: a financial writer may need those rows for audit foreign keys.
Selection never calls a financial writer while holding a different lock order.

Statement guards are a safety backstop, not a cure for existing explicit row-first locks.
Every mapped caller must take the currency lock before authoritative reads/row locks,
including settings/numbering and status-only hosting completion. Otherwise a legacy
invoice-lock-then-trigger path can deadlock with a currency-lock-then-invoice path.
Unexpected/pre-locking SQL must abort safely on deadline/deadlock, never swallow errors.
Do not enable selection until writer adoption and drain tests prove coverage.

Mutation isolation is explicitly **Read Committed**. Acquire the advisory lock in one
statement, then obtain selected policy/history/security facts in subsequent statements.
SQL guard/transition functions are VOLATILE and read after lock acquisition; never put
lock acquisition and history/current selection into one pre-wait statement snapshot or
mark these functions STABLE/IMMUTABLE. Guarded mutations at Repeatable Read/Serializable
are rejected until separately designed/tested; they must not reuse a stale snapshot.
Read-only advisory preflights may use one consistent read-only snapshot and grant no
transition authority. This protocol is a design inference from PostgreSQL's
[isolation](https://www.postgresql.org/docs/18/transaction-iso.html),
[advisory locks/deadlocks](https://www.postgresql.org/docs/18/explicit-locking.html),
[function snapshots](https://www.postgresql.org/docs/18/xfunc-volatility.html) and
[trigger behavior](https://www.postgresql.org/docs/18/trigger-definition.html), not an
executed concurrency proof.

Within a future selection transaction:

1. Set verified isolation and bounded lock/statement/transaction deadlines; apply initial
   session/role/CSRF checks and acquire the existing staff mutex, without taking auth row
   locks before currency coordination. Initial browser/request claims do not authorize commit.
2. Acquire currency coordination and control lock, then re-read/lock current session/user/
   profile/MFA/proof facts and authorize. Read an actor/session-bound idempotency receipt
   if present. Matching completed replay returns its original result without another
   audit/generation change; current selection is a separate observation. Conflicting body or
   actor/session binding rejects. A stale new request cannot masquerade as a replay.
3. Load exact candidate/unit context through Command 99/98 repositories. Require matching
   expected revision/generation and authoritative history/price/adoption compatibility.
   Validate confirmation/proof against the captured current/proposed facts and assessment;
   any relevant change since preview requires a new preview, not silent acceptance.
4. CAS selection once, retain/set latch and base anchor, append immutable ledger plus
   redacted activity log, and consume the one-use confirmation proof in the same commit.
   Failure of validation, audit or proof consumption rolls everything back. Candidate
   appending, if later supported, must be in this transaction and retain immutable replay rules.
5. Commit before returning success; read-refresh or delivery failure afterward cannot replay
   the mutation. Do not insert outbox/provider/hosting work merely for a preference change.

Propose a maximum of three whole-transaction attempts for classified deadlock/serialization
failures in this future local operation, within an overall request deadline. Explicit lock
timeouts return a retryable conflict; stale revisions, malformed/unknown facts, missing
provenance, denied permission and differing idempotent facts are not retried. Use one
request identity through retries; never retry an aborted statement, failed provider call or
hosting mutation. Existing services have no general retry wrapper to rely on. Duration
values require dedicated acceptance/resource measurement before adoption.

### Legacy adoption, compatibility and new-record provenance

An existing installation without selection is **not** empty just because its invoices are
paid or cancelled. Ordinary initialization must refuse it. A separately approved adoption
record must identify target reporting base, protected evidence for original units, covered
row identities/hashes, source mapping and unresolved classes. Mixed BDT/USD or WHMCS's
old USD base is not permission to choose a target base or relabel money. The BDT target
direction remains; existing-history adoption approval and exact metadata rights are missing.

Missing legacy metadata stays unknown. No latest/Intl/localization guess, default exponent,
fabricated revision, current FX or all-rows BDT linkage. Keep raw amount strings, code,
original record IDs and snapshots intact. A later reviewed additive sidecar may bind exact
unit evidence to historical records without changing amounts; quarantine uncovered/inconsistent
records and require billing review before new collection/renewal or decimal presentation.
Inspection/read-only access remains available, labelled unresolved where necessary; lack
of current capabilities must never hide original history. This design does not disable or
alter today's legacy application; that change requires the adoption command and owner window.

Once history exists, the original base anchor's code **and exponent** cannot change.
A new base metadata version with the same code/exponent is permissible only with verified
source/compatibility evidence and audited explicit selection; it never rewrites the anchor,
previous policies, valuations or records. Changed exponent is rejected even if the pure
Command 97 helper accepts the same code. Before history, a base switch still requires
compatible/empty price context and explicit re-confirmation; no automatic price rescaling.

Future new money pins immutable unit code/version on each money-bearing record and the
selected policy revision used for its creation, with a separate origin/adoption classification.
Header/line money must agree on exact unit, not merely code. Price-to-order-to-invoice/service
lineage is explicit; payment/refund/renewal inherits original unit/obligation lineage while
recording the policy under which the new operation was allowed separately. A renewal does
not pretend that today's policy originally created its service. New-record required links
and existing-row null/unknown distinctions need additive migrations and SQL validation;
no columns or backfill are created here.

New-sale flags apply to future sales, not collection/renewal of old obligations. Collection
requires original exact units, approved same-currency destination/provider coverage,
authentication and existing payment invariants; a true flag is insufficient. Disabled
collection leaves visible billing review. No cross-currency settlement, original-payment
rewrite, repricing, credit-wallet omission or automatic termination follows selection.
Disabling collection blocks new initiation, not authenticated completion of an already
admitted in-flight payment. Validate that completion against its captured original unit,
merchant/route/amount/invoice and replay evidence, even when new initiation is now disabled.
If that evidence is unresolved, retain/quarantine the event for reconciliation rather than
drop it, falsely settle or silently leave received funds unexplained. Coordinated callback
transactions take the guard before event insertion; linked/processed `payment_events`
writes also need the SQL coordination backstop because history checks inspect that evidence.
Group future aggregates by compatible unit context as well as code; unresolved or differing
precision must not be summed as if homogeneous. Formatting resolves pinned precision;
mixed-currency portal/report/PDF/email/exports are separate consumer changes before rehearsal.

### Adoption and activation prerequisites

Use an explicitly approved maintenance/writer-drain rollout, not zero-downtime inference:

1. Inventory every deployed writer/version/role and in-flight gateway/hosting operation;
   owner approves target, recovery and maintenance scope. Prepare read-only preflight and
   reviewed unit/source/adoption evidence. Staging hostname alone is not sufficient authority.
2. Drain financial API writes, worker consumers, scheduler-produced work, seeds/imports and
   database writers, preserving authenticated callbacks for safe later processing. Prove no
   old transaction or queued old implementation can resume; do not drop events or declare
   external operations failed just to drain. This document shuts down nothing.
3. In an authorized deployment transaction, hold locks blocking writes on the covered tables/
   relevant settings, compute prior history, install singleton/latch/provenance/normal-SQL
   controls and verify runtime privileges. Existing rows remain byte-for-byte unchanged.
   If evidence is incomplete, selection/new writes remain blocked; do not resume partially
   upgraded writers. All seven tables empty permits confirmed initialization, not an auto seed.
4. Roll out every mapped caller with guard-first ordering, new-record provenance, explicit
   read/collection compatibility and security. Verify fictional SQL/concurrency/application/
   browser and old-row comparisons, then perform separately authorized selection/adoption.
   Resume only the reviewed compatible writer set; route/provider approval is still separate.
5. After new-version financial commits, an old application binary is not a safe rollback.
   Retain original provenance/ledger and restore or forward-repair only under a reviewed
   recovery command. Never drop guards or overwrite history to make an old binary work.

Source/metadata distribution rights, live sale/collection currencies and destinations,
price/quote rules, protected WHMCS data/credits, operational D5–D8, operators/recovery,
maintenance scope and final launch approval stay open. A fictional test fixture or a
completed design cannot satisfy those prerequisites.

### Security, confirmation, audit and errors

`AuthModule` installs `SessionAuthGuard`, `RolesGuard`, ownership, CSRF and rate-limit
guards. `AuthService.authenticateSession` checks active/revoked/expired/idle sessions and
MFA verification when enrolled. `RolesGuard` defaults unspecified administrator permission
to full administrator, but does **not** generally require full administrators to enroll
MFA. `StaffService.lockAndAuthorize` rechecks full role/enrollment under mutex; use this
pattern, not just controller metadata, and require a currently valid MFA-verified session.

Policy mutation requires active full administrator at both route and service boundary;
billing/support/customer roles cannot preview restricted evidence or mutate it. Re-read
session/user/profile/credential after acquiring locks and hold row locks through commit;
coordinate future auth/staff changes to avoid reversed lock order and revocation races.
Existing private password/factor helpers verify and consume credentials, but no reusable
session/operation-bound currency step-up/confirmation grant exists.

Design that missing boundary separately: password plus fresh enrolled factor produces a
short-lived, one-use server-side proof, proposed five-minute maximum lifetime, bound to
actor/session, operation, expected selection/generation, exact proposed revision, canonical
change digest and adoption/history assessment. Store only opaque proof hashes and UTC
expiry/consumption evidence; never passwords, TOTP secrets/codes, recovery codes or browser
authority flags. Reusing a factor step must be prevented; recovery use follows existing
consumption semantics and must not silently bypass mandatory enrollment. This lifetime is
a proposed technical default, not an implemented token or new API/protocol value.

Use the existing signed double-submit CSRF/origin protection on preview-proof/confirmation
mutations, HttpOnly sessions and bounded rate limits; no skip-CSRF decorator. Confirmation
shows before/after base/default/capabilities, affected historical obligations and blockers
in sentence case, with explicit owner intent; no generic static phrase alone proves target
binding. Stale generation or changed relevant history/evidence invalidates preview. No
MFA-enrollment boolean, hidden input, successful GET or redirect authorizes a write.

Successful selection requires an atomic activity log/ledger containing before/after exact
revisions/generation, safe capability/unit diffs, actor, request/correlation ID, reason and
protected evidence IDs, with UTC time/IP hash where applicable. No raw customer exports,
proof tokens or provider credentials. Audit failure denies selection. Denied security
attempts may be recorded separately without claiming a successful transition. Existing
`AuthAuditService` alone is not a transactional selection ledger or absolute tamper protection.
Use existing error-envelope categories with safe sentence-case messages for unavailable
context, conflict/review-required state and denied authorization; no raw SQL/stack/secret
detail. Exact response schemas and endpoint names remain a later implementation decision.

### Fictional acceptance matrix — designed, not executed

Each future test uses newly owned marked loopback scopes and model/raw guards. Assertions
include unchanged historical row hashes, no extra financial/outbox/provider effects,
selection/ledger/activity/proof atomicity and exact string money. Proposed scenarios:

| Scenario / controlled interleaving                                                                                          | Required outcome                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two empty initializers pause after preview, then confirm different revisions                                                | One winner; loser stale/conflict; one generation/ledger/audit, no partial selection. Matching same-key replay returns original receipt.                                                                                 |
| Two replacements share expected revision/generation; attempt A-to-B-to-A                                                    | One CAS winner; stale/new request denies. Superseded revision cannot reactivate; no timestamp ordering inference.                                                                                                       |
| Uninitialized writer acquires guard before initialization                                                                   | Financial write denied/rolled back, no latch or numbering change; initialization may then succeed. No orphan obligation is created without selection.                                                                   |
| Selected history-free writer holds guard before base replacement                                                            | Writer commits original pinned money and latch; waiting replacement re-reads history and denies base code/exponent change.                                                                                              |
| Base replacement acquires guard before first financial writer                                                               | Replacement commits; writer re-reads new context and either creates correctly pinned valid money or rejects stale price/quote. Never re-label supplied amounts.                                                         |
| Row-first legacy writer/normal SQL bypasses service; SQL takes a pre-lock                                                   | Triggers still enforce selection/unit/history; prove guard-first adoption. Deadlock/timeout aborts safely without swallowed/partial commit; no activation with unresolved coverage.                                     |
| Long-lived Repeatable Read/Serializable mutation waits on guard                                                             | Isolation rejected, never stale history/selection success; permitted read-only preflight remains advisory only.                                                                                                         |
| Cancelled draft, zero paid invoice, failed payment, terminated service; draft lines replaced                                | History remains latched; price soft delete/debt clearance does not unlock. Forbidden DELETE/TRUNCATE/control reset rejects.                                                                                             |
| Same base code, changed exponent; same exponent with new reviewed metadata version                                          | First denies. Second requires explicit compatible evidence and new revision; anchor/old unit facts and old-row hashes stay unchanged.                                                                                   |
| Existing BDT/USD rows with absent provenance or inconsistent line/payment joins                                             | Empty initialization denies; reviewed adoption absent means blocked. Raw history stays visible, no inference/conversion/hidden debt.                                                                                    |
| Unknown exact revision/unit, incomplete context, disabled capability, missing route                                         | Fail closed for relevant new operation, never latest/global/default fallback or inferred provider support.                                                                                                              |
| COPY/nested/ON CONFLICT/MERGE/no-op UPDATE; direct control/ledger DML                                                       | All currency guards/privileges apply; no partial inserts, changed immutable facts or unaudited selection. Validate under a non-owner writer role, not just migration owner.                                             |
| Transaction exception, audit failure, proof-consume failure, classified retry                                               | Full rollback; bounded whole-transaction retry retains request identity; one receipt/audit; no provider call repeated.                                                                                                  |
| Billing/support/customer caller; unenrolled/full admin, unverified/expired/revoked session, staff demotion/MFA disable race | Denied at service boundary; locked current auth facts determine winner. No mutation based on stale identity snapshot.                                                                                                   |
| Wrong/missing CSRF/origin, stale/tampered/expired/other-session proof, reused factor/proof                                  | Denied without selecting; failed attempt leaks no credential/proof/raw error.                                                                                                                                           |
| Disable new sales/collection; renew/refund or complete admitted in-flight payment in its exact unit                         | Block new initiation where disabled, but validate captured in-flight completion independently; retain unresolved events for reconciliation. No hidden history, repricing/inverse FX or hosting/termination implication. |
| Prior-24-migration fixture through future migration/guard adoption; replay/import rerun                                     | Preserve all financial/settings/unit/policy facts and idempotency; no legacy backfill/default policy. Keep prior-22/23 history tests intact.                                                                            |

### Smallest proposed follow-on slice and handoff

Propose a **read-only currency adoption preflight** before a selection-state migration:
an unused injected-client database entry that inventories all seven tables' row/history
counts and bounded per-code counts from one consistent read-only snapshot. Return exact
string counts and explicit unknown legacy provenance/selection-not-installed/writer-
coverage-not-established blockers, not financial sums, interpreted decimal amounts,
base inference or a ready-to-activate verdict. Cap group results with explicit truncation;
large/unknown code sets cannot disappear or become zero. Bound query/runtime resources and
include snapshot observation time; this advisory result never replaces a later locked
history query. No table creation, latch/pointer,
metadata publication, app consumer, environment/network I/O or provider access.

This slice makes the existing-history gate inspectable without touching money or installing
guards prematurely. Fictional tests would cover empty, mixed/zero/cancelled history,
soft-deleted price/customer scope, bounded counts, snapshot consistency and no writes.
It is a proposal only: this command does not assign its command number, implement it,
approve a real-data query or authorize selection. The owner subsequently authorized the
phase review below, which assigns Command 101 but does not authorize its implementation.

### Command 100 review and Command 101 boundary

The owner-authorized phase review on 2026-10-07 accepted the documentation-only scope
at `c15117c0974f3bbb3b5ab68812182ad6d58ed196`. Exact-head CI Validate passed all 28
steps and CodeQL all eight; PR-only Dependency review skipped on push, not passed.
The writer/state/security map meets Command 100's design deliverables. No runtime defect
or implementation proof is asserted: selection, SQL guards, adopted writers, unit lineage
and confirmation/audit remain future work. Its seventeen matrix scenarios are designed,
not executed by the unchanged acceptance suites.

Define **Command 101 — Build a read-only currency adoption preflight** as one unused
database entry only. Tighten the proposal into an owned, explicitly Repeatable Read and
database-enforced READ ONLY transaction, fixed schema-qualified queries and transaction-
local deadlines/row-visibility checks. Client injection and a TypeScript interface alone
cannot prove read-only or consistent observation. No caller-owned transaction, automatic
connection, app/CLI entry or live-data query. Missing schema/permissions or restricted
visibility fails, never means empty. Preserve pool/session defaults after completion.

Count all seven tables regardless of state/soft deletion; distinguish six financial-history
tables from price configuration. Return exact string counts, bounded deterministic code
groups (32 per table), explicit overflow/omitted-row counts and database UTC observation
time. Codes alone never resolve legacy units or prove support. Payment events receive
only aggregate evidence counts; payloads/linked obligation consistency and reviewed adoption
evidence remain unassessed. No amounts, record/customer IDs, inferred base/precision,
history latch, readiness/eligibility verdict or policy lookup that pretends to select authority.
The absent selection mechanism and unestablished writer/adoption coverage always remain
visible, even with zero rows. Evidence can become stale immediately after observation.

Initial technical ceilings are two seconds acquisition, 500 milliseconds lock, two seconds
statement and ten seconds transaction, with validated shorter positive limits only.
LIMIT bounds output, not count/group scan cost; cancellation, rollback, connection release
and local-setting reset need real fictional PostgreSQL tests. No retry/partial-success
fallback. Mandatory source and guarded SQL acceptance also covers snapshot interleaving,
read-only write rejection, restricted RLS/permissions, search-path decoys and unchanged
old financial/settings/unit/policy/audit/outbox facts. Keep all 24 migrations and existing
prior-22/23 history comparisons unchanged. These are next-command requirements, not tests
run by this review. The transaction/access-mode and visibility rules are based on primary
[PostgreSQL transaction documentation](https://www.postgresql.org/docs/18/sql-set-transaction.html)
and [client defaults](https://www.postgresql.org/docs/18/runtime-config-client.html);
the proposed implementation still needs executable verification.

The exact definition and acceptance are in [command tracking](../CODEX_DEVELOPMENT_COMMANDS.md).
No selection migration, financial rewrite, activation, source-rights decision, operating
approval, existing-scope cleanup or deployment is authorized. Ask for Command 101 approval.

## 4. Price publication, quote and renewal rules

### Catalogue pricing

Use existing `ProductPrice` rows as published sale prices. Each price is either an
administrator-set fixed amount in that currency or a derived amount from an identified
BDT source price, accepted rate snapshot and versioned rounding policy. Fixed USD prices
are allowed; do not overwrite them during an FX refresh. Derived prices cannot silently
become fixed, or vice versa.

For derived prices, refresh creates a reviewed publication batch. Retire prior active
rows and append replacements only when relevant amounts/provenance change; do not edit
retired rows. Pin each batch to one source catalogue revision, currency policy revision
and rate set. Transactional publication must reject stale inputs/concurrent publications
and enforce one active price per product/period/currency. A failed refresh retains the
last accepted version and its true age. It must not make stale data appear fresh.

### Server-owned quotes

1. Resolve the requested product, period and currency on the server. Require a published
   usable price and an available approved collection route. Otherwise offer a clearly
   labelled estimate or explain that checkout is unavailable; never silently use BDT.
2. Persist an opaque, session/customer-bound quote with target price, base-price lineage
   when derived, rate/policy versions, setup amount, totals, requested domain and expiry.
   Browser-supplied amounts or rates have no financial authority. Anonymous quotes are
   bound to a secure session and explicitly claimed by the same authenticated user.
3. Proposed expiry is 15 minutes. Carry only the opaque quote through sign-in. Revalidate
   ownership, availability and captured product/domain on confirmation; expired or
   retired-price quotes require a new quote and visible price acceptance.
4. In one transaction, consume the quote, allocate the invoice number and snapshot the
   exact invoice/order amounts and provenance. Serialize against price/policy changes.
   A rate refresh after successful confirmation does not change the issued invoice.
5. Keep existing idempotency: the same submission key and identical captured request
   returns its existing order/invoice even after quote expiry. A conflicting body/quote
   is rejected. Failed delivery/refresh must not replay an order or financial write.

Fixed prices do not require a current FX rate to be billed in their own currency.
Their optional converted display estimate still obeys freshness rules. Missing display
conversion must not block an otherwise valid fixed-price invoice.

### Renewals and issued invoices

- Existing services renew at their stored recurring amount/currency, including imported
  USD contracts. A preference change, BDT default or rate refresh never changes them.
- Future service currency/price changes require a separate audited agreement/effective
  date workflow. No bulk repricing is included here.
- An issued invoice remains payable in its own currency for its lifetime. Switching a
  page selector changes browsing, not its amount/currency, credit, payment or history.
- Changing an unpaid invoice's currency requires separately authorized financial
  correction/replacement behavior; it is not a general settings toggle.
- Do not aggregate different service currencies into one renewal invoice. Existing
  renewal idempotency and payment-versus-hosting state separation remain mandatory.

## 5. Rate-provider boundary and failure behavior

Recommended first evaluation candidate: ExchangeRate-API. Its
[supported-currency documentation](https://www.exchangerate-api.com/docs/supported-currencies)
includes BDT/USD. The [open-access documentation](https://www.exchangerate-api.com/docs/free)
describes daily updates, commercial conversion/caching, attribution and a prohibition on
rate-data redistribution. The [terms](https://www.exchangerate-api.com/terms) also require
review for the selected usage. An open-source code licence does not grant rate-data rights.
Do not ship fetched rates/raw responses with releases, demos or repository fixtures, or
offer a general public rate-feed proxy. Decide whether individual quote evidence retention
and its presentation fit the chosen licence before production use.

[Open Exchange Rates](https://docs.openexchangerates.org/reference/supported-currencies)
is a second evaluation candidate; assess its current coverage, terms, plan limits and
base/historical capabilities separately. No paid plan, automatic failover or provider
activation is selected. WHMCS's current
[currency documentation](https://docs.whmcs.com/9-1/payments/currencies/)
lists supported automatic-update currencies without BDT; neither that newer documentation
nor the old installation's settings prove working BDT updates on WHMCS 8.1.3.

Create a provider-neutral `ExchangeRateProvider` inside the modular monolith. It receives
only currency codes and permitted date/refresh parameters, never customers, invoices,
payment references or browser credentials. Use allowlisted HTTPS endpoints, bounded
timeouts/response sizes and secret-redacted errors. Credentials use the existing encrypted
integration boundary; only full administrators with MFA manage configuration/overrides.
Billing operators may read permitted quote/invoice evidence, not mutate provider policy.

Provider base currency is independent of installation BDT. Normalize a rate set with
USD-relative inputs using exact ratios: for source S to target T, `rate(T) / rate(S)`.
Both values must come from the same accepted provider snapshot. Do not splice dates,
sources or inverted directions without recorded provenance.

Proposed operational defaults, not approved launch inputs:

- A guarded idempotent refresh every 24 hours, with bounded retry/backoff and jitter;
  use the existing dedicated scheduler/worker architecture, not browser timers.
- Maximum provider data age of 48 hours for new derived quotes/publications. Check the
  provider's observation timestamp, not only download time. Reject future timestamps
  beyond a small explicitly configured clock allowance.
- Invalid/missing required codes, invalid base, excessive age or a change above a
  proposed 10% per-pair threshold quarantine the candidate set for administrator review.
  Exact rational comparison avoids floating-point percentage calculations. The threshold
  is configurable and is not evidence of rate correctness.
- Serialize refresh/publication; deduplicate by provider, provider observation time and
  content identity. Identical replay is a no-op; conflicting data for the same identity
  is quarantined, not used to revise an accepted snapshot.
- Existing fixed prices, issued invoices, manual review and contracted renewals remain
  usable when rate retrieval fails. Block new stale-derived checkouts with an explanation.
  Stale estimates, if displayed, show age and cannot be used to confirm a derived order.
- An administrator override requires reason, direction, exact rate, effective time,
  expiry and audit. Proposed maximum duration is 24 hours; expiry does not rewrite any
  quote already converted into an invoice. No silent provider fallback or best-rate shopping.
- Show last successful refresh, observation time, next scheduled attempt, quarantined
  candidates and failures. External alert delivery/named operators remain launch gates.

Market reference rates are not guaranteed bank/gateway buy/sell rates. Gateway fees,
spread and actual settlement evidence must remain separate from reference conversion.

## 6. Proposed persistence and API contracts

Names below are design proposals, not implemented tables/routes:

| Component                    | Minimum evidence/constraints                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Currency definitions         | Code, exponent, version, current/historical status, metadata provenance; immutable referenced versions                                                     |
| Installation currency policy | BDT base, BDT default, USD preferred secondary, per-currency display/sales/collection capability, revision; base locked once history exists                |
| FX snapshots                 | Provider/base, observed/fetched UTC times, bounded exact decimal/rational values, identity hash, acceptance/quarantine evidence; accepted values immutable |
| FX override                  | Pair, exact ratio, actor/reason, effective/expiry UTC times, supersession; append-only evidence                                                            |
| Price publication            | Source BDT price, target price, accepted snapshot/override, rounding version, publication revision; preserve existing price-row lineage                    |
| Order quote                  | Owner/session binding, immutable captured request/amounts/provenance, expiry, consumed order; unique submission/consumption guard                          |
| Financial provenance         | Invoice/order conversion and currency-definition snapshots, origin including imported history; absent legacy FX stays explicitly unknown                   |
| Reporting valuation          | Separate immutable report/as-of valuation evidence; never part of invoice balance or payment verification                                                  |
| Migration source links       | Source installation/class/ID to target identity, protected evidence reference, checksum and reconciliation status; collision-safe idempotency              |

Build forward/additive migrations. Nullable provenance for pre-existing records must
mean unknown/not applicable, not fabricated BDT conversion at today's rate. Preserve
the existing money JSON shape where possible; add validated optional evidence and
versioned aggregate contracts. Do not rename the old localization field in a single
breaking migration: add separate explicit currency policy and migrate consumers together.

Suggested routes: `GET /currencies/public` for capabilities, not raw feeds;
`POST /orders/quotes` and existing order confirmation for captured quotes;
full-only `GET/PATCH /settings/currencies` plus separately guarded rate-refresh/override
actions. These are not permissions to call a real provider. Customer preferences are
session-owned; CSRF, strict runtime validation, ownership, rate limits and staff grants
apply. All mutations have captured targets/revisions and reject stale concurrent edits.

## 7. Collection, refunds, credits and reports

- Each payment is in its invoice currency. Callback signature, merchant, amount,
  currency, event uniqueness, invoice and replay checks remain unchanged.
- A USD invoice cannot be marked paid merely because a BDT transfer approximates its
  total. Cross-currency settlement requires a separately authorized explicit settlement
  and reconciliation model; it is excluded from the initial currency implementation.
- Manual collection must have an approved destination for that currency and verified
  same-currency evidence. Do not assume today's BDT instructions work for USD.
- Refunds/reversals reference original payment money in its original currency. Never
  derive refunds using today's rate. Preserve cumulative refund limits and provider
  authorization. Different bank settlement values are additional evidence, not edits.
- Partial-payment policy remains disabled. Multi-currency does not authorize partial
  payments or a customer credit-wallet feature. Imported credits need a separately
  reconciled per-currency migration treatment before those records are usable.
- Customer/admin invoice balances and financial dashboard metrics use arrays/groups
  by currency, with explicit zero/empty states. No mixed sum and no multi-currency 500
  error. Counts remain counts across the stated scope, not currency-converted numbers.
- Optional BDT equivalents are labelled reference valuations, separately from original
  totals. Start with per-currency originals; consolidated reporting is a later slice.
  Define observation date, rate provenance, rounding and coverage for any valuation.
  Missing historical rates produce an incomplete result with excluded currencies/counts,
  not zero, a current-rate substitution or a purported complete total.
- Invoice and cash-collection dates remain different concepts. Actual realized FX and
  statutory accounting/tax reports are outside this design. Exports retain each row's
  original currency and unit metadata; any valuation columns are separately labelled.

## 8. Administrator and customer experience

Administrator settings: **Currencies** with BDT base/default and USD secondary shown
separately. A currency table shows name/code, unit precision, display/sales/collection,
available payment routes and blockers. Separate **Exchange rates** status, refresh
history and overrides from **Product prices** (fixed/derived and publication preview).
Base changes are unavailable after history exists. Disabling a currency previews affected
new sales/collection and explains that existing invoices/services remain unchanged.

Storefront: a labelled keyboard-accessible selector, BDT first and USD second, followed
by reviewed available currencies. Use code plus amount rather than an ambiguous `$`.
Changing currency resets/requotes a selected purchase explicitly; retain the intended
product/period/domain through sign-in. Show **Estimated conversion** when collection is
unavailable. Do not make an estimate look like a payable price.

Checkout: show selected invoice currency, final amount, fixed/derived pricing, quote
expiry and available payment method. On expiry show **Price updated — review before
continuing**; never auto-submit the replacement quote. An FX refresh cannot override a
write success notice or replay confirmation. A read-only GET failure after success is
handled as a refresh problem, not a failed payment/order.

Portal: display original currency prominently on invoices, PDFs, payments and services.
The home shows outstanding balances separately, for example **Amount due in BDT** and
**Amount due in USD**, linking to matching invoices. Preferred browsing currency never
rewrites those cards. Show unavailable collection with **Contact billing support**.

All authored labels use sentence case; currency codes and historical/user facts retain
exact case. Test screen-reader labels, keyboard control, 375px mobile layout, long names,
large integer values, loading/empty/error/stale states and explicit confirmation messages.

## 9. Speed Host WHMCS rehearsal

Read-only Chrome inspection on 2026-10-06 showed WHMCS 8.1.3 and configured BDT/USD.
The legacy UI indicated USD as its base. That is source evidence, not permission to
change the legacy base or adopt its configured exchange rate as a current market rate.
The new installation can start with BDT base while retaining every imported USD record
in USD. Do not change the existing WHMCS currency configuration.

Available client/service/invoice/transaction export field lists were inspected, not
downloaded. Invoice report fields do not include line items. Service fields include
passwords: exclude those, provider secrets, authentication hashes and unnecessary private
notes. No export/sample, source schema or isolated target has been supplied or created.

Rehearsal gates:

1. Agree a protected, anonymized source sample and allowlisted isolated target. Determine
   source currency IDs/codes, decimal precision/timezone, product/cycle mapping and full
   linked customers, services, invoices, invoice lines, payments/refunds and credits.
   Do not reconstruct missing lines from totals or scrape all private data through Chrome.
2. Parse source decimal amounts exactly. Validate header/line/payment currency joins and
   original statuses/totals/credit/tax snapshots. Quarantine inconsistencies or unsupported
   classes; no silent conversion, credit omission, fabricated rates or rounding away errors.
3. Retain source identifiers, immutable amounts/currencies, invoice numbers and service
   recurring currency/price. Unknown historical FX remains unknown. A source paid/active
   status is imported evidence, not a new gateway verification or fresh hosting action.
4. Keep outbound mail, gateway callbacks/collection, workers/scheduler and all hosting/
   registrar/renewal mutations disabled. Real credentials stay absent. A public staging
   hostname alone is not a protected replica destination.
5. Reconcile counts AND financial line/header totals, paid/balance/refund/credit amounts
   grouped by currency, source ownership/links and renewal dates. Rerun checks for duplicates
   and unchanged historical hashes. Per-currency reconciliation is authoritative; an FX
   grand total is not sufficient.
6. List unsupported items and retain-source responsibilities explicitly. Customer credit,
   unknown legacy cycles/domains/add-ons and gateway subscriptions require decisions,
   not a claim that the replica is complete. Retain recovery, source-freeze/final-delta,
   one-billing-authority and separately confirmed cutover gates.

## 10. Acceptance tests and delivery boundaries

Required before functional activation:

- Currency registry/retired-code handling, exponent snapshots, strict parsing, canonical
  BigInt strings, overflow, invalid rates, zero identity, half-even ties, zero/two/three
  decimal conversions, quantities and header/line equality; no floating-point money.
- USD-based cross-rate direction from one snapshot; precision-preserving provider JSON,
  invalid/oversized responses, missing currencies, future/stale timestamps, replay and
  conflicting identities, quarantine/override expiry, no silent fallback or secret leakage.
- Concurrent refresh/publication/order confirmation, stale policy edits, quote ownership/
  expiry/sign-in claims, identical and conflicting idempotency replays, no duplicate writes.
- Rate updates/preferences/currency disabling preserve issued invoices, contracted renewals
  and refunds; authenticated same-currency payments only, replay/ownership/MFA/CSRF intact.
- Mixed BDT/USD portal/dashboard/PDF/email/export correctness without hidden records,
  mixed sums or 500 errors; missing valuations explicitly incomplete; mobile/keyboard UI.
- Fictional isolated import reruns, per-currency financial reconciliation and no outbound
  mail/provider/automation effects; source passwords/data never enter Git or test fixtures.

Delivery sequence, each needing separate authorization:

1. Commands 93 and 95 have delivered validation-boundary repairs and bounded tooling
   mitigations. The Command 95 phase review verified their acceptance evidence. Full
   audit still reports two development-tooling advisories; mitigation is not upstream
   closure or owner residual-risk acceptance. Keep mitigation verification and the
   production audit gate; separately review any changed exposure before activation.
2. **Command 96 — Build the exact currency arithmetic foundation** was authorized,
   delivered and phase-reviewed on 2026-10-07, with local and exact-head hosted evidence
   in the progress report. Pure
   shared metadata contracts, bounded exact-rational/decimal-string arithmetic and
   fictional zero/two/three-decimal tests do not connect application consumers or activate
   billing. Do not ship a maintained currency dataset without verified source rights.
   A production registry/capability policy, adapter, database backfill and pricing effects
   remain later, separately authorized slices. See the bounded command definition in
   [command tracking](../CODEX_DEVELOPMENT_COMMANDS.md).
3. **Command 97 — Build explicit currency policy and capability contracts** was separately
   authorized, delivered and validated locally and at the exact source head on 2026-10-07.
   Keep it unused: strict explicit metadata bindings,
   independent capabilities, historical lookup and pure revision/base-lock validation.
   It cannot establish real provider routes, enforce database transitions or enable sales.
   The owner-authorized phase review accepted its engineering scope without activating it.
4. **Command 98 — Persist immutable currency unit definitions** was separately authorized.
   Implementation and local acceptance completed on 2026-10-07: empty unused version store,
   exact bounded lookups and database immutability/replay checks using fictional tests.
   Corrected-head hosted acceptance and the owner-authorized phase review passed.
   No live registry or policy.
5. **Command 99 — Persist immutable currency policy revisions** was separately authorized: empty unused
   complete revision snapshots with exact stored-unit context, immutable/replay guarantees
   and fictional SQL/history acceptance. Complete local and exact-head hosted acceptance
   passed; the owner-authorized phase review accepted the engineering scope.
   Active policy selection/initialization, base-history concurrency and financial provenance
   remain separate; no selected policy or caller-history authority is added by snapshot storage.
6. **Command 100 — Design authoritative currency policy selection and legacy-history
   safeguards** was separately authorized and completed on 2026-10-07: real writer map,
   initialization/history states, guarded Read Committed coordination, exact-unit/legacy
   adoption rules, security/audit and fictional acceptance matrix. No runtime state/source
   change or activation. Exact-head CI/CodeQL and the owner-authorized phase review passed.
7. **Command 101 — Build a read-only currency adoption preflight** is defined only, not
   authorized: unused database entry, one bounded read-only snapshot, exact counts and
   explicit unknown/truncation limits. It cannot grant selection/adoption authority or
   live-data access; no migration, runtime consumer or registry publication.
8. Later additive policy/provenance services and per-currency reads; preserve legacy records and
   pass mixed BDT/USD portal/report tests before an import rehearsal.
9. Fixed BDT/USD catalogue, ownership-bound quotes and confirmed same-currency collection
   paths. Use fake providers; real USD payment approval is separate.
10. Rate-adapter sandbox evaluation, reviewed terms/credentials and proposed operational
    defaults, followed by guarded derived-price publication and additional currency tests.
11. Protected WHMCS sample/import rehearsal with reconciliation and separate owner review.
    Actual source export and target controls may be assessed earlier, read-only, by authority.

Remaining decisions: exact supported sales currencies and payment destinations, fixed
versus derived catalogue prices, provider/plan/licence, refresh/staleness/deviation/override
thresholds, quote expiry/rounding acceptance, reference valuation policy, legacy credit and
unsupported-record treatment. No empty field defaults to operational approval. No part of
this sequence activates providers, deploys changes or authorizes production cutover.

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
  The owner subsequently authorized Command 101's unused read-only adoption preflight;
  its entry and fictional tests passed complete local and exact-head CI/CodeQL acceptance
  at `1795160`. The owner-authorized phase review accepted the scope and defines
  Command 102's unused coordination transaction primitive. The owner subsequently authorized
  that helper and fictional acceptance on 2026-10-07; implementation and complete local
  and exact-head CI/CodeQL acceptance passed at `fdcaea6`. The owner-authorized phase
  review accepted its unused engineering scope and defines Command 103's unused SQL
  coordination guard prototype only. The owner subsequently authorized its pure renderer
  and mandatory fictional SQL acceptance on 2026-10-07; complete local acceptance passed
  on 2026-10-08, with canonical and exact-head CI/CodeQL delivery at `2c05dce` verified.
  The owner-authorized phase review accepted its unused scope and defines Command 104's
  unselected control storage only. The owner subsequently authorized that slice on
  2026-10-08; inert storage and its unused entry were delivered at `73e31bd` with complete
  local/exact-head acceptance. Its phase review was delivered at `3fd2def`; the owner
  authorized Command 105's documentation-only implementation specification on 2026-10-08.
  Command 105 was delivered at `64c1713` with exact-head CI/CodeQL success. Its owner-
  authorized phase review accepts the specification and defines Command 106's isolated
  privilege acceptance harness only; implementation is not authorized by this review.
  The owner subsequently authorized Command 106 on 2026-10-08; its P1-only test harness
  was delivered at `fb86cca` with complete local and corrected exact-head hosted acceptance.
  Its owner-authorized phase review on 2026-10-09 accepts P1 engineering scope; a fresh
  full audit found three additional Handlebars tooling advisories, including two critical.
  The owner subsequently authorized Command 107; the narrow repair was delivered at
  `ecfdd16` with complete renewed local and exact-head hosted acceptance. Its owner-
  authorized review accepts tooling scope on 2026-10-09 and defines Command 108's unused
  selection request contracts only (P2a). That review was delivered at `ae067c0` with
  exact-head CI/CodeQL success. The owner subsequently authorized Command 108; its
  unused request decoder was delivered at `a1fcbb6` with local and exact-head hosted
  acceptance. Its owner-authorized review accepts P2a and defines documentation-only
  Command 109's canonical authority binding specification, not its implementation. The
  owner subsequently authorized that documentation slice, delivered at `3c4606c` with
  exact-head CI/CodeQL acceptance. Its phase review on 2026-10-10 accepts the specification
  and defines Command 110's empty identity storage only, not its execution. P2 authority
  storage is not implemented. No production authority is installed.
  Temporary test installation is not product adoption.
  The selection protocol is not implemented or activated.
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
approval, existing-scope cleanup or deployment is authorized by that review. The owner
subsequently authorized only Command 101's preflight implementation below.

## 3b. Read-only currency adoption observation — Command 101

`@webhost-billing/database/currency-adoption-preflight` is a separate unused entry.
`inspectCurrencyAdoption` receives an explicitly injected transaction-capable Prisma
client and strict `{ schema, limits? }` input. It owns a top-level Repeatable Read
transaction and sets/verifies READ ONLY before data reads. No root export, application,
HTTP/CLI consumer, self-created connection, environment discovery or module-load I/O.
This implementation is not permission to query live or WHMCS data.

Targets use bounded full-string lowercase ASCII schema identifiers and fixed qualified
table names; system schemas are rejected. A catalog check requires all eight sources to
be actual ordinary tables, not missing/foreign/view substitutes. Local search path is
`pg_catalog`; fixed functions/collation are qualified. Local `row_security=off` causes
filtered non-owner RLS reads to fail rather than silently return partial/empty counts;
it grants no privilege. Missing tables/permissions/modes or malformed stored observations
return a redacted observation failure without partial counts or raw SQL/connection cause.

Every row in the seven money tables is counted, including inactive/retired/deleted prices,
draft/cancelled/paid-zero invoices, failed payments, terminated services and soft-deleted
customers. Six history tables are distinguished from configuration prices. Count strings
are validated as canonical nonnegative PostgreSQL BIGINT counts and computed with BigInt,
not Number. At most 33 shape-valid code groups are fetched per table in deterministic
ASCII order; 32 are displayed, with explicit truncation and exact omitted-row count.
Malformed/null code rows receive a separate unresolved count without exporting raw labels.
Shape-valid unknown codes are visible, not declared supported; codes do not establish units.

Gateway results contain only total, linked/unlinked and SQL-non-null normalized-payload
presence counts, not payload content, validity or obligation reconciliation. No money
columns/sums, decimal rendering, record/customer IDs, policy/metadata lookup, base inference
or readiness/eligibility verdict. `financialHistoryObserved` is an advisory snapshot fact,
not a persistent latch. Selection authority remains unimplemented; writer/adoption coverage,
legacy provenance and gateway consistency remain unresolved even with an empty result.
The database supplies canonical UTC observation time; results can immediately become stale.

Default ceilings: two seconds acquisition, 500 milliseconds lock, two seconds statement
and ten seconds transaction. Explicit overrides must be strictly positive integers at or
below those ceilings; unknown fields, null/undefined budgets and authority flags reject
before work. Database-local lock/statement/transaction deadlines complement the client's
maxWait/transaction timeout. No retries, Promise.race-only timeout or swallowed aborted
statement. Success returns after commit; failures roll back. Pooled defaults/roles remain
unchanged. COUNT/GROUP may scan entire tables and consume resources despite LIMIT; this
is not a constant-cost/zero-I/O audit or an activation assessment.

Mandatory source and actual PostgreSQL acceptance are wired into the database package's
existing root/CI path. Fictional tests preserve all current row snapshots, previous unit/
policy/history assertions and the unchanged 24 migrations. Restricted-role tests use
existing built-in roles transaction-locally, never create/grant production roles. Read-only
write rejection verifies SQLSTATE 25006. Snapshot interleaving, overflow, acquisition/
lock/statement/transaction failure, connection reuse/local-setting reset, RLS/permissions,
qualified decoys and missing tables are tested in newly marked owned loopback scopes.
No production hooks or arbitrary callback are exposed by the entry.

No selected pointer/latch/guard/ledger/proof, writer adoption, financial provenance/backfill,
registry publication, formatting/aggregate repair, provider, real import or deployment.
The separately authorized phase review accepted the delivered scope below.

### Command 101 review and Command 102 boundary

On 2026-10-07 the owner-authorized review accepted Command 101 at
`17951608eae4622bd88033e44b02bcb5bc467bbe`. Fresh database acceptance passed all thirty
source tests, nine unit SQL, ten policy SQL and eleven preflight SQL scenarios, followed
by guarded seed/verifier. Source-head CI Validate passed all 28 steps and CodeQL all eight;
PR-only Dependency review was skipped on push, not passed. No in-scope defect or runtime
consumer was found. Observational unknowns, scan costs, pool/deadline behavior and stale
results remain accurately bounded; stored candidates or empty counts grant no authority.

Define **Command 102 — Build an unused currency coordination transaction primitive**
before state/guards or financial-writer integration. Own an explicitly Read Committed,
read-write top-level transaction with verified local/client deadlines and a dedicated
schema/database-scoped transaction advisory lock. A trusted server-code body executes
only after lock acquisition, with later statements seeing the predecessor's commit.
Freeze one qualified SQL-derived key contract for future matching guards; no supplied
keys, session locks, cached authority, schema fallback, retry or external calls. The
body is not a JavaScript sandbox or an authenticated financial permission. A final
in-transaction verification must reject caught aborted SQL or changed required modes,
not acknowledge a commit that actually rolled back. Transaction
ownership prevents a helper accidentally acquiring and releasing a lock in autocommit.

An explicit trusted composition choice takes existing staff mutex `920006` first where
needed, then currency coordination; no arbitrary pre-lock body or auth row lock is added.
That choice authenticates nobody. Full-administrator/session/MFA/CSRF, locked auth facts,
control/business ordering, one-use proof, atomic ledger/audit and ordinary-SQL enforcement
remain future integration requirements. Database deadlines cannot cancel arbitrary
JavaScript or undo external effects; the body permits database-only trusted composition.

Mandatory new fictional tests must prove actual same-schema serialization, post-wait fresh
visibility, staff ordering, rollback/deadline release, independent owned schemas, qualified
decoys, wrong-mode denial and unchanged pool defaults/locks. Nonparticipating SQL must
remain demonstrably outside advisory protection. This is cooperative unused infrastructure,
not installed writer coverage, an initialization/base lock or adoption eligibility.
Keep all 24 migrations and previous history/preflight tests intact. No singleton/latch/
selection/ledger/proof/SQL guards, grants, financial/auth/worker consumers or provenance
changes. The exact scope and full acceptance are in [command tracking](../CODEX_DEVELOPMENT_COMMANDS.md).

The transaction lock and fresh-statement requirements follow primary PostgreSQL
[locking](https://www.postgresql.org/docs/18/explicit-locking.html) and
[isolation](https://www.postgresql.org/docs/18/transaction-iso.html) documentation;
the primitive and its proposed scenarios are not implemented or tested by this review.
Later complete writer/SQL protection and owner-approved drain/adoption/recovery remain
necessary before selection. No live data, metadata rights, policy activation, operating
approval, import, existing-scope cleanup or deployment follows from this definition.

## 3c. Unused currency coordination transaction — Command 102

The owner separately authorized this implementation on 2026-10-07.
`@webhost-billing/database/currency-coordination` is a separate unused entry, not a root,
application, HTTP or CLI consumer. `withCurrencyCoordination(client, input, body)` accepts
an injected transaction-capable client and strict `{ schema, staffMutex, limits? }` facts.
The schema is an explicit bounded lowercase ASCII identifier; missing/system schemas or
missing schema USAGE fail, never fall back. `staffMutex` must be `required` or `not_required`
as an explicit trusted server composition choice, never an actor/MFA/browser permission.

It owns one explicit Read Committed/read-write transaction. Local search path `pg_catalog`,
`row_security=off` and positive lock/statement/transaction deadlines are set and verified,
with client acquisition/transaction bounds. Default ceilings remain 2 seconds acquisition,
500 milliseconds lock, 2 seconds statement and 10 seconds transaction; only shorter
positive integer overrides are accepted. No caller-owned transaction, environment discovery,
client construction, module-load I/O, external operations or automatic retry.

The frozen PostgreSQL two-int key contract is:

```sql
pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('webhost-billing.currency-coordination.v1:' || pg_catalog.current_database()),
  pg_catalog.hashtext($1::text)
)
```

`$1` is the validated explicit schema, not a caller key or search-path fallback. Future
SQL guards must use the identical namespace/formula in the same database; PostgreSQL
upgrade/rename/restore and writer adoption require separate review, not client-side hash
computation. Hash collisions can over-serialize, never admit independent same-key writers.
The two-int space is distinct from existing single-bigint staff/scheduler/payment keys.
Where required, fixed staff mutex `920006::bigint` is acquired before this currency lock.
No arbitrary pre-lock body, auth row lock, control/history lookup or financial mutation.

Lock acquisition is its own statement. Verify modes, schema permission/identity, backend/
actor identity and actual granted exclusive advisory locks through qualified `pg_locks`
before invoking the body. Body statements obtain fresh Read Committed snapshots after
waiting; Command 101's Repeatable Read observation is not reused inside this transaction.
After the body, repeat verification: caught aborted SQL, changed modes/deadlines/role/
schema identity or missing required locks must not return success. The body returns void;
any runtime return value rejects, so no transaction handle, release function, policy receipt
or authority token escapes as the helper's result. Success resolves only after commit.

The body is trusted database-only server code: no transaction/session control, session
advisory locks, detached work, external/file/provider effects or retries. This is not a
JavaScript sandbox or financial/body-SQL guard; arbitrary injected clients, getters and
violating body code remain trusted powers. Deadlines abort database work, not JavaScript
or external effects. Ordinary failures roll back; an unobserved network failure during
commit can leave outcome uncertain, so this helper never retries or asserts that every
failed acknowledgement proves rollback. Future financial idempotency/receipts are separate.
Safe errors retain no raw body/SQL/connection cause or partial response. Helper-owned
transaction locks/local settings release/reset at transaction end; no session unlock calls.

Nine new mandatory source tests and eleven actual PostgreSQL scenarios cover strict
input/no-I/O boundaries, fixed key/ordering, commit-gated void results, serialization/fresh
reads, rollback and deferred commit failure, staff-first waiting, all four deadlines/reuse,
caught aborted SQL, mode/role/returned-handle denial, pool defaults/lock release, independent
owned schemas and explicit-target decoys. Nonparticipating SQL demonstrably bypasses
advisory coordination. Tests use only new nonce-marked loopback scopes and temporary probe
rows; owned probe cleanup preserves the unchanged seed/verifier table assertions. All prior
financial/settings/unit/policy/audit/outbox rows and 24 migrations/history comparisons remain.

Complete local acceptance passed, including full root/API/invariant tests, both browser
gates, lint/types, production builds and retained security controls. Delivery at
`fdcaea6b086593260b71c198efc99f18d373f769` passed exact-head
[CI 37654981028](https://github.com/ebit101/webhost-billing/actions/runs/37654981028)
(28 Validate steps) and [CodeQL 37654980978](https://github.com/ebit101/webhost-billing/actions/runs/37654980978)
(eight steps). PR-only review skipped on push, not passed. No selected policy/control/
latch/guard/proof/ledger, grants, financial/auth/worker consumer, provenance, registry, live
query/import, operating approval or deployment. The subsequently owner-authorized review
accepted the scope; cooperative serialization is not installed writer coverage or
permission to initialize/activate currencies.

### Command 102 review and Command 103 boundary

The owner-authorized phase review on 2026-10-07 found no in-scope source defect. Fresh
acceptance passed 39 database source tests, nine unit SQL, ten policy SQL, eleven preflight
SQL and eleven coordination SQL scenarios, followed by guarded seed/verifier, four library
builds, strict database types and 93 shared cases. Source-head CI/CodeQL were freshly
verified separately; their full application/browser acceptance is not a claimed fresh
local rerun by this documentation-only review. All 24 migrations remain unchanged.

Define **Command 103 — Build an unused SQL currency coordination guard prototype** as
the next smallest normal-SQL coordination proof, not another selection design or an
application guard rollout. A pure separate database entry renders fixed qualified SQL
from an explicit bounded schema; it does not execute DDL or expose an installer. Only
mandatory guarded tests may install it atomically in fresh nonce-owned fictional schemas,
then remove their objects under marker checks before the unchanged seed/verifier.

Propose fixed VOLATILE SECURITY INVOKER BEFORE STATEMENT DML triggers for the seven money
tables plus settings/payment_events, sharing exactly Command 102's two-int key. Reject
prototype TRUNCATE. Validate actual trigger schema/table/OID and supported ordinary-table
context; no custom targets, keys, function bodies or exemption flags. No SECURITY DEFINER,
global roles/grants, staff/auth lock or automatic retry. Callers establish bounded positive
deadlines and Read Committed/read-write in earlier statements; the trigger verifies them,
preserves shorter limits and takes only the currency transaction lock.

This is a proposed engineering slice inferred from PostgreSQL's
[trigger behavior](https://www.postgresql.org/docs/18/trigger-definition.html),
[function snapshots](https://www.postgresql.org/docs/18/xfunc-volatility.html),
[advisory functions](https://www.postgresql.org/docs/18/functions-admin.html) and
[deadline semantics](https://www.postgresql.org/docs/18/runtime-config-client.html).
Acquisition inside a trigger cannot refresh the initiating DML snapshot or undo earlier
row locks. Changing an in-flight statement's timeout is not an adequate boundary. Future
policy validation requires separate post-lock volatile queries; adopted application writers
must still take coordination before authoritative reads and existing business locks.

Future acceptance must exercise actual non-owner writes using existing roles locally,
all nine targets/statement forms, both helper/SQL wait directions with real lock evidence,
commit/rollback release, reentrancy, independent scopes, decoys, modes/deadlines and safe
reversed-order failure. Show initiating-statement versus later-read snapshot limits.
Preserve every prior row outside explicit fictional probes and all existing source/SQL/
migration/history controls. Non-owner inability to alter triggers is not a proof of deployed
runtime privilege hardening; owner/migration bypass remains a separately recorded power.

No prototype exists or is installed by this review. It would enforce coordination only in
test scopes, not currency units, policy capabilities, history latch, provenance or actor
intent. Product behavior remains legacy and uncoordinated. Selection/state/ledger/proof,
per-row validation/privileges, full writer adoption/drain, legacy evidence and recovery
remain required before activation. Metadata/source/provider/operating approvals, real-data
access/import and deployment stay separate. The owner subsequently authorized Command 103
as recorded below, not any application installation.

### Implemented Command 103 prototype boundary

The separate unused database entry
`@webhost-billing/database/currency-coordination-guards` exports only
`renderCurrencyCoordinationGuardPrototype`. It accepts exactly an explicit non-system
ASCII schema identifier and produces fixed SQL, without a client or executing installer.
No root/application/CLI consumer, migration, role, grant or provider is added.

The generated VOLATILE SECURITY INVOKER function has a fixed catalog search path,
qualified catalog calls and exact actual table/schema/OID/trigger context checks. Nine
ordinary targets receive before-statement insert/update/delete coordination plus truncate
refusal. Their two-int transaction key is identical to Command 102, derived from actual
table schema and current database. Catalog identity is not policy or actor authority.
Views, foreign/partition/inheritance contexts are rejected, not supported by assumption.
Errors inside the function are rethrown safely; native permission/read-only/DML errors or
fatal server disconnects outside its body retain PostgreSQL semantics. No retry or
swallowed success, transaction/session handles or session advisory locks.

Read Committed/read-write and positive lock/statement/transaction settings at most
500/2000/10000 ms are required. Caller setup is in earlier commands, never an in-flight
statement deadline rewrite. **Settings are not proof of the internal timer:** PostgreSQL
[only enables an inactive transaction timer when assigning a positive value](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/tcop/postgres.c).
Changing an already-positive value to a shorter value does not rearm its active timer.
Tests demonstrate this behavior rather than claim the renderer solves it. Trusted raw
callers must establish their first active budget correctly (or have an independent
deadline); Command 102 also has its own bounded client transaction. The prototype cannot
certify prior setup history, prevent a privileged caller changing settings afterward,
refresh the initiating DML snapshot or repair a row-first lock order. Future runtime
adoption still requires separately reviewed connection/deadline/writer/privilege controls.

Only mandatory test code installs it atomically. The test process creates its own nonce
schemas, applies all 24 unchanged migrations and verifies marker, model/raw/loopback
identity before installation. It rejects target/name collisions before DDL and verifies
all 18 triggers/function properties afterward. The existing `pg_write_all_data` role
executes permitted no-row insert/update/delete on every target and real copy input; it
cannot disable/drop/replace guards or set replication bypass. That built-in role lacks
SELECT, so read-dependent conflict/merge/nested/snapshot/row-lock fixtures use the
fictional owner without granting privileges. Owner/superuser bypass remains a residual
power, not deployed-role hardening or solved ordinary-SQL writer coverage.

Controlled barriers and real locks cover both helper/SQL wait directions, commit/rollback
release, reentrancy, explicit shorter settings, independent schemas and qualified decoys.
Ordinary writes, copy input, conflict/merge/nested/no-op paths, all-target truncation,
wrong modes/budgets and misattachments are mandatory, with initiating-snapshot and
reversed-order counterexamples. Baselines compare all existing rows in both the parent
acceptance scope and the newly owned prototype scope. Explicit fictional settings probes
are rolled back or removed. Exact installed triggers/function are marker-verified and
removed before scope deletion and the unchanged launcher seed/verifier. No existing
application/test scope, cache, migration history or real customer data is adopted.

The owner-authorized phase review on 2026-10-08 verified source-head
[CI 37665607889](https://github.com/ebit101/webhost-billing/actions/runs/37665607889)
(28 Validate steps) and
[CodeQL 37665607804](https://github.com/ebit101/webhost-billing/actions/runs/37665607804)
(eight steps), completed successfully at `2c05dce1e5bbfe542cb1bba479b799187140c073`.
PR-only Dependency review skipped on push, not passed. Fresh local acceptance passed
42 source and 56 SQL cases plus the unchanged seed/verifier. No runtime consumer or
in-scope source defect was found; this accepts the prototype, not policy enforcement.

Clarify the error boundary: the caught-error tests catch in JavaScript without SQL
recovery, then prove the transaction remains aborted. An explicit
[savepoint rollback](https://www.postgresql.org/docs/18/tutorial-transactions.html) or
[outer PL/pgSQL exception block](https://www.postgresql.org/docs/18/plpgsql-control-structures.html)
can recover a SQL error and retain earlier work. The renderer cannot prohibit raw
callers doing that. This is a source-backed qualification, not an additional executed
Command 103 test or claim of safe workflow recovery. Command 102's trusted body
forbids transaction/session control; adopted business workflows must propagate failure
and provide their own complete atomic boundary. Preserve uncertain commit outcomes too.

### Command 103 review and Command 104 storage boundary

Define **Command 104 — Stage unselected currency control storage**, not another lock
prototype or premature policy activation. Add one future additive `currency_controls`
store and separate unused stage/read entry. Its migration is empty; explicit staging
under Command 102 may create only one constant key-1 row: generation `"0"`, selected
revision and exact base-anchor fields null, history latch null meaning **unknown**.
Absence and unassessed storage are different, but neither is initialization eligibility.
Never initialize history to false merely because the control row is new or some observed
counts are zero. This intermediate unknown state refines the proposed final state model;
it does not replace the permanent boolean latch once a future assessed state is approved.

Database checks admit only the complete unassessed shape. Ordinary update/delete/truncate
are denied, including empty statements; insertion/conflict-do-nothing can only replay
uncertainty. No seeded row, selected policy, history scan, latch setting, existing-table
trigger, global privilege or application consumer. Creating this inert row can coexist
with current writers because it makes no claim about them or history. The storage entry
must not compose separate preflight observations into an eligibility decision.

This future slice must prove concurrent staging, fresh qualified post-lock facts, exact
singleton/null/reference constraints, actual non-owner SQL mutation denial and safe
savepoint recovery boundaries in owned fictional acceptance. Preserve all 24 existing
migrations, prior-22/23 comparisons and previous gates; add prior-24 row preservation
and update total migration expectations only for the one new additive migration.
Complete local/exact-head hosted gates are required. No migration is implemented by
this review, and no live target is authorized for migration by defining the command.

Later assessed/latching states need a deliberately reviewed transition migration plus
fresh post-lock SQL validation, privileges, ledger/security proof, complete guard-first
writer adoption/drain, legacy evidence and bounded connection/deadline controls. The
active timer, initiating snapshot, row-first and owner/SQL recovery limits demonstrated
or documented above remain. No live selection/adoption, registry/FX/payment route,
real import, provider, operating approval, cleanup, release or deployment follows.
Ask for explicit Command 104 authorization and stop after review delivery.

### Implemented Command 104 storage boundary

The owner subsequently authorized the empty additive store and unused
`@webhost-billing/database/currency-control` entry. The migration itself creates no
row and reads no business history. Key 1 is internal, not a tenant ID; generation is
integer zero, returned as `"0"`. All nullable history/selection/anchor fields must remain
null by SQL check. Exact nullable policy/unit foreign keys restrict update/delete.
The proposed assessed state model above is deliberately not open in this migration.

`readCurrencyControl` and `stageCurrencyControl` accept only explicit schema, trusted
staff composition and shorter Command 102 budgets. They own that coordinated transaction,
read subsequent qualified facts after locking and return copied absent/unassessed facts
only after commit. No assessment, eligibility, chosen revision, handle, retry or root/
runtime consumer. Actual Prisma model relation locks are compared with qualified raw
catalog identities, including two empty stores; a raw/model mismatch cannot stage into
the wrong schema. Unsupported table kinds, privileges, RLS and corrupt facts deny.

The new table alone has invoker/fixed-path before-statement update/delete/truncate denial,
including empty statements. Direct constant insertion, conflict-do-nothing and COPY may
stage uncertainty, never history authority; conflict-do-update denies. SQL-supplied creation
timestamps are not provenance/approval evidence. Savepoint/outer-handler tests demonstrate
recoverable outer work without control mutation, not irrevocable workflow abort. Privileged
DDL, trusted clients and uncertain commit transport remain explicit residual powers.

Mandatory owned fictional tests preserve every prior-24 row and retain prior-22/23 and
Command 101/102/103 acceptance. The guarded verifier recognizes the new table but still
requires an empty control store after the unchanged fictional seed. The 24 old migrations
remain unchanged; the chain now totals 25. No application database is migrated by local
acceptance, and no live migration is authorized. Complete local acceptance, cached pinned
full-history scan (208 commits, no leaks), non-force canonical delivery and exact-head
CI/CodeQL passed at `73e31bd7942784b8f717728b484a407a902f08f7`, including the authorized
Next.js `16.3.8` repair. The owner-authorized phase review reverified CI's 28 Validate
steps and CodeQL's eight, and renewed 51 source/70 PostgreSQL cases plus seed/verifier.
No in-scope source defect or runtime consumer found. PR-only review skipped; development
advisories/mitigations, governance and launch gates remain without waiver.

### Command 104 review and Command 105 specification boundary

Define **Command 105 — Specify assessed-state transitions and activation prerequisites**,
not a migration that opens selection or a further disconnected authority helper. Command
100 already specifies the target protocol. The delivered storage and empirical snapshot,
timer, non-owner and recoverable-SQL constraints now require an implementation-ready
dependency plan before that protocol can safely become authoritative.

Command 105 was subsequently authorized, documentation-only. Resolve exact legal state
tuples, whether assessed-unselected facts persist at all, NULL and permanent anchor/latch
invariants, exact unit/exponent bindings, generation exhaustion and superseded revision
tracking. Specify an additive opening sequence without an unguarded writer-visible state;
retain the current 25 migrations and unassessed semantics until separately reviewed work.
Map current runtime/owner powers to proposed least-privilege transition/latch boundaries,
actor/session/action/body-bound one-use proof and atomic CAS/ledger/activity/replay behavior.
Neither SQL-supplied claims nor arbitrary ledger appends can certify human approval.

Refresh the source-grounded writer inventory and prescribe guard-first service/worker/
settings/numbering/callback behavior alongside normal-SQL exact row/state/unit/lineage
protection. State maintenance/drain/adoption and connection/deadline prerequisites. Account
for raw savepoint/outer-handler recovery rather than promising irreversible outer abort;
preserve committed-row-only history, allowed genuine draft-line replacement and historical
money visibility. No preflight count, caller-history flag or unknown row grants eligibility.

The specification must give bounded implementation slices, file targets, stop conditions
and mandatory fictional/non-owner/concurrency/security/preservation acceptance, with one
smallest later implementation candidate. Proposed test-only assessed fixtures cannot open
product states or weaken normal launchers. No current assessment, role/grant, proof/ledger,
executor, application/SQL writer adoption, real-data query/import/provider, approval,
cleanup, release or deployment. Its completed specification follows; no proposed slice
below is authorized for implementation by Command 105.

## 3d. Assessed-state implementation specification — Command 105

### Authority, baseline and observed gaps

Owner-authorized on 2026-10-08, source baseline
`3fd2defb54c7b3956225a0cbb1f54744b9691fcc`. This section specifies future implementation;
none of its states, privileges, proofs, ledger, lineage or adopted writers is installed.
It refines Command 100 using Commands 102–104, rather than replacing their delivered
contracts. All 25 migrations, runtime code, dependencies and mandatory tests stay unchanged.

Observed source: `packages/database/prisma/schema.prisma:CurrencyControl` and migration
`20261008090000_unselected_currency_control` allow only zero/null uncertainty. Existing
`currency-control.ts` cannot read an assessed row; it must fail, never reinterpret that
row as absent. `currency-coordination.ts` owns bounded transactions and returns void;
future services must capture copied facts internally and release them only after commit,
not return receipts through its trusted body or inject an already-open transaction.
`currency-coordination-guards.ts` proves statement coordination, not policy/row enforcement.

Production Compose passes the same `database_url` secret to migrations/API/workers.
`client.ts:createPrismaClient` selects a schema but establishes no privilege boundary.
No current code provisions separate non-owner transition/proof roles. Exact live ownership
and deployed memberships were not queried; source configuration is not an attestation of
live grants. Predefined-role probes cannot establish the proposed least-privilege model.

### Exact state tuples and transitions

Let `R` be an exact stored policy revision, `U` its exact base definition, `A` the base
anchor `(code, metadataVersion, minorUnitExponent)`, and `g` the selection generation.
All fields below refer to key 1; `created_at` remains its original staging time and is
not an assessment/approval time. Generation is BIGINT, serialized as canonical decimal
string, range `0`–`9223372036854775807`. No Number arithmetic or inferred ordering of R.

| State                    | Durable tuple                                                                                  | Permitted future operation                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Absent                   | No row                                                                                         | Read absence; explicit constant stage. Initialization/adoption may stage within its own trusted transaction, never by GET.                                  |
| Unassessed               | `g=0`, `R=NULL`, latch `NULL`, all A fields `NULL`                                             | Remain unknown, or trusted assess-and-select atomically after all prerequisites. No ordinary financial writes in a guarded installation.                    |
| Assessed unselected      | **Not a legal durable tuple**                                                                  | Transaction-local evidence only. No saved latch false/true without selection; proof references a preview, not an authoritative persisted emptiness verdict. |
| Selected history-free    | `g>=1`, R non-null, latch exactly false, complete A exactly U                                  | Confirmed replacement after fresh compatibility checks; first successful financial insertion may latch.                                                     |
| Selected history-present | `g>=1`, R non-null, latch exactly true, complete frozen A                                      | Compatible confirmed replacement only; R base code/exponent equal A, though a reviewed metadata version may differ.                                         |
| Invalid/unavailable      | Partial tuple, missing/inconsistent exact references, unreadable context or unsupported target | Deny new mutation/selection, expose safe review-required inspection. No fallback to latest, localization or BDT.                                            |

Future shape CHECK uses explicit `IS NULL`, `IS NOT NULL`, `IS TRUE` and `IS FALSE`
branches. Retain singleton/nonnegative checks and both existing RESTRICT foreign keys;
add an exact three-column anchor FK to immutable `(code, metadata_version,
minor_unit_exponent)` with the corresponding additive unique key. No unit rows change.
Qualified SQL validates R's base against A; a CHECK cannot establish cross-table policy
semantics. Ordinary-table/OID/raw/model/visibility checks remain mandatory.

Transitions are separate typed operations, not a generic control UPDATE:

- **Stage:** absent to unassessed, or identical unassessed replay; no history scan or
  generation increment. After privilege adoption ordinary writers lose control INSERT;
  the old staging entry cannot bypass that denial.
- **Initialize:** fresh locked proof of zero rows in all seven money-bearing tables
  and no payment events/unresolved adoption obligation; choose exact R and U, set g to 1,
  latch false and A=U. Existing prices, including retired ones, block this ordinary path.
  Even an unlinked/rejected gateway event requires reviewed classification, not automatic
  history-free initialization. Command 101 counts cannot provide this authority.
  Compare the preview's absent/unassessed state discriminator before any internal stage;
  another committed stage invalidates an absent preview. Staging inside the successful
  transition is not a new independently reusable assessment or a silent CAS relaxation.
- **Adopt:** separately approved exact legacy/configuration/evidence manifest, fresh
  verified coverage and no unresolved classes; g=1, R explicit, A from the approved base.
  Any of the six financial-history tables or linked obligation makes latch true. Prices
  or rejected/unlinked events alone do not fabricate financial history; a configuration-
  only adoption can be false only after their exact context and absence of obligations
  are authoritatively verified. No stored claimant boolean decides either case.
- **Replace:** exact expected R/g, new never-before-selected R, compatible complete context,
  one-use proof and fresh evidence. Increment g once. With latch false A follows the new
  base only after price/obligation compatibility; no implicit rescaling. With latch true
  retain A byte-for-byte and require candidate base code/exponent equal A. Same exponent
  alone does not approve new metadata; compatibility evidence is required.
  Effective history is stored latch OR fresh observed history/linked obligation. A stored
  false latch with committed history is an integrity inconsistency: deny ordinary base
  replacement and require reviewed repair/adoption, never freeze the proposed new base.
- **First history:** AFTER a successful inserted row in any of the six history tables,
  under the same key/control lock, change false to true and freeze current A. This is
  automatic integrity enforcement, not administrator selection. Keep g unchanged: it is
  a selection generation. No-op/conflict-nothing/failed insert cannot latch. Rollback
  removes both insertion and latch. Linked gateway evidence also blocks replacement;
  inconsistent event/payment links deny or quarantine, never clear history.
- **Replay:** a completed matching actor/session/body receipt returns its original result
  with no control/proof/audit change. It does not select an old R again. Current selection
  is reported separately. Reject conflicting keys/bodies/bindings and superseded R reuse.

At generation maximum, new selection denies before adding one; no wrap or reset.
Valid same-unit financial work and first latching do not need another selection generation.
Latching does invalidate a false-history preview despite unchanged g: the full control
tuple/evidence digest is rechecked, not just expected R/g. No assessed state may transition
back to unknown/absent, no true latch becomes false, and no delete/truncate/reset is legal.

### Privilege and trusted-execution contract

Role labels below are proposed duties, not installed names, memberships or credentials.
All are installation-local duties; PostgreSQL roles themselves are cluster-wide. Runtime
roles must not own tables/functions/schemas, inherit owner powers, use `SET ROLE` to a
trusted duty, create triggers/objects/extensions, bypass RLS or replication guards, or
obtain migration credentials. Owner/superuser compromise remains outside this protection.

| Duty                              | Proposed permitted authority                                                                                  | Explicitly denied                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Offline migration operator        | Install reviewed DDL/ACL atomically during approved drain; verify owner/membership/catalog manifest           | Ordinary API/worker connection or automatic deployment/selection                                           |
| Non-login object/function owners  | Own only reviewed objects; narrowly scoped function owners receive only required column/table privileges      | Login, superuser/role creation/RLS bypass, runtime membership, arbitrary dynamic SQL                       |
| Business writer, including worker | Read exact public currency context; guarded DML on approved business tables; genuine draft-line deletion only | Control/proof/selection-ledger/legacy-evidence DML or private proof reads; transition/proof issuer EXECUTE |
| Trusted proof issuer              | Isolated server-only credential/duty for locked auth/factor verification and narrow proof issuance            | Policy selection, control/ledger writes, arbitrary caller approval flags                                   |
| Trusted transition executor       | Narrow reviewed transition function EXECUTE and authorized receipt retrieval                                  | Issue/modify proofs, direct control/ledger writes, financial/provider operations                           |
| Trigger-only latch owner          | Validated successful-row trigger can set false to true with original A and append integrity evidence          | Select policy, clear latch, change A, issue proof or masquerade as human approval                          |

API business, proof and transition pools need separately supplied credentials or equivalently
proven isolated roles; an ambient runtime `SET ROLE` membership is not separation. The
proof issuer is trusted server code: SQL cannot establish that it actually verified a
human password/factor. Its compromise and theft of its isolated credential are residual
powers. The transition executor must still verify the stored one-use proof and locked
current auth facts, not trust its privilege as human intent. No GUC/token field/actor ID/
creation timestamp substitutes for this boundary.

Use VOLATILE narrow SECURITY DEFINER functions only where required, with minimal non-login
owners, fully qualified catalog/application objects, fixed `search_path=pg_catalog,pg_temp`,
explicit table/schema/OID/trigger checks and `row_security=off` visibility refusal. Revoke
PUBLIC/default EXECUTE and restrict signatures within the same installation transaction;
no public-access window. Deny ordinary control and selection-ledger mutation even for
empty statements. An owner-performed staging INSERT still certifies only uncertainty.
No callable generic latch/ledger setter. Trigger-only entry checks actual allowed target,
timing/operation and stored row; arbitrary attachment/direct call is not accepted.

These choices follow PostgreSQL's [function security](https://www.postgresql.org/docs/18/sql-createfunction.html),
[privileges](https://www.postgresql.org/docs/18/ddl-priv.html) and
[trigger creation](https://www.postgresql.org/docs/18/sql-createtrigger.html) rules. They
are design requirements, not executed privilege proofs. Test actual distinct login roles,
not just owner-side `SET ROLE`, including temporary-object/function overload attacks,
membership/default ACLs and inability to disable/drop/recreate guards or set replica mode.

### Proof, ledger, replay and atomic authorization

Source targets: `apps/api/src/modules/auth/services/auth.service.ts`:
`authenticateSession`, `verifyCurrentPassword`, `consumeEnabledFactor`; `totp.service.ts`,
`auth-token.service.ts`, `csrf.service.ts`, `auth-rate-limit.service.ts`, `auth-audit.service.ts`;
`guards/roles.guard.ts`; `modules/staff/staff.service.ts:lockAndAuthorize`; shared auth
contracts; Prisma user/profile/session/TOTP/recovery models. Staff locking currently
rechecks role/enrollment but not locked session freshness. RolesGuard does not universally
require full administrators to enroll MFA. AuthAuditService uses its own client, not a
caller transaction. Factor consumption in disable/regenerate flows currently precedes
their later transaction. None is a ready currency proof or transactional selection ledger.

Proposed strict confirmation request: action initialize/replace/adopt, exact proposed
revision, expected revision explicitly null or exact, canonical generation, UUID request
key and one opaque proof token. Schema/actor/session, history, anchors, approved/evidence
flags and definitions are server-owned, not request fields. Unknown/nested authority
fields reject. Existing 64-character revision, 32-entry/unit and schema limits remain.
Technical request ceiling 4 KiB; proof token is a 32-byte random base64url token (43 ASCII
characters); hashes/digests are 64 lowercase hex. No financial amount enters this request.

Preview is advisory/read-only; it does not save assessed control. Step-up/confirmation are
CSRF/origin-protected, rate-limited mutations using HttpOnly sessions. Require active,
email-verified full administrator, enrolled factor and a current MFA-verified session at
both service and trusted transaction boundary. Reuse bounded existing password/factor
parsers; password verification occurs outside long-held locks, then its exact verified
password/credential version is rechecked under locks. Consume the accepted TOTP step or
recovery code atomically with proof issuance, not via the current outside-transaction helper.
Recovery remains subject to enrollment/one-use rules, never a weaker bypass.

Proof stores only token hash, actor/session/credential binding, action, request key,
expected/proposed revisions/generation, immutable assessment/compatibility evidence IDs,
versioned digest, issued/expiry UTC and consumption-to-ledger reference. Five minutes is
the maximum proposed lifetime, shortened by session validity. Check expiry using fresh
database wall-clock at the guarded decision, not transaction-start CURRENT_TIMESTAMP.
Never persist password, factor/recovery value, bearer token or raw exports. Role demotion,
session/password/factor change or changed assessment invalidates unconsumed proof.
Actor/session references retain exact restricted identity. Credential/recovery binding
uses a non-secret immutable identity/version digest, not a FK that prevents the existing
MFA disable/recovery-regeneration deletions. Missing/replaced current credential denies
confirmation; preserve historical proof evidence without retaining factor secrets/codes.

Use two different server-owned SHA-256 digests over explicitly ordered UTF-8 JSON tuples:
`currency-selection-request-v1` fingerprints stable intent (installation, action, actor/
session, request key, supplied expected R/g and proposed R); it excludes the proof bearer
and mutable current facts, so identical completed replay can still match later.
`currency-selection-assessment-v1` binds that intent to the expected complete observed
control tuple/state discriminator, canonical immutable policy/exact units and immutable
evidence IDs/versions/digests. Use explicit nulls, exact string integers and ASCII-sorted
capability entries; object/member order must not change identity. No timestamp/latest
lookup or browser digest chooses authority. For a new operation, fresh full tuple/evidence
must match the proof's assessment digest. For a completed replay, compare stored stable
intent before imposing current-state equality; never recompute it from current selection.
This prevents both false-history proof reuse after latching and broken legitimate replay.

Proposed empty additive stores: `currency_transition_proofs`, `currency_selection_ledger`
and protected adoption/compatibility evidence. Proof bindings never mutate; only narrow
consume/expire operations may append or record consumption. Ledger has unique request
binding, unique resulting selection generation and unique newly selected revision,
exact previous/new R/g/A/latch, operation, actor/session, proof/evidence references, reason,
activity ID and database time.
Exact policy/unit/actor/session references restrict deletion; successful actor identities cannot
be hard-deleted. Superseded selection revisions are tracked from ledger, not policy creation
time. Ledger append alone is not selection: ordinary append is denied, and every success
must correspond to the atomic control CAS, proof consumption and transactional activity.
Latch integrity evidence is distinguishable from a human selection, not a forged receipt.

Trusted confirmation flow: lock and reauthorize, then check a matching committed receipt
before treating expected state as a new stale request. Matching replay needs current valid
actor/session but not a second consumption of the completed proof, even if that proof later
expires. Cross-session/actor/body replay denies; a different request must satisfy fresh proof.
After success, an unchanged request can retrieve only its original receipt, never assert
that its old selection is current. Receipt reads use the authoritative database, not cache.

One function/transaction performs complete validation, CAS, ledger/activity insertion and
proof consumption; no caller chooses which components to skip. Audit uses the transaction,
not standalone AuthAuditService.record. All validation and writes lie inside one atomic
function/subtransaction boundary, propagate failure and have deferred consistency checks
where needed. Outer raw savepoint/PLpgSQL recovery may retain earlier unrelated work, but
cannot commit a partial transition. A SQL function result is provisional until COMMIT;
the service returns copied JSON only after its owned transaction resolves successfully.
Unknown COMMIT transport outcome means outcome unknown, not proved rollback. No automatic
retry initially: supersede Command 100's proposed three-attempt default for this first
implementation. An explicit authenticated same-key receipt check resolves committed replay;
otherwise a reviewed new attempt is required. No provider/outbox/hosting effects for selection.

### Writer inventory refresh and row/lineage contract

The Command 100 map was rechecked against the source baseline, using Prisma write/raw-lock
searches and the relevant method bodies. Additions and non-obvious paths are explicit:

| Source target                                                                                                                      | Required guarded boundary                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/products/product.service.ts`: create/definePrice                                                                          | Before active-price reads, retirement/append and audit. Pin exact units; retired prices remain readable, no rescaling.                                                                                                      |
| `modules/orders/order.service.ts`: create/updateStatus                                                                             | Before replay/price/customer/numbering reads and order/item/invoice/status writes. Existing receipt replay does not create a new sale.                                                                                      |
| `modules/invoices/invoice.service.ts`: create/updateDraft/applyAction/updateBusinessIdentity                                       | Before authoritative state/CAS/numbering and settings writes. Keep draft edit atomics and historical issue boundary.                                                                                                        |
| `modules/payments/payment.service.ts`: submitManual/recordManual/review/adjust/updateSettings; `partial-payment-policy.ts`         | Before invoice locks/partial-policy lock, rejected status updates, balances, charge/adjustment append, audit/outbox.                                                                                                        |
| `modules/payment-gateways/payment-gateway.service.ts`: createSession/processNormalizedEvent/completeBkashCallback/reconcilePayment | Cover standalone session claim, provider-result/failure and reconciliation updates as well as transactional settlement/events. Provider I/O stays outside locks; each DB completion rechecks captured exact context.        |
| `modules/services/service.service.ts`: create/transition                                                                           | Before order-item/server/service locks and order status; inherit exact original obligation, never current browsing money.                                                                                                   |
| `modules/hosting-panels/hosting-panel.service.ts`: executeServiceOperation/completeSuccess/completeFailure/applyServiceSuccess     | Cover preparation, service provisioning/status and completion/order changes; do not retry the external operation with a DB transaction.                                                                                     |
| `modules/settings/settings.service.ts`: update                                                                                     | All settings DML coordinates; currency-sensitive row rules cover localization, numbering, payment policy and invoice identity; no second base pointer.                                                                      |
| `modules/renewal-automation/renewal-automation.service.ts`: updatePolicy                                                           | Currently reads localization then array-upserts both renewal policy and localization. Move reads inside fresh guard-first callback; prevent stale currency re-emission.                                                     |
| API `common/identifiers/invoice-number.ts`; worker `renewal/invoice-number.ts`                                                     | Currency before settings upsert/row lock/increment; preserve unique numbering/rollback.                                                                                                                                     |
| Worker `renewal/renewal-processor.service.ts`: createRenewalInvoice/markOverdue/applyRenewalPayment                                | Before service/invoice locks and period uniqueness; retain fixed original recurring units/amounts even if new sales disabled.                                                                                               |
| Worker `renewal/hosting-automation.service.ts`: complete                                                                           | Include status-only service completion. Scheduler/outbox/background-job code is not a currency admission proof; queued work rechecks on execution.                                                                          |
| `packages/database/prisma/seed.ts`; `apps/web/e2e/prepare-environment.ts`; database tests; backup/restore scripts                  | No exempt writer mode. Keep legacy fixtures/25-migration launcher intact; guarded fixtures are separately owned. Restores preserve lineage/control/ledger and need recovery validation. No WHMCS importer currently exists. |

API paths in this table are under `apps/api/src`; worker paths under `apps/worker/src`.
Future importer/direct SQL/provider completion requires the same reviewed boundary.
Searches are source evidence, not deployed-process coverage or an exhaustive proof against
dynamic SQL. Repeat inventory at each adoption slice and before activation.

Normal SQL needs all nine Command 103 targets coordinated: seven money-bearing tables,
settings and payment_events. Row rules validate NEW/OLD exact unit, creation/operation
policy, source/adoption evidence and parent links. New records require exact metadata;
legacy NULL remains unknown, never default-filled. Introduce nullable exact unit-version/
policy/origin links additively, plus append-only reviewed legacy sidecars keyed by exact
table/record identity and digest. Sidecars validate actual parent identity; polymorphic
labels alone are not a foreign-key guarantee. Preserve all old rows byte-for-byte.

Orders/items/invoice headers/lines agree on exact unit; services inherit order-item or
reviewed original contracts. Payments inherit invoice units; refund/reversal inherits the
original charge. Renewals preserve service units and original lineage, recording current
allowing policy separately from creation policy. Retired/disabled currencies stay visible.
Keep existing quantity/totals/nonnegative/settlement/idempotency invariants. Parent/child
aggregate validation may need deferred constraint triggers because nested inserts span
statements; test COMMIT failure and early SET CONSTRAINTS, never a skip-validation GUC.

Issued identity/unit/money and source links cannot be rewritten; issued-to-draft reversion
cannot authorize deletion. Genuine draft-line replacement locks/verifies the actual draft
parent and atomically replaces its lines. Existing updateDraft also accepts currency edits:
guarded adoption must support an append-only draft-context revision recording old/new exact
units under fresh compatibility, or explicitly gate that operation pending its separately
reviewed implementation. Do not silently declare current draft currency behavior covered.
Once issued, its exact context freezes. Draft history already locks the installation base.

Configuration prices do not latch history. All six successful financial insert targets
do; status-only updates do not invent an insertion but still coordinate. Financial DELETE
and all TRUNCATE deny except genuine draft-line deletion; immutability survives cancellation,
debt clearance, refunds, cleanup and customer soft deletion. Rejected/unlinked events stay
reviewable; authenticated admitted payment completion validates original merchant/route/
unit/amount even when new collection is disabled. Unresolved money is quarantined for
reconciliation, not dropped, converted or hidden. Provider BDT/two-decimal and current
mixed-currency portal/report gaps remain separate consumer gates, not solved here.

### Lock, deadline and installation protocol

Owned Read Committed/read-write transaction: correctly establish first active server
transaction timer and independent client acquisition/transaction bound; verify actual
backend/schema/roles/modes. Use Command 102's unchanged key. For staff selection/proof,
staff mutex `920006` precedes currency; then control, user, profile, credential, sessions
(sorted IDs), proof/receipt and existing business locks. Where user locks protect non-key
auth fields, review FOR NO KEY UPDATE to avoid unnecessary audit-FK key-share blocking;
do not assume current staff/auth writers already follow this order. Adopt their overlapping
password reset/MFA enable-disable/recovery/staff demotion/session revocation paths and test
both race directions. No auth row lock spans a wait for currency. Hold current auth rows
through the decision so concurrent revocation cannot win unnoticed.

Financial writers acquire currency/control before existing partial-policy/invoice/service/
server/numbering locks and authoritative reads. Preserve relative business ordering and sort
multi-row locks. Separate post-lock statements obtain current facts; initiating DML snapshots
or Command 101 Repeatable Read observations never authorize selection. SQL backstops do
not repair row-first callers. Deadlock/timeouts deny the whole owned workflow without
swallowing errors, retrying providers or returning tentative facts.

Retain 2 s acquisition, 500 ms lock, 2 s statement, 10 s transaction ceilings with shorter
positive overrides only. COUNT/coverage work can exceed them: deny incomplete assessment,
never turn timeout into empty history or silently raise budgets. Settings do not certify
an already-active internal timer; establish the initial budget or enforce independent
control. Future direct-SQL guarded connections need approved role defaults and bounded
client/session configuration, tested with ordinary roles; role defaults alone are not
proof a hostile caller cannot change settings. These residual limits remain explicit.
See [PostgreSQL client deadlines](https://www.postgresql.org/docs/18/runtime-config-client.html).

Proposed additive installation sequence, only in a separately approved maintenance window:

1. Inert empty proof/ledger/evidence and nullable provenance storage can be delivered
   first without opening the Command 104 shape. No defaults/backfill/authority-seeding.
2. Test the complete functions/ACLs/row guards/latch/writers in a fresh isolated cluster
   with deliberately labelled test-only assessed fixtures; never weaken the 25 product
   migrations or normal fictional seed/verifier to create them. Prototype authority
   objects belong to a separate nonce-owned prototype schema, not an altered product
   `currency_controls` table. Early transition-only fixtures deny all business writes;
   missing that protection denies prototype selection. P5 replaces that test-only
   deny-first protection with complete row/latch enforcement before allowing money.
3. Drain all deployed writers/old transactions, workers/scheduler, scripts/imports and
   external-operation DB completions. Preserve authenticated callback evidence safely;
   verify versioned queue handling and recovery. Source tests alone cannot prove this drain.
4. One installation transaction takes staff/currency first, then control and deterministic
   ACCESS EXCLUSIVE locks over the nine ordinary targets plus new authority objects.
   Old transactions must already be drained; waiting/deadlock denies, not proof of drain.
   Verify identity, migration hashes, privilege/guard manifest and evidence.
   Install final guards/owners/ACLs, retain DELETE/
   TRUNCATE denial, replace only the old blanket UPDATE guard with narrow authorized checks,
   add the exact anchor FK, and replace zero/null shape with the legal branches above.
   Do not drop the old protections in a separately committed migration first.
5. Only after complete protection and guarded deployment validation permit trusted
   initialization/adoption. Absent/unknown facts stay unchanged until that explicit action.
   Missing evidence leaves writes blocked; no migration seed or resume of a legacy writer.
6. Resume only the verified guarded writer set after owner review. A guarded schema has
   no legacy escape flag/credential; environment/GUC selection cannot disable enforcement.
   After new guarded commits, recovery is reviewed restore/forward repair, not rolling
   back to an old binary or dropping guards. Failed installation rolls back atomically;
   incomplete activation remains drained/blocked, preserving original rows and evidence.

Independent prerequisite migrations are inert; the protection-opening transaction is a
single later reviewed install unit, not permission to deploy now. Exact global role names,
credential provisioning, ownership transfer and recovery owner/window require approval.

### Bounded dependency sequence and acceptance

Each proposed slice needs its own command, tests, delivery and phase review. No numbering
or implementation authorization is assigned here. Existing acceptance stays mandatory.

| Slice                                                  | Proposed files/deliverable                                                                                                         | Required acceptance and stop condition                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1 — Isolated privilege acceptance harness             | New test-only `packages/database/test/currency-privilege-harness.*`, mandatory package/CI launcher integration                     | Fresh disposable PostgreSQL cluster; actual login/owner/membership/ACL/temp-shadow denial. Apply all 25 unchanged migrations; control remains empty/unknown. No roles/grants on current Compose/application cluster. Stop without transition/state/proof implementation. |
| P2 — Inert authority records                           | Future additive migrations/schema for proof/ledger/evidence; shared strict requests, database tests                                | Empty stores, exact restricted references, strict budgets/digests/immutable bindings, non-owner direct-write denial and prior-25 snapshots. No arbitrary append implying success, consumer or shape opening.                                                             |
| P3 — Exact new/legacy money lineage                    | Future nullable model links, reviewed sidecars/draft-version contracts and exact repositories                                      | No old-row backfill/relabel; unknown legacy quarantine, exact header/line/payment/service joins, draft edits and no hidden history. Stop before consumer adoption/selection.                                                                                             |
| P4 — Trusted transition prototype                      | Test-only fixed SQL functions using P1/P2/P3; copied result boundary tests                                                         | Complete tuples, initialize/adopt/replace/CAS/anchor/max/ABA/replay; one atomic ledger/activity/proof; raw recovery and deferred COMMIT failure. Assessed fixtures only in new isolated prototype scopes, no product migration opening.                                  |
| P5 — Row/state enforcement and first history           | Test-only normal-SQL guards/validated trigger latching on nine targets                                                             | Actual non-owner SQL/COPY/MERGE/conflict/no-op/nested cases, draft/issued rules, first history versus replacement both orders, immutable anchors and original rows. No deployed installer.                                                                               |
| P6 — Human proof and revocation integration            | Future auth/staff service extensions, isolated proof/executor pool wiring, shared/API tests                                        | Transaction-bound factor consumption/proof issuance; current auth recheck, demotion/reset/logout/MFA races, CSRF/rate-limit/expiry/tamper/replay denial. No provider or activation endpoint exposed prematurely.                                                         |
| P7 — Guard-first writer adoption, bounded by family    | API settings/products/orders/invoices/payments/gateways/services/hosting, worker renewal/completion/numbering, owned test fixtures | Each writer family separately reviewed; no old row-first path or standalone status update omitted. Existing transaction/idempotency/provider boundaries preserved; no selection availability until all families pass.                                                    |
| P8 — Protected legacy and consumer readiness           | Later owned rehearsal/manifest, per-currency portal/report/PDF/email/payment-money tests                                           | Exact mixed-unit inspection/reconciliation and credits, metadata/provider rights, original rows; no actual WHMCS query/import without separate approval. Resolve draft currency compatibility before coverage sign-off.                                                  |
| P9 — Complete guarded install/drain/recovery rehearsal | Future fixed installer/manifest and newly owned fictional activation tests                                                         | Atomic protected opening plus runtime roles, no legacy-resume interval, versioned queue/callback recovery, prior-25/older preservation and restore refusal of incompatible binaries. Still no live install/selection authorization.                                      |

**Smallest next implementation candidate: Build an isolated currency privilege acceptance
harness.** P1 resolves the observed non-owner proof gap before privileged control changes.
Use a uniquely owned throwaway cluster/container, loopback-only port, fresh labels/nonce/
database marker, bounded resources/deadlines and cached approved PostgreSQL image. No
pull, reuse of existing containers/clusters, role creation in the shared cluster or broad
cleanup. Redact ephemeral fictional credentials. If no cached image/resources/ownership
proof is available, stop with the actual blocker; never switch to the existing server.
Cleanup verifies exact container/volume/database ownership and removes only newly owned
objects. Leave incomplete/unmarked scopes and recoverable caches untouched. Fixture
functions probe permissions on explicitly fictional objects, not successful human
approval; do not disable Command 104 guards or open selected product states. Wire mandatory
checks without opt-out and retain every existing source/SQL/seed/history acceptance.
Command 105 did not implement or define/authorize this candidate. Its subsequently
owner-authorized phase review defines Command 106 below, without implementation authority.

Cross-slice acceptance, designed here and **not executed** by Command 105:

- Empty/mixed/zero/cancelled/failed/terminated/draft history, prices-only and gateway-
  evidence-only classifications; no NULL-to-false/default metadata inference.
- Prior-25 all-row comparison, plus retained prior-22/23/24 tests; no financial/settings/
  unit/policy/audit/outbox/event changes from inert install or failed selection.
- Real lock barriers for two initializers/replacements, first insert versus replacement
  in both orders, fresh post-wait reads, superseded ABA and generation exhaustion.
- Actual distinct non-owner logins: direct control/proof/ledger DML/EXECUTE denial,
  COPY/conflict/MERGE/nested/no-op/truncate, draft-only delete, RLS/missing privileges,
  schema/model/OID/temp decoys and owner/trigger/replica escalation refusal.
- Stale/tampered/expired/other-session proof, reused factor/proof, current authorization
  and revocation races; matching committed replay versus conflicting key/body/binding.
- Failure at CAS, activity, ledger, consumption and deferred COMMIT; savepoint/outer-handler
  recovery never yields partial transition. Unknown commit acknowledgment stays unknown.
- Acquisition/statement/lock/transaction/client deadlines, wrong isolation/role, row-first
  deadlock and pooled release; no swallowed/automatic retry or repeated external effects.
- Draft currency-context edits, issued immutability, fixed renewals/refunds and admitted
  payment completions while sales/collection disabled; no hidden debts or inferred route.
- Failed atomic install/drain/queue/callback/restore, missing guard manifest and stale
  binary/credential; protected state never resumes unadopted writers.

### Separate activation approvals and handoff

Engineering delivery requires all relevant source/SQL/API/invariant/browser/build/audit/
secret/CI/CodeQL gates, exact migration/guard hashes and non-owner evidence. That still
does not authorize activation. Separately obtain verified deployed writer versions and
roles, named operator/recovery owner, approved target/window/drain/queue/callback recovery,
exact metadata/compatibility rights, protected WHMCS/credit/adoption coverage, catalogue/
same-currency provider decisions, Command 33 D5–D8/Command 91 inputs and final owner launch
approval. BDT/USD direction is not legacy-unit provenance or approved live collection.

Command 105 changes documentation only. Proposed acceptance is not executed validation,
the P1–P9 slices are dependencies rather than a promised completion count/date, and no
live query/import, role/grant, assessed fixture, transition, provider, cleanup, release or
deployment occurred. After validated delivery, stop for **Phase review — Review Command
105 assessed-state specification and define the next bounded currency command**.

### Command 105 review and Command 106 implementation boundary

Owner-authorized review on 2026-10-08 accepts the documentation specification at
`64c17136e1029ee8fd35a9883144b289a070e6f7`, not its proposed enforcement. No blocking
in-scope specification defect was found. Complete tuple/evidence checks handle the
unchanged-generation first-history race; separate stable intent permits original-receipt
replay after later selection. Early prototype deny-first guards and atomic final opening
avoid treating partial prerequisites as permission. Draft compatibility, human-proof
revocation, exact legacy lineage and complete deployed writers remain open gates.

Fresh source review confirmed the control CHECK still permits only zero/null, blanket
mutation triggers remain, and `currency-control` accepts only absent/unassessed facts.
Coordinator returns void after owned commit and explicitly documents trusted-client
limits. Current tests use owner-side/predefined-role probes, not the proposed isolated
login duties. Command 105 changed five documentation files only; all 25 migrations and
runtime/package/CI tests were unchanged. No current-role/history query was performed.

Exact-source CI passed its aggregate/all 28 Validate steps; CodeQL aggregate/all eight
steps. PR-only dependency review skipped, not passed. Review reran 51 database source
tests and installed mitigation/production/full audits, not new non-owner SQL or the full
local browser suite. Evidence supports the specification scope, not installed authority.

Define **Command 106 — Build an isolated currency privilege acceptance harness**, P1
only, in [the command record](../CODEX_DEVELOPMENT_COMMANDS.md). That implementation
requires separate authorization. It establishes reproducible actual-login privilege
acceptance before later authority records/functions; it is not another unused production
helper or permission to initialize currency.

Concrete harness refinements: keep the existing database launcher unchanged and execute
the new isolated runner mandatorily through the database package/root test path and CI.
Use a fresh nonce-labelled local Docker container and automatically allocated loopback
port, no application `.env`/DATABASE_URL, shared network/data mount or fallback server.
Inspect the cached approved `postgres:18.6-bookworm` image and run its immutable image
ID with `--pull=never`; this review observed Linux/amd64 repository digest
`postgres@sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650`.
Same-name tag alone is insufficient. Another architecture/digest needs reviewed evidence.
Use bounded tmpfs over the actual image data-volume target (no anonymous volume), one CPU,
512 MiB memory, 64 MiB shared memory, 256 MiB data and 128 PIDs, sequential execution and
a ten-minute watchdog plus bounded cleanup. Resource insufficiency denies; no automatic
budget increase, image pull or existing-cluster role creation. Docker's
[run reference](https://docs.docker.com/reference/cli/docker/container/run/) informs
the proposed limits/mount/port options; none is exercised by this review.

Apply the 25 unchanged migrations only after exact container/mount/marker/server proof.
Keep product control empty or operator-staged zero/null, then compare all product facts
and guard manifests. Separate nonce-owned fictional probe objects support actual
business/issuer/executor logins and minimal non-login owners. Prove successful authorized
access and precise SQLSTATE denials, PUBLIC/default ACL/membership/owner escalation,
protected product DML and guard DDL refusal. ACL refusal is not row-policy validation.
An intentionally untrusted TEMP-enabled attack principal probes qualification/overload
behavior without granting any production role privileges. See PostgreSQL's
[role membership](https://www.postgresql.org/docs/18/role-membership.html) and
[function security](https://www.postgresql.org/docs/18/sql-createfunction.html) rules.
Probe functions return fictional facts, never selection/proof/ledger authority.

Fresh ephemeral SCRAM credentials stay in memory/bounded child environment, never raw
logs/URLs/SQL/env dumps. Mocked process-boundary failure tests complement, not replace,
actual authenticated SQL. Exact-ID/nonce/image/mount ownership must be reverified for
cleanup, and only the new container/tmpfs removed. No prune, shared volume deletion or
leftover-run adoption. Missing prerequisites, interruption or unsafe cleanup fail the
gate with redacted identifiers; all old acceptance remains mandatory.

Review changes documentation only; no harness/container/role/probe is built. No product
shape/guard opening, selected fixture, proof/ledger/row-latch implementation, current
database query, provider/import/operating approval, release/deploy or old-scope/cache
cleanup. Stop and request explicit Command 106 authorization after review delivery.

### Command 106 isolated P1 implementation

Owner-authorized on 2026-10-08. The five new database test files provide reusable
ownership/resource/process/connection boundaries, immutable migration pins, clearly
fictional SQL fixtures, actual-login acceptance and injected lifecycle-failure tests.
The package test sequence makes the new gate mandatory before the unchanged old SQL/
seed/history launcher; ordinary root and existing CI package tests include it. No runtime
export, dependency or product migration changes. CI explicitly prepares the approved
digest before package tests; the harness never pulls or substitutes a same-name tag.
Run `pnpm --filter @webhost-billing/database test:privileges` for the standalone mandatory
gate with the approved local cached image; ordinary `pnpm test` includes it as well.

The harness first verifies the local Docker context and inspects the cached approved
digest above directly (not the mutable tag),
then uses its immutable image ID with `--pull=never`. Engine 28+, Linux/amd64 and exact
PostgreSQL server version 18.6 are required; missing prerequisites fail, never skip.
One new nonce-labelled bridge has IP masquerading disabled and default binding
127.0.0.1. A Docker internal-only network did not expose the host mapping during actual
acceptance, so it is not used. This bridge is not a complete outbound-network sandbox.
Only the newly returned full IDs are targets; no Compose/demo/production resource is adopted.

One CPU, 512 MiB memory/no extra swap, 64 MiB shared memory, 256 MiB data tmpfs at the
image's actual `/var/lib/postgresql` volume target, 128 PIDs, 16 server connections,
no persistent container logs (`--log-driver=none`) and no restart bound the new cluster. Preflight requires 768 MiB free
host/daemon memory and 512 MiB working-volume space. SQL connection/statement/lock/
transaction limits are 2 s/2 s/500 ms/10 s, client queries/closure 3 s, Docker children
15 s, readiness 60 s, whole run 10 minutes and independent cleanup 30 s. Injected tests
can shorten, not increase, the three overridable clocks. These are trusted test-callback
boundaries, not arbitrary JavaScript or privileged Docker-user isolation.

Bootstrap credentials travel via captured child stdin into verified tmpfs only, never
host files, Docker arguments or `Config.Env`. Role-password SQL is not logged; fixed
error phases/codes, validated SQLSTATE and exact ownership identifiers replace raw causes.
Database/server identity and the out-of-product nonce marker precede all product SQL and
fictional login DDL, and are rechecked before removal. Changed mounts/labels/marker/IDs,
uncertain creation or client/cleanup failure fail closed for owner review; no old-scope
cleanup/adoption/prune is permitted.
Cached close failures remain failures on repeated closure. Pending acquisitions must
settle/close within the independent cleanup deadline; otherwise resource removal is refused.

All 25 migration files are sent as read, with no rewriting. Canonical LF SHA-256 pins
cover Git content on Windows/Linux; separate raw-byte snapshots catch any change during
the run, including local CRLF checkout differences. Product rows begin empty; only the
operator stages key-1 generation zero, unknown history and null selection/base. Distinct
business/issuer/executor/temporary-attack SCRAM logins and minimal NOLOGIN owners exercise
qualified fictional definer probes, exact EXECUTE separation, guard DDL/escalation denial,
temporary/table/overload decoys and restrictive RLS refusal. Every denied SQL operation
asserts its precise SQLSTATE and unchanged trusted row/object/role/membership/default/
database ACL snapshots. Existing trigger no-ops separately assert integrity SQLSTATE.

Actual acceptance exposed an important fixture correction: creator-global default
function EXECUTE must be revoked; a schema-only revoke cannot remove a global default.
Fixture installation is atomic, explicit PUBLIC revokes remain and default-ACL probes
always roll back. See primary [PostgreSQL default privileges](https://www.postgresql.org/docs/18/sql-alterdefaultprivileges.html),
[network address formatting](https://www.postgresql.org/docs/18/functions-net.html) and
[Docker localhost port publication](https://docs.docker.com/engine/network/port-publishing/).
Server identity uses `host(inet_server_addr())`, not mask-bearing `inet::text`.

Validation and delivery evidence belongs in the Command 106 progress report. This harness
does not install production privileges, assess/adopt history, issue human proofs, implement
selection/ledger/latches/writers or open controls. P2–P9 remain separately gated. Exact next
request: **Phase review — Review Command 106 isolated privilege acceptance harness and
define the next bounded currency command**.

### Command 106 review and security-first handoff

Owner-authorized review on 2026-10-09 accepts the P1 implementation at
`fb86ccaaab831596c76e73d899ffcb6089df6b12`, not production privileges or selection.
Fresh hosted verification confirms CI aggregate/all 29 Validate steps and CodeQL
aggregate/all eight steps passed. The first delivery's image-cache preflight failure
is not a pass: corrected CI prepares the exact approved digest before tests, while
the harness inspects that digest and creates by immutable ID with `--pull=never`.
Runtime/migrations/old launcher remain unchanged; all prior tests are still mandatory.
Current source review found no blocking in-scope ownership/cleanup/privilege defect.
Temporary object/RLS/default-ACL tests establish fictional mechanics only, not a live
role attestation, complete row protection, human proof or protected activation.

Review reran 68 database source and ten installed mitigation tests, a frozen install
and both audits. It did not create a cluster, run new actual-login SQL or rerun the
full local browser suite. Fresh production audit reports no known vulnerabilities,
but full audit now has five development findings: the retained braces/sprintf-js
pair plus three Handlebars `4.7.9` findings through ts-jest in API/worker/queue.
The maintainer's [4.7.10 release](https://github.com/handlebars-lang/handlebars.js/releases/tag/v4.7.10)
and [AST advisory](https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-8r5x-fm3f-whwj),
[own-property advisory](https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-p8wg-vrv2-v86f)
and [inline-output advisory](https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-xw65-4hp5-5hc7)
identify the patched target; registry version/integrity lookup confirms its publication.
No exploit is run here and no production-compromise claim follows from the audit.

Define **Command 107 — Repair newly disclosed Handlebars tooling advisories** in
[the command record](../CODEX_DEVELOPMENT_COMMANDS.md), not P2 implementation. That
narrow dependency/test repair needs separate authorization and complete renewed
validation. The existing local braces/sprintf-js patches and all acceptance stay.
No audit suppression, skip, ceiling increase or mitigation-as-upstream-fix claim.
The production-only CI audit does not close a newly failed development-security gate.

After the repair's phase review, P2 inert proof/ledger/evidence records remain the
next currency dependency candidate. Its exact command is not defined here; no record
schema, generic append API, issuer/executor, lineage, selected fixture or guard opening
is implemented or authorized. No shared-role/current-history query, provider/import,
operating approval, old-resource cleanup, release or deployment. Stop and request
explicit **Command 107 — Repair newly disclosed Handlebars tooling advisories** authorization.

### Command 107 bounded tooling repair

The owner authorized this security prerequisite on 2026-10-09. One exact global
Handlebars 4.7.10 override resolves the installed ts-jest paths in API, worker and
queue. Registry SHA-512 provenance matches the regenerated lockfile; the dependency
diff contains no unrelated upgrade, direct runtime package or install workaround.
The maintainer [release](https://github.com/handlebars-lang/handlebars.js/releases/tag/v4.7.10)
and the three advisories cited above guide the regression boundaries.

Five mandatory child groups extend the existing security script from ten to fifteen
tests. Every group resolves all three real consumers and checks the exact installed
version. Malformed AST fields and unknown node dispatch require precise rejection;
prototype own-constructor back-references are denied even with permissive defaults,
while ordinary own constructor data remains valid. Inline precompiled code must
escape script/comment boundaries in content, literals, properties, data, partials,
compat mode and source locations, while preserving expected runtime output.
Valid ASTs, partials, escaping and Map/Set/generator behavior retain positive checks.
The Map fixture follows the release's entry-pair iteration behavior. Existing Jest/
coverage consumer checks and all ten prior patch/container checks stay mandatory.

Probes run only with the existing stripped environment and unchanged memory/stack/
time/output ceilings. Canary effects are in-memory only; no external-operation
payload or raw exploit diagnostic is emitted. Only known positive compiler output
is evaluated in a bounded VM; malformed AST output never reaches that evaluation.
The fresh production audit reports zero known findings. The full audit now contains
only the two retained braces/sprintf-js findings and still exits 1; neither is waived.
All three new Handlebars advisory IDs are absent after the repair.

Full renewed validation, any failed local invocation and delivery evidence belong in
the Command 107 progress report. No test budget, migration/history assertion, cached
image preparation or ownership/cleanup rule is relaxed. This changes tooling only,
not currency authority or production readiness. Stop after validated delivery for
**Phase review — Review Command 107 Handlebars tooling repair and define the next
bounded currency command.** P2 remains a later candidate, not a started command.

### Command 107 review and P2a request-contract handoff

Owner-authorized review on 2026-10-09 accepts the tooling repair at
`ecfdd16005d294e4fd0dbefabfce7b11baa872a5`. Fresh exact-head verification confirms
[CI 37901445001](https://github.com/ebit101/webhost-billing/actions/runs/37901445001)
aggregate/all 29 Validate steps and
[CodeQL 37901445054](https://github.com/ebit101/webhost-billing/actions/runs/37901445054)
aggregate/all eight succeeded on their first attempts. CI logs confirm ordinary root
acceptance, including the actual-login harness, original preservation tests and
19 lifecycle/four staff browser tests. PR-only dependency review skipped, not passed.
This review did not rerun complete local SQL/API/browser/build acceptance or certify
absence of every security alert. Command 107's local serial qualification remains.

Fresh frozen install, all 15 tooling regressions and 68 database source tests passed.
Registry version/integrity still match the exact pin. Production audit exits 0 with
zero known findings; full audit exits 1 with only retained braces high and sprintf-js
moderate advisories. All three Handlebars IDs are absent. They are maintainer-patched
boundaries, not evidence of compromise; the remaining pair is neither fixed nor waived.
Source review found no blocking in-scope defect. Real-consumer resolution, precise
AST rejection/constructor denial/inline escaping, known positive template execution
and sanitized bounded children remain intact; no VM security-sandbox claim follows.

Define **Command 108 — Build unused currency selection request contracts**, P2a only,
in [the command record](../CODEX_DEVELOPMENT_COMMANDS.md). P2 already proposes strict
requests alongside inert proof/ledger/evidence stores. Split the specified input
boundary from those storage/reference/privilege lifecycles: bounded UTF-8 JSON text,
exact action/proposedRevision/expectedRevision/expectedGeneration/requestKey/proofToken,
explicit null, canonical BIGINT strings and action/state consistency. Reject caller
authority fields and return copied facts or fixed redacted failure, never raw errors.
A token-shaped string is not an issued or valid proof; accepted requests contain the
bearer and must not be logged. The entry stays separate and unused, with no root or
application consumer. No schema/migration, proof generation/storage, endpoint or UI.

Stable-intent and assessment digests are intentionally excluded. Their installation
identity, ordered server/evidence serialization and historic replay bindings need a
separate reviewed slice before P2 storage. Do not infer missing bindings from browser
claims, local settings, a preview, current session cleanup or an arbitrary UUID.
P2a does not complete P2, select policy, attest privileges, open assessed states or
permit writers. All 25 migrations/control guards and P3–P9 dependencies stay unchanged.
This review changes documentation only and does not authorize the implementation.
Stop after review delivery and request explicit Command 108 authorization.

### Implemented Command 108 request-syntax boundary

Owner-authorized on 2026-10-09, source baseline
`ae067c05b34a76ec7c4aefc5b1f87a2327704ef5`. Separate unused shared subpath
`currency-selection-request` exposes technical limits, types and one decoder, not raw
validation schemas. Root exports and all application/database/worker/browser consumers
stay unchanged. It accepts primitive JSON text only: code-unit screening bounds encoder
allocation, then an actual 4 KiB UTF-8 ceiling precedes JSON parsing and strict flat
six-field validation. No object graph, coercion/default, partial result or raw diagnostic.

All six fields are explicit: action, proposedRevision, expectedRevision,
expectedGeneration, requestKey and proofToken. Revisions reuse policy grammar/64-character
limit with full-input matching (including rejection of trailing line breaks). UUIDs retain
the existing grammar and exact case; nil/max UUID shapes are syntax, not valid authority.
Generations are canonical decimal strings through `9223372036854775807`, compared with
bounded BigInt after length/grammar checks. Initialize/adopt require null expected revision
and zero generation; replace requires an explicit revision, positive generation and a
different exact proposed revision. Parsing maximum does not authorize increment/selection.
The opaque 43-character base64url token check certifies shape only, not issuance/validity.

Unknown/nested/caller-authority fields deny. A bounded quoted-token walk after JSON and
flat-shape validation also rejects duplicate keys/escaped aliases rather than accepting
JSON.parse's last-member overwrite. Success returns fresh copied/frozen primitive facts;
all failures return one fixed frozen error without input/token/Zod details. Accepted
requests still contain the bearer and must never be logged. No function selects policy,
assesses history, mints/hashes/stores proof, supplies a receipt or performs external work.

Tests cover all actions, revision/UUID/token grammar, exact generations above Number
precision and maximum/overflow, missing/contradictory/authority/nested inputs, arbitrary
getter/proxy objects, malformed/duplicate/escaped JSON, actual UTF-8 boundaries before
parse, copying and redaction. A mandatory boundary test checks exports, pure imports and
absence of tracked runtime consumers. All prior gates/25 migration pins remain intact.
Acceptance, failed resource invocations and exact delivery belong in `docs/PROGRESS.md`.
No storage, digests, privilege/lineage/writer adoption, guard opening or activation follows.
Stop after validated delivery for **Phase review — Review Command 108 unused currency
selection request contracts and define the next bounded currency command**.

### Command 108 review and canonical-authority binding handoff

Owner-authorized review on 2026-10-09 accepts request-syntax delivery at
`a1fcbb6cf4bd364c445478338771e95f60599264`. Fresh exact-head verification confirms
[CI 37931335199](https://github.com/ebit101/webhost-billing/actions/runs/37931335199)
aggregate/all 29 Validate steps and
[CodeQL 37931335151](https://github.com/ebit101/webhost-billing/actions/runs/37931335151)
aggregate/all eight passed, first attempts. Hosted ordinary root tests include shared
112, actual-login privilege acceptance and all prior SQL/seed/preservation gates,
API integration 81 and 19 lifecycle/four staff browser cases. PR-only dependency review
skipped, not passed. Prior local failed invocations remain visible in the report.

Source/test review found no blocking in-scope defect. Primitive-input rejection does
not visit getters/proxies; encoder work and JSON parsing are bounded; private strict
schemas and duplicate-key checks give either complete copied facts or fixed failure.
The post-shape key scan is bounded ambiguity rejection, not a general JSON parser.
Returned bearer-containing requests remain sensitive. There is no root/runtime consumer,
hashing, clock/environment/provider/storage or selected-state change. All 25 migrations,
patches/pins and mandatory workflow/runtime tests remain unchanged.

Fresh frozen install, shared 112/build/types, database source 68 and installed tooling
15 passed, zero skips. Production audit exited 0/zero known findings; full audit exited
1 with exactly retained braces high GHSA-vfj7-8cjw-p6xm and sprintf-js moderate
GHSA-hp3w-g68c-fv3c. No new security finding or waiver. This documentation review did
not rerun complete local actual-login/SQL/API/browser/build suites or query live history.

Define **Command 109 — Specify canonical currency authority bindings**, documentation
only, in [the command record](../CODEX_DEVELOPMENT_COMMANDS.md). This resolves specific
P2 prerequisites deferred by ADR-108/Command 108, not another overall protocol design:

- Authoritative persistent installation identity and restore/clone/schema-placement
  lifecycle, distinct from Command 102's database/schema coordination key. There is no
  installation-identity model in the inspected product schema. A caller UUID is not authority.
- Exact ordered, bounded UTF-8 JSON tuples for the two Command 105 digest domains:
  stable original intent for matching replay, versus complete control/policy/unit/
  credential/evidence binding for fresh proof checks. Resolve UUID text/database aliases,
  absent/unassessed/null/first-history distinctions and locale-independent order.
- Non-secret credential/version evidence and immutable proof/ledger/evidence references.
  `schema.prisma` User/AdminProfile/AuthSession/AdminTotpCredential/AdminRecoveryCode/
  ActivityLog have UUID identities, but no dedicated authorization epoch. `authenticateSession`
  updates `lastSeenAt`; password reset revokes sessions. `disableTwoFactor` deletes the
  credential (recovery cascade); `regenerateRecoveryCodes` deletes/replaces recovery rows.
  Runtime logout revokes sessions; test teardown deletes fictional sessions. General
  `updatedAt`, heartbeat or last-used-step movement is not a purpose-built credential epoch.
  Do not retain password hashes, encrypted factor secrets, session tokens or recovery
  values as authority evidence, or forbid ordinary security operations with inappropriate FKs.
- Concrete fictional byte/hash vectors, reference/invalidation/replay acceptance and one
  smallest later P2 implementation candidate. Proposed tests are not executed proof.

Source paths: `packages/database/prisma/schema.prisma`, `packages/database/src/currency-policies.ts`
(ordered immutable policy facts), `currency-control.ts` (only absent/unassessed observations),
`packages/shared/src/currency-selection-request.ts`, and
`apps/api/src/modules/auth/services/auth.service.ts` plus staff authorization and API fixture
teardown. Canonical storage keys, auth versioning, evidence acquisition and serializer
placement remain to be specified, not invented or implemented by this review.
No P2 store/digest, auth behavior/secret retention, shape opening, new consumer, role/writer
adoption or live operation is authorized. P3–P9 and business/provider/launch prerequisites
remain. Stop after review delivery and ask for explicit Command 109 authorization.

## 3e. Canonical authority binding specification — Command 109

Owner-authorized on 2026-10-09, clean source baseline
`c3b7dff50ae66da08275878466abc992ac9ee5d9`. This is a documentation-only refinement of
section 3d's P2 prerequisites. None of the identities, epochs, serializers, hashes,
authority tables or functions below is installed. Command 108 remains an unused
six-field syntax decoder; all 25 migrations and runtime/workflow/dependency files remain
unchanged. Neither digest equality nor a well-formed UUID establishes authorization.

### Source evidence and serialization basis

`schema.prisma` has User, AdminProfile, AuthSession, AdminTotpCredential, AdminRecoveryCode
and ActivityLog UUID identities, but no persistent installation identity or dedicated
auth epoch. `currency-coordination.ts` derives a database/schema lock key, not a durable
identity. `currency-control.ts` reads only absent/unassessed facts. `currency-policies.ts`
already orders copied immutable policy facts and spells missing secondary preference as
null. These existing helpers are not authority/digest implementations.
`auth.service.ts` updates session heartbeat, resets passwords/revokes sessions, deletes
MFA credentials with recovery cascade and replaces recovery rows; `staff.service.ts`
revokes sessions on access updates. Their current locks/factor helpers are not P6 adoption.

The formats below are application protocol decisions, not a universal JSON canonicalization
standard. The serializer uses fresh dense arrays of validated primitives, explicit nulls,
ECMAScript JSON string quoting, no replacer/indent/BOM/final newline and UTF-8 bytes.
The two hashes are SHA-256 with lowercase hexadecimal output. This follows
[ECMAScript array serialization](https://tc39.es/ecma262/multipage/structured-data.html#sec-serializejsonarray)
and [Node.js hash input/output](https://nodejs.org/docs/latest-v24.x/api/crypto.html#hashupdatedata-inputencoding).
Future SQL must reproduce these exact bytes, not hash `jsonb::text`: PostgreSQL's
[JSON types](https://www.postgresql.org/docs/18/datatype-json.html) do not preserve all
textual details. Store the canonical text alongside relational facts and its digest;
validate equality through the one reviewed codec/SQL parity gate before trusted use.
No hash of arbitrary caller objects, toJSON/getters/proxies or raw request JSON is allowed.

### Installation identity, placement and recovery

Use two server-owned non-secret UUIDs: **installationId** identifies the retained business
history; **executionDomainId** identifies one approved placement/recovery incarnation.
Both are exact lowercase standard UUID text acquired from qualified immutable storage
and a trusted operator-owned, read-only deployment pin, never from a browser, GUC,
localization setting, coordination hash or automatically generated per-request UUID.
The pin supplies installation/domain IDs, exact database/schema and reviewed deployment/
guard-manifest identity. Trusted operator verification binds it to the actual target;
matching database names alone cannot attest the server. Missing/mismatched pin, grants,
domain or catalog/model identity denies all future proof/selection work.

Proposed minimal inert tables (names describe future objects, not migrations here):

- `currency_installations`: singleton key 1; unique non-null installation UUID and UTC
  creation time. Immutable after an explicitly approved offline initialization. An empty
  migration is not permission to initialize it, stage controls, assess history or enable money.
- `currency_execution_domains`: domain UUID primary key, installation UUID RESTRICT
  FK, exact database/schema names (existing 63-character identifier grammar), UTC creation
  time and 64-lowercase-hex reviewed placement-manifest digest. Immutable, including
  placement; unique `(installation_id, id)` supports exact later compound references.
  No database-selected current-domain flag: the operator's trusted pin selects the domain.

No defaults, migration seed or ordinary writer can issue either identity. Non-login
owners/offline installation duty remain section 3d privileges. Qualified reads verify the
pin before staff/currency-first transactional rechecks. A trusted operator who deliberately
copies both data and the original pin/credentials can defeat clone isolation; that is a
privileged deployment compromise, not protection proved by UUIDs.

| Operation                                              | Required future handling                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process restart at the same approved target            | Preserve both IDs; never rotate on startup or invalidate replay just because the process restarted.                                                                                                                                                                           |
| Reviewed relocation, database/schema rename or restore | Preserve installation/history, append a fresh execution domain under an approved drain/recovery procedure, replace the trusted pin and revoke old sessions/unconsumed proofs before resume. Old domains remain historical. No counter reset or automatic deployment approval. |
| Same-business restored copy used for rehearsal         | Preserve historical installation references for inspection; use a distinct domain/pin, disable real providers and proof/selection availability. Original-domain receipts cannot mutate or replay on the copy.                                                                 |
| Separate new business cloned from source               | Start from approved empty installation data and a new installation/domain, not relabel a copied financial ledger or silently mint an ID around old money.                                                                                                                     |
| Backup rollback or uncertain recovery completeness     | Stay drained. A new domain does not prove no history was lost or permit reused generations/revisions; protected ledger/queue/callback/backup reconciliation remains P9.                                                                                                       |

Normal matching selection replay is confined to the original active execution domain.
After restore/relocation, old receipts remain historical audit records, not replay authority;
a separately authorized historical inspection path must not reselect them. Logical IDs and
all old domain/ledger references survive. No relocation/restore/pin is executed here.

### Non-secret auth versions and immutable factor evidence

Future `currency_authorization_versions` has User UUID primary/RESTRICT FK, positive
BIGINT `auth_epoch` and `recovery_set_epoch`, nullable public credential UUID and boolean
`usable`. No password hash, token hash, encrypted secret, recovery hash/value or user-agent
enters it. Missing/unestablished rows are unavailable, never default epoch 1 or proof of
enrollment. Explicit baseline establishment belongs to protected P6 adoption, after every
overlapping auth writer and SQL backstop is proven. These counters are installation-local
versions, not the user's current general updatedAt.

Future immutable `currency_authorization_evidence` captures the exact ten-field tuple `H`
below at successful step-up. Its User/AdminProfile/AuthSession ownership is verified with
qualified locked reads and exact compound FKs (future `(id,user_id)` unique keys where
needed), all RESTRICT. Credential/recovery IDs are copied non-secret historical identities,
**not FKs to deletable secret-bearing rows**. The snapshot does not assert the live rows
remain enrolled or authorized. Trusted issuer owns its creation; ordinary business writers
cannot append approval-shaped evidence or invoke issuer/executor functions.

| Existing source / event                                                                           | Future version/invalidation rule                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User password reset/change, role/status/verification/soft-delete change; AdminProfile role change | Increment auth epoch in the same guarded security transaction and retain existing session revocation. Display-name/heartbeat changes alone do not change the epoch.                                                                                                          |
| MFA enable, disable or re-enrollment; credential replacement                                      | Increment auth and recovery-set epochs, update/clear the public current credential ID atomically; retain ordinary credential/recovery deletion. Missing/different live credential denies a new confirmation.                                                                 |
| Recovery regeneration                                                                             | Increment both epochs atomically with replacement; old snapshots retain only public identities. A consumed recovery code must not be reused for issuance.                                                                                                                    |
| Logout, idle expiry, session revocation                                                           | Recheck that exact live session under the reviewed lock/order and fresh database time; a revoked/expired/missing session denies issuance, confirmation and receipt replay. Logout-all also increments auth epoch.                                                            |
| TOTP last-used step or individual recovery consumption, ordinary login                            | Enforce factor one-use atomically with proof issuance; do not use incidental counter/usedAt movement as the general auth epoch. Other valid factor use does not silently rewrite historical evidence.                                                                        |
| Either version at BIGINT maximum                                                                  | Security actions still commit, including logout/reset/disable. Mark `usable=false` and deny all currency proof/confirmation; never overflow/reset/wrap or block ordinary account recovery to save a currency counter. Re-establishment needs a separately reviewed protocol. |

`H = [evidenceId, executionDomainId, actorUserId, adminProfileId, sessionId,
authEpoch, credentialId, recoverySetEpoch, factorKind, recoveryCodeId]`.
Positions 0–4/6 are exact server-owned lowercase UUIDs; positions 5/7 are canonical
positive BIGINT strings; position 8 is `totp` or `recovery`; position 9 is explicit null
for TOTP or the consumed public recovery-row UUID. All live owner/epoch/credential facts
must match at issuance and new confirmation; for recovery, proof issuance records its
atomic one-use consumption, not a requirement that usedAt remain null afterwards.
The original factor's identity is immutable; later freshness comparison uses its stored
evidence plus the **current** versions/credential/session, not a newly invented factor ID.

Enrollment/current full-administrator/email/status/session-MFA checks remain mandatory;
these columns/tuples alone never authorize. Password verification is outside long-held
locks; its exact auth epoch is read before verification and rechecked under locks. All
security writers must reliably bump it before this can substitute for comparing a secret.
Existing reusable/outside-transaction factor helpers are not that implementation.
Current roles/session expiry/idle age and verification facts are rechecked without hashing
heartbeat, generic updatedAt or last-used counters. No hashing/copying of a password hash
is proposed as a non-secret credential version.

Historical successful actor/session/profile references are protected from hard deletion.
Revocation/expiry/security updates still work. Unreferenced fictional auth teardown is
unchanged; authority fixtures must use a newly owned scope and verified whole-scope cleanup,
not delete immutable ledger/evidence merely to unblock an auth FK. A future session-retention
policy must not silently cascade or null historical references. No such retention job exists
in inspected runtime; integration teardown is not a production deletion policy.

### Canonical primitives, budgets and exact UUID treatment

All fields below are explicit. Validate grammar/full input and limits **before** member
traversal, allocation/sorting or BigInt comparison. Canonical strings are ASCII only:
revision/metadata `[A-Za-z0-9][A-Za-z0-9._:-]*`, length 1–64; currency exactly three uppercase
ASCII letters; provenance the existing printable-ASCII grammar, length 1–256; status
`current`/`historical`; UUID 36 characters in the already reviewed grammar. Use canonical
decimal string integers through `9223372036854775807`; only the exponent uses a JSON integer
number 0–4. No Number conversion of financial/generation/auth values. UTC control creation
time is exact `YYYY-MM-DDTHH:mm:ss.sssZ`, 24 ASCII characters, with calendar validation and
an exact round trip; it is the immutable row identity time, not an approval timestamp.

Command 108 preserves requestKey text, including case and nil/max shape; do not change that
parser or silently lowercase its output. Stable intent preserves that exact 36-character
text. Future intent uniqueness additionally uses a PostgreSQL UUID value: uppercase and
lowercase spellings occupy the same request slot, but have **different stable intent**.
A spelling change at an occupied slot is conflicting replay, never a new key or matching
receipt. SQL must compare saved text/digest byte-for-byte, not reconstruct it from UUID
output. All server-owned identity UUIDs come from standard lowercase database output;
their existence/ownership must be verified. Syntactic nil/max values grant no identity.
This distinguishes request text from [PostgreSQL UUID identity/output](https://www.postgresql.org/docs/18/datatype-uuid.html).

| Budget                                                    | Exact v1 ceiling                                                                                                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing client confirmation text                         | 4,096 UTF-8 bytes, unchanged.                                                                                                                         |
| Future internal binding input / canonical assessment text | 65,536 UTF-8 bytes each; primitive JSON text only, code-unit bound before encoding, byte bound before parsing. No caller object graph.                |
| Canonical stable-intent text                              | 1,024 UTF-8 bytes.                                                                                                                                    |
| Each policy context / control / auth tuple                | 24,576 / 512 / 1,024 UTF-8 bytes respectively, also covered by the outer ceiling.                                                                     |
| Policy entries and resolved definitions                   | At most 32 **per context**, unchanged; one proposed context and at most one prior context. Never combine them into an enlarged existing 32-entry API. |
| Anchor definition                                         | One exact existing definition or explicit null; not a third unbounded context.                                                                        |
| Evidence references                                       | 1–32, maximum 224 UTF-8 bytes per reference; array length checked before indexed members.                                                             |
| Hash / revision / UUID / integer token                    | 64 lowercase hex / 64 ASCII / 36 ASCII / 19 decimal characters respectively.                                                                          |

Reject sparse/extra/wrong-arity inputs or unprescribed nesting (maximum tuple depth 5),
unsupported versions, duplicate reference
identities, coercion/defaults and partial facts. These array codecs are future private
server-only code, not shared/browser/root exports. JSON parsing of bounded primitive text
provides own plain data; build fresh fixed-arity arrays after strict validation. Internal
binding JSON has no object-member aliases; reject object-shaped replacement of tuples.
Raw client member order is handled by Command 108, not by hashing raw JSON.
Sort copies only, with explicit ASCII `<`/`>` comparisons, never localeCompare. Preserve
case-sensitive revision/metadata strings. Fixed failures must not expose input, bearer,
raw JSON/Zod/SQL issues, H, object handles or partial hashes. Canonical material contains
restricted identities even without secrets and must not be casually logged or returned.

### Exact stable-intent and assessment tuples

Array positions are zero-based; brackets below are syntax specifications, not runtime code.

`S = ["currency-selection-request-v1", I, action, actorUserId, sessionId,
requestKeyText, expectedRevision, expectedGeneration, proposedRevision]` (arity 9).

- Position 1: `I=[installationId,executionDomainId]`, arity 2; checked active pin/domain.
- Positions 2/5/6/7/8: Command 108 action/exact key text/explicit expected revision/
  canonical expected generation/proposed revision, unchanged null/zero/replace rules.
- Positions 3/4: exact server-owned authenticated actor/session UUIDs, not request fields.
- `stableIntentDigest = SHA256(UTF8(canonical S))`. Exclude proof bearer/hash, current
  selection/latch, credential epoch/evidence, heartbeat and all incidental times.

`A = ["currency-selection-assessment-v1", stableIntentDigest, C, proposedContext,
priorContext, anchorDefinition, H, E]` (arity 8).

`C = [state,generation,selectedRevision,historyLatch,baseCode,baseMetadataVersion,
baseExponent,createdAt]` (arity 8):

- Absent: `["absent",null,null,null,null,null,null,null]`.
- Unassessed: `["unassessed","0",null,null,null,null,null,createdAt]`.
- Selected: `["selected",positiveGeneration,exactRevision,booleanLatch,exactCode,
exactVersion,exponent,createdAt]`. No partial/null selected tuple or durable
  assessed-unselected state. Latch false/true is explicit and survives unchanged generation.
- Initialize/adopt require observed absent/unassessed and request null/zero. Replace
  requires selected with exact request R/g; maximum parses but new selection cannot increment.
  Staging after an absent preview or first history after a false preview changes A and denies
  new confirmation even without a generation change. Do not restage before comparing C.

Each `Context=[P,U]` (arity 2):

- `P=[revision,baseRef,defaultBrowsingRef,secondaryRefOrNull,capabilities]`, arity 5.
  Each ref is `[code,metadataVersion]`. Each capability entry is
  `[code,metadataVersion,display,newSales,collection]`, arity 5, sorted by code.
  No duplicate code; all base/default/secondary membership and Command 97 rules apply.
- `U` has exactly the required stored immutable definitions, no extras/missing entries.
  Each is `[code,metadataVersion,minorUnitExponent,provenance,status]`, arity 5,
  sorted by code then exact metadataVersion; duplicate `(code,version)` denies.
  Obtain definitions by exact references, never latest metadata or inferred BDT/exponent.
- Proposed context matches S's proposed revision. Prior context is null exactly when
  C is absent/unassessed; otherwise it matches C's selected revision. Anchor is null in
  those two unknown states, otherwise one exact definition matching all C anchor fields.
  With latch false, prior base equals the whole anchor; with latch true, code/exponent
  agree and a different reviewed metadata version needs explicit compatibility evidence.
  Do not deduplicate a prior/proposed context or omit anchor facts because their rows match.

H is the ten-field immutable auth evidence above. Domain/actor/session match S, and
profile/credential/version ownership must pass current qualified checks, not just tuple shape.
`E` is a sorted array of `[kind,evidenceId,version,payloadDigest]` (arity 4), sorted by
kind, version, evidence ID with ASCII comparison. Duplicate `(kind,id)` denies even if
versions/digests match. Exact registered kind/version pairs are `history` /
`currency-history-assessment-v1`, `compatibility` / `currency-compatibility-v1`, and
`adoption` / `currency-adoption-v1`. At least one fresh history root and one complete
compatibility root are required; adopt also requires its approved adoption root. Other
versions/kinds deny v1, not fallback. Roots identify protected immutable manifests;
version names/digests alone do not attest completeness. Manifest acquisition, class coverage,
legacy/draft lineage and root payload schemas still require P3/P4/P8 implementation.
All exact referenced roots must be loaded/verified for the same installation/domain,
action/intent and observed C/policies; incomplete/unresolved/missing roots deny authority.
Command 101 counts are not substitutes. The codec can compute a fictional shape's hash
without certifying these server/storage obligations.

`assessmentDigest = SHA256(UTF8(canonical A))`; the different literal at index 0 separates
the two digest domains. Include provenance/status and complete exact units, not just codes
or their equal exponents. No query, time/default substitution or evidence issuance occurs
inside a future codec. Fresh authorized acquisition precedes it under section 3d locks;
output is copied facts/hashes, not permission, a transaction handle or a selected receipt.

### Future inert records, references and atomic consumption

All authority stores begin empty and deny ordinary DML/EXECUTE, including empty/no-op
statements, under P1-proven distinct-login ACLs. Runtime credentials are not owners or
issuer/executor members. No production privilege/owner installation is authorized here.

| Proposed object                   | Minimal future immutable facts / keys                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `currency_selection_intents`      | Primary `(installation_id,request_key_uuid)`; exact preserved request-key text, original domain/actor/session, action, expected R/g, proposed R, canonical S text/digest. Compound domain/installation, actor/session ownership and exact policy references RESTRICT. Alias/body/actor/session/domain conflicts deny; a reserved intent alone is not a receipt. |
| `currency_authorization_evidence` | H columns plus domain/installation and created UTC time; exact restricted actor/profile/session ownership. Public credential/recovery IDs have no FK to secret rows. Immutable after trusted issuance.                                                                                                                                                          |
| `currency_authority_evidence`     | UUID, installation/domain, kind/version, immutable protected payload reference and digest, original intent/C/context binding and UTC creation time. Exact binding/reference checks, not an arbitrary approval JSON. Payload/coverage schema remains versioned and must pass its prerequisite gates.                                                             |
| `currency_transition_proofs`      | UUID; restricted intent/H/E/context references; canonical A text/digest; unique opaque-token SHA-256 hash, issued/valid-until UTC. Immutable bindings. Multiple attempts may reference identical intent, but only the currently eligible issued proof can be consumed. No raw bearer, factor/password/exports.                                                  |
| `currency_selection_ledger`       | UUID, restricted intent/proof/H/E/ActivityLog references, exact before/after C, operation and database decision time. Unique `(installation,request_key_uuid)`, `(installation,result_generation)` and `(installation,new_selected_revision)`, and unique proof ID. Original domains retained; superseded revisions cannot be selected again.                   |
| `currency_proof_consumptions`     | Proof UUID primary key; ledger UUID unique; exact proof/ledger pairing. A separate one-use immutable link, not a generic mutable consumed flag.                                                                                                                                                                                                                 |

Use exact child/join rows for E and all policy/unit/H references, not just polymorphic IDs
inside JSON. Actor/session ownership requires corresponding compound keys; a FK to any
unrelated session is insufficient. Policy revision FKs and unit `(code,version)` FKs are
RESTRICT; exponent/value equality is independently validated against immutable rows.
Where exact anchor `(code,version,exponent)` references need an additive unique key, keep
that later protection-opening dependency explicit. No old FK/row/migration changes here.

Proof token hashing later reuses the reviewed `hashOpaqueToken` convention:
SHA-256 of the exact 43-character token's UTF-8 bytes, lowercase hex, without persisting
that input or treating this unkeyed hash as a signature. This command does not mint/hash
any bearer. Proof validity, five-minute maximum/session-shortened lifetime, fresh DB
wall-clock expiry, current versions and one-use consumption remain trusted checks.
Expiry and auth revocation are conditions, not deletion or changes to immutable bindings.
Any explicit proof invalidation is a separately protected append-only record; reissue
after failure cannot reuse consumed proof or change a completed intent's body.

Resolve the consumption cycle as follows: proof exists first; allocate ledger/activity
IDs inside the owned transaction; perform validated CAS/activity/ledger insertion, then
consumption insertion. Consumption has an immediate exact `(ledgerId,proofId)` FK to a
unique ledger pair. Ledger has a reciprocal `(proofId,ledgerId)` FK to consumption,
`NO ACTION DEFERRABLE INITIALLY DEFERRED`, with unique referenced pair. That one deferred
edge permits insertion ordering but refuses COMMIT without its exact consumption. All
historical non-cycle references remain RESTRICT. This relies on
[PostgreSQL FK actions/deferral](https://www.postgresql.org/docs/18/ddl-constraints.html#DDL-CONSTRAINTS-FK).
Early SET CONSTRAINTS, savepoint/outer-handler recovery and deferred failure must be tested.
The links alone do **not** prove CAS/auth/history: P4's narrow atomic function must verify
and mutate the whole boundary; direct ledger append remains denied even with valid FKs.

ActivityLog is inserted through that same transaction, with exact actor/action/ledger
entity consistency, not standalone AuthAuditService.record or a caller-chosen activity ID.
Reserve selection audit actions to the trusted transition duty; generic business append
must not forge them. Add exact `(id,actor_user_id)` reference support/validation where
needed, not a loose entityId claim. No provider/outbox effect or automatic retry follows.
Only after successful COMMIT may copied receipt facts leave the owned transaction.
Unknown acknowledgment remains unknown; key-based authorized receipt inspection resolves it.

### Matching replay versus new confirmation

Lock and reauthorize current actor/profile/session/enrollment under section 3d order;
verify placement. Find the installation-wide UUID request slot; compare saved key text,
original domain and complete S/digest, not current selection. A matching committed ledger
returns only its original receipt. A token-shaped but expired/different supplied bearer
does not authorize a write and need not be consumed/accepted again for this authenticated
receipt read. Syntax still passes Command 108. Current revoked/expired/non-full/unverified/
unenrolled sessions, cross-actor/session/domain or conflicting key/body deny.

Completed replay does not require the original auth epoch, false latch or selected R to
remain current: those are historic evidence, not a second transition. Current valid
authorization is still mandatory. Show current selection separately if later supported;
never claim the historical receipt's R is current. Later history, replacement or original
proof expiry therefore does not break legitimate matching receipt inspection.

Without a matching committed ledger, verify the supplied proof hash and original intent,
current usable auth/recovery versions/credential/session, expiry and fresh complete A/root
coverage under locks. Do not replace stored H with newly issued evidence or manufacture
missing state/evidence. A false-to-true latch at the same g, a committed stage, changed
metadata/compatibility/adoption root or credential epoch denies; re-step-up/reassessment
is a separate explicit operation, not coercion/retry. An existing incomplete intent can
only be resumed with an eligible newly verified proof of the **same** S; uncertain commits
first use authenticated receipt inspection. No automatic SQL/provider retry.

### Fictional canonical byte/hash vectors

These are literal ASCII JSON lines: no indentation, BOM, trailing newline or surrounding
code-fence bytes enter the hash. All IDs/manifests/times are fictional; repeated `a`/`b`/`c`
digests are shape fixtures, not computed coverage roots. No live authority or assessed
database fixture is created. Ten Node.js calculations were independently checked against
.NET SHA-256 and UTF-8 byte counts on 2026-10-09; this is **format evidence only**, not an
implemented codec, SQL/privilege/authorization/replay acceptance test.

S base (267 bytes):

```text
["currency-selection-request-v1",["10000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000002"],"initialize","20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000003","a0b1c2d3-0000-4000-8000-abcd12345678",null,"0","fictional-v1"]
```

A base (910 bytes):

```text
["currency-selection-assessment-v1","3f609e5934187609b5a5e679fa6f15fbb2d8e951653e21b672306e5fe1641426",["absent",null,null,null,null,null,null,null],[["fictional-v1",["BDT","fictional-units-v1"],["BDT","fictional-units-v1"],null,[["BDT","fictional-units-v1",true,true,true]]],[["BDT","fictional-units-v1",2,"Fictional source","current"]]],null,null,["20000000-0000-4000-8000-000000000005","10000000-0000-4000-8000-000000000002","20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000002","20000000-0000-4000-8000-000000000003","1","20000000-0000-4000-8000-000000000004","1","totp",null],[["compatibility","30000000-0000-4000-8000-000000000001","currency-compatibility-v1","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],["history","30000000-0000-4000-8000-000000000002","currency-history-assessment-v1","bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]]]
```

For the replacement vectors, S changes only action to `replace`, expected revision to
`fictional-v0` and generation to `9007199254740993`. A uses that new S digest; C becomes
`["selected","9007199254740993","fictional-v0",false,"BDT","fictional-units-v1",2,"2026-01-01T00:00:00.000Z"]`;
prior context equals proposed context with only its P revision changed to `fictional-v0`;
anchor is the single U definition. Everything else stays exactly A base.

| Vector / exact delta                                                            | UTF-8 bytes | SHA-256                                                            |
| ------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| S base                                                                          | 267         | `3f609e5934187609b5a5e679fa6f15fbb2d8e951653e21b672306e5fe1641426` |
| A base                                                                          | 910         | `de6f72e67de6d5ef8fdb0932e3aa79554bd38f41c171471e705d4b359ab48c75` |
| S base: uppercase key text only                                                 | 267         | `bec8f8e1020a69348660b0f71a5c4f1fd0239114625bfceace6bf73720054491` |
| S base: execution domain suffix `000000000003` only                             | 267         | `552681453a18ae4af7a62716d650aad40b6ebb5e1d25fc2528b9d42cdca23215` |
| A base: C becomes unassessed zero/null with creation `2026-01-01T00:00:00.000Z` | 935         | `4a2569f124c682965193e639aa86d674641f362a1734e8c8c659bca1427f499c` |
| A base: H auth epoch `1` to `2` only                                            | 910         | `6f19bc3b2cd99f762be386f76b5ebe7d84ff3d1d4f28b0ddbc2af95f44303959` |
| S replacement as defined above                                                  | 289         | `e005a8316125fb52a2e0e9645376488d3208a260043791b334ba29cd72461acf` |
| A replacement as defined above                                                  | 1213        | `e7c7affabac5e0f95ac8f1f8b68e0abaec5734cb358e31f98c95d26935bb6866` |
| A replacement: latch true and history-root digest all `c` only                  | 1212        | `8f87247911a4bbb01cede22bef1dc6a52954aa2e1c59823c0d46baf7f69d911a` |
| S replacement: generation `9223372036854775807` only                            | 292         | `d7ee4ed0a9047d5967ccb34261e66eab9a9b62d739382d69eca129594d65ee11` |

For the unassessed vector C is exactly
`["unassessed","0",null,null,null,null,null,"2026-01-01T00:00:00.000Z"]`.
Uppercase key occupies the same SQL UUID slot but conflicts with the base's exact intent.
Maximum is valid syntax, not increment authority. Changing only C leaves S unchanged;
the stored proof's A must not match after staging/latching. These outputs have no bearer.

### Proposed acceptance and smallest implementation candidate

The following is **required future acceptance**, not tests executed by Command 109:

| Boundary                                                                                | Required exact outcome                                                                                                                                                                  |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reordered input object members and context/reference lists                              | Fresh sorted tuples give identical canonical bytes/digests; no input mutation, locale order or dropped fields. Duplicate/unknown/extra facts deny.                                      |
| Null/state, absent-to-stage and false-to-true latch without g change                    | S unchanged where applicable, A differs; no stale new selection, fabricated emptiness or generation-only CAS.                                                                           |
| Case-sensitive policy/metadata; UUID aliases                                            | Policy/metadata case changes exact facts; SQL UUID slot cannot admit another alias; original request text cannot be reconstructed/lowercased into a matching replay.                    |
| Large/max/max+1/noncanonical generation or auth epoch                                   | Above-Number precision stays exact; max parses, overflow/noncanonical denies; exhaustion blocks currency authority but security actions remain possible.                                |
| Changed capability/unit exponent/provenance/status/anchor or evidence ID/version/digest | A differs or invalid tuple denies; no same-exponent substitution, unknown evidence version, incomplete root or latest metadata fallback.                                                |
| Malformed, duplicate, nested, huge, proxy/getter or wrong-byte-limit input              | Pre-traversal/pre-parse bounds and fixed redaction; no getter/coercion/raw error or partial digest. 32/33 entries/roots and exact byte ceilings tested.                                 |
| Wrong pin/domain/server ownership or clone/restore                                      | Deny before trusted work; missing identity never self-initializes. Relocation rotates only by approved recovery, preserves history and refuses lost-ledger generation reuse.            |
| Password reset/demotion/logout/MFA disable/re-enable/recovery regeneration races        | Both lock orders tested with actual current auth facts; old proof denies. Live secret-row deletion still works; historical non-secret evidence remains.                                 |
| Completed matching receipt after later selection/latch/expiry                           | Current authorization plus original S returns original receipt with no new CAS/audit/consume; conflicting actor/session/body/domain and revoked current auth deny.                      |
| FK/ledger/consumption/audit/COMMIT failure or raw recovery                              | No partial transition; exact deferred link/SQL parity tested. Unknown acknowledgment not rollback fiction. Normal writers cannot forge or directly mutate authority, even with no rows. |

**Smallest next implementation candidate: Stage inert currency installation identity
storage.** Only empty immutable `currency_installations` / `currency_execution_domains`
and their exact relationship, with no ID defaults/seed/current pin or application helper.
Future file targets: `packages/database/prisma/schema.prisma`, one additive migration with
an `_inert_currency_identity` suffix, and existing database source/isolated-login/owned SQL
test launchers. Do not create those files now or assign another command number.

Candidate acceptance must preserve all 25 original raw/content hashes and prior-25 all-row
snapshots (plus retained prior-22/23/24), empty new identity tables and unchanged existing
control/policy/unit/auth facts (other future authority stores still absent), exact relational
FK/immutability, normal-scope decoy/visibility denial and
P1 distinct-login direct DML/owner-membership/DDL/EXECUTE refusal. Fictional identity inserts
are explicit fixture-owner actions in newly owned scopes only; they do not assert active
pin/approval or authorize selection. Existing mandatory test/cleanup/resource limits and
complete root/SQL/API/invariant/browser/build/audit/secret/exact-head CI gates remain.
No production role DDL, staging API, migration identity minting, ordinary writer grant,
P2 proof/ledger completion or control-shape opening. Stop for a separately authorized review.

Remaining identity initialization/pin, exact digest codec/SQL parity, non-secret auth version
adoption, evidence payload/lineage/coverage, proof/ledger/atomic transitions and P3–P9 writer/
consumer/drain/recovery still need bounded implementation and acceptance. They are not
automatically authorized, a fixed remaining-command count or launch-date promise. Real
legacy/provider evidence, Command 33 operating inputs and final launch approval remain
separate. Stop after this documentation delivery for **Phase review — Review Command 109
canonical currency authority binding specification and define the next bounded currency
command**. No live query/import, PostgreSQL creation, roles, implementation or activation.

### Command 109 review and inert identity-storage boundary

Owner-authorized review on 2026-10-10 accepts the specification at
`3c4606c5946740d665252634c7cde72311294ff2`, not installed authority. No blocking in-scope
specification defect found. Fresh S/A vector calculations agree with all ten persisted
byte/hash values in Node and .NET; hashes of fictional shape facts do not establish live
coverage. Full original-intent/current-auth receipt rules, unchanged-generation stage/latch
invalidation, non-secret factor history and recovery-domain isolation remain requirements.

Fresh exact-head CI aggregate/all 29 Validate steps and CodeQL aggregate/all eight passed
on first attempts; PR-only dependency review skipped, not passed. Its ordinary hosted
root/source/actual-login/retained SQL/API/invariant/browser/build/production-audit gates
passed. This review reran frozen/tooling/source/shared checks and both audits, not new
SQL/login/browser tests. Full audit still has the two unwaived development findings.

Define **Command 110 — Stage inert currency installation identity storage** in
[the command record](../CODEX_DEVELOPMENT_COMMANDS.md). Only CurrencyInstallation and
CurrencyExecutionDomain, empty `currency_installations` / `currency_execution_domains`,
exact singleton/UUID/RESTRICT relationship/compound key and bounded placement/digest/UTC
columns; no defaults, active flag, automatic identity/time, seed, pin or consumer. One
additive `20261010090000_inert_currency_identity` migration is proposed, not created here.
Keep lowercase supported target names consistent with current coordination grammar;
unsupported names need review, not normalization. Manifest shape does not attest target.

Use statement-level fixed invoker mutation guards for UPDATE/DELETE/TRUNCATE, including
no-op/empty statements, and explicit new-object PUBLIC revokes. New source/owned SQL tests
must be mandatory through the existing database/root launcher, with P1 real non-owner
INSERT/DML/EXECUTE/DDL/escalation denials and per-denial snapshots. Append one exact new
migration pin without changing any of the prior 25 hashes; reconcile current 26-inventory
assertions without weakening historical prior-22/23/24 checks. Add prior-25 all-row/guard
preservation, empty post-migration/seed/workflow tables, raw/Prisma parity, shape/FK/UUID/
immutability/rollback and qualified decoy/visibility checks. All existing limits and gates
stay; no test opt-in, altered migration bytes or normal-scope guard disabling.

Important qualification: explicit fixture-owner INSERTs prove constraints only. PostgreSQL
[statement triggers](https://www.postgresql.org/docs/18/sql-createtrigger.html) cover
zero-row mutations, while [privilege revocation](https://www.postgresql.org/docs/18/sql-revoke.html)
does not remove owner powers. Current production Compose shares `database_url` between
migration/API/workers; no deployed ownership or membership was queried. This inert slice
does not install non-owner production duties, attest a pin, prevent privileged clone copying
or grant installation initialization/domain append. Those are later activation dependencies.

No schema/migration/test implementation, role/cluster creation, identity initialization,
auth epoch/evidence/codec/proof/ledger/selection, application adoption, live data/provider,
operating approval, release/deploy or unrelated cleanup in this review. P2 and P3–P9 plus
protected legacy/provider/business approvals remain. Stop after validated review delivery
and request explicit **Command 110 — Stage inert currency installation identity storage**
authorization; do not start it automatically or promise a remaining count/go-live date.
The owner subsequently authorized Command 110 on 2026-10-10. Its preflight still found
Docker's Linux engine unavailable; the preceding review's scan/push/exact-head closure
must finish before implementation. No identity model, migration or test code exists yet.

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
7. **Command 101 — Build a read-only currency adoption preflight** was separately authorized:
   unused database entry, one bounded read-only snapshot, exact counts and explicit unknown/
   truncation limits, mandatory fictional acceptance. Implementation and complete local
   validation and exact-head CI/CodeQL passed; the owner-authorized phase review accepted
   its scope. It cannot grant selection/adoption authority or live-data access;
   no migration, runtime consumer or registry publication.
8. **Command 102 — Build an unused currency coordination transaction primitive** is
   separately authorized: owned bounded Read Committed transaction, schema-scoped
   cooperative lock, fresh post-wait reads and explicit staff-first composition. The unused
   entry and mandatory fictional tests passed complete local and exact-head CI/CodeQL at
   `fdcaea6`; the owner-authorized review accepted its scope. No selection state, SQL guards
   or adopted writer.
9. **Command 103 — Build an unused SQL currency coordination guard prototype** was
   subsequently authorized: pure fixed SQL rendering, with temporary installation solely
   by guarded tests in schemas they create themselves. Complete local/canonical/exact-head
   hosted acceptance passed at `2c05dce`; the owner-authorized review accepted its scope.
   No policy/row enforcement, migration, executing
   installer, deployed privilege change or adopted consumer. Snapshot/lock-order/internal
   timer and raw SQL recovery limits remain explicit.
10. **Command 104 — Stage unselected currency control storage** was subsequently
    authorized on 2026-10-08 and delivered at `73e31bd` with the authorized security repair.
    One additive empty singleton store;
    explicit unused staging records unknown history and no policy/anchor, never eligibility.
    Complete local and exact-head hosted acceptance passed; the owner-authorized phase
    review accepted its engineering scope and renewed database/security checks.
    Assessed history, selection transitions and writer enforcement remain later approvals.
11. **Command 105 — Specify assessed-state transitions and activation prerequisites** was
    authorized on 2026-10-08 and completed as documentation only. Section 3d fixes legal
    tuples, transaction-local assessment, protected opening/proof/ledger/writer boundaries
    and P1–P9 fictional acceptance dependencies. Delivered at `64c1713` with exact-head
    hosted acceptance; its owner-authorized phase review accepts the documentation scope.
    **Command 106 — Build an isolated currency privilege acceptance harness** was subsequently
    authorized on 2026-10-08 and implemented for P1 only; acceptance/delivery evidence is
    recorded separately in progress. No selected state or deployed privilege.
12. Later additive policy/provenance services and per-currency reads; preserve legacy records and
    pass mixed BDT/USD portal/report tests before an import rehearsal.
13. Fixed BDT/USD catalogue, ownership-bound quotes and confirmed same-currency collection
    paths. Use fake providers; real USD payment approval is separate.
14. Rate-adapter sandbox evaluation, reviewed terms/credentials and proposed operational
    defaults, followed by guarded derived-price publication and additional currency tests.
15. Protected WHMCS sample/import rehearsal with reconciliation and separate owner review.
    Actual source export and target controls may be assessed earlier, read-only, by authority.

Remaining decisions: exact supported sales currencies and payment destinations, fixed
versus derived catalogue prices, provider/plan/licence, refresh/staleness/deviation/override
thresholds, quote expiry/rounding acceptance, reference valuation policy, legacy credit and
unsupported-record treatment. No empty field defaults to operational approval. No part of
this sequence activates providers, deploys changes or authorizes production cutover.

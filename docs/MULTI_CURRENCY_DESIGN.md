# Multi-currency billing design

## Status and authority

- Command: 94 — Design multi-currency billing and WHMCS migration rules.
- Date: 2026-10-06.
- Status: Design completed; Command 96's unused arithmetic foundation delivered and
  phase-reviewed. Command 97 is defined only; application integration/activation remains
  separately gated.
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

### Defined next slice: explicit currency policy contracts

The owner-authorized Command 96 phase review on 2026-10-07 found no arithmetic repair
necessary and defines **Command 97 — Build explicit currency policy and capability
contracts** only. Its implementation still requires separate authorization.

One unused shared entry will describe revisioned base/default/secondary choices and
explicit independent display, new-sales and collection flags, pinned to supplied unit
metadata. It will reject ambiguity and unsupported references without a built-in dataset,
live default or application consumer. A rate, browsing choice or metadata definition never
enables collection or proves a payment route. Historical code/version resolution remains
available independently of disabled flags; it never adopts current precision implicitly.

Pure transition tests will reject stale revisions and base-code changes after an explicit
history-exists fact. Future server services must obtain that fact authoritatively and enforce
concurrency, authorization and confirmation; these contracts do not do so. Fictional
BDT/USD target examples do not approve actual sales/collection capabilities. Persisted
metadata/policy, per-currency portal/report reads and prices/quotes remain later slices.

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
3. **Command 97 — Build explicit currency policy and capability contracts** is defined
   only by that review, not authorized. Keep it unused: strict explicit metadata bindings,
   independent capabilities, historical lookup and pure revision/base-lock validation.
   It cannot establish real provider routes, enforce database transitions or enable sales.
4. Additive policy/provenance schema and per-currency reads; preserve legacy records and
   pass mixed BDT/USD portal/report tests before an import rehearsal.
5. Fixed BDT/USD catalogue, ownership-bound quotes and confirmed same-currency collection
   paths. Use fake providers; real USD payment approval is separate.
6. Rate-adapter sandbox evaluation, reviewed terms/credentials and proposed operational
   defaults, followed by guarded derived-price publication and additional currency tests.
7. Protected WHMCS sample/import rehearsal with reconciliation and separate owner review.
   Actual source export and target controls may be assessed earlier, read-only, by authority.

Remaining decisions: exact supported sales currencies and payment destinations, fixed
versus derived catalogue prices, provider/plan/licence, refresh/staleness/deviation/override
thresholds, quote expiry/rounding acceptance, reference valuation policy, legacy credit and
unsupported-record treatment. No empty field defaults to operational approval. No part of
this sequence activates providers, deploys changes or authorizes production cutover.

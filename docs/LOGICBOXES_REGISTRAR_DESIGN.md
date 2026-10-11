# StarGate/UK2 sandbox registrar design

Command 49 design, researched on 2026-10-11. This document specifies future work;
it does not install a registrar, configure credentials or approve a purchase.

## 1. Provider and scope decision

The owner identified [resell.biz](https://www.resell.biz/) as the account brand,
provided a StarGate/UK2 configuration screenshot, and requested sandbox integration.
The owner then chose **local fake registrar first, with no external calls or charges**.
They intend to place a LogicBoxes folder in the project root for code-structure review;
it was not present at inspection. Review that material without executing it, copying
credentials or assuming a PHP/WHMCS module is a compatible TypeScript implementation.
The owner subsequently supplied `stargate.zip`. Read-only ZIP inspection found
`index.php`, `stargate.php`, `whmcs.json` and `logo.gif` under `stargate/`.
The metadata declares type `whmcs-registrars`, author WHMCS and license `proprietary`;
both PHP entries contain ionCube encoding markers and no readable function definitions
were found. This verifies package structure, not registration logic, authenticity,
compatibility or sandbox isolation. Nothing was extracted, executed or copied into
the application. Root archive/extracted-directory names are excluded from Git;
reuse/distribution would require separate licensing evidence and is not this design.
The screenshot is context only: its masked credentials, unchecked test-mode box,
visible TLDs and pricing-sync timestamp are not account verification or configuration
to copy. No secret, reseller identifier or real customer record belongs in Git.

The official [WHMCS StarGate/UK2 documentation](https://docs.whmcs.com/8-13/domains/domain-registrar-modules/stargate/)
identifies this module with Resell.biz/UK2 and the LogicBoxes platform. It also says
to request account API access for the server's IP through resell.biz support.
This corroborates the brand; it does not validate the owner's account or prescribe
our adapter implementation. The public resell.biz homepage fetch failed during
research; no authenticated portal or registrar API was accessed.

**Go: one complete fake/mock-tested registration workflow in Command 50.** Include
an official-contract sandbox transport tested through injected HTTP mocks, but keep
network use disabled and real account configuration absent. Do not fragment this
into additional unused foundation commands.

**No-go: credentialed sandbox execution or live registration now.** A separate,
provider-confirmed demo reseller identity, protected secrets and the acceptance
inputs in section 9 are missing. The owner has selected sandbox, not a live account.
Command 51 requires separately authorized, exact demo operations; no production
fallback. Currency development remains on hold under ADR-125.

## 2. Official API findings and unresolved contracts

Technical facts below come from public primary documentation, not an SDK, screenshot
or inference from a successful WHMCS installation. Account-specific capabilities
must subsequently be verified against the genuine demo account.

- [Access and authentication](https://manage.logicboxes.com/kb/answer/753): HTTPS;
  reseller identity and API key; source-IP allowlisting. Reads use GET, mutations
  POST. Key regeneration immediately invalidates the old key. **Live credentials
  on `test.httpapi.com` still perform production actions.** A test hostname or
  checkbox is not sandbox proof. Documentation also permits GET mutations on the
  test URL; our transport must never do that. HTTP 500 is documented for errors,
  so a 500 alone cannot establish whether an operation executed.
- [Availability](https://manage.logicboxes.com/kb/answer/764):
  `/api/domains/available.json` reports availability and may include premium/EAP
  pricing or trademark claims. Its example uses `domaincheck.httpapi.com`.
  Availability is an observation, not a reservation. Unknown, premium, launch-phase
  and claim-bearing results must not enter the initial registration path.
- [Reseller cost pricing](https://manage.logicboxes.com/kb/answer/1029): GET
  `/api/products/reseller-cost-price.json` returns product/action/tenure pricing;
  documentation recommends caching. Fetch these costs from the provider rather
  than scraping WHMCS. Actual account currency, product-key/TLD mapping, promotions,
  taxes and all-in charge semantics remain unverified. A cost is not a Speed Host
  customer selling price, and missing values are not zero.
- [Registration](https://manage.logicboxes.com/kb/answer/752): POST
  `/api/domains/register.json` takes domain, years, nameservers, customer and contact
  identities. `auto-renew` is required. `NoInvoice` executes without creating the
  provider's customer invoice; other invoice modes differ in execution/payment
  behavior. Order/action identities and action status are returned. Under
  `NoInvoice`, customer identity and selling-amount/currency fields are omitted;
  reconciliation must obtain independent ownership and cost evidence. An accepted
  request is not proof of a registered domain. The retrieved contract contains no
  documented general idempotency key or atomic ordinary-domain maximum-charge
  parameter; this is a contract gap, not proof none exists elsewhere.
- [Customer signup](https://manage.logicboxes.com/kb/answer/804) documents POST
  `/api/customers/v2/signup.json` with identity, address, telephone, language and
  consent fields. [Customer lookup](https://manage.logicboxes.com/kb/answer/874)
  supports username lookup. Its response can contain a sensitive PIN; never store
  or log the raw response. Do not reuse the local portal password for signup.
- [Contact creation](https://manage.logicboxes.com/kb/answer/790) documents POST
  `/api/contacts/add.json`, customer-linked contact types and TLD-specific fields.
  [Contact search](https://manage.logicboxes.com/kb/answer/793) can help reconciliation
  but excludes some archived contacts; an empty search is not conclusive absence.
  [Contact changes](https://manage.logicboxes.com/kb/answer/777) have a designated-agent
  option, default false. Such changes are outside the initial mutation scope.
- [Order lookup](https://manage.logicboxes.com/kb/answer/763) provides a domain's
  provider order ID. [Order details](https://manage.logicboxes.com/kb/answer/770)
  provide status/expiry and ownership context. Full details can expose the domain
  secret; use a strict projection, never persist raw details or request `All` for
  convenience. Registration and contact-verification status are separate.
- [Renewal](https://manage.logicboxes.com/kb/answer/746) uses POST
  `/api/domains/renew.json` with order, years and current expiry. [Transfer](https://manage.logicboxes.com/kb/answer/758)
  uses POST `/api/domains/transfer.json` with authorization/contact requirements.
  [Nameserver changes](https://manage.logicboxes.com/kb/answer/776) use POST
  `/api/domains/modify-ns.json`. Their documented availability is not authorization
  to implement or execute them in the initial registration slice.
- [API abuse policy](https://manage.logicboxes.com/kb/servlet/KBServlet/faq682.html)
  warns against excessive checks, repeated mutations and unused customer creation,
  with IP/account blocking consequences. No account-specific numeric allowance was
  established. Our conservative budgets below are application proposals, not
  claimed provider limits. No authenticated webhook contract was established;
  use bounded read-only reconciliation, not unsigned callbacks.
- [Domain setup requirements](https://manage.logicboxes.com/kb/servlet/KBServlet/faq971.html)
  require the actual reseller's registrant agreement and customer acceptance.
  Obtain that agreement from the account's legal-agreements section. Do not replace
  it with generic website terms or infer consent from a paid invoice.

## 3. Source-grounded architecture

The inspected baseline is `1eae076` on canonical `main`. Current source has no
registrar adapter, domain aggregate, provider contacts or registration workflow.
`requestedDomain` on a hosting order means a requested hosting hostname, not a
domain purchase.

- [Prisma schema](../packages/database/prisma/schema.prisma): `OrderItem` requires
  product/price references; `Service` requires a server and hosting lifecycle.
  `InvoiceItem` can link an order item without a hosting service.
- [Order service](../apps/api/src/modules/orders/order.service.ts): creation currently
  requires a hosting package. Its generic status method can complete orders without
  registrar evidence. Domain-specific creation and completion guards are needed;
  do not bypass the hosting-package check by inventing a WHM package.
- [Payment service](../apps/api/src/modules/payments/payment.service.ts): verified
  charges atomically update invoice balances and eligible order state. Reuse this
  ledger workflow; there must be no registrar endpoint that simply marks an invoice
  paid. Customer submissions and browser redirects are not verified receipts.
- [Service service](../apps/api/src/modules/services/service.service.ts) and
  [renewal processor](../apps/worker/src/renewal/renewal-processor.service.ts): keep
  domain items out of hosting setup, provisioning, renewal and suspension selection.
- [Credential service](../apps/api/src/modules/settings/integration-credential.service.ts)
  currently supports payment providers and overwrites a single credential record.
  [Credential cipher](../apps/api/src/modules/settings/integration-credential.cipher.ts)
  provides AES-GCM with provider-bound authenticated data. Extend the protected
  boundary deliberately; do not pretend that a timestamp revision preserves old
  secret material or mix WHM/payment credentials with registrar credentials.
- [Staff contracts](../packages/shared/src/contracts/staff.ts): retain fixed roles.
  Registrar configuration, approval, retry and reconciliation require an enrolled
  full administrator at the API/service layer. Billing operators may use existing
  financial permissions, not acquire registrar write authority.
- [Outbox dispatcher](../apps/worker/src/outbox/outbox-dispatcher.service.ts): use
  durable outbox events and an explicit registrar consumer. Generic BullMQ retry
  behavior must not repeat a potentially executed registrar mutation.

### Proposed minimal data changes

Add an explicit product kind, default `HOSTING` for existing rows, and snapshot the
kind on each new order item. Do not reinterpret historical items using mutable
catalogue metadata. A `DomainOffer` binds a domain product to an approved account,
exact TLD, one-year duration and ordinary-registration capability. Existing
`ProductPrice` supplies the fixed BDT customer price; domain offers have no WHM
package and zero setup fee in the initial slice. Hosting catalogue endpoints and
forms must explicitly select hosting products.

Proposed additional records, all with bounded fields and UTC timestamps:

| Record                                       | Required purpose and boundary                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registrar account and credential version     | Brand, explicit fake/demo mode, pinned endpoint set, provider identity, enabled/disabled control; immutable encrypted credential versions; never return plaintext        |
| Provider customer/contact mapping            | Local owner plus provider account/customer/type/ID; protected immutable contact snapshot and consent reference; never adopt by email alone                               |
| Domain quote/request                         | Exact canonical name, TLD, years, nameservers, offer/price revisions, availability/cost evidence and expiry; unique submission identity and request fingerprint          |
| Domain                                       | Separate local aggregate linked to customer, order item and account; canonical-name reservation, provider order ID, registration and verification state, observed expiry |
| Registrar operation and append-only evidence | Stable intent and unique dispatch claim, actor, invoice, account/version, contact/quote references, mode, outcome category and redacted reconciliation observations      |

Database uniqueness must prevent two active registrations of the same canonical
name in this installation, duplicate provider order bindings, duplicate operations
and cross-customer mapping reuse. Use restrictive foreign keys and matching account/
owner constraints, not just UUID existence. Quote/contact/consent snapshots and
attempt evidence must not be overwritten. A mutable operation summary may be
updated transactionally alongside immutable evidence. Never hard-delete financial
history, issued domain requests or operations to permit a retry.

Default all existing rows to hosting without changing their financial snapshots.
New domain records start empty. No real fixture, provider key, automatic currency
selection, WHMCS import or backfill. Migration acceptance must compare pre-existing
rows/migration bytes and preserve current hosting tests. Disabling this feature is
the operational rollback; do not promise that downgrading drops new history safely.

## 4. Complete initial customer and operator flow

1. Use the existing authenticated customer/admin creation workflows. In automated
   acceptance use fictional customers only; no real record is created by this design.
2. Offer one ordinary ASCII second-level name under a small explicit TLD allowlist,
   one year, quantity one. `.com`/`.net` are proposed mock fixtures, not approved
   live products. Reject IDN/punycode, premium/EAP/claims, unsupported suffixes,
   subdomains and arbitrary provider fields. No bulk lookup or anonymous external
   availability calls. Nameservers must be owner-approved and snapshotted.
3. Ask for complete registrant data and actual agreement acceptance. Administrator
   entry on a customer's behalf requires retained customer authority, not an
   automatic consent checkbox. Preserve the exact provider agreement text; app
   labels remain sentence case. Obtain required organization/data-sharing consent
   explicitly. Never invent an address, company, contact or designated-agent assent.
4. Fetch availability and reseller cost through the adapter. Snapshot cost currency,
   integer minor amount, timestamp, account, TLD/product/action/year and price
   provenance. Create a short-lived quote for a fixed owner-approved BDT sale price.
   Provider pricing sync is read-only and must not silently rewrite selling prices.
5. In one local transaction consume the quote once and create the domain request,
   order/item, unpaid invoice and standard historical customer/business/price
   snapshots. Same submission plus same intent returns the same result; reuse for
   another customer/domain/price/consent conflicts. An expired quote requires a new
   explicit review, not quiet price replacement. Issued invoices remain immutable.
6. Record an actual manual receipt through the existing review workflow, or a verified
   gateway payment through its existing authenticated callback path. Sandbox receipts
   are fictional and clearly labelled. Full verified settlement is required; partial,
   pending, reversed/refunded, cancelled or mismatched-currency payment cannot authorize
   dispatch. A zero-price domain is not eligible for this initial purchase workflow.
7. An enrolled full administrator reviews exact customer/domain/year, verified invoice,
   nameservers, consent, provider account/mode, current availability, cost and budget,
   then explicitly approves one operation. Payment alone never automatically registers.
8. Persist the operation and dispatch claim before external work. Create or reconcile
   remote customer/contact mappings first; query-only observation cannot silently
   acquire another person's existing remote account. Snapshot actual mapped identities.
   Submit once, then read-only reconcile. Finish the order only on matching provider
   registration evidence, not HTTP success, payment or a generic status dropdown.
9. Display invoice and domain outcomes independently. Failed/uncertain registration
   leaves verified payment/history intact and alerts the operator. An approved refund
   is a new transaction; it neither deletes a domain nor proves a registrar refund.

Use `NoInvoice` only after acceptance confirms its account-specific reseller-wallet
effect and charge evidence. Speed Host's local invoice is the customer bill; a second
provider customer invoice is not local payment proof. Reseller funding is separate.

No FX or cross-currency financial arithmetic is introduced: BDT selling price and
provider-native cost are independently typed integer amounts. Do not subtract USD
cost from BDT revenue or create converted profit. Unknown currency/unit or unparseable
cost denies approval. Parse provider decimal tokens losslessly, never through JS
floating-point financial arithmetic. A later adapter must bound the full response
before extracting only the approved pricing branch.

The initial request explicitly disables auto-renew, privacy purchase/protection and
premium DNS; it never silently accepts registry-specific attributes or a designated-
agent appointment. Unsupported obligations stop the request rather than injecting
default consent. No customer account creation happens until an approved paid operation
needs it, avoiding bulk unused provider accounts.

**Charge ceiling limitation:** checking a fresh quote immediately before a call is
not an atomic price ceiling. No such ordinary-registration control was established
in the retrieved contract. Credentialed/live acceptance must obtain provider proof
of enforceable all-in limits, or explicit owner approval of the exact residual
price-change risk and alternative funding controls. Never describe a preflight
comparison as a guarantee. Stop on uncertain tax, premium or unexpected charges.

## 5. States, retries and reconciliation

| Observation                                                  | Domain/operation outcome       | Permitted next action                                                |
| ------------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------- |
| Invoice unpaid or only partially verified                    | Awaiting payment               | Existing payment review; no registrar dispatch                       |
| Fully verified, consent complete, no approval yet            | Awaiting registration approval | Full-administrator review                                            |
| Durable dispatch claimed or provider action pending          | Registration pending           | Bounded read-only reconciliation; no duplicate POST                  |
| Timeout, crash after claim, malformed/unknown/error response | Needs reconciliation           | Read-only lookup/details and operator escalation                     |
| Definitively rejected before execution                       | Registration failed            | New deliberate approval only after conclusive non-execution evidence |
| Matching account/customer/domain and registered state/expiry | Registered                     | Read-only status; contact verification may still be pending          |

These are proposed presentation states, not existing enums or provider action values.
Unknown provider states fail closed. Verify the exact domain, account ownership,
mapped customer, operation/order identity and observed status/expiry; `Active` alone
does not prove the resource belongs to this customer. A pre-existing provider order
discovered before dispatch is a conflict, not our registration success or an import.

Local uniqueness is not provider exactly-once execution. Claim once in a short DB
transaction using consistent locks (invoice before domain before operation) and
fresh eligibility checks. External HTTP must occur outside that transaction. After
claim, even a crash before proven send is ambiguous: do not clear the claim and
blindly POST again. Reconcile by known provider order ID or domain lookup; absence,
eventual consistency, an empty contact search or a 500 are not proof of no charge.
Retain unresolved cases for provider support; human retry requires evidence that
the original did not execute, a new intent and renewed payment/cost/consent checks.

Any cancellation, invoice edit or financial reversal racing dispatch must participate
in the same invoice/domain locking boundary. Before claim it denies dispatch; after
claim it cannot promise to undo an already authorized external call. Freeze request
and issued invoice evidence, record the race and escalate rather than rewriting
history. Generic domain-order completion/cancellation must use these guards.

Start with one outbound operation per account, 10-second request timeout, bounded
response bytes, cached pricing and a small authenticated lookup budget. Proposed
read-only polling is 15/30/60 seconds followed by capped backoff, at most ten reads
per operation in one hour, then manual attention. These are our defaults subject to
demo acceptance, not provider SLA/limits. Mutation attempts are never automatically
retried by HTTP, BullMQ or outbox redelivery; redispatch only resumes reconciliation.

## 6. Adapter and credential boundary

The provider-neutral `DomainRegistrar` exposes strict validated availability,
cost quote, customer/contact ensure-or-reconcile, register-once and registration
lookup operations. Capabilities explicitly mark renew/transfer/nameserver/contact
changes unsupported in the initial implementation. No generic arbitrary-method
endpoint, provider URL, contact attribute map or provider credential reaches the client.

`FakeDomainRegistrar` implements deterministic success, delayed completion, rejection,
unavailability, price change and lost-response scenarios. `LogicBoxesSandboxRegistrar`
uses an injected HTTP transport and the official request/response projections;
Command 50 runs only mocked transport. Registering its classes is not permission to
make a network request. Fail closed on absent configuration or unknown mode.

Credentialed transport requires the exact pinned demo account/hosts/source IP and
an operator-confirmed demo identity, not just a string called sandbox. Do not select
production hosts as a fallback. Strict HTTPS, no redirects, no browser/API-key calls,
no full query-URL logging, no raw provider body/error persistence. Outbox/jobs contain
only local identifiers; worker loads encrypted contact/credentials on demand.
Redact API keys, passwords, PINs, EPP/domain secrets, cookies and personal contact
content from logs, errors and histories; persist only approved structured projections.

Encrypt each credential version with authenticated binding to provider/account/mode/
version; preserve required versions for outstanding reconciliation with restricted
access. Keep provider API rotation separate from encryption-key rotation. A retired
API key may immediately stop working: pause unresolved operations and explicitly
approve a replacement bound to the same verified account, never swap accounts on a
pending job. Credential changes need MFA, audit and outstanding-operation review.
Do not rotate the existing WHMCS key during design or mock implementation.

## 7. Administrator and customer surfaces

- Administrator settings: StarGate/UK2 brand, fake/demo badge, disabled-by-default
  network status, masked configuration, source-IP/demo prerequisites and kill switch.
  No live enable button in Command 50.
- Domain offers: exact TLD, supported duration, fixed BDT selling price and separately
  observed provider cost/freshness. A refresh is read-only; publishing/changing selling
  prices is explicit and does not edit existing invoices. No mass registrar assignment.
- Domain review: customer/order/invoice links, verified balance, contact/consent checks,
  nameservers, account/mode, cost warning and exact confirmation. Full-administrator
  actions only. Pending/uncertain operations offer reconcile, not unsafe retry.
- Customer order/detail: own quotes, registration requests, payment next action and
  truthful domain/verification status. No provider IDs/secrets, private operations or
  another customer's contact data. Sign-in cannot lose the selected offer/domain.
- Both roles retain sentence-case labels, mobile layouts and existing invoice history.
  Mock outcomes must say simulated; never present a fake registration as a real domain.

## 8. Renewal, policy and later operations

Local and provider auto-renew remain false. Record observed registry expiry separately
from invoice due dates. The initial slice has no domain renewal/suspension scheduler;
hosting overdue automation must not suspend/delete a domain or silently advance its
expiry. Renewal later needs a separate invoice, fresh cost, actual current provider
expiry, approval and reconciliation before advancing observed expiry.

Transfer/auth-code retrieval, contact/designated-agent changes, nameserver changes,
privacy, DNS management, premium domains, IDN, redemption/restoration, deletion and
WHMCS domain import are not Command 50 features. They require separately bounded
design/implementation/acceptance; no new command numbering is implied here.

The previously approved 30-day general refund window does not establish that registry
fees are refundable. Obtain explicit owner-approved domain exclusions/cancellation,
refund, failed-registration and contact-retention rules plus the actual agreement
before customer-facing sale. This design does not invent a legal policy or alter
approved Speed Host wording. Do not copy WHMCS contacts or prices without protected
rehearsal/import authority and historical-mapping checks.

## 9. Acceptance and remaining inputs

Command 50 must deliver the complete fictional vertical workflow, not merely types:

- Strict domain/TLD/contact/consent and exact-money contracts, fake adapter and mocked
  official transport, default-deny mode/host/credential guards and secret-redaction tests.
- Additive migration and actual SQL uniqueness/ownership tests; previous migration bytes,
  issued financial history and hosting setup/catalogue/renewal behavior unchanged.
- Authenticated API integration tests for both roles, restricted staff, cross-customer
  denial, duplicate submissions, concurrent registration claims and immutable snapshots.
- Existing verified-payment path, partial/pending/duplicate/refunded/reversed payment
  denials; generic status/dropdown cannot complete domain registration. Invoice-edit and
  cancellation/reversal races are exercised at the claim boundary.
- Provider pending/rejection/unknown state, malformed/oversized response, missing money/
  currency, premium/claims, stale quotes, changed costs, account mismatch and unavailability.
  NoInvoice omissions must not be treated as authoritative customer/cost evidence.
- Crash/lost-response after successful remote mutation, duplicate worker/outbox delivery,
  ambiguous customer/contact creation and uncertain lookup never repeat a mutation.
  Confirmed outcome uses ownership-bound status/expiry, not payment or HTTP 200 alone.
- Chromium customer/admin mobile workflow with explicit simulated labels and independent
  invoice/domain outcomes; refresh/pricing/reconciliation do not issue purchases.
- Ordinary formatting/docs/lint/types/build, package/API/worker/invariant/browser checks,
  schema/migration preservation, security audit and pinned secret scan, followed by that
  exact commit's CI/CodeQL acceptance. Do not waive the retained tooling advisories.

Before Command 51, supply through protected local configuration and an approved runbook:

1. Separate official demo-account portal and provider confirmation that this identity
   cannot buy live domains. Resell.biz's public URL and a WHMCS test checkbox are insufficient.
2. Demo reseller identity/key, exact allowed HTTPS hosts/API access and worker egress IP;
   no secrets in chat or Git. Start with separately authorized read-only identity,
   balance/status, availability and cost checks; no automatic signup as a connection test.
3. Exact supported disposable domain/TLD/year, approved demo registrant/contact identities,
   actual agreements/consents, designated-agent false and approved nameservers.
4. Cost currency/unit, taxes/promotions, expected wallet effect, exact all-in budget,
   enforceable charge-control evidence or explicitly accepted residual risk. Confirm
   demo/no-charge semantics rather than assume a provider HTTP test costs nothing.
5. Exact operation sequence and mutation permission, operator/window, monitored stop
   conditions, polling/status vocabulary and support path for ambiguous results.
6. Protected evidence/backup plan and safe cleanup limits. Registration cannot necessarily
   be undone; deletion, renewal, transfer and nameserver changes need separate authority.

If genuine demo access is unavailable, keep the fake/mock-tested integration and stop;
never quietly use the owner's live account. Successful sandbox acceptance is not
production approval. First live registration would additionally need an exact domain,
customer authority, real verified payment, live account/cost approval, recovery evidence
and final explicit owner confirmation. No such operation occurred in Command 49.

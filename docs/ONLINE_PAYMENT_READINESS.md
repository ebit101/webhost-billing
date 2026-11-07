# Online payment production readiness

Reviewed **2026-11-07 (Asia/Dhaka)** for Command 219 against application commit
`eeae0ae` and the official documentation linked below. This is a source/contract
review, with local mocked checks. It does not certify a merchant account, actual
sandbox checkout, reachable callback, production release or live transaction.

## Decision and current gate

**Selected technical pilot: SSLCOMMERZ v4 Hosted Checkout**, initially with
fictional records and injected responses; genuine sandbox testing requires
separate authorization after access exists. Keep bKash as the alternative.
SSLCOMMERZ's published v4 create/IPN/validation/query contract aligns with the
installed adapter and offers a documented sandbox signup path. Its hosted flow
also fits the initial requirement to keep payment credentials outside this app.
This recommendation concerns implementation fit, not fees or merchant approval.

The owner confirmed on 2026-11-07 that **neither provider has approved API or
sandbox access yet**. Merchant selection/onboarding, pricing and channels still
need owner/provider agreement. No account was created and no credentials were
requested, inspected or changed by this review.

**Production gate remains closed.** Both real adapters and the shared gateway
interface support only `SANDBOX`, with pinned test endpoints/checkout hosts and
synthetic sandbox merchant labels. These restrictions are intentional isolation,
not configuration errors. Do not replace a hostname, insert live credentials or
remove an allowlist to make the current adapter operate in production. Retain
manual payments as the existing operational option. The pilot is one-time,
full-balance BDT checkout only: confirm the installation uses BDT. A different
locked base currency is a blocker, not permission to change it or introduce FX.
Recurring invoices do not authorize automatic wallet/card debits.

## Official contract evidence

These public pages were read on the review date. Documentation retrieval is not
an authenticated provider test. The SSLCOMMERZ v4 overview carries its historical
2019 update label; the date above records retrieval, not a new API release.

| Reference | Primary source                                                                                          | Relevant evidence                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| S1        | [SSLCOMMERZ v4 overview](https://developer.sslcommerz.com/doc/v4/)                                      | Hosted checkout, separate live/test endpoints and accounts, server-side validation and refund/status APIs. |
| S2        | [SSLCOMMERZ sandbox signup](https://developer.sslcommerz.com/registration/)                             | Sandbox registration is offered for test payments. No signup performed.                                    |
| S3        | [Transaction initiation and customer fields](https://sandbox-gw.sslcommerz.com/docs)                    | Session requests, customer phone/address fields and returned hosted checkout URL.                          |
| S4        | [SSLCOMMERZ IPN](https://sandbox-gw.sslcommerz.com/doc/v4/ipn.html)                                     | Form POST, merchant transaction reference, validation ID, currency/amount fields and risk indicators.      |
| S5        | [Order validation](https://sandbox-gw.sslcommerz.com/doc/v4/order-validation.html)                      | Authenticated validation request and successful/previously validated outcomes.                             |
| S6        | [Transaction query](https://sandbox-gw.sslcommerz.com/doc/v4/order-query.html)                          | Distinct merchant transaction/session/bank references and status lookup.                                   |
| B1        | [bKash online business](https://www.bkash.com/en/business/online-business)                              | Provider onboarding route; a wallet or merchant QR is not evidence of approved API access.                 |
| B2        | [bKash tokenized checkout without agreement](https://developer.bka.sh/docs/tokenized-without-agreement) | Hosted customer verification, execute/query confirmation and timeout recovery.                             |
| B3        | [bKash current create-payment reference](https://developer.bka.sh/docs/create-payment-3)                | V2 endpoint and response/callback fields differ from the installed legacy contract.                        |
| B4        | [bKash token management](https://developer.bka.sh/docs/token-managment-v2)                              | Token lifecycle, refresh and grant/refresh request limits.                                                 |
| B5        | [bKash IPN](https://developer.bka.sh/page/instant-payment-notification)                                 | Separately provisioned signed notifications/subscription confirmation, not the browser-return endpoint.    |
| B6        | [bKash refunds](https://developer.bka.sh/docs/refund-transaction)                                       | Provider refund/status capabilities, distinct from local invoice adjustments.                              |

The legacy versioned bKash create/execute URLs referenced in
[the existing integration guide](PAYMENT_GATEWAYS.md) could not be retrieved by
the web extractor during this review. That does **not** prove their API is
retired. The current portal's V2 create example uses a different endpoint and
`paymentId` response spelling, while its field table/callback example also use
`paymentID`; obtain the merchant-provisioned version and actual sandbox fixtures
before deciding compatibility. Never mix versions based on a generic example.

## Existing implementation versus missing acceptance

| Area             | Existing source behavior                                                                                                                                                 | Still required                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Billing boundary | Integer minor units, server-calculated invoice balance, ownership/CSRF checks, invoice locks, durable payment events and transaction uniqueness checks.                  | Selected-provider and manual-payment races against PostgreSQL; remote capture versus local settlement recovery.                                                    |
| Checkout         | Same submission key reuses a saved unexpired session; session creation is claimed once.                                                                                  | Browser retry identity, cross-key duplicate attempts, recovery without a saved external reference and authoritative expiry.                                        |
| SSL callback     | Form IPN is validated server-to-server before normalization. Browser returns only navigate.                                                                              | Real sandbox payload shape, stored transaction binding, bank reference retention, risk/replay transitions and delayed IPNs.                                        |
| bKash callback   | Legacy callback calls authenticated execute/query; matching payment ID and amount/currency are required. Generic bKash webhook rejects requests.                         | Merchant API version agreement, callback execution fencing and optional IPN contract decision.                                                                     |
| Credentials      | Administrator-managed bundles are encrypted with masked status and audited replacement; deployment fallback exists.                                                      | Explicit test/live and merchant binding, rotation of in-flight attempts and private production secret provisioning.                                                |
| Operations       | Full-administrator attention queue and explicit pending-payment reconciliation exist. New checkout selection is separate from resolving an inactive configured provider. | Bounded rechecks/runbook, orphan attempts, late money after another settlement, and a tested stop-new-checkouts procedure.                                         |
| Refunds          | Neutral interface has an optional refund method; fake adapter implements it. Manual charges have append-only refund/reversal records.                                    | Neither real gateway implements refund dispatch; the existing adjustment service refuses online originals. No online refund/chargeback reconciliation is accepted. |
| Production       | Both real adapters are sandbox-only; application UI labels online checkout as sandbox.                                                                                   | Reviewed live adapter/environment identity and hosts, merchant approval, release acceptance and separately approved pilot.                                         |

Source map: [gateway contract](../apps/api/src/modules/payment-gateways/payment-gateway.interface.ts),
[registry](../apps/api/src/modules/payment-gateways/payment-gateway.registry.ts),
[settlement/reconciliation service](../apps/api/src/modules/payment-gateways/payment-gateway.service.ts),
[controller](../apps/api/src/modules/payment-gateways/payment-gateway.controller.ts),
[SSL adapter](../apps/api/src/modules/payment-gateways/sslcommerz-payment.gateway.ts),
[bKash adapter](../apps/api/src/modules/payment-gateways/bkash-payment.gateway.ts),
[credential service](../apps/api/src/modules/settings/integration-credential.service.ts),
[customer checkout](../apps/web/src/components/payments/customer-gateway-payment.tsx)
and [payment adjustments](../apps/api/src/modules/payments/payment.service.ts).

## Confirmed gaps and contract questions for Command 220

No runtime fix is included in Command 219. “Reproduced” below means injected
HTTP/in-memory service records, not an actual bank transaction or database race.

| ID     | Evidence/status                                                                                                                                                                                                                                                                                                              | Required outcome                                                                                                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 219-01 | Confirmed isolation limit: interface/adapters expose only sandbox mode, pinned hosts and synthetic merchant IDs. Credentials are keyed only by provider, without test/live merchant revision on payment attempts.                                                                                                            | Add explicit reviewed environment/account identity before any live implementation. Keep independent activation controls; do not relax sandbox pins.                                                                      |
| 219-02 | Reproduced: SSL query returns the same merchant transaction ID while changing from pending to successful. `reconcilePayment` builds the same event ID; `replay` rejects its changed content with 422. Time-varying observation timestamps can also alter the normalized hash.                                                | Distinguish authoritative observations from immutable delivery identity. Pending/risk-held observations must be able to progress once, retaining audit history and replay protection.                                    |
| 219-03 | Reproduced at service boundary: simultaneous bKash success callbacks both enter execute. After one succeeds, a later provider error writes `FAILED` by payment ID without a pending-state condition. In-memory invoice remains paid while that payment becomes failed. Database concurrency was not exercised by this probe. | Fence execute claims, re-read final state under locks and make stale/error updates conditional. Verify in PostgreSQL that a late error cannot downgrade confirmed settlement. Applies to the alternative bKash pilot.    |
| 219-04 | Confirmed source gap: unknown session creation can leave a pending payment with `reference=null`; reconciliation requires a reference. The browser generates a new UUID on every click, while uniqueness is per submission key, not one active invoice/provider attempt.                                                     | Preserve browser attempt identity, block/review overlapping attempts and provide safe recovery for lost create replies. Never blindly create another external charge.                                                    |
| 219-05 | Confirmed SSL mapping gap: normalization stores merchant `tran_id` as the provider transaction ID and discards `bank_tran_id`; the common validator does not compare SSL `tran_id` with the payment's saved reference.                                                                                                       | Retain separate merchant transaction, session, validation and bank references; bind callback proof to the stored attempt. Preserve the bank reference needed for refund/status operations (S4–S6/S1).                    |
| 219-06 | Reproduced: an SSL query with `risk_level` omitted normalizes a valid transaction as successful; only literal `1` creates a hold. A proven safe/unknown policy and release of risk-held observations are not accepted.                                                                                                       | Define required risk evidence and fail closed on missing/unknown risk until provider-approved policy exists. Verify risk transitions, not only the existing high-risk fixture.                                           |
| 219-07 | Confirmed code assumption; merchant compatibility unverified: IPN schema requires `store_id`. The published IPN table does not promise that field. A fixture without it is rejected before authoritative validation.                                                                                                         | Capture an authorized sandbox fixture and establish merchant authentication through the documented validation contract. Do not accept arbitrary stores or remove checks without replacement proof.                       |
| 219-08 | Confirmed mapping assumption: SSL initiation sends `cus_phone='N/A'` and does not carry a phone in the neutral session input. S3 describes a customer phone field; its requirement wording also mentions logistics.                                                                                                          | Map a validated customer contact or obtain explicit provider approval of omission for hosted digital services; verify country/address conventions. Actual rejection behavior is unverified.                              |
| 219-09 | Confirmed financial gap: invoice locks reject a second settlement, but money already captured externally after manual/other payment needs an unallocated/duplicate-capture record and refund review. Real gateway refunds and online adjustments are absent.                                                                 | Record authoritative remote capture without a second invoice credit; add a reviewed append-only online refund/reconciliation path before a live pilot. Do not relabel an online charge as manual.                        |
| 219-10 | Confirmed source gaps: provider HTTP response is read without a byte cap; SSL query failure text can flow from provider `error` into a failure reason. Documented validation/query URLs put store credentials in query strings.                                                                                              | Bound response bytes, classify unknown outcomes safely, allow only reviewed hosts and redact URLs/provider text from logs, telemetry and customer-facing errors. Existing HTTP code rejects redirects and uses timeouts. |
| 219-11 | Confirmed local policy, external contract unverified: bKash expiry is locally assigned 24 hours; SSL expiry 30 minutes. Expiry blocks reusing that URL but does not prove a remote transaction can no longer complete.                                                                                                       | Confirm provider expiry per version/account; preserve delayed authoritative success and handle already-paid/cancelled invoices through financial review. Do not treat a local timer as payment failure.                  |
| 219-12 | Current bKash contract difference: B3/B4 describe V2 fields/endpoints/token refresh; installed code pins v1.2.0-beta and re-grants tokens, sharing them only inside one API process. B5 describes signed IPN, not implemented here.                                                                                          | If choosing bKash, obtain version-specific provider agreement; then implement compatible fixtures/token coordination and an explicit callback/IPN choice. Preserve legacy isolation until that decision.                 |

Other unverified cases include late success after a recorded failure, valid
callbacks with changed encoding/field order, credential rotation between checkout
and IPN, account suspension, missing provider dates and IPN acknowledgement/retry
timing. They belong in the acceptance matrix, not in a claim of production safety.

## SSLCOMMERZ pilot prerequisites

These are blocking evidence items, not permission to change an account:

- [ ] Owner obtains a private sandbox account through S2 and confirms v4 Hosted
      Checkout entitlement. Keep sandbox and live store IDs/passwords separate.
- [ ] Provider confirms allowed payment channels, hosting/digital-service merchant
      classification, limits, fees, settlement schedule, disputes and refund access.
      No pricing, approval duration or channel entitlement is assumed here.
- [ ] Owner approves an isolated test environment, fictional customer/invoice,
      test wallet/card instructions and public HTTPS API callback origin. No actual
      customer invoice or real payment credentials may substitute for test data.
- [ ] Register and verify the actual API IPN URL, plus success/fail/cancel return
      URLs. TLS, DNS, reverse-proxy routing, form/raw-body handling, rate limits and
      provider retry behavior must work without a customer browser session.
- [ ] Resolve 219-02 and 219-04–11 and pass the local selected-provider matrix.
- [ ] Enter sandbox secrets privately through the existing credential mechanism
      only for the authorized test window. Neither a false bootstrap flag nor an
      unchanged `.env` proves stored credentials are inactive: the registry can use
      configured encrypted credentials independently of those flags.
- [ ] Complete authorized sandbox success/failure/delay/recovery/refund evidence,
      comparing the provider's transaction record with one retained local charge.
- [ ] Before any live pilot, implement approved live-mode identity/host handling
      (219-01), arrange production merchant approval and private secret provisioning,
      refund/reconciliation capability and deploy a separately approved release.

S1 distinguishes test/live stores and endpoints. S4/S5 require validation of the
transaction and amount; `VALIDATED` is not a second payment. S6 distinguishes a
bank reference from the merchant reference. Refund initiation/status in S1 needs
the bank transaction identity; the docs also call for registered public IP access
for live refund operations. Confirm actual merchant permissions with the provider.
Use strict TLS verification even if an old sample disables it locally.

## bKash alternative prerequisites

Start with B1 to request approved PGW access, not a personal wallet PIN or a
third-party credential bundle. Obtain the provisioned API version, private app
key/secret and API username/password plus sandbox test-user instructions. The
installed legacy adapter cannot be assumed compatible with V2 credentials.

B2 requires execute/query proof after the callback and treats a timeout as
uncertainty. B3's request/response differs from the installed legacy schema;
agree exact casing and callback validation with bKash. B4's refresh/rate guidance
requires review of the existing re-grant/per-process token cache. B5's signed
notifications require separate provisioning and trusted subscription/signature
handling; never follow an unverified subscription/certificate URL. B6's provider
refund capability does not add a local refund operation to this application.

If bKash becomes the owner's chosen provider, close 219-03/04/09–12 and the shared
identity/replay/risk-equivalent requirements, then repeat the matrix with that
version's contract. Do not implement saved-wallet agreements, automatic recurring
debits, capture-later payments or extra products as part of this first pilot.

## Acceptance matrix for Command 220

Every row requires fictional local records and an injected transport first.
“Existing check” means current mocked coverage only, not provider approval.
Authorized genuine sandbox checks follow after access and local fixes.

| Scenario                                                           | Required evidence                                                                                          | Current status                                                                       |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Owned full-balance BDT checkout                                    | Server amount/identity, no browser-supplied price, no secret/card data in app responses.                   | Existing mocked checks; selected-provider customer-field acceptance pending.         |
| Same-key, new-key and double-click retries                         | One intended attempt, persisted browser key, no duplicate remote creation.                                 | Same-key checks exist; 219-04 open.                                                  |
| Lost create response or crash before saving session                | Retained intent and safe provider lookup/manual recovery without blind mutation retry.                     | 219-04 open.                                                                         |
| Hosted success return without IPN                                  | Invoice remains unpaid until validated remote proof arrives.                                               | Existing fake/adapter boundary checks.                                               |
| Valid IPN and repeat `VALID`/`VALIDATED` observations              | Exact store/attempt, gross amount, BDT and transaction proof; one settlement/outbox/audit.                 | SSL mocks exist; 219-02/05/07 and merchant fixtures open.                            |
| Wrong merchant, invoice, payment, amount or currency               | No invoice credit and retained safe rejection evidence.                                                    | Existing generic mocks; actual SSL stored-reference binding pending.                 |
| High, missing and changed risk result                              | Hold unknown/risky outcomes; approved safe evidence can progress exactly once.                             | High-risk mock exists; 219-02/06 open.                                               |
| Pending query followed by success                                  | Different authoritative observations advance safely, without replay conflict.                              | Probe reproduces 219-02.                                                             |
| Concurrent IPN/reconciliation/manual settlement                    | Exactly one invoice credit; retain and review any second remote capture.                                   | Generic locking coverage; selected-provider PostgreSQL and capture recovery pending. |
| Cancel, failure, expiry and later success                          | No settlement from navigation; resolve authoritative late money independently of local URL expiry.         | Partial mocked coverage; failure-to-success policy/219-11 pending.                   |
| Provider timeout, malformed response, oversized reply and redirect | Bounded processing, no blind execute/create retry and no leaked payloads/secrets.                          | Timeout/redirect handling exists; 219-10 open.                                       |
| Rotation, stop-new-checkouts and delayed IPN                       | Keep correct old-attempt account binding and recovery while new sessions stop.                             | Active selection is separate; rotation/live identity acceptance pending.             |
| Provider refund, delayed refund and external refund                | Reviewed remote operation, status confirmation and new linked local transaction; preserve original charge. | Real implementation/219-09 absent.                                                   |
| Refund/capture uncertainty or duplicate remote collection          | Idempotent review record, no second credit and no unverified success override.                             | Blocking work in 219-09.                                                             |
| bKash alternative: concurrent browser returns                      | One execute claim; late provider errors cannot rewrite terminal state.                                     | Mock probe reproduces 219-03; database acceptance pending.                           |

## Validation performed and next action

- Existing bKash, SSL, fake gateway and money suites: **36/36 passed**, four suites.
  All use fictional credentials and injected HTTP; no provider API was called.
- Four direct review probes against the compiled adapter/service, using in-memory
  records and injected HTTP, reproduced 219-02, the service-level 219-03 write,
  219-06 and the input behavior in 219-07. A reproduced deficiency is an open
  readiness finding, not a passed production requirement. No database race was
  certified by these probes.
- Public official documentation was retrieved, compared and linked. No account
  registration, credentials, live flags, database data, network payment operation,
  app behavior, schema, dependencies, version or deployment was changed.
- Formatting, local documentation references and contributor paths are recorded
  in [the progress log](PROGRESS.md). Full application CI is unnecessary for this
  documentation-only command and was not run.

**Next recommended command: Command 220 — Verify the selected online gateway end
to end.** Start with the selected SSLCOMMERZ local fixes and fictional adapter/API/
PostgreSQL tests above. Stop at the real-sandbox boundary until the owner has
access and explicitly authorizes its environment and test scope. Command 221,
real payments, refunds, account changes, publishing and deployment all require
separate authorization.

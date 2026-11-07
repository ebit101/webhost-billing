# Payment gateways

**Readiness review — 2026-11-07:** Both real adapters remain sandbox-only.
Command 219 selects SSLCOMMERZ Hosted Checkout for the first technical pilot and
records confirmed recovery gaps and unverified merchant contracts in
[online payment readiness](ONLINE_PAYMENT_READINESS.md). The owner currently has
access to neither provider. Existing mock tests do not certify genuine sandbox
or production use; no gateway activation is authorized.

**Command 220 local update:** SSLCOMMERZ now uses bound retained checkout and
refund recovery, with merchant/credential snapshots, semantic observations and
unapplied-capture review. Read [the current SSL policy](SSLCOMMERZ_CHECKOUT_RECOVERY.md)
for its rules and local acceptance. Generic/fake and legacy bKash behavior below
does not imply those same guarantees for bKash.

## Scope

Commands 12 and 13 provide the provider-neutral payment boundary plus sandbox-only bKash Tokenized Checkout and SSLCOMMERZ Hosted Checkout adapters. Cash and bank deposits remain the reviewed manual-payment flow described in `MANUAL_PAYMENTS.md`. No production credential or real charge is part of this integration.

`FakePaymentGateway` remains available only when `NODE_ENV` is `development` or `test`. The real adapters are registered only when their complete, runtime-validated sandbox configuration is enabled.

## Provider-neutral contract

Every payment adapter implements `PaymentGateway` with:

- application-attempt session idempotency, without blindly retrying uncertain external creation;
- provider-specific callback authentication: exact-byte signatures for the fake provider, authoritative SSL validation and legacy bKash execute/query proof;
- provider-event normalization into internal status and identity fields;
- server-to-server transaction-status lookup;
- provider transaction-ID extraction;
- an optional refund operation.

Provider-specific request shapes, signature rules, statuses, credentials, and errors stay behind this interface. The normalized event contains a unique provider event ID, merchant identity, internal payment and invoice IDs, integer minor-unit amount string, currency, transaction ID, occurrence time, and normalized status.

## Session creation

`POST /payment-gateways/:provider/sessions` requires an authenticated administrator or customer plus CSRF validation. Customers may use only invoices they own. The API:

1. locks and re-reads the invoice;
2. accepts only an `UNPAID` or `OVERDUE` invoice with a positive balance;
3. creates one pending full-balance gateway `Payment` using a UUID submission key and atomically claims its external-session creation;
4. records a safe audit event;
5. calls the adapter with its own provider-neutral session request;
6. stores the provider session reference, checkout URL, and expiry and returns money as a decimal string.

An exact retry returns the same unexpired session. Same-key concurrent retries cannot create two external sessions. SSLCOMMERZ additionally holds different keys behind one unresolved invoice attempt and preserves a pre-saved merchant reference after lost creation responses. An uncertain create result cannot be blindly retried. Reusing a submission key for another invoice conflicts. Creating a session does not settle the invoice, and a checkout or browser redirect is never evidence of payment.

## Webhook processing

This section describes the generic/fake and legacy bKash processor. The bound
SSLCOMMERZ path additionally retains unapplied remote captures and deduplicates
semantic observations rather than rejecting changed form encoding; its current
rules are in [SSLCOMMERZ recovery](SSLCOMMERZ_CHECKOUT_RECOVERY.md).

`POST /payment-gateways/:provider/webhooks` is public because the provider, not a browser session, calls it. It explicitly skips browser CSRF and uses the adapter's documented provider authentication. The route is Redis-rate-limited to 120 requests per source address per minute and accepts at most 256 KiB.

NestJS raw-body capture is enabled at bootstrap. Provider verification occurs before normalized database processing and uses the exact bytes received. Signatures, credentials, access tokens, checkout URLs, and raw provider payloads are never placed in logs or administrator responses.

After authentication, processing requires all of the following to match:

- the configured adapter merchant identity;
- the internal payment ID and invoice ID;
- the expected pending gateway provider and charge kind;
- the payment-session amount and current invoice balance;
- the payment and invoice currency;
- a unique provider transaction ID for successful events;
- an unpaid or overdue invoice;
- a unique provider event ID with the same payload hash on replay.

A successful event runs in one PostgreSQL transaction: it inserts the immutable `PaymentEvent`, locks the invoice, revalidates all values, finalizes the pending `Payment`, updates invoice aggregates/status, marks a linked awaiting-payment order paid, appends audit records, and inserts one `GATEWAY_PAYMENT_SUCCEEDED` outbox event. Provider failures similarly finalize the pending payment as failed and append `GATEWAY_PAYMENT_FAILED` to the outbox without changing the invoice. Pending notifications are recorded as ignored.

Signed but mismatched events are recorded as failed normalized events and do not modify payments or invoices. Invalid signatures and malformed payloads are rejected before financial processing. Exact replays return an idempotent acknowledgement; reusing an event ID with different bytes is rejected.

The synchronous request performs only the minimal durable financial transaction. Email, provisioning, service renewal/reactivation, and other slow or retryable effects belong to outbox consumers so their failure can never roll back a verified payment.

## Fake adapter

The fake adapter uses deterministic local sessions and HMAC-SHA256 callbacks for development and automated tests. Its signing key is domain-separated from the development credential-encryption secret and is not exposed through an HTTP route. It supports in-memory transaction-status fixtures and the optional refund contract for adapter tests.

The fake checkout URL is a non-production placeholder. There is deliberately no browser-success endpoint that can mark an invoice paid.

## bKash sandbox

Command 167 (02/11/2026) prepares the existing v1.2.0-beta sandbox adapter for
credentialed acceptance. The owner does not yet have sandbox access. Local tests
use injected HTTP responses; they do not establish a genuine bKash connection.

The bKash adapter implements the official Tokenized Checkout flow. A provider-returned checkout URL is accepted only when it is credential-free HTTPS on a pinned supported bKash sandbox checkout hostname; arbitrary provider-controlled redirects are rejected before persistence or navigation.

1. grant and cache a short-lived token using the sandbox app key/secret and username/password;
2. create a `sale` payment in BDT and return the provider's `bKashURL`;
3. receive the browser callback containing `paymentID` and status;
4. on a successful return, execute the payment from the API server;
5. after an uncertain execute response, query the payment by `paymentID` before deciding its state.

Execute and query evidence must name the exact requested payment ID. Mismatched,
unknown or contradictory evidence remains unresolved and cannot settle an invoice.
Amounts must be exact decimal strings; JSON numeric amounts are rejected. A
provided API status code must indicate success. Accept the documented `bkashURL`
field and the existing `bKashURL` compatibility field only when unambiguous, then
apply the sandbox checkout-host checks. Raw provider error text is not retained as
a customer-visible failure reason. Reuse an in-flight token request for concurrent
checkouts to avoid duplicate authentication; credential-revision isolation remains.

The adapter checks its pinned sandbox API URL at every request boundary, including
when administrator-stored credentials activate it independently of bootstrap
environment flags. A production/custom API destination is rejected before any
credential or request is sent. Existing invoice/merchant/currency/amount/transaction
and replay checks still govern settlement; a browser return alone proves nothing.

### Obtain sandbox access

1. Start with the [official developer portal](https://developer.bka.sh/) and the
   [versioned Tokenized Checkout guide](https://developer.bka.sh/v1.2.0-beta/docs/create-payment-1).
   If credentials have not been issued, use bKash's [Online Business enquiry](https://www.bkash.com/en/business)
   to request Tokenized Checkout sandbox access for this integration. Request the
   sandbox app key, app secret, API username/password and published test-wallet
   instructions. Do not substitute a merchant wallet PIN or production keys.
2. Once issued, enter the bundle privately through the existing administrator
   settings credential form or the approved local secret store. Keep manual
   payments selected until a controlled test window is authorized. No secrets,
   sandbox OTP/PIN or access token belongs in Git, chat, reports or screenshots.
3. The planned staging callback is
   `https://my.speedhost.bd/payment-gateways/bkash/callback`. Verify its HTTPS
   reachability and the API/web origins in the authorized test environment first;
   this source command neither deploys nor certifies that public callback.
4. Use a fictional customer and invoice with the provider's sandbox test wallet.
   Confirm success, cancel/failure, unknown outcome, amount/currency/identity
   mismatches and duplicate returns. Inspect the authoritative ledger, and verify
   one settlement only after authenticated execute/query proof. Keep hosting,
   registrar, WhatsApp and all live payment operations disabled.

Official contract references: [token management](https://developer.bka.sh/v1.2.0-beta/docs/token-management-overview-3),
[create payment](https://developer.bka.sh/v1.2.0-beta/docs/create-payment-1) and
[execute payment](https://developer.bka.sh/v1.2.0-beta/docs/execute-payment-1).
The portal also publishes V2 documentation; this command preserves the installed
adapter's versioned protocol rather than silently mixing versions or credentials.

The installed legacy callback is navigation, not a signed webhook and never settles from query-string values alone. The current bKash portal separately documents a signed IPN product that this adapter does not implement; see the Command 219 version review. The server requires the stored payment/session identity and bKash's authenticated execute/query response. A completed transaction must still match the stored invoice, amount, currency, and unique transaction ID.

Official references: [checkout overview](https://developer.bka.sh/docs/checkout-process-overview), [grant token](https://developer.bka.sh/docs/grant-token-1), [create payment](https://developer.bka.sh/docs/create-payment-2), [execute payment](https://developer.bka.sh/docs/execute-payment-2), and [query payment](https://developer.bka.sh/docs/query-payment-2).

## SSLCOMMERZ sandbox

The SSLCOMMERZ adapter posts BDT invoice/customer/product snapshots and the customer's real contact phone to the official v4 sandbox session endpoint. It redirects to `GatewayPageURL` only when credential-free HTTPS on `sandbox.sslcommerz.com`. Before that request, retain the merchant reference, sandbox identity and encrypted credential snapshot. Validate IPN with that bound account, retaining the distinct bank reference and checking amount/currency, transaction and optional echoed internal IDs. Missing, unknown or high risk and missing completion time remain held. A store ID in the IPN is optional but must match when present. See the current recovery policy for concurrent settlement, semantic replay, legacy holds and refunds.

Browser success/fail/cancel returns only navigate back to the invoice. They never establish payment. Administrator reconciliation uses the Merchant Transaction ID Validation API and the stored merchant transaction reference.

Official reference: [SSLCOMMERZ integration documentation v4](https://developer.sslcommerz.com/doc/v4/).

## Configuration

Both integrations are sandbox-only in this release. They support BDT without conversion. SSLCOMMERZ additionally enforces its documented BDT 10.00–500,000.00 session range.

```dotenv
API_PUBLIC_ORIGIN=https://public-api-development.example
PAYMENT_PROVIDER_TIMEOUT_MS=10000

BKASH_ENABLED=true
BKASH_SANDBOX_BASE_URL=https://tokenized.sandbox.bka.sh/v1.2.0-beta
BKASH_APP_KEY=replace-with-sandbox-value
BKASH_APP_SECRET=replace-with-sandbox-value
BKASH_USERNAME=replace-with-sandbox-value
BKASH_PASSWORD=replace-with-sandbox-value

SSLCOMMERZ_ENABLED=true
SSLCOMMERZ_STORE_ID=replace-with-sandbox-value
SSLCOMMERZ_STORE_PASSWORD=replace-with-sandbox-value
```

Keep populated values only in an ignored runtime `.env` or deployment secret store. Never commit them. `API_PUBLIC_ORIGIN` must be an externally reachable, credential-free HTTPS origin for provider callbacks; local-only origins require a deliberate secure tunnel during sandbox testing. The application refuses incomplete enabled configurations and refuses a bKash base URL other than the pinned official sandbox API base.

Command 21 also supports administrator-managed encrypted bKash and SSLCOMMERZ bundles. A stored bundle takes precedence over the environment fallback, and only the active configured gateway is offered for new checkout sessions. Existing callbacks and reconciliation can still resolve an inactive configured provider. See `docs/SETTINGS_AND_SECRETS.md` for masking and rotation procedures.

No automated test calls either provider. Provider-contract tests use a mocked HTTP boundary and fictional credentials. For a deliberate manual sandbox test, first obtain sandbox credentials from each provider, configure public callback reachability, use only the provider's published sandbox test identity, create a fictional BDT invoice, and verify the payment only through the administrator ledger/provider sandbox portal. Do not substitute production credentials.

## Timeouts, retries, and reconciliation

- Session creation and bKash execute are not automatically retried because an unknown result could duplicate an external financial operation.
- Token grant may retry once; read-only validation/query operations may retry twice for network or provider `5xx` failures.
- Requests use the configured 1–30 second timeout, reject redirects and bound response bodies to 256 KiB. SSL errors use fixed safe messages; credential-bearing validation URLs must also be redacted by external monitoring tools.
- SSLCOMMERZ unknown outcomes retain their saved reference and credential snapshot for administrator queries, even after stopping new checkouts or rotating current credentials. Local URL expiry does not prove failure. Retain late captures without another invoice credit when the balance is already closed. Legacy unbound SSL attempts and the alternative bKash recovery findings still require separate review.
- Reconciliation uses the same merchant, payment, invoice, amount, currency, status, transaction-uniqueness, invoice-lock, event-idempotency, and settlement checks as callbacks.

## API

| Method | Route                                                       | Access                    | Purpose                                     |
| ------ | ----------------------------------------------------------- | ------------------------- | ------------------------------------------- |
| `GET`  | `/payment-gateways`                                         | Administrator or customer | List enabled checkout choices               |
| `POST` | `/payment-gateways/:provider/sessions`                      | Administrator or customer | Create an owned idempotent payment session  |
| `POST` | `/payment-gateways/:provider/webhooks`                      | Provider callback         | Authenticate, normalize, and process an IPN |
| `GET`  | `/payment-gateways/bkash/callback`                          | Public bKash return       | Execute/query and return to the invoice     |
| `POST` | `/payment-gateways/sslcommerz/return/:status`               | Public browser return     | Navigate to the invoice without settlement  |
| `GET`  | `/payment-gateways/failures`                                | Administrator             | List safe gateway exceptions                |
| `POST` | `/payment-gateways/:provider/payments/:paymentId/reconcile` | Administrator             | Query and safely process a pending payment  |

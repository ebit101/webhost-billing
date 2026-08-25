# Payment Gateways

## Scope

Commands 12 and 13 provide the provider-neutral payment boundary plus sandbox-only bKash Tokenized Checkout and SSLCOMMERZ Hosted Checkout adapters. Cash and bank deposits remain the reviewed manual-payment flow described in `MANUAL_PAYMENTS.md`. No production credential or real charge is part of this integration.

`FakePaymentGateway` remains available only when `NODE_ENV` is `development` or `test`. The real adapters are registered only when their complete, runtime-validated sandbox configuration is enabled.

## Provider-neutral contract

Every payment adapter implements `PaymentGateway` with:

- idempotent payment-session creation;
- signature verification against the exact unparsed request bytes;
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

An exact retry returns the same unexpired session. Concurrent retries cannot create two external sessions. An uncertain create result remains pending with a safe administrator-visible reconciliation reason and cannot be blindly retried. Reusing a submission key for another actor or invoice conflicts. Creating a session does not settle the invoice, and a checkout or browser redirect is never evidence of payment.

## Webhook processing

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

The bKash adapter implements the official Tokenized Checkout flow:

1. grant and cache a short-lived token using the sandbox app key/secret and username/password;
2. create a `sale` payment in BDT and return the provider's `bKashURL`;
3. receive the browser callback containing `paymentID` and status;
4. on a successful return, execute the payment from the API server;
5. after an uncertain execute response, query the payment by `paymentID` before deciding its state.

The callback is navigation, not a signed webhook and never settles from query-string values alone. The server requires the stored payment/session identity and bKash's authenticated execute/query response. A completed transaction must still match the stored invoice, amount, currency, and unique transaction ID.

Official references: [checkout overview](https://developer.bka.sh/docs/checkout-process-overview), [grant token](https://developer.bka.sh/docs/grant-token-1), [create payment](https://developer.bka.sh/docs/create-payment-2), [execute payment](https://developer.bka.sh/docs/execute-payment-2), and [query payment](https://developer.bka.sh/docs/query-payment-2).

## SSLCOMMERZ sandbox

The SSLCOMMERZ adapter posts BDT invoice/customer/product snapshots to the official v4 sandbox session endpoint and redirects the customer to `GatewayPageURL`. It accepts the provider's form-encoded IPN only after calling the official Order Validation API with `val_id`. The validation result must be `VALID` or `VALIDATED` and must exactly match the IPN transaction, validation ID, internal payment/invoice values, amount, and currency. A `risk_level` of `1` remains pending, is not settled, and is placed in the administrator attention queue.

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
- Requests use the configured 1–30 second timeout, reject redirects at the API boundary, and return only fixed safe failure text.
- Unknown outcomes remain pending. Administrators can use the Payments attention queue to query the provider; definitive failures remain immutable failed attempts.
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

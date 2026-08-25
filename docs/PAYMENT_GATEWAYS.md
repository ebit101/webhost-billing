# Payment Gateway Adapter

## Scope

Command 12 adds the provider-neutral online-payment boundary, a development/test fake adapter, authenticated raw-body webhooks, replay protection, invoice settlement, and transactional outbox handoff. It does not select or integrate a real payment provider, make real charges, process cards, perform provisioning, or consume outbox events.

`FakePaymentGateway` is available only when `NODE_ENV` is `development` or `test`. Production rejects the fake provider. Command 13 must add separately validated real-provider configuration and must preserve the fake for automated tests.

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
3. creates one pending full-balance gateway `Payment` using a UUID submission key;
4. records a safe audit event;
5. calls the adapter with its own provider-neutral session request;
6. stores the provider session reference and returns money as a decimal string.

An exact retry returns the same payment and deterministic fake session. Reusing a submission key for another actor or invoice conflicts. Creating a session does not settle the invoice, and a checkout or browser redirect is never evidence of payment.

## Webhook processing

`POST /payment-gateways/:provider/webhooks` is public because the provider, not a browser session, calls it. It explicitly skips browser CSRF and instead requires the adapter's `X-Payment-Signature`. The route is Redis-rate-limited to 120 requests per source address per minute and accepts at most 256 KiB.

NestJS raw-body capture is enabled at bootstrap. Signature validation occurs before JSON parsing or database processing and uses the exact bytes received. Signatures and raw payloads are never stored or logged.

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

## API

| Method | Route                                  | Access                    | Purpose                                    |
| ------ | -------------------------------------- | ------------------------- | ------------------------------------------ |
| `POST` | `/payment-gateways/:provider/sessions` | Administrator or customer | Create an owned idempotent payment session |
| `POST` | `/payment-gateways/:provider/webhooks` | Signed provider callback  | Verify, normalize, and process an event    |

No real payment provider is configured by this command.

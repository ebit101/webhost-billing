# Manual Payments

## Scope

Command 11 implements text-only manual payment submission, administrator review, administrator-recorded receipts, invoice settlement, and append-only refunds and reversals. It does not implement a payment gateway, webhook, file upload, automatic provisioning, renewal, or service reactivation.

## Payment vocabulary

The database retains provider-neutral `PaymentKind` and `PaymentStatus` values for future gateway work. The manual-payment API derives the business-facing state:

| Stored transaction                    | Manual state |
| ------------------------------------- | ------------ |
| `CHARGE` + `PENDING`                  | `PENDING`    |
| `CHARGE` + `SUCCEEDED`                | `VERIFIED`   |
| `CHARGE` + `FAILED` or `CANCELLED`    | `REJECTED`   |
| successful append-only `REFUND` row   | `REFUNDED`   |
| successful append-only `REVERSAL` row | `REVERSED`   |

A rejected pending reference never changes its invoice. A verified charge is immutable. Refunds and reversals create new positive-valued adjustment rows linked through `originalPaymentId`; they do not update or delete the original charge.

## Submission and proof boundary

Customers may submit a reference for an invoice they own. Administrators may record a receipt as already verified. Both paths accept only:

- a controlled manual method;
- a text transaction/reference identifier;
- optional payer name and note;
- an optional UTC-offset payment timestamp.

The schema is strict and has no filename, URL, binary data, attachment, or upload field. Passwords, PINs, full card numbers, secret codes, and raw provider payloads must never be entered as proof. The internal normalized reference hash is not exposed by the API.

UUID submission keys make charge and adjustment creation idempotent. An exact retry returns the existing result. Reusing a key for different input conflicts. A verified reference is also protected by a provider/reference uniqueness constraint.

## Settlement and concurrency

Only `UNPAID` and `OVERDUE` invoices with a positive balance accept charges. Currency is derived from the invoice; clients cannot choose it.

`billing.manual-payments` contains `partialPaymentsEnabled`, which defaults to `false`. When false, a payment must equal the complete current balance both at submission and at administrator verification. When true, a positive amount up to the balance is accepted.

Verified charge application runs in one PostgreSQL transaction:

1. lock the invoice row;
2. re-read the payment, invoice, and payment setting;
3. conditionally move one pending charge to succeeded;
4. update `amountPaid`, `balanceDue`, and invoice status;
5. mark a linked awaiting-payment order paid only when the invoice reaches zero balance;
6. append administrator/security audit records.

The invoice lock serializes different payments for the same invoice. The conditional pending-state update prevents two reviewers from applying the same payment. Overpayment rolls back the complete transaction.

Refunds and reversals use the same invoice lock. Their sum cannot exceed the remaining unadjusted amount of the original verified charge or the invoice's current net paid amount. A partial adjustment sets the invoice to `PARTIALLY_REFUNDED`; reducing net paid amount to zero sets it to `REFUNDED`. Service state is not changed automatically.

## API

| Method  | Route                              | Access                 | Purpose                                    |
| ------- | ---------------------------------- | ---------------------- | ------------------------------------------ |
| `GET`   | `/payments/settings`               | Administrator          | Read partial-payment policy                |
| `PATCH` | `/payments/settings`               | Administrator          | Update and audit partial-payment policy    |
| `POST`  | `/payments/manual/customer`        | Customer               | Submit an owned pending reference          |
| `POST`  | `/payments/manual/admin`           | Administrator          | Record and apply a verified manual receipt |
| `GET`   | `/payments`                        | Administrator          | Search/filter manual payment ledger        |
| `GET`   | `/payments/my`                     | Customer               | List only owned manual payments            |
| `GET`   | `/payments/:paymentId`             | Administrator or owner | Read protected transaction details         |
| `PATCH` | `/payments/:paymentId/review`      | Administrator          | Verify or reject one pending reference     |
| `POST`  | `/payments/:paymentId/adjustments` | Administrator          | Append an idempotent refund or reversal    |

All mutations require cookie authentication, role authorization, and CSRF validation. Customer detail and list access are scoped to the authenticated customer at the service/API boundary. No deletion route exists.

## Interfaces

- `/admin/payments` provides the payment ledger, pending review actions, administrator receipt entry, explicit partial-payment policy, and refund/reversal entry.
- `/portal/invoices/:invoiceId` contains the customer reference form and that invoice's manual-payment history.

The administrator must independently verify bank or mobile-financial-service evidence before approving a customer submission. A browser message or customer-entered reference is never proof of settlement.

# Invoice Management

## Scope

Command 10 implements administrator invoice generation and management, customer-owned invoice history and details, and a printable billing document. Order checkout continues creating issued unpaid invoices transactionally; administrators can additionally create editable standalone drafts.

Payment recording, refunds, reversals, and payment-provider callbacks remain later commands. Their future workflows must use the invoice calculation and state boundaries documented here.

## Money calculations

Every amount is an integer minor-unit value parsed from a canonical decimal string. JavaScript floating-point arithmetic is never used.

For each item:

```text
item subtotal = unit amount × quantity
line total    = item subtotal − item discount + item tax
```

For the invoice:

```text
subtotal    = sum(item subtotals)
discount    = sum(item discounts)
tax         = sum(item taxes)
total       = subtotal − discount + tax
balance due = total − credit − amount paid
```

Discount cannot exceed its item's subtotal. Credit plus paid amount cannot exceed the invoice total. Every multiplication and addition is checked against PostgreSQL `BIGINT`; PostgreSQL check constraints independently enforce nonnegative amounts, total consistency, settlement limits, and balance consistency.

The API calculates totals from administrator-entered item values. Clients cannot submit calculated subtotal, total, paid, or balance fields.

## Drafts and issued history

Administrator-created invoices begin in `DRAFT`. Draft dates, currency, credit, descriptions, quantities, prices, discounts, and taxes may be replaced. Draft line rows may be deleted and recreated because they are not issued financial history.

Issuance snapshots and locks the complete document. After issuance:

- item descriptions and amounts cannot be edited;
- customer name, email, address, and tax identity remain the creation snapshot;
- business identity remains the creation snapshot;
- invoice number and due date remain stable;
- no API route deletes the invoice or its items.

Order-created invoices begin at `UNPAID` and are already issued. A zero-balance or fully credited draft becomes `PAID` when issued because no payment is due; a positive balance becomes `UNPAID`.

## States and actions

Supported display states are `DRAFT`, `UNPAID`, `OVERDUE`, `PAID`, `CANCELLED`, `PARTIALLY_REFUNDED`, and `REFUNDED`.

The invoice module exposes only actions that can be proven without fabricating a payment:

- `ISSUE`: `DRAFT -> UNPAID`, or `DRAFT -> PAID` when balance is zero;
- `MARK_OVERDUE`: a past-due `UNPAID` invoice with a positive balance becomes `OVERDUE`;
- `CANCEL`: `DRAFT`, unpaid `UNPAID`, or unpaid `OVERDUE` becomes `CANCELLED`.

Paid invoices cannot be cancelled. They require a later refund or reversal transaction. `PAID`, `PARTIALLY_REFUNDED`, and `REFUNDED` transitions are therefore reserved for verified payment/refund workflows in Command 11. Cancelling an initial order invoice also cancels a still-pending/awaiting-payment order in the same transaction and records both audit events.

## Numbering and idempotency

Invoice numbers use `INV-YYYYMMDD-<16 uppercase hex>`, giving a human-readable date prefix and 64 random collision-resistant bits. PostgreSQL also enforces uniqueness.

Every invoice has a unique submission key. Administrator creation accepts a UUID; order checkout derives the invoice key from the order submission UUID. An exact retry returns the existing invoice with `duplicate: true`. Reusing a key for different input returns `CONFLICT`.

## Identity settings and snapshots

Administrators configure `business.identity` through the invoice screen or protected settings endpoint. The schema supports business name, address, country, contact details, and tax identifier. Future invoices snapshot that value. Existing draft and issued invoices do not change when the setting changes.

If the setting is absent, the safe minimum identity is `{ "name": "Webhost Billing" }`. Customer billing snapshots come from the selected customer at invoice creation.

## API

| Method  | Route                                  | Access                 | Purpose                                             |
| ------- | -------------------------------------- | ---------------------- | --------------------------------------------------- |
| `GET`   | `/invoices/settings/business-identity` | Administrator          | Read future-invoice identity source                 |
| `PATCH` | `/invoices/settings/business-identity` | Administrator          | Update and audit future-invoice identity source     |
| `POST`  | `/invoices`                            | Administrator          | Create an idempotent standalone draft               |
| `GET`   | `/invoices`                            | Administrator          | Search/filter all invoices                          |
| `GET`   | `/invoices/my`                         | Customer               | List only the authenticated customer's invoices     |
| `GET`   | `/invoices/:invoiceId`                 | Administrator or owner | Read full historical document                       |
| `PATCH` | `/invoices/:invoiceId/draft`           | Administrator          | Replace editable draft fields and lines             |
| `PATCH` | `/invoices/:invoiceId/action`          | Administrator          | Issue, mark overdue, or cancel under explicit rules |

All unsafe routes require session authentication, role authorization, and CSRF validation. Customer detail access is checked against the invoice's customer ID at the service layer.

## Interfaces

- `/admin/invoices` provides business identity settings, multi-line draft creation, status/balance listing, and detail navigation.
- `/admin/invoices/:invoiceId` provides draft editing, safe state actions, and the historical document.
- `/portal/invoices` lists the authenticated customer's documents.
- `/portal/invoices/:invoiceId` shows invoice details and links to a printable view.
- `/invoices/:invoiceId/print` renders a focused document with a browser print action. API ownership remains authoritative for the print route.

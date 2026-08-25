# Invoice Management

## Scope

Command 10 implements administrator invoice generation and management, customer-owned invoice history and details, and a printable billing document. Command 23 adds deterministic server-generated PDF downloads for issued invoices. Order checkout continues creating issued unpaid invoices transactionally; administrators can additionally create editable standalone drafts.

Manual payment recording, review, refunds, and reversals are implemented by Command 11 using the invoice calculation and state boundaries documented here. Payment-provider callbacks remain a later command.

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

Paid invoices cannot be cancelled. They require an append-only refund or reversal transaction. Verified manual charges move a fully settled invoice to `PAID`; successful adjustments move it to `PARTIALLY_REFUNDED` or `REFUNDED` without rewriting the original payment. Cancelling an initial order invoice also cancels a still-pending/awaiting-payment order in the same transaction and records both audit events.

## Numbering and idempotency

Invoice presentation numbers use the configured prefix, next number, and padding. Allocation locks the settings row and increments the sequence in the invoice transaction; PostgreSQL also enforces uniqueness.

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
| `GET`   | `/invoices/:invoiceId/pdf`             | Administrator or owner | Download an issued invoice as a private PDF         |
| `PATCH` | `/invoices/:invoiceId/draft`           | Administrator          | Replace editable draft fields and lines             |
| `PATCH` | `/invoices/:invoiceId/action`          | Administrator          | Issue, mark overdue, or cancel under explicit rules |

All unsafe routes require session authentication, role authorization, and CSRF validation. Customer detail and PDF access are checked against the invoice's customer ID at the service layer.

## PDF invoices

The API renders each download from the same serialized invoice returned by the ownership-checked detail service. Issued identity and item snapshots provide the stable historical source; current append-only payment adjustments supply paid, credited, refunded, and outstanding values. Editable drafts return `422 UNPROCESSABLE_ENTITY` until they are issued.

The A4 renderer includes:

- invoice number, state, created/issued/due dates, and public order number;
- snapshotted business and customer billing identities;
- item descriptions, quantities, unit values, discounts, tax, line totals, and service periods;
- subtotal, discount, tax, invoice total, credit, paid amount, and balance due;
- exact integer-minor-unit formatting, with BDT displayed to two decimal places;
- embedded Latin and Bengali font subsets, wrapped address/item text, repeated table headings, and numbered multi-page footers.

Generation uses no clock, random value, remote image, URL, credential, provider response, or database query. PDF metadata dates come from the invoice record, so the same serialized invoice produces byte-identical output. The document exposes human-facing invoice/order numbers but never serializes invoice, customer, order, or item database UUIDs.

The response is `application/pdf` with an attachment filename, exact content length, `Cache-Control: private, no-store`, and `X-Content-Type-Options: nosniff`. It is a raw file response rather than the normal JSON success envelope; failures retain the standard JSON error envelope.

## Interfaces

- `/admin/invoices` provides business identity settings, multi-line draft creation, status/balance listing, and detail navigation.
- `/admin/invoices/:invoiceId` provides draft editing, safe state actions, and the historical document.
- `/portal/invoices` lists the authenticated customer's documents.
- `/portal/invoices/:invoiceId` shows invoice details and offers PDF download plus a printable view after issue.
- `/invoices/:invoiceId/print` renders a focused document with a browser print action. API ownership remains authoritative for the print route.

# Order Creation

## Scope

Command 9 implements one-item hosting orders for authenticated customers and administrators. Every accepted request creates an order, its historical item snapshot, an issued unpaid invoice, itemized invoice lines, and an audit record in one PostgreSQL transaction. Payment collection, payment verification, approval, provisioning, and renewal remain later commands.

## API

| Method  | Route                     | Access                           | Purpose                                                      |
| ------- | ------------------------- | -------------------------------- | ------------------------------------------------------------ |
| `POST`  | `/orders/checkout`        | Customer                         | Create an order for the authenticated customer's own account |
| `POST`  | `/orders/admin`           | Administrator                    | Create an order for an active selected customer              |
| `GET`   | `/orders/my`              | Customer                         | Paginated list of the authenticated customer's orders        |
| `GET`   | `/orders`                 | Administrator                    | Paginated searchable order list                              |
| `GET`   | `/orders/:orderId`        | Administrator or owning customer | Order and initial-invoice detail                             |
| `PATCH` | `/orders/:orderId/status` | Administrator                    | Apply a permitted manual state transition                    |

Unsafe requests require the authenticated session cookie and CSRF header. Customer identity is taken from the server-side session; the customer checkout body cannot select a customer.

## Authoritative creation rules

The browser supplies only product ID, price ID, requested domain, and a UUID submission key. Administrator creation additionally supplies customer ID and an optional internal note. Request schemas reject extra price, amount, quantity, currency, discount, tax, and total fields.

The transaction revalidates that:

- the customer and user account are active;
- the product is active and has a non-secret hosting-package mapping;
- customer checkout uses a publicly visible product;
- the price belongs to the product, is active, is not deleted, and is inside its validity window;
- the normalized bare domain is syntactically valid;
- recurring amount plus setup fee fits PostgreSQL `BIGINT`.

The order snapshots product name, description, period, recurring amount, setup fee, currency, domain, product slug, and hosting package identifier. The invoice snapshots customer billing identity and the current `business.identity` setting. Until the settings command defines that record, the safe fallback is `{ "name": "Webhost Billing" }`.

## Idempotency and numbering

`Order.submissionKey` has a database unique constraint. A retry with the same key and the same customer/product/price/domain returns the original order and invoice with `duplicate: true`. Reusing the key for different input returns `CONFLICT`. This protects both sequential retries and concurrent insert races.

Order and invoice numbers use `ORD-YYYYMMDD-<16 hex>` and `INV-YYYYMMDD-<16 hex>`. The 64-bit random suffix is collision-resistant and each column also has a database unique constraint. Internal relationships continue using UUIDs.

## State boundaries

New orders start at `AWAITING_PAYMENT`; their initial invoices start at `UNPAID` with an immediate due date. An administrator may reject or cancel an awaiting-payment order, which cancels its draft/unpaid invoice in the same transaction. Directly marking an order paid is prohibited: only the future verified payment workflow may perform `AWAITING_PAYMENT -> PAID`.

The domain state machine recognizes the planned progression:

```text
pending -> awaiting_payment -> paid -> processing -> completed
```

Rejected, cancelled, and failed transitions are validated explicitly. Terminal states cannot be reopened through the general administrator endpoint.

## Interfaces

- `/portal/checkout` loads the current public catalogue, preserves selected product/price context, collects the domain, holds one UUID across safe retries, and shows the created order and unpaid invoice.
- `/portal/orders` lists only the authenticated customer's orders.
- `/admin/orders` loads protected customers, products, prices, and orders; creates offline-requested orders; and exposes only currently safe manual reject/cancel actions.
- Public product cards now link directly to authenticated checkout. An unauthenticated submission is rejected by the API and the interface offers sign-in.

API ownership and role checks remain authoritative regardless of which interface is visible.

# Customer Management

Command 7 implements customer administration and customer self-service through the NestJS `CustomerModule`, shared Zod contracts, and the existing cookie-session security boundary. Command 77 makes the bounded administrator context navigable without changing those business rules. Command 78 adds an ownership-bound portal summary whose action facts are derived on the server from the full customer account.

## API surface

| Method  | Route                                    | Access                           | Purpose                                                         |
| ------- | ---------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| `POST`  | `/customers`                             | Administrator                    | Create a customer and pending-verification account              |
| `GET`   | `/customers`                             | Administrator                    | Paginated search and customer-status filtering                  |
| `GET`   | `/customers/:customerId`                 | Administrator or owning customer | Customer detail and recent linked records                       |
| `GET`   | `/customers/:customerId/portal-summary`  | Owning customer                  | Server-derived portal actions and bounded recent context        |
| `PATCH` | `/customers/:customerId/profile`         | Administrator or owning customer | Update permitted contact/address fields                         |
| `PATCH` | `/customers/:customerId/billing`         | Administrator                    | Update administrator-only tax identity                          |
| `PATCH` | `/customers/:customerId/access`          | Administrator                    | Activate or deactivate portal access                            |
| `POST`  | `/customers/:customerId/change-password` | Owning customer                  | Verify the current password, change it, and revoke all sessions |

Unsafe requests require the signed CSRF header/cookie pair. Administrator-only routes use role authorization; shared customer routes additionally use the customer-ID ownership guard.

## Account rules

- Administrator creation queues the same email-verification outbox event as public registration. The initial password is Argon2id hashed and never returned.
- Activating access never proves email ownership. An unverified account returns to `PENDING_VERIFICATION`; a verified account returns to `ACTIVE`.
- Deactivation changes the customer to `INACTIVE`, changes the user to `DISABLED`, and immediately revokes active sessions.
- A customer can edit contact and address fields, but cannot change customer number, email identity, account status, or tax identifier.
- Password changes require the current password and revoke every active session, including the current session.
- Administrator mutations are written to `ActivityLog`. Metadata records changed field names and state, not the submitted personal values.

## Detail and history loading

Customer detail returns totals for orders, services, invoices, payments, and tickets plus the ten most recent records in each category. Monetary values use the shared lossless `{ amount: string, currency: string }` JSON contract. The administrator presentation uses the safe currency formatter and configured business time zone; it does not calculate authoritative money in the browser.

Recent invoices link to the existing administrator invoice detail. Orders, services, payments, and tickets link to their administrator ledgers with a validated `customerId` query. Each ledger displays the resolved customer identity, sends the filter through the existing API contract, identifies customer-specific empty results, and provides a clear action. Repeated or malformed values are ignored and shown as invalid rather than being used to infer customer context.

## Portal next-action summary

The customer portal home does not calculate balances from its bounded recent lists. The dedicated portal summary aggregates every positive `UNPAID` or `OVERDUE` invoice for the owning customer, counts overdue invoices, selects the earliest outstanding invoice, selects the earliest due active or suspended service, and separates tickets waiting for the customer from tickets waiting for staff. Money remains integer minor units in storage and lossless decimal strings at the API boundary. More than one outstanding currency is treated as an inconsistent server state rather than being combined.

The portal presents payment, suspended-service, and customer-reply actions first, with direct links to permitted customer routes. Active renewal and staff-owned support work are informational. A paid zero-balance invoice may appear in recent activity but cannot become a payment action. Accounts with records and no required action receive an explicit healthy state; first-use accounts receive a distinct empty state. The endpoint is customer-only and retains the customer-ID ownership guard.

## Interface routes

- `/admin/customers` provides search, status filtering, pagination, and customer creation.
- `/admin/customers/[customerId]` puts identity, status, linked counts, and bounded recent records before optional profile/billing edits and access controls.
- `/portal/profile` loads the authenticated customer's owned profile and supports permitted edits and password changes.
- `/portal` uses the dedicated server-derived summary to prioritize customer actions before bounded recent activity.

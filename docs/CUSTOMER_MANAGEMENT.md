# Customer Management

Command 7 implements customer administration and customer self-service through the NestJS `CustomerModule`, shared Zod contracts, and the existing cookie-session security boundary.

## API surface

| Method  | Route                                    | Access                           | Purpose                                                         |
| ------- | ---------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| `POST`  | `/customers`                             | Administrator                    | Create a customer and pending-verification account              |
| `GET`   | `/customers`                             | Administrator                    | Paginated search and customer-status filtering                  |
| `GET`   | `/customers/:customerId`                 | Administrator or owning customer | Customer detail and recent linked records                       |
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

Customer detail returns totals for orders, services, invoices, payments, and tickets plus the ten most recent records in each category. Monetary values use the shared lossless `{ amount: string, currency: string }` JSON contract. Full module-specific histories remain the responsibility of their later development commands.

## Interface routes

- `/admin/customers` provides search, status filtering, pagination, and customer creation.
- `/admin/customers/[customerId]` provides profile/billing edits, access confirmation, and linked-record summaries.
- `/portal/profile` loads the authenticated customer's owned profile and supports permitted edits and password changes.

# Webhost Billing Database

## Scope

The PostgreSQL schema is owned by `packages/database`. The initial 20 business models are supplemented by three authentication models:

- Identity: `User`, `Customer`, `AdminProfile`
- Catalog: `Product`, `ProductPrice`
- Orders and hosting: `Order`, `OrderItem`, `Service`, `Server`
- Billing: `Invoice`, `InvoiceItem`, `Payment`, `PaymentEvent`
- Support and notifications: `Ticket`, `TicketMessage`, `EmailLog`
- Operations: `ActivityLog`, `AutomationRun`, `Setting`, `OutboxEvent`
- Authentication: `AuthSession`, `PasswordResetToken`, `EmailVerificationToken`

The schema remains one modular-monolith database. Model grouping does not create independent services or databases.

## Core invariants

### Identifiers and time

- Every application table uses a UUID primary key.
- Business-facing order, invoice, customer, and ticket numbers have independent unique constraints; UUIDs are not shown to customers as document numbers.
- Every Prisma `DateTime` column is explicitly stored as PostgreSQL `TIMESTAMPTZ(3)`. Application code must continue treating timestamps as UTC and convert only for presentation.

### Money and currency

- All monetary values use PostgreSQL `BIGINT` and Prisma `BigInt` in the currency's minor unit.
- Floating-point columns are prohibited for money.
- Currency snapshots use uppercase, three-letter ISO-style codes enforced by database checks. Supporting a code in business workflows still requires explicit application configuration.
- Database checks reject negative amounts and inconsistent order, order-item, invoice, and invoice-item totals.
- JSON APIs must serialize monetary `BigInt` values as decimal strings; shared boundary helpers are introduced in Command 4.

### Historical records

- Order items snapshot the product name, description, billing period, price, setup fee, currency, and provisioning configuration used at purchase time.
- Invoice headers snapshot the customer identity, billing address, business identity, and tax identity.
- Invoice items snapshot their descriptions, money, currency, quantity, tax, discount, and service period.
- Later product, customer, or business-setting changes must not rewrite these snapshots.

### State separation and idempotency

- Orders, services, invoices, payments, payment events, tickets, email attempts, automation runs, and outbox events use separate state enums.
- A paid invoice and an active hosting service remain independent facts.
- Payment transactions and provider events use separate provider identifiers and idempotency keys.
- Refunds and reversals are positive-valued adjustment rows linked to the original charge; they never overwrite it.
- Automation and outbox records have unique idempotency keys for safe retries.

### Relationships and deletion

- Foreign keys use `ON DELETE RESTRICT`; deleting a parent cannot cascade through billing or operational history.
- Soft deletion is available only for users, customers, products, product prices, and servers, where hiding an inactive record while retaining references is useful.
- Orders, services, invoices, invoice items, payments, payment events, tickets, ticket messages, email logs, activity logs, automation runs, settings, and outbox events have no soft-delete field. Normal application workflows must transition their state or append a corrective record instead of deleting them.
- Permanent service termination is represented by service state and timestamps, not row deletion.

### Secrets and payloads

- `Server.credentialsCiphertext` is reserved for encrypted control-panel credentials; plaintext credentials must never be stored there.
- Product provisioning configuration and settings contain non-secret configuration only.
- Payment events retain a SHA-256 payload hash and an optional normalized, redacted payload. Raw card data, secrets, signatures, and unfiltered provider requests are prohibited.
- Activity logs may retain a one-way IP-address hash, not authentication secrets.
- Authentication session and action-token lookups use SHA-256 hashes of random opaque tokens. Raw reset and verification tokens are encrypted only for pending email delivery; raw session tokens are never stored.

### Authentication history

- Sessions have explicit creation, last-seen, expiry, and optional revocation timestamps. Revocation changes state instead of deleting the row.
- Reset and verification tokens have creation, expiry, and single-use timestamps. Consuming or superseding a token removes its encrypted delivery material while preserving the historical record.
- Database checks enforce lowercase hexadecimal token hashes and valid timestamp ordering.
- Password reset, logout-all, and explicit revocation update session state transactionally. Authentication records use restrictive foreign keys like the rest of the schema.

## Database-enforced checks

The initial migration adds SQL constraints beyond Prisma Schema Language:

- lowercase normalized user email;
- two-letter uppercase country codes and three-letter uppercase currency codes;
- nonnegative money and internally consistent totals;
- positive quantities, payment amounts, server limits, and valid server ports;
- valid price, invoice, and service-period date ranges;
- refund/reversal links to an original payment and prevention of self-reference;
- nonnegative email, automation, and outbox attempt counters;
- JSON-object invoice identity snapshots;
- one active, non-deleted product price per product, billing period, and currency through a partial unique index.

Because check constraints and partial indexes are customized in migration SQL, never replace committed migrations with `prisma db push`.

## Prisma workflow

From the repository root:

```bash
pnpm db:format
pnpm db:validate
pnpm db:generate
pnpm db:migrate:dev
pnpm db:migrate:status
```

For a schema change requiring custom SQL:

1. Run `pnpm --filter @webhost-billing/database exec prisma migrate dev --config prisma.config.ts --name descriptive_name --create-only`.
2. Review and safely customize the generated SQL.
3. Apply it with `pnpm db:migrate:dev` against an isolated development database.
4. Run `pnpm db:validate`, `pnpm db:verify`, and the complete repository validation suite.

Production and staging use only committed migrations through `pnpm db:migrate:deploy`.

## Development seed

```bash
pnpm db:seed
pnpm db:verify
```

The seed is idempotent and contains a fictional administrator, customer, hosting product and price, fake server, completed order, active service, paid invoice, manual payment, payment event, ticket, email log, activity log, automation run, business setting, and outbox event. All email addresses and hostnames use reserved `.test` domains. Seeded users have no password and cannot authenticate.

The verifier confirms table coverage, UUID primary keys, `BIGINT` monetary columns, timezone-aware timestamps, restrictive foreign keys, custom checks, the partial unique price index, and representative seeded relationships.

# Products and Pricing

Command 8 implements the focused hosting catalogue for administrators and public customers. Products and price rows are never deleted by the application workflow; state and version changes preserve references used by historical orders and services.

## API surface

| Method  | Route                         | Access        | Purpose                                                                          |
| ------- | ----------------------------- | ------------- | -------------------------------------------------------------------------------- |
| `GET`   | `/products/public`            | Public        | List active, publicly visible products with current active prices                |
| `GET`   | `/products`                   | Administrator | List every non-deleted draft, active, and archived product with price history    |
| `GET`   | `/products/:productId`        | Administrator | Read one product with price history                                              |
| `POST`  | `/products`                   | Administrator | Create a draft product with optional initial prices                              |
| `PATCH` | `/products/:productId`        | Administrator | Edit catalogue details, display order, visibility, package mapping, and features |
| `PATCH` | `/products/:productId/status` | Administrator | Move a product between draft, active, and archived states                        |
| `POST`  | `/products/:productId/prices` | Administrator | Define a monthly, quarterly, or annual price version                             |

All administrator mutations use cookie authentication, administrator role authorization, and CSRF validation. Public responses exclude the hosting-panel package identifier and internal price history.

## Product lifecycle

- New products are always `DRAFT`, even if public visibility is requested.
- Activation requires a hosting package identifier, storage/website/email/bandwidth display features, and at least one active supported price.
- Editing an active product cannot clear those required fields; move it to draft first when an incomplete reconfiguration is necessary.
- `publicVisible` controls storefront display only while status is `ACTIVE`.
- Archiving changes status to `ARCHIVED` and forces `publicVisible` to false. It does not delete the product or any price.
- Archived products remain editable, but must leave archived status before a new price can be defined.
- Administrator mutations append `ActivityLog` records containing state or changed-field names, not package identifiers or monetary values.

## Price versioning

- Supported sale periods are monthly, quarterly, and annual.
- Amount and setup fee are integer minor units represented as decimal strings at JSON boundaries.
- Defining a price for an existing product/period/currency retires the previous active row with `isActive = false` and `validUntil`, then creates a new active row.
- The database partial unique index permits only one active, non-deleted row for a product/period/currency.
- Public catalogue reads include only active prices inside their validity window. Administrator reads retain the complete price history.

## Catalogue fields

Each product stores explicit storefront and provisioning metadata:

- lowercase URL-safe slug and display name;
- optional description;
- public visibility and nonnegative display order;
- provider-neutral hosting package identifier;
- storage, website, email, and bandwidth display values.

The package identifier is non-secret configuration. Actual cPanel credentials remain encrypted server-integration data and are never stored on a product.

## Interfaces and checkout selection

- `/admin/products` provides creation, editing, ordering, visibility, lifecycle, price definition, and price-history controls.
- `/` and `/hosting` load active public products from the API, compare supported periods and currencies, and display configured limits.
- Choosing a plan links to `/register?productId=...&priceId=...`. Command 9 will validate and consume that exact server-side product/price selection when it implements order creation.

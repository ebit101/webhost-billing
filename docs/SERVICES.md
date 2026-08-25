# Hosting Services

## Purpose

A hosting service is the application's operational record for one purchased hosting account. It is intentionally separate from its order, invoice, payment, and future hosting-panel operation records. A paid invoice proves settlement only; it does not prove that an account exists on a server.

## Creation and snapshots

An administrator creates a service from an order item only when:

- the linked order is `PAID` or already `PROCESSING`;
- the order item has a supported monthly, quarterly, or annual hosting period and a requested domain;
- no service already references the order item; and
- the selected server is active, not deleted, and below its configured account limit.

Creation copies the customer, product, product-price, product name and description, provisioning configuration, domain, billing period, recurring minor-unit amount, currency, start date, and calculated next-due date. Historical product and price snapshots are used in service responses even if the live catalogue changes later.

The order item is the idempotency boundary. Repeating the same request for the same server returns the existing service. Reusing it with another server conflicts. The order-item row and selected server row are locked while eligibility and capacity are checked, so concurrent requests cannot create duplicates or overbook the last configured server slot.

New services begin `PENDING`. A `PAID` order moves to `PROCESSING`, but no hosting-panel call occurs in Command 14.

## State machine

```text
PENDING ──> PROVISIONING ──> ACTIVE ──> SUSPENDED ──> ACTIVE
   │              │             │            │
   │              └──> PROVISION_FAILED      └──> TERMINATED
   │                        │       │
   │                        └───────┘
   └──> CANCELLED

PROVISIONING ──> CANCELLED
PROVISION_FAILED ──> CANCELLED
ACTIVE ──> TERMINATED
```

- `PROVISIONING` means operational work has started; it does not mean an account exists.
- `ACTIVE` requires both an external account identifier and control-panel username.
- `PROVISION_FAILED` requires a failure reason and may return to `PROVISIONING` for a deliberate retry.
- `SUSPENDED` requires a reason and timestamp; reactivation reuses the recorded account identity.
- `CANCELLED` is a terminal pre-activation state with reason and timestamp.
- `TERMINATED` is a terminal post-activation state with reason, timestamp, administrator identity, and the exact confirmation phrase `TERMINATE` at the API boundary.

When every order item has an active service, a `PROCESSING` order becomes `COMPLETED`. Failed, pending, suspended, cancelled, or terminated services do not satisfy that completion check.

## API and authorization

All routes use the authenticated cookie session, CSRF protection for mutations, runtime-validated inputs, and the standard success/error envelope.

| Method  | Route                         | Access                 | Purpose                                                |
| ------- | ----------------------------- | ---------------------- | ------------------------------------------------------ |
| `GET`   | `/services/setup-options`     | Administrator          | Active servers and eligible paid order items           |
| `GET`   | `/services`                   | Administrator          | Filtered, paginated inventory                          |
| `GET`   | `/services/my`                | Customer               | The signed-in customer's services only                 |
| `GET`   | `/services/:serviceId`        | Administrator or owner | One service with ownership enforcement                 |
| `POST`  | `/services`                   | Administrator          | Create one pending service from an eligible order item |
| `PATCH` | `/services/:serviceId/status` | Administrator          | Apply one validated state transition                   |

Customers cannot create or transition services and cannot access another customer's service. Server responses expose only the safe name, hostname, adapter key, and state; encrypted credentials and other server secrets are never serialized.

## Administrator and customer interfaces

The administrator service inventory supports paid-order fulfilment, server assignment, transition evidence, explicit termination confirmation, status, renewal, and account identity. It clearly labels lifecycle operations as manual until the provider-neutral panel adapter is implemented in Command 15.

The customer portal lists only the authenticated customer's services and provides a detail view with product snapshot, domain, current state, server hostname, control-panel username, billing period, recurring amount, start date, next due date, operational timestamps, and the relevant safe state reason.

## Audit and follow-up boundary

Creation and every transition write an activity record in the same transaction as the state change. Audit metadata records identifiers and state evidence without server credentials. Rows are never normally deleted.

Command 15 will introduce the provider-neutral hosting-panel boundary, fake adapter, normalized failures, operation idempotency, and manual retry workflow. Until then, these controls record verified manual operational outcomes only; they do not contact cPanel or another external panel.

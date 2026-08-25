# Critical Business Invariants

This document is the executable evidence map for Command 25. It covers the billing, payment, provisioning, renewal, ownership, destructive-action, retry, and money guarantees that must remain true for the private Webhost Billing application.

## Focused command

Start the isolated local PostgreSQL and Redis services, then run:

```bash
pnpm test:invariants
```

The command builds the shared packages first and runs four layers in sequence:

1. shared runtime contracts, including lossless money and single-attempt risky-job policies;
2. API integer invoice and provider-money unit tests;
3. selected PostgreSQL/Redis API integration suites for payments, orders, invoices, services, and hosting operations;
4. selected PostgreSQL renewal scheduler and lifecycle worker integration suites.

The suite uses fictional `.test` identities and fake providers. It does not contact bKash, SSLCOMMERZ, SMTP, cPanel/WHM, UK2Group, or any production service.

## Invariant matrix

| Invariant                                                           | Primary enforcement                                                                                                   | Focused regression evidence                                                                                                                                                                         |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate webhooks cannot create duplicate payments                 | Unique provider event/transaction keys, exact-payload replay checks, and invoice-row locking                          | `payment-gateways.e2e-spec.ts`: signed callback replay is acknowledged once; only one event, settlement, and follow-up handoff persist                                                              |
| Concurrent payment handling cannot overpay an invoice               | Invoice row lock plus current-balance revalidation inside the financial transaction                                   | `payment-gateways.e2e-spec.ts`: concurrent callback delivery settles once; `payments.e2e-spec.ts`: concurrent manual payments/reviews cannot exceed the balance                                     |
| A browser redirect cannot mark an invoice paid                      | Redirect endpoints navigate only; settlement requires authenticated provider proof                                    | `payment-gateways.e2e-spec.ts`: an SSLCOMMERZ success return leaves the invoice unpaid, payment pending, and event count at zero                                                                    |
| Product-price changes cannot alter historical invoices              | Append-only price versions plus order/invoice amount snapshots                                                        | `orders.e2e-spec.ts`: supported repricing changes the active catalogue price while the existing order and invoice totals/lines remain unchanged                                                     |
| Payment success and provisioning failure remain separate states     | Independent payment, invoice, order, service, and hosting-operation states                                            | `services.e2e-spec.ts`: a successful payment and paid invoice remain intact after the linked service enters `PROVISION_FAILED`                                                                      |
| Repeated scheduler runs cannot create duplicate renewal invoices    | Daily scheduler idempotency key, advisory lock, and unique service/period invoice-line constraint                     | `renewal-scheduler.integration.spec.ts` creates one daily request across concurrent schedulers; `renewal-lifecycle.integration.spec.ts` processes a cycle twice and retains one renewal line        |
| Repeated provisioning jobs cannot create duplicate hosting accounts | Unique operation idempotency key, request fingerprint, order-item uniqueness, and provider-side identity check        | `hosting-panels.e2e-spec.ts`: simultaneous and later replayed account creation yields one operation/account; `services.e2e-spec.ts` retains one service per order item                              |
| Refunds do not delete original payments                             | Append-only adjustment rows linked to the original charge with restrictive foreign keys                               | `payments.e2e-spec.ts`: refund and reversal rows change the net balance while the original successful charge remains unchanged                                                                      |
| A customer cannot access another customer's data                    | Session-derived customer identity plus service-layer ownership checks                                                 | Selected invoice, payment, service, and hosting-login E2E tests deny foreign-customer reads/actions and keep owned lists isolated                                                                   |
| Only authorized administrators can terminate services               | Administrator role guard at the service/hosting-operation boundary                                                    | `hosting-panels.e2e-spec.ts`: an authenticated customer with a syntactically valid confirmed termination request receives `403`                                                                     |
| Termination requires explicit confirmation                          | Strict state/action schema requires the exact `TERMINATE` phrase                                                      | Service and hosting-panel E2E tests reject missing confirmation and accept the administrator-confirmed operation only                                                                               |
| Jobs are safe to retry                                              | Reference-only payloads, deterministic idempotency keys, bounded retry classification, and persisted attempt evidence | Renewal lifecycle processing is replayed at invoice, suspension, payment, and unsuspension stages; hosting temporary retry is single-success/idempotent and inconsistent outcomes cannot be retried |
| Money calculations never use floating-point arithmetic              | PostgreSQL `BIGINT`, TypeScript `bigint`, canonical decimal strings, checked arithmetic, and overflow constraints     | Shared money contracts reject decimal amounts; invoice calculations cover exact `BIGINT` bounds; provider conversion uses decimal strings and `bigint` only                                         |

## Failure interpretation

A failed invariant test blocks delivery. Do not solve a failure by weakening an assertion, deleting concurrency, increasing arbitrary delays, bypassing ownership, or changing a fake provider to report success unconditionally.

Investigate the owning boundary:

- duplicate/replay failures: database uniqueness, idempotency key/fingerprint, row locking, and transaction scope;
- money failures: boundary parsing, integer overflow checks, snapshot persistence, and current-balance validation;
- state failures: payment/invoice/order/service/operation transition ownership and evidence;
- scheduler/job failures: business-date key, advisory locking, outbox identity, attempt classification, and provider uncertainty handling;
- authorization failures: server-derived identity, role guard, resource ownership, and destructive confirmation parsing.

Warnings from the current Jest experimental VM mode or the known `pg` concurrent-query deprecation are not test failures, but they remain upgrade risks and must not hide a failed assertion or nonzero exit status.

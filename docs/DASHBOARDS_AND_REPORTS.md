# Dashboards and Reports

Command 22 replaces the administrator dashboard's fictional values with live PostgreSQL queries. The dashboard is an operational view for one hosting business, not a general-purpose analytics warehouse.

## Metric contract

All monetary values use the configured operating currency and integer minor units. JSON serializes the integer as a decimal string. Database timestamps remain UTC; `from` and `to` are inclusive calendar dates in the configured IANA business timezone. A response includes `generatedAt` so data freshness is explicit.

| Metric                 | Source and calculation                                                                        | Time scope      |
| ---------------------- | --------------------------------------------------------------------------------------------- | --------------- |
| Collected revenue      | Successful `CHARGE` payments less successful `REFUND` and `REVERSAL` rows, using `verifiedAt` | Selected period |
| Outstanding balance    | `balanceDue` on `UNPAID` and `OVERDUE` invoices only                                          | Current state   |
| Overdue balance        | `balanceDue` on `OVERDUE` invoices only                                                       | Current state   |
| Active services        | Services in `ACTIVE`                                                                          | Current state   |
| Suspended services     | Services in `SUSPENDED`                                                                       | Current state   |
| Pending orders         | Orders in `PENDING`, `AWAITING_PAYMENT`, `PAID`, or `PROCESSING`                              | Current state   |
| Open tickets           | Tickets in any state except `CLOSED`                                                          | Current state   |
| Failed automation jobs | Automation runs in `FAILED` or `PARTIALLY_SUCCEEDED`                                          | Selected period |

Cancelled and draft invoices never contribute to outstanding balances. Pending, failed, and cancelled payments never contribute to revenue. A refund or reversal is subtracted as its own successful transaction; the original charge is not rewritten. Daily revenue uses the same transaction set and business-date boundaries as the headline metric.

The default period is the current business month through the current business date. Explicit periods must supply both dates, be ordered, and contain at most 366 inclusive dates. No currency conversion is attempted; records in historical currencies other than the configured operating currency are not mixed into money totals.

## Recent activity

The dashboard returns the twelve newest `ActivityLog` records, newest first. It exposes the safe action name, display label, entity type/identifier, actor display name, and UTC occurrence time. Arbitrary audit metadata, IP hashes, credentials, request payloads, message bodies, and provider responses are not returned.

## API and exports

- `GET /dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD` — administrator-only typed dashboard response. Omit both dates for month to date.
- `POST /reports/exports/customers` — current non-deleted customer snapshot.
- `POST /reports/exports/invoices` — invoices created during the selected business-date period.
- `POST /reports/exports/payments` — payment transactions created during the selected business-date period.
- `POST /reports/exports/services` — current service snapshot.

Each export body accepts the same optional period pair. Export routes require an administrator session and CSRF token, return `text/csv`, disable response caching, and create a `REPORT_CSV_EXPORTED_BY_ADMIN` activity record containing only resource, row count, period, currency, and timezone.

CSV values are UTF-8 with a BOM, consistently quoted, lossless for `BIGINT`, and neutralized when a cell begins with a spreadsheet formula character. Exports deliberately omit password hashes, credential ciphertext, control-panel credentials, provider payloads, payment proof metadata, tax identifiers, audit metadata, and deletion markers. A 10,000-row safety limit rejects oversized exports instead of silently truncating them.

## Interface and operations

The administrator dashboard provides period controls, eight actionable metric cards, a daily net-revenue chart, audited export buttons, and recent activity. Invoice/payment exports follow the selected period; customer/service exports remain current snapshots. Negative daily or total net revenue is displayed explicitly and never converted through floating-point arithmetic.

For reconciliation, compare exported payment kinds and successful states with the dashboard period. If the operating currency changes, review historical currency records separately because the dashboard intentionally does not perform exchange-rate conversion.

# Operational and financial reports

Open **Reports → Operational and financial** to select a report, apply business
dates, page through matching rows or download an audited CSV. Existing overview,
invoice aging and raw-record exports remain available in their existing tabs.

All money uses the installation's base currency and integer minor units. The
report shows its currency, business time zone, applied period and generation
time. Dates are inclusive business dates, resolved to UTC start/end boundaries
by the existing dashboard period helper, with a maximum span of 366 days.
Current-state reports do not reconstruct historical balances or statuses.

## Report definitions

| Report                           | Grain and date basis                                                                                                    | Meaning and limits                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collected income by product      | One purchased product ID/label/type group; successful payment `verifiedAt` in the selected business dates               | Charges less successful refunds and reversals, allocated to invoice lines. Includes partial payments. Unattributed amounts stay visible. This is cash movement, not profit or earned revenue. Gateway fees and business expenses are unavailable.                                                                                                                 |
| Renewal invoice balances         | One issued renewal invoice due in the selected business dates                                                           | Current invoiced, paid-applied, credit and outstanding amounts. Combined hosting/add-on invoices appear once. Detect hosting renewal coverage and the dedicated domain-renewal invoice mapping; exclude draft/cancelled invoices and plan-change invoices. Paid applied is not cash received in this period.                                                      |
| Recurring charges due            | One current purchased product label/type/cycle group, for hosting whose next due date is in the selected business dates | One next-cycle forecast from active/suspended hosting and fulfilled, matching-cycle recurring add-ons. Keep different billing cycles separate. Exclude one-time extras, choices ending by that cycle, deleted customer accounts, hosting cancellation holds and pending plan-change holds. Do not add issued invoices or multiply into monthly recurring revenue. |
| Hosting plan changes             | One change record created in the selected business dates                                                                | Current status, saved direction and saved source/target names. Quotes and requests are not completed sales. Missing historical facts are labelled unknown.                                                                                                                                                                                                        |
| Domain renewal exceptions        | One latest attempt per renewal invoice, whose creation is in the selected business dates                                | Rejected or reconciliation-required attempts and financial review holds. Choose the latest attempt across all history before applying the date filter, so a newer success does not leave an earlier failure visible. This is retained local status, not a live registrar observation. No attempt does not mean success.                                           |
| Ticket workload by department    | One current department, including archived departments                                                                  | Current open, waiting and closed counts across all tickets, plus tickets created in the selected dates. These are current workloads, not past status histories. No reply bodies, private notes, attachments, SLA or staff-effort estimates.                                                                                                                       |
| Pending manual cancellation work | One unresolved hosting request or unacknowledged purchased add-on removal; all dates                                    | Includes future scheduled work. The date selector does not filter this queue. Only an acknowledgement for the same service, purchased item and effective end date, recorded on/after that date, removes add-on work. It never changes hosting or billing.                                                                                                         |

## Cash attribution and reconciliation

Join each successful payment to its own invoice lines rather than joining whole
order totals to every product. Use positive historical line totals as weights.
For each payment, calculate differences between cumulative proportional amounts
using exact PostgreSQL numeric arithmetic and truncation to integer minor units.
Line position and ID provide stable remainder ordering. Apply the same signed
calculation to successful refunds and reversals in their own verification period.
Every movement is allocated exactly once, including the final minor-unit
remainder. Failed and pending movements are excluded.

For example, fictional invoice lines of 100, 60, 40 and 20 minor units have a
combined weight of 220. A charge of 143, refund of 33 and reversal of 11 produce
net allocations of 45, 27, 18 and 9: exactly 99 minor units. An additional
unattributed receipt of 50 brings the cash report to 149. This avoids counting a
combined invoice once for every purchased item.

Invoice-level tax and discounts participate in this proportional cash allocation;
credits are not extra cash. The allocation is an analytical convention, not a
separate product settlement ledger. Zero-weight, negative or inconsistent-currency
line sets remain unattributed rather than being silently discarded or assigned
to a current catalogue product.

Prefer the saved invoice-line product snapshot introduced by Command 226, then
the existing purchased order-item product ID and saved name. Future hosting and
add-on renewals, upgrade charges and newly confirmed domain renewals retain that snapshot. Some older lines lack
either form of product evidence; their cash remains in **Unattributed product**. Current
service/catalogue names are not substituted for missing historical evidence.
The renewal-balance report still includes those invoices. Do not rewrite issued
history or fabricate old identities. See [invoice attribution](INVOICE_PRODUCT_ATTRIBUTION.md).

## Pagination, exports and access

- Full administrators only, enforced by the route guards and again by the report
  service. Customer support sessions and restricted staff cannot read or export.
- Filters accept known report IDs, complete valid business-date pairs and bounded
  page sizes. Currency, time zone and arbitrary SQL filters cannot be supplied by
  the browser. SQL identifiers are fixed; values are bound parameters.
- A read-only repeatable-read transaction produces rows, count and whole-result
  numeric totals from one snapshot. Rows have a stable key order. An empty page
  retains the complete count and totals. Limit pages to 100 rows, page numbers to
  one million and each query to a 15-second statement timeout.
- CSV exports use the applied report scope, not unsaved date edits or the current
  page. Refuse exports above 10,000 matching rows without returning a partial file;
  use narrower dates where applicable, or pagination for current queues.
- Export monetary values as exact minor-unit strings. Quote all cells, preserve
  Unicode and line breaks, and neutralize spreadsheet formulas even after leading
  whitespace/control characters. Spreadsheet safety may prefix a text apostrophe.
- Export metadata includes the report, base currency, time zone, period and UTC
  generation time. Audit the request's report, scope, row count and reporting
  basis before returning a download. If audit persistence fails, no CSV is returned.
  Do not store exported bodies or customer/provider secrets in the audit metadata.
- Authenticated reads retain private/no-store session headers. Exports require
  CSRF protection and use no-store, nosniff and an attachment filename. Browser
  download URLs are temporary and revoked after use.

## Local verification

The guarded `reports --verify-schema` selector in the existing API acceptance
launcher creates and removes an owned fictional PostgreSQL schema. Its report
suite covers cash/adjustment reconciliation and exact Dhaka date boundaries,
partial renewal balances, combined order allocation, purchased-price forecasts,
one-time/cancelled extras, retained registrar exceptions, department workload,
manual acknowledgement matching, pagination, exact large money, role/CSRF rules
and audited CSV safety. It uses only fictional records and the fake registrar.

Contract, service and component tests cover filter bounds, whole-result totals,
loaded export scope, audit failure, formula injection, report selection, pagination
and visible request failures. Acceptance outcomes and any local constraints are
recorded in [the progress log](PROGRESS.md).

Command 224 adds no dependency, provider connection, database table or migration.
It does not publish code, alter the release number or deploy an application.

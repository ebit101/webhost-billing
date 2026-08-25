# Renewal Automation

Command 19 implements a daily, business-timezone renewal cycle for active and suspended hosting services. It generates historical invoices, sends reminders, marks unpaid invoices overdue, requests suspension after a grace period, and reactivates an automatically suspended account only after a verified full payment. It never requests or performs automatic termination.

## Policy

The administrator Automation screen and API manage the `automation.renewal-policy` setting:

- `enabled` — schedules a skipped audit run instead of work when false;
- `invoiceLeadDays` — 1–90 calendar days before the service due date;
- `reminderDaysBeforeDue` — up to ten unique calendar-day offsets, each less than the invoice lead time;
- `gracePeriodDays` — 0–60 complete calendar days after the due date; and
- `timeZone` — an IANA business timezone such as `Asia/Dhaka`.

Defaults are enabled, 14 lead days, reminders at 7/3/1 days, a 3-day grace period, and `Asia/Dhaka`. Dates are compared as calendar dates in the configured timezone. PostgreSQL timestamps remain UTC.

Administrator routes are:

| Method | Route                        | Purpose                         |
| ------ | ---------------------------- | ------------------------------- |
| `GET`  | `/renewal-automation/policy` | Read the effective policy       |
| `PUT`  | `/renewal-automation/policy` | Validate and save the policy    |
| `GET`  | `/renewal-automation/runs`   | Read the latest 50 renewal runs |

## Runtime processes

Run the normal worker for outbox publication, email, renewal, and hosting consumers. Run exactly one dedicated scheduler process per environment:

```bash
pnpm --filter @webhost-billing/worker dev
pnpm --filter @webhost-billing/worker start:scheduler:dev
```

The scheduler polls at `SCHEDULER_POLL_INTERVAL_MS`, obtains a PostgreSQL transaction-scoped advisory lock, and inserts at most one `renewal-cycle:YYYY-MM-DD` `AutomationRun` in the business timezone. The unique run/event keys remain the final duplicate barrier if multiple scheduler processes are started accidentally.

## Idempotency and lifecycle

Each renewal invoice has a unique service/start/end period at the database layer. A delayed cycle catches up eligible invoices and reminder thresholds, while unique outbox keys prevent duplicate reminders, overdue notices, and panel requests. Every cycle records processed, succeeded, and failed counts; temporary database-safe work has three bounded queue attempts.

Full verified settlement emits renewal work only for an invoice containing complete service-period lines. The worker advances `nextDueAt` to the invoiced period end. If the service is suspended and `suspensionInvoiceId` points to that exact paid invoice, it requests unsuspension. Payments cannot reactivate manual or unrelated suspensions.

## Hosting-panel safety

Automated cPanel suspension and unsuspension use the service's stored account identity and the same server-bound AES-256-GCM token format as manual cPanel operations. The worker uses WHM API 1 over validated HTTPS, then reloads `accountsummary` and verifies the username, domain, and target state before changing the local service.

Hosting mutations have one automatic queue attempt. An explicitly retried, fixed pre-mutation temporary failure appends a new hosting-operation attempt, with a hard limit of three; it never rewrites the prior evidence. A timeout, restart-abandoned `RUNNING` operation, failed post-mutation verification, or database failure after a verified provider mutation is recorded as `INCONSISTENT`; it is not blindly repeated. The fake panel performs no network traffic in development/tests. No event route or worker handler exists for automated termination.

## Test coverage

The worker suite uses injectable clocks and real PostgreSQL to cover Dhaka date boundaries, month-end clamping, leap-day renewal, delayed reminder/overdue processing, concurrent scheduler runs, repeated jobs, invoice uniqueness, fake-panel suspension, verified-payment due-date advancement, and invoice-linked unsuspension.

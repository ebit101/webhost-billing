# Hosting plan changes and proration

Command 210, prepared 2026-11-05 (Asia/Dhaka).

The owner selected **downgrades at the next billing date, with no mid-period
credit or automatic refund**. Starting Command 211 accepts the upgrade proposal
below for local implementation. Command 210 supplied the tested reference model;
Command 211 adds the administrator-offered paid upgrade workflow described at
the end of this document. Period-end downgrade execution remains Command 212.

## Initial policy

| Topic             | Rule                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upgrade           | Quote the remaining paid-period price difference; require verified payment, administrator approval and confirmed package change before updating the service plan.                                   |
| Downgrade         | Schedule at the end of the current paid period. Current hosting remains available through that boundary. Immediate charge, credit and refund are zero.                                              |
| Billing cycle     | Keep the existing monthly, quarterly or annual cycle and its boundary. No cycle conversion, anniversary reset or server migration.                                                                  |
| Currency          | Both prices must use the installation's existing base currency. No conversion or customer currency choice.                                                                                          |
| Source price      | The purchased hosting recurring amount covering the paid interval, not today's price for the old product. Exclude setup fees and add-ons.                                                           |
| Target price      | An active, explicitly eligible target plan and price version for the same cycle, snapshotted at confirmation.                                                                                       |
| Rounding          | Compute the net difference exactly, then round once to the nearest minor unit, with a half rounded upward.                                                                                          |
| Quote expiry      | Fifteen minutes from quotation, clipped at the paid-period end. Acceptance at or after expiry requires a fresh quote.                                                                               |
| Capacity          | Verify that account usage fits the target package. Unknown limits or usage require administrator review. Recheck at execution.                                                                      |
| Repeated changes  | Initially allow one completed immediate plan change per paid period and one pending request per service. Further changes need review until accounting for multiple pricing segments is implemented. |
| Existing hosting  | Preserved/imported existing hosting requires manual review; do not infer package compatibility from a product name.                                                                                 |
| Financial history | Preserve issued invoices, payments and original order snapshots. No wallet, automatic refund, hidden charge or invoice rewrite.                                                                     |

The existing catalogue requires positive target prices. A free historical source
plan can be evaluated, but a free target requires a separate catalogue decision.
An explicitly allowed different plan with the same price can produce a zero-charge
quote. A same-product request is rejected, even if today's price differs. Price
alone does not establish which plan is an upgrade: the administrator must approve
the source/target pair. A cheaper upgrade or more expensive downgrade requires
manual review rather than an implicit credit or charge.

## Exact calculation

Use the authoritative paid interval `[startAt, endAt)`, in UTC, and a server
quotation timestamp `quotedAt` within it. Its start is inclusive and its end is
exclusive. The business time zone affects display, not the elapsed-time ratio.

For an upgrade:

```text
periodMs    = endAt - startAt
remainingMs = endAt - quotedAt
difference  = target recurring minor units - purchased recurring minor units
numerator   = difference * remainingMs
charge      = numerator div periodMs
if 2 * (numerator mod periodMs) >= periodMs: charge += 1
```

Use integer `bigint` values for money, elapsed durations, multiplication and
division. Serialize monetary values and durations as decimal strings. Round the
net difference once; do not separately round an old-plan credit and a new-plan
charge. No fixed 30-day month or 365-day year is assumed.

Downgrade quotes charge zero immediately and show the target full-period price
for the next cycle. They do not expose a negative invoice amount, unused-time
credit or automatic refund.

### Fictional worked quotes

All timestamps below are at 00:00 UTC unless specified. BDT examples use 100
minor units per taka.

| Paid interval                                        | Quote time                  | Purchased price |  Target price |               Immediate charge | Following full-cycle hosting price |
| ---------------------------------------------------- | --------------------------- | --------------: | ------------: | -----------------------------: | ---------------------------------: |
| 2026-04-01 to 2026-05-01, monthly                    | 2026-04-16                  |    BDT 1,000.00 |  BDT 1,600.00 |                     BDT 300.00 |                       BDT 1,600.00 |
| Same monthly interval                                | 2026-04-16 12:00            |    BDT 1,000.00 |  BDT 1,600.00 |                     BDT 290.00 |                       BDT 1,600.00 |
| 2026-01-01 to 2026-04-01, quarterly, 90 days         | 2026-02-15                  |    BDT 3,000.00 |  BDT 4,800.00 |                     BDT 900.00 |                       BDT 4,800.00 |
| 2026-01-01 to 2027-01-01, annual, 365 days           | 2026-07-02, 183 days remain |   BDT 12,000.00 | BDT 18,000.00 |                   BDT 3,008.22 |                      BDT 18,000.00 |
| 2024-01-01 to 2025-01-01, annual, 366 days           | 2024-07-02, 183 days remain |   BDT 12,000.00 | BDT 18,000.00 |                   BDT 3,000.00 |                      BDT 18,000.00 |
| 2026-01-31 to 2026-02-28, monthly, 28 days           | 2026-02-14                  |    BDT 1,000.00 |  BDT 1,600.00 |                     BDT 300.00 |                       BDT 1,600.00 |
| 2026-04-01 to 2026-05-01, downgrade                  | 2026-04-16                  |    BDT 1,000.00 |    BDT 700.00 | BDT 0.00; effective 2026-05-01 |                         BDT 700.00 |
| Monthly interval, same-price eligible different plan | 2026-04-16                  |    BDT 1,000.00 |  BDT 1,000.00 |                       BDT 0.00 |                       BDT 1,000.00 |

For a one-minor-unit difference at exactly half the period, charge one minor
unit. One millisecond after the midpoint charges zero; one millisecond before
charges one. The reference tests cover these rounding boundaries and the
PostgreSQL maximum monetary value without JavaScript floating-point arithmetic.

## Eligibility and pending work

The future API must load these facts from authorized database and provider
records. Browser-supplied ownership, paid status, prices or eligibility flags
are never authoritative.

- The customer must own the service and have active access. The service must be
  active with verified paid coverage; suspended or unpaid hosting must be resolved
  first.
- The current server must be ready, with supported package changes and verified
  source and target packages on the same server and adapter. Confirm account
  identity and target capacity. Missing evidence requires review.
- The target plan and price must be available for the same base currency and
  billing cycle. The allowed source/target mapping must be explicit.
- Block a new quote while a service-related issued future renewal invoice,
  unpaid balance, pending payment reference or gateway session, disputed or
  adjusted paid coverage, or other unresolved financial work exists. Review
  combined invoices as a whole; never silently cancel or rewrite their lines.
- Block while a hosting cancellation, another plan-change request, running
  package operation or uncertain provider outcome exists. A withdrawn or rejected
  cancellation does not itself block eligibility.
- Retain compatible purchased recurring add-ons at their purchased prices and
  preserve their cancellation cutoffs and manual completion records. They are
  outside the hosting proration calculation. Verify all retained entitlements
  against the target plan; never silently drop, reprice or revive an add-on.
  Unfinished add-on work needing review must be resolved first. Completed
  one-time extras do not become recurring charges.
- Revalidate every fact, the service revision, price version, paid interval and
  quote expiry under the service row lock before accepting a quote. A quote is
  a price preview, not authorization to change a package.

At the exact period end, the existing quote is invalid. Resolve renewal and
obtain verified coverage for the new interval before requesting another immediate
upgrade. Do not clamp an overdue service to a zero-charge upgrade.

## Paid-period evidence and current implementation gaps

The service record has `startedAt`, `nextDueAt`, recurring money and a purchased
provisioning snapshot. Initial service creation derives its first interval from
`startedAt` and the existing clamped UTC billing calendar. Initial order invoice
lines do not provide the same service-period evidence as renewal lines.

Renewal invoices record `servicePeriodStart` and `servicePeriodEnd`. Payment
processing can advance `nextDueAt` when a future renewal is paid early. Therefore,
**do not derive the current paid-period start by subtracting a month, quarter or
year from `nextDueAt`**. End-of-month clamping is not reversible, and an early
payment can move that field into a later interval.

Command 211 must resolve the interval containing the acceptance time from
verified paid invoice coverage, using the original paid order and service
creation boundary for the initial interval. Missing, overlapping, refunded,
partially paid or manually adjusted evidence requires review. Carry the source
invoice identity and authoritative price into the quote snapshot.

Current product feature labels are display text rather than machine-verified
quota definitions. There is no customer plan-change request model or allowed
transition matrix yet. The existing administrator `CHANGE_PACKAGE` operation
does not by itself implement a purchased plan change, prorated invoice or
financial snapshot transition. These are implementation work for Commands 211
and 212, not features completed by Command 210.

## Quote snapshots and fulfillment timing

The reference quote records the policy version, service revision, source invoice
and paid interval, source and target price/package snapshots, quotation and
expiry times, charge, remaining duration and unchanged billing boundary. It has
no random ID, wall-clock dependency or side effects. During Command 210 it was
not exposed through the shared public entry point, API or UI. Command 211 exports
its validated contracts and connects it to the upgrade workflow.

The proposed upgrade fee is calculated as of the quotation timestamp. If the
customer confirms a different amount after a refreshed quote, obtain confirmation
again before issuing the invoice. The package becomes effective only after a
verified provider result; the reference `effectiveAt` is a proposed quotation
time, not proof that fulfillment occurred then.

Command 211 must keep quotation, acceptance, payment, approval and actual provider
completion timestamps separate. Do not apply an upgrade from an expired quote
or across the quoted paid-period boundary. A payment or provider result arriving
after that window needs reconciliation and administrator review; retain any
issued invoice and successful payment rather than silently repricing them.
Material delivery delays and paid-but-failed requests need a documented manual
adjustment/refund decision before live use. No automatic wallet or refund is
authorized by this proposal.

## Proposed request workflow for Commands 211 and 212

| Request state   | Meaning and next step                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Requested       | Customer accepted a current quote; record immutable snapshots and the request key.                                                      |
| Approved        | Administrator approved eligibility. Invoice and payment status remain separate.                                                         |
| Scheduled       | Downgrade reserved for the paid-period end; customer may withdraw before execution.                                                     |
| Queued          | Required approval, verified payment for a positive upgrade charge, and timing checks passed.                                            |
| Applying        | One durable provider operation is in progress. No second request may run concurrently.                                                  |
| Verifying       | Reconcile the account identity, actual package and operation outcome.                                                                   |
| Completed       | Provider result confirmed and the current service plan snapshot updated atomically. Historical order and invoice snapshots stay intact. |
| Failed          | A definite failure left the original plan in place; reviewed recovery may retry with a linked operation.                                |
| Review required | The provider result, payment timing, capacity or financial evidence is uncertain. Reconcile before another package mutation.            |
| Cancelled       | Withdrawn before provider execution. Any issued invoice or payment needs the existing audited financial handling.                       |

No positive-charge upgrade may be fulfilled solely because an invoice exists or
a browser returned from checkout. A zero-charge eligible change still requires
administrator approval and provider verification. Cancellation after a provider
operation starts is a review case rather than an automatic reversal.

### Scheduled downgrades versus early renewal

A reserved downgrade must be visible to renewal generation under the same service
row lock. The existing worker otherwise invoices the old plan ahead of its due
date. Initially, do not accept a scheduled downgrade over an already-issued future
renewal invoice. Commands 211 and 212 must prevent the worker from issuing a
conflicting old-plan renewal after a reservation is accepted.

The proposed first implementation defers that service's next renewal invoice
until the boundary package change is verified. Then issue one invoice using the
confirmed target snapshot, preserving the existing late-invoice grace policy.
If capacity checks or the provider fail, keep the original package, flag the
request for administrator review and resolve the renewal deliberately; do not
silently bill a different plan, suspend early or permanently terminate hosting.
This worker coordination is required before period-end downgrades can be enabled.

## Decisions before applying changes

- **Confirmed by owner:** Period-end downgrade; no mid-period credit or automatic
  refund.
- **Accepted by starting Command 211:** Exact UTC-duration proration,
  half-up rounding once on the net difference, a fifteen-minute quote window,
  same-cycle/same-server scope, one completed immediate change per paid interval,
  and the reviewed handling of delayed fulfillment and late payments.
- **To configure in Command 211:** Allowed plan pairs and verified package/capacity
  evidence. Do not assume all catalogue products are interchangeable.
- **Before Command 212:** Implement renewal reservations and the failure-review
  path so the existing scheduler cannot bill the old plan unnoticed.

## Local verification

The reference implementation is
`packages/shared/src/hosting-plan-change.ts`; executable fictional examples and
eligibility cases are in `packages/shared/test/hosting-plan-change.spec.ts`.
Run `pnpm --filter @webhost-billing/shared exec tsx --test test/hosting-plan-change.spec.ts`
and `pnpm --filter @webhost-billing/shared typecheck` from the repository root.
No database, queue, hosting panel, payment provider or email delivery is used.

## Command 211 implementation

The administrator service review and customer-specific service record now have
a Hosting upgrades section. A full administrator chooses an active target price
for the same currency and cycle, supplies a review reason, and confirms package,
capacity and add-on compatibility. This explicit per-service offer is the first
allowed plan-pair mechanism; public catalogue visibility alone grants no upgrade
eligibility. Account identity and the source package are read from the provider.
Capacity and target-package availability are administrator attestations until
machine-readable quota statistics are implemented.

The customer reviews the offered charge, following full-period price, quotation
time, expiry and retained billing boundary. Explicit acceptance creates exactly
one invoice. Its service line has no renewal-period columns, so settlement does
not advance paid coverage. Payment uses the existing invoice payment workflow.
A full administrator then reconfirms eligibility and approves the paid upgrade.
Invoice/payment state, request state and package-operation state are shown
separately. Support sessions can inspect offers but cannot accept them.

`service_upgrades` stores the immutable quote/context hash, invoice reference,
acceptance, approval and completion times, attempt and provider-operation link.
One pending accepted request per service is enforced by a partial unique index.
Service and invoice row locks serialize acceptance, approval and settlement
checks. The paid source and upgrade invoices must match successful verified
charge records, not just a status label. Prices, add-ons, service revision and
coverage are revalidated before acceptance and fulfillment.

Package changes reuse the existing hosting-panel operation and bounded retry
chain, with a stable key per upgrade attempt. One caller claims initial dispatch;
concurrent clicks read its progress. A lost claim without an operation can be
reviewed after one minute. The current plan, recurring price and separate current
package identifier update only after the account identity and target package are confirmed.
The original provisioning snapshot, order and financial snapshots are retained, and
`nextDueAt` stays unchanged.

Definite retryable failures retain the original recorded plan. A reviewed retry
uses the linked operation rather than a fresh unrelated key. If the provider
changed its package but a reply or local finalization was lost, reconcile the
recorded result/account before updating the service, without another mutation.
An uncertain unconfirmed result stays in review. A fully refunded failed request
can be closed only after the original package is verified; the refund and
original charge remain separate financial records. There is no automatic refund.

Pending accepted, applying or review requests hold conflicting service changes,
hosting/add-on cancellation and scheduled renewal work. An upgrade invoice is
excluded from renewal reminders/suspension processing. Ordinary hosting renewal
continues at the confirmed price after completion. An unstarted unpaid request
can be closed with its unpaid invoice cancelled, releasing the hold. Expired
paid requests require financial/provider review and cannot bypass quote expiry.

The local acceptance harness migrates a fresh owned PostgreSQL schema, uses
loopback Redis and fake hosting, and drops only that schema afterward. No live
hosting, customer data, deployment or publishing is included in Command 211.

# Phase 2 pilot customer journey

Command 183 reviewed one fictional hosting customer from signup through a paid
renewal and service reactivation. The pilot scope is one customer, one hosting
plan, one server, and one payment path.

## What passed

The [GitHub browser run](https://github.com/ebit101/webhost-billing/actions/runs/41640001884/job/125930801867)
passed all 36 browser tests, including **complete hosting customer and administrator
lifecycle**. The run tested commit `ac6d171`. The tree matched the published
`main` merge commit `cb8135b` when reviewed. The same job passed API integration,
critical invariant, and isolated backup and recovery checks.

| Step                         | Observed test result                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signup and access            | A fictional customer retained their selected plan through registration, verification, and sign-in. The test retrieved the verification token from the test database. |
| Checkout and initial payment | The customer submitted the hosting order, received an invoice, and paid through the fake gateway.                                                                    |
| Approval and provisioning    | An administrator approved the order, created the pending service, and provisioned through the fake hosting panel. The customer saw the service as active.            |
| Renewal and suspension       | The renewal processor created an unpaid invoice for the same service. After the simulated grace period, the customer saw the service as suspended.                   |
| Late payment and recovery    | A successful fake gateway payment settled the renewal invoice. The service returned to active.                                                                       |
| Support                      | The same journey included a customer support ticket and administrator reply.                                                                                         |

The browser test advances a fixed clock and invokes renewal processing through
an isolated test helper. It proves the tested state transitions. The verification
token, payment, and hosting panel are fictional test inputs. Local preflight
reported that the Docker engine was unreachable, so this command reviewed the
existing hosted run instead of repeating the journey locally.

Command 197 repeated scheduled renewal locally with a fictional customer, the
normal scheduler and worker, and preview mail. It read the verification link
from the preview, generated one renewal invoice, verified the messages through
reactivation, and settled the invoice through administrator-verified manual
payment. Only the scheduler and worker test clock was advanced. See the
[progress log](PROGRESS.md) for Command 197.

## Phase 2 backlog

These are acceptance gaps from the journey and proposed work. They are separate
from defects in the states the browser test verified.

| Priority | Work                                                                      | Acceptance                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Write and rehearse a one-plan pilot setup checklist                       | An operator can configure the plan, server, payment method, notification settings, and renewal policy using a fresh fictional instance.                                 |
| P0       | Rehearse manual payment and replay on the same customer journey           | Staff can review fictional evidence and verify settlement. Repeated submissions and retries leave one settlement and one provisioned account.                           |
| P0       | Prove scheduled renewal and customer messages through the normal job flow | Completed locally in Command 197 with an isolated scheduler and worker, fictional payments, preview mail, and a fake hosting panel.                                     |
| P0       | Rehearse recovery for the pilot installation                              | An operator restores a verified backup into isolation, confirms the order, invoice, and service history, and receives an alert when a job fails.                        |
| P0       | Handle renewal invoices when the scheduler misses the due date            | Command 198 verifies one catch-up invoice and the full grace period after the invoice is issued.                                                                        |
| P1       | Consolidate staff follow-up                                               | Staff can find pending payment reviews, failed deliveries, and uncertain provisioning in one queue, open each source record, and track unread alerts per administrator. |
| P1       | Standardize assisted setup and managed evaluation handover                | A quote defines setup, scope, support, backups, and upgrades. A second fictional tester can follow the same handover checklist.                                         |

Command 199 adds a one-time website migration to the fictional hosting checkout.
The purchase uses the hosting invoice, with separate fulfillment in the order
review. See the [progress log](PROGRESS.md) for the replay and settlement results.

Command 200 adds a managed backup that follows the hosting renewal cycle. The
pilot checks the purchased price, one add-on line per period, and payment of
the combined invoice. See the [progress log](PROGRESS.md) for verification.

Next proposed command is **Command 202 — Let customers cancel recurring hosting add-ons at period end**.

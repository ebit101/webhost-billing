# Support departments and routing

Command 216, implemented locally on 2026-11-05. No deployment or external mail
delivery is included in this command.

## Administration

Open **Support → Manage departments** as a full administrator with two-step verification enabled. Create or edit a
department, choose its customer visibility and staff restrictions, enter a support
reason, then save. Discard changes closes the unsaved form. Configuration revisions
reject stale saves; refresh the page before editing again after a conflict.

Support, Billing and Sales are installed as enabled, customer-visible departments.
Existing tickets migrate to Support without replacing their IDs, owners, service
links, assignments, messages or dates. Support starts unrestricted so existing
authorized support operators keep access. Legacy creation requests without a
department select this same Support department and still undergo its current
enabled/visibility checks.

## Access and assignment

| Setting or role              | Behavior                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Customer-visible and enabled | Customers may choose it for a new ticket.                                                                                     |
| Hidden from customers        | Staff may route tickets there; customers cannot submit new tickets to it. Owning customers retain their conversations.        |
| Disabled                     | No new customer tickets or incoming department moves. Existing authorized conversations, replies and status changes continue. |
| Unrestricted                 | Full administrators and active support operators with two-step verification have access.                                      |
| Restricted                   | Full administrators and selected active support operators with two-step verification have access.                             |
| Billing operator             | No ticket permission, even for the Billing department. Department membership never grants a staff role permission.            |

Full administrators with two-step verification enabled manage departments. Support operators can filter, read, reply
and update only accessible tickets and route only between departments they can
access. Assignment requires an active full administrator or support operator with
target-department access. An inaccessible existing assignee is cleared during a
move when no replacement is requested; explicitly assigning an ineligible person
is rejected. Removing membership revokes access immediately; an assignment does
not override department restrictions. Retained assignments never authorize mail
delivery to an ineligible recipient.

Customers remain scoped to their own customer ID in lists, details and replies.
Changing a department or forging its ID cannot grant ownership of another ticket.
Linked ticket summaries and counts in administrator customer records use the same
staff visibility rules, including billing-operator exclusion. Customer responses
exclude staff-only `SYSTEM` messages and their message counts.
Customers cannot submit a message kind, assignment, staff membership or private
message flag. Department choices expose no membership lists or configuration
revisions to customers.

## Routing and notifications

Open a ticket from the support queue. Select its department and enter **Reason for
department change** before saving the ticket controls. The audit entry records
the previous and current departments, assignments, status, priority, actor and
reason. Department configuration records its before/after settings and members.
Ticket text is not copied into these audit entries.

Creation and department moves queue an existing customer message through the
durable ticket notification pipeline; replies keep the existing pipeline. At
resolution time, staff mail selects the eligible assignee, or the earliest active
eligible staff account by creation date and ID. Restriction and membership checks
use current data, including support staff MFA enrollment and queued events. If no staff recipient is eligible,
resolution fails without falling back to an unrelated staff role. Staff replies
go to the owning customer. Private system messages cannot produce reply mail or
urgent customer notifications. No fan-out, inbound email routing, automatic staff
assignment, mailbox configuration, attachment upload or SLA policy is added.

Disabled departments retain notification delivery for existing conversations.
Unrestricted departments may notify an eligible support operator or full
administrator; restricted departments may notify only a member or full
administrator. Existing urgent administrative notifications remain limited to full
administrators, who retain department access.

## Local acceptance

The guarded `support` API test group uses a fresh marked fictional PostgreSQL
schema. It covers legacy migration, public/default routing and duplicate creation,
hidden/disabled targets, customer ownership and private-message exclusion,
restricted staff list/read/reply/update access, reason and assignment validation,
membership revocation, stale configuration, current notification recipients and
department-management HTTP role checks. It also runs the earlier ticket workflow
regressions. The schema verifier inventories both new tables and the revision
constraint.

The focused Chromium scenario creates a restricted department, opens an owned
customer ticket, routes it to Billing with an audit reason, checks retained
messages/ownership and the customer view, and checks the ticket controls at mobile
width. UI tests cover save and discard behavior; shared tests reject forged
ownership and private-message fields. All accounts and messages are fictional.

Recommended next command: **Command 217 — Add private ticket attachments**.
Implementation requires separate owner authorization.

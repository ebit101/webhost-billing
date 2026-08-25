# Support Tickets

## Scope

Command 20 implements one private support queue for the Webhost Billing business. Customers can open tickets, optionally link one of their hosting services, read their own conversations, and reply. Administrators can inspect the complete queue, filter it, assign an active administrator, set priority and status, reply, reopen, and close.

This is intentionally not a help-desk suite. Departments, canned replies, satisfaction surveys, SLAs, public knowledge bases, file uploads, and per-staff permission matrices are outside the initial release.

## API

All routes require an authenticated cookie session. Unsafe routes also require the signed CSRF header.

| Method  | Route                        | Role           | Purpose                                                       |
| ------- | ---------------------------- | -------------- | ------------------------------------------------------------- |
| `POST`  | `/tickets`                   | Customer       | Open a ticket for the signed-in customer                      |
| `GET`   | `/tickets/my`                | Customer       | List only the signed-in customer's tickets                    |
| `GET`   | `/tickets/:ticketId`         | Customer/Admin | Read a conversation after service-layer ownership enforcement |
| `POST`  | `/tickets/:ticketId/replies` | Customer/Admin | Append one plain-text reply                                   |
| `GET`   | `/tickets`                   | Admin          | Filter the complete queue                                     |
| `GET`   | `/tickets/setup-options`     | Admin          | List active assignable administrators                         |
| `PATCH` | `/tickets/:ticketId`         | Admin          | Change status, priority, or assignment                        |

Administrator list filters include search, status, priority, customer, service, assigned administrator, and unassigned-only. Customer lists accept search, status, and an owned-service filter. Both use the shared bounded pagination contract.

## States and priority

New tickets begin `OPEN` with `NORMAL` priority. A customer follow-up moves a non-closed ticket to `WAITING_FOR_STAFF`; an administrator reply moves it to `WAITING_FOR_CUSTOMER`. An administrator may explicitly set `OPEN`, either waiting state, or `CLOSED`. Closed tickets reject replies until an administrator reopens them.

Priorities are `LOW`, `NORMAL`, `HIGH`, and `URGENT`. Only administrators can change priority. Assignment accepts only an active, non-deleted administrator profile, and may be cleared.

The ticket state is independent of hosting-service, order, invoice, payment, provisioning, and renewal states. Closing support never changes a hosting account or financial record.

## Ownership and service association

The customer ID is always derived from the authenticated customer identity; request bodies cannot choose it. If a service is supplied at creation, the API proves that the service belongs to the same customer. Every ticket detail and reply performs service-layer ownership enforcement, so changing a URL UUID cannot expose or mutate another customer's conversation.

The administrator response includes the minimum customer and service context needed for queue work. It does not expose hosting credentials, control-panel secrets, payment evidence, or unrelated billing data.

## Idempotency and history

Customer creation and every reply require a client-generated UUID `submissionKey`. The creation key becomes the ticket UUID, and a reply key becomes the append-only message UUID. An exact retry returns the existing conversation; reuse with different content, ownership, or scope conflicts. Ticket numbers remain separate human-readable `TKT-YYYYMMDD-<random>` identifiers.

Messages have no update or delete route. Administrator replies and every administrator status, assignment, or priority change append an `ActivityLog` in the same transaction. Audit metadata contains IDs and before/after state, never message bodies.

## Plain text and attachment policy

The initial release does not accept attachments. Strict request objects reject `attachments`, file URLs, and any additional fields. Subjects and messages are trimmed, length-bounded plain text; angle brackets and unsupported control characters are rejected at the API boundary. The Next.js interfaces render content only as React text, and the email template catalog independently HTML-escapes durable text.

Customers are reminded not to paste passwords, API tokens, recovery codes, or other secrets. Adding files later requires a separate authorized design for private object storage, authenticated download authorization, filename normalization, MIME and signature validation, allowlisted formats, size/count limits, malware scanning, retention, and audit evidence. A web-accessible upload directory is not acceptable.

## Reply email delivery

The initial message opens the ticket without a reply email. Each later reply atomically appends one `EMAIL_TICKET_REPLY` outbox event keyed by the message UUID.

- Administrator replies notify the ticket-owning customer's current email and link to `/portal/support`.
- Customer replies notify the assigned active administrator. If unassigned or the assignee is inactive, the worker selects the oldest active administrator profile and links to `/admin/support`.
- If no active administrator exists, delivery fails permanently and remains visible in email operations; the committed ticket reply is never rolled back.

The worker reloads the ticket and exact message from PostgreSQL. Redis receives reference-only job data. Normal email idempotency, retry classification, escaping, and delivery evidence remain defined in `docs/EMAIL_NOTIFICATIONS.md`.

## Interfaces

`/portal/support` provides service-aware creation, a customer-only ticket list, threaded history, closed-state guidance, and replies. `/admin/support` provides server-backed search/filter controls, a queue table, conversation context, assignment/priority/status controls, and replies. Both are responsive and use the established customer and administrator workspace shells.

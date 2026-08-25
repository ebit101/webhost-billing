# Email Notifications

## Scope

Command 18 implements transactional email as a trusted BullMQ consumer. Business and authentication transactions commit a reference-only PostgreSQL outbox event; the outbox dispatcher publishes that reference to the `emails` queue; the worker then loads current records, validates the event payload, renders the message, and sends it through a provider-neutral adapter. An SMTP outage can therefore fail an email without rolling back an order, invoice, payment, or service operation.

The active template catalog contains exactly these twelve responsive HTML messages, each with a plain-text alternative:

| Template            | Durable event                       | Producer in Command 18             |
| ------------------- | ----------------------------------- | ---------------------------------- |
| Email verification  | `AUTH_EMAIL_VERIFICATION_REQUESTED` | Registration/customer creation     |
| Password reset      | `AUTH_PASSWORD_RESET_REQUESTED`     | Password-reset request             |
| Order received      | `EMAIL_ORDER_RECEIVED`              | Order creation                     |
| Order approved      | `EMAIL_ORDER_APPROVED`              | Order transition to processing     |
| Payment received    | `EMAIL_PAYMENT_RECEIVED`            | Verified manual or gateway payment |
| Invoice created     | `EMAIL_INVOICE_CREATED`             | Initial or manually issued invoice |
| Renewal reminder    | `EMAIL_RENEWAL_REMINDER`            | Command 19 producer pending        |
| Overdue notice      | `EMAIL_OVERDUE_NOTICE`              | Explicit overdue transition        |
| Service provisioned | `EMAIL_SERVICE_PROVISIONED`         | Verified activation/provisioning   |
| Service suspended   | `EMAIL_SERVICE_SUSPENDED`           | Verified suspension                |
| Service reactivated | `EMAIL_SERVICE_REACTIVATED`         | Verified reactivation              |
| Ticket reply        | `EMAIL_TICKET_REPLY`                | Command 20 producer pending        |

Command 18 defines and tests the renewal and ticket templates/routes, but it does not implement the Command 19 scheduler or Command 20 support workflow.

## Configuration

Development defaults to `EMAIL_TRANSPORT=preview`. This produces RFC-compatible `.eml` files without an external network delivery. Configure the brand, sender, public link origin, preview directory, and concurrency with the `EMAIL_*` values documented in `.env.example`.

Production refuses preview delivery and non-HTTPS public links. SMTP requires a host, a valid port, certificate-validated TLS 1.2 or newer, and either implicit TLS or required STARTTLS. Username and password must be supplied together when authentication is used. Keep credentials in the deployment secret store and never commit them.

No live SMTP credential is configured by this command and no external message was sent during development validation.

## Rendering and secret boundary

Template models are typed and selected by a closed catalog. All customer, product, domain, ticket, and business-brand values are HTML-escaped before interpolation. Subjects and sender-name settings reject line breaks. Money is formatted directly from integer minor units without floating-point arithmetic, and dates are rendered from UTC values.

Redis contains only the outbox and aggregate references. Verification/reset tokens remain encrypted in PostgreSQL and are decrypted only inside the trusted worker immediately before rendering. Raw tokens, full message bodies, SMTP credentials, provider responses, and outbox payloads are never written to job data, structured logs, administrator responses, or delivery-attempt failure fields.

## Delivery, retries, and idempotency

Each outbox event has at most one `EmailLog`. Each actual adapter call receives a durable `EmailAttempt` row and a deterministic `Message-ID` derived from the outbox UUID. A successful log is terminal: duplicate jobs return without another adapter call. Temporary SMTP failures use the email queue's bounded five-attempt exponential retry policy; permanent rejection stops immediately.

An SMTP connection failure before message submission is temporary. A timeout or lost connection during SMTP `DATA`, an unknown provider result, or a worker restart after a send started has an uncertain outcome. It is classified `INCONSISTENT` and is not blindly resent. The deterministic message ID helps provider-side investigation but is not treated as proof of delivery.

Attempt records store only the provider key, fixed failure kind/code, provider message identifier on success, and timestamps. They never store raw exception text. Delivery history is append-only in normal operation, and the administrator listing tolerates retired historical template identifiers.

## Development preview

Set a private local directory, for example:

```dotenv
EMAIL_TRANSPORT=preview
EMAIL_PREVIEW_DIRECTORY=/tmp/webhost-billing-email-preview
```

The worker creates the directory with mode `0700` and files with mode `0600`. Filenames are SHA-256 digests of deterministic message IDs, not recipient addresses or subjects. Open the resulting `.eml` in a local mail client. Preview files can contain customer data and action links, so the directory must not be web-served, shared, backed up as source code, or committed.

## Administrator visibility

Authenticated administrators can open `/admin/email`, backed by `GET /email-notifications`, to view the latest 100 delivery logs and their attempts. Customer access is forbidden. The response contains recipient, subject snapshot, template identifier, status, attempt count, timestamps, and normalized failure codes only. It excludes raw `lastError`, provider messages, message bodies, tokens, and outbox payloads.

The Automation page remains the place to inspect a failed BullMQ job and manually retry only a `TEMPORARY` failure. Permanent and inconsistent outcomes require configuration repair or reconciliation, not replay.

## Operational checklist

Before enabling SMTP outside development:

1. Configure the exact HTTPS billing URL and verified sender identity.
2. Inject SMTP credentials outside Git and restrict access to the worker process.
3. Confirm TLS validation and STARTTLS/implicit-TLS behavior against the chosen provider.
4. Send only fictional acceptance messages first and inspect both HTML and plain text.
5. Confirm SPF, DKIM, DMARC, bounce handling, provider limits, alerting, and credential rotation with the selected provider.
6. Monitor failed/inconsistent attempts and the retained BullMQ failures.

Provider-specific bounce ingestion and delivery analytics are not part of Command 18.

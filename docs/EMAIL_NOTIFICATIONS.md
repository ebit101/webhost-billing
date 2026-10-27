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

Command 21 moves non-secret email branding and sender/reply-to identity into typed business settings. The worker reloads and validates that branding for each resolved outbox message. SMTP host authentication remains deployment-managed and is not returned through the settings API.

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
Use `docs/PRODUCTION_SMTP_ACCEPTANCE.md` for the Command 38 provider, DNS, reputation,
credential, fictional-recipient, evidence, and rollback gate.

## Admin and Client notification plan (Command 137)

Open `/admin/notifications` or `/portal/notifications`, including through the
header bell. Each role has a notification list, paginated alert history,
transactional email history and an account-only preferences dialog. Restricted
staff see only their own security alert catalogue/history. There is no fabricated
unread badge or claim of external delivery.

All events below have an email path. “Existing” uses the unchanged twelve-template
transactional pipeline and its configured transport. “New preview” uses the new
ledger and private generic account-alert email previews. Important WhatsApp alerts
use the same new ledger, including when the corresponding email already exists.

| Client notification        | Email path             | WhatsApp  |
| -------------------------- | ---------------------- | --------- |
| Verify email               | Existing               | —         |
| Password reset             | Existing               | —         |
| Welcome after verification | New preview            | —         |
| Account security changed   | New preview            | —         |
| Order received             | Existing               | —         |
| Order approved             | Existing               | —         |
| Invoice issued             | Existing               | Important |
| Renewal reminder           | Existing               | —         |
| Overdue notice             | Existing               | Important |
| Final suspension warning   | New preview            | Important |
| Verified payment receipt   | Existing               | —         |
| Hosting ready              | Existing               | —         |
| Service suspended          | Existing               | Important |
| Service restored           | Existing               | Important |
| Domain registered          | New preview            | —         |
| Domain renewed             | New preview            | —         |
| Domain renewal reminder    | New preview            | —         |
| Domain expiry warning      | New preview            | Important |
| Support reply              | Existing               | —         |
| Urgent support update      | Existing support email | Important |
| Refund or reversal         | New preview            | —         |

| Admin notification                                  | Email path                                   | WhatsApp  |
| --------------------------------------------------- | -------------------------------------------- | --------- |
| Customer email verified                             | New preview                                  | —         |
| New order                                           | New preview                                  | —         |
| Manual payment needs review                         | New preview                                  | Important |
| Payment confirmed                                   | New preview                                  | —         |
| Refund or reversal                                  | New preview                                  | —         |
| New support ticket/customer reply                   | New preview for creation; existing for reply | —         |
| Urgent support update                               | Existing support email                       | Important |
| Hosting failure or uncertain outcome                | New preview                                  | Important |
| Domain failure or uncertain outcome                 | New preview                                  | Important |
| Own account security change                         | New preview                                  | Important |
| Exhausted/permanent email or alert delivery failure | New preview                                  | Important |
| Failed/partial automation or failed business outbox | New preview                                  | Important |
| Daily operations summary                            | New preview                                  | —         |

### Automatic important alerts

The owner explicitly requested invoice-created and overdue WhatsApp alerts and
no opt-in step. Important WhatsApp defaults on when a valid number is available.
Use the customer's account phone, normalizing a valid Bangladesh local mobile
number only when its country is BD, or a separately saved international number.
Administrators can save their own number. Invalid/missing numbers skip WhatsApp.
No verification/password link, receipt or daily digest is sent through WhatsApp.

Preferences may turn important alerts off. Muting or changing a number suppresses
queued WhatsApp entries; muting preserves the encrypted saved number. A blank
number field keeps the current number. Saving a number never confirms external
reachability or enables a live provider. Responses show only its final four digits.

### Delivery boundary and scheduling

`NOTIFICATION_DELIVERY_MODE=disabled` is the default in the application and sample
deployment environments. Its only other value is `preview`. There is no live mode,
WhatsApp credential or live connector. Existing transactional email transport is
independent and is not switched by this setting. Staging's current email settings
must be preserved during any separately authorized rollout.

Projection reads committed sources since the migration epoch and records an
idempotent per-source/recipient/type/channel ledger. Issued and overdue invoices
use canonical invoice keys even if an outbox event is duplicated. Existing email
events are not re-enqueued. Calendar notices cover domain expiry at 14/7 days
(email) and 1/0 days (one final email/WhatsApp alert per expiry); the final hosting
warning is the business day before the existing policy's suspension date and
requires enabled renewal policy, an outstanding invoice and an active service.
The daily email summary counts pending orders, overdue invoices, failed hosting
operations and domains expiring within fourteen days. It is not a financial or
provisioning operation.

Before preview delivery the worker rechecks account eligibility, current staff
role, mute preference, destination fingerprint and mutable business references.
Paid overdue invoices, changed domain expiry, stale service state, closed payment
reviews and non-urgent tickets are skipped. Failed local previews retain safe
bounded retry state; automatic retries never call an external provider.

Preview emails use the saved email branding or configured fallback and existing
private `.eml` transport. WhatsApp previews are private JSON files beneath
`EMAIL_PREVIEW_DIRECTORY/whatsapp`, with a hashed entry-ID filename, masked
recipient and generic sign-in link. They contain no invoice amount, token or
ticket content. Keep all preview files outside public serving and Git. History
labels distinguish disabled, queued, skipped, failed and local-preview states.

Own transactional history is restricted to current recipient and account creation
time; Client history additionally requires the owned customer UUID. Raw message
bodies, action tokens, ciphertext, destination fingerprints and provider errors
are excluded. Global administrator email operations remain at `/admin/email`.

Command 137 adds database tables but authorizes migration only in isolated
fictional test schemas. Office/staging migration, live messaging and deployment
remain separate owner-authorized work.

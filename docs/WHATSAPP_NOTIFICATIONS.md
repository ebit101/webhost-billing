# Important WhatsApp notifications

Command 168 prepares Meta WhatsApp Cloud API locally. Delivery defaults disabled;
no account, phone, template or webhook is created at Meta by this implementation.
The owner's intended sender is retained privately outside Git. A phone number alone
is not a Cloud API phone-number ID or proof of enrollment.

## Alerts and recipients

The shared notification catalogue is the closed allowlist. Clients receive issued
invoices, overdue notices, final suspension/domain-expiry warnings, confirmed
service suspension/restoration and urgent support updates. Full administrators
receive new/overdue invoice alerts, payment-review requests, urgent support and
hosting/domain/delivery/automation failures. Administrator security alerts go to
the affected administrator, including restricted staff. Routine notices, receipts,
welcome messages, verification/reset links and daily summaries stay email-only.

An issued invoice means an invoice with `issuedAt`, not a draft. Overdue alerts
are suppressed if the invoice is cancelled, paid or no longer has a payable
balance. Invoice reads retain client ownership and administrator staff-role checks.
Source/recipient/key/channel uniqueness prevents duplicate ledger entries; existing
transactional email is not duplicated. Previously projected sources are not replayed
to add historical administrator invoice alerts.

Important alerts remain automatic for valid account numbers unless muted, as the
owner requested. An encrypted notification-number override takes precedence.
Administrators must save their own recipient number through Notification preferences;
the sender is never substituted for a missing recipient. Restricted staff do not
receive general business alerts. Accounts, preferences, current invoice/service
state and the recipient fingerprint are checked again at submission claim time.
Muting skips queued alerts; it cannot recall a submission already claimed.

## Private configuration and disabled gates

All three conditions are required for real networking:

1. `NOTIFICATION_DELIVERY_MODE=live` in the API and worker/scheduler environment.
2. `WHATSAPP_LIVE_ENABLED=true`, an independent gate defaulting false.
3. An enabled, valid encrypted configuration with the exact event's approved template.

**Do not enable those gates as part of local development or this command.** The
example environments retain disabled/false. Preview mode always uses the filesystem
adapter and never reads Meta credentials or calls Meta. Its private masked-recipient
artifact now includes the same body parameters used by the Cloud API transport.
In live mode only important WhatsApp alerts are submitted; new alert emails remain
disabled. Existing transactional SMTP is independent in every mode.

Configuration lives in the existing `IntegrationCredential` store under provider
key `whatsapp.meta`. There is no plaintext environment-token fallback and no public
credential-response endpoint. `MetaWhatsAppConfigurationCipher` encrypts the complete
runtime-validated configuration with randomized AES-256-GCM, a WhatsApp-specific
derived key and authenticated key-version context. Use its `encrypt` method and
`META_WHATSAPP_KEY_VERSION` for a separately reviewed private configuration entry;
never write a token or real customer information into Git, terminal output or a job.
This command does not add a credential settings screen or write a configuration row.

The private bundle schema requires `enabled`, `senderPhoneNumber` (E.164),
`phoneNumberId`, `apiVersion`, `accessToken` and `templates`. `enabled` defaults false.
`templates` maps catalogue keys to their exact approved `name` and `language`.
Missing or invalid credentials/templates fail closed. Choose an API version supported
by the actual Meta app during credentialed acceptance; test-fixture versions do not
certify account compatibility.
The token needs the corresponding messaging and phone-metadata management access;
verify its actual scopes privately during setup.

Before each POST, the adapter makes a bounded authenticated GET of the configured
phone-number ID and requires its displayed number to match the configured sender.
Mismatch or unavailable proof stops before message submission. Both requests use
only `https://graph.facebook.com`, reject redirects and time out after ten seconds.
Responses are bounded to 16 KiB; raw provider errors and credentials are not persisted.

## Template contract

Use a separately approved utility template for each important catalogue key, with
the appropriate fixed event wording and four positional text body parameters:

| Position | Value                                                                           |
| -------- | ------------------------------------------------------------------------------- |
| 1        | Business display name from existing email branding                              |
| 2        | Invoice number for invoice events; otherwise the notification reference         |
| 3        | Invoice balance/due calendar date, or the catalogue's bounded event description |
| 4        | Authorized Admin or Client collection URL under the configured HTTPS origin     |

For example, an invoice template proposal is:
`{{1}}: Your invoice {{2}} is available. {{3}}. Sign in to review: {{4}}`.
The administrator variant must say it concerns a customer invoice. This is a
proposal, not a claim of Meta approval. Template names/languages must be explicitly
mapped after approval; there is no arbitrary-text or default-template fallback.
BDT 390000 minor units becomes `BDT 3900.00`; due dates use dd/mm/yyyy and retain
their UTC calendar day. No passwords, OTPs, recovery links, bank destinations,
ticket bodies or raw event metadata are sent.

## Submission and uncertainty

The worker commits `SUBMITTING` under its recipient/entry locks before making any
network request. It performs the single provider submission outside that database
transaction. The stable notification UUID is sent as opaque callback correlation;
it is **not** treated as a Meta idempotency guarantee.

A validated matching-recipient response with one message ID becomes `ACCEPTED`,
meaning provider acceptance only. A definite rejection/configuration failure becomes
`FAILED`. A timeout, 5xx, ambiguous/mismatched/oversized response or unrecorded result
becomes `UNKNOWN` where storage is available. A process/storage failure can leave
`SUBMITTING`. Redelivery never submits Accepted, Unknown or Submitting entries again;
live Failed entries are not automatically or manually retried through queue flags.
Unknown outcomes project an administrator delivery-problem alert without recursive
failure alerts. Review provider evidence before any separately authorized new send.

History explicitly labels acceptance as delivery unconfirmed and uncertain/claimed
submissions as requiring review. Signed delivery-status webhooks and Delivered/Read
tracking are not implemented in this command; no HTTP response is labelled delivered.
Before operational activation, review retention/incident handling for uncertain or
stuck submissions and complete fictional-recipient acceptance at Meta.

## Acceptance still required

Local tests use fictional data, encrypted fixture bundles and injected HTTP responses.
They are not genuine sender enrollment, template approval, recipient authorization,
delivery, billing or production acceptance. No genuine credentials were supplied and
no provider request or message was sent. Do not enroll/migrate the owner's existing
WhatsApp number, enable networking, send a test message or deploy without a separate
authorization. Obtain the phone-number ID and token privately, confirm the intended
sender mapping and template approvals, then test only authorized fictional/test
recipients in the separately approved environment. Preserve SMTP and other providers.

Command 169 completes PostgreSQL-backed acceptance through
`pnpm test:whatsapp:database`. The driver creates and migrates a fresh marked,
loopback-only schema, skips general demo seeds, forces process-level sending gates
off and drops only that verified schema. Ten cases cover actual projection/role
scope, locks, claim-before-send, concurrent/replayed delivery, uncertain and lost
acknowledgements, encrypted configuration, private previews and unchanged fictional
financial records. Provider branches use injected HTTP/adapters; external fetch is
blocked. CI has a dedicated step, while ordinary worker tests skip this opt-in suite.

The real database run exposed an installed adapter-pg timestamp-normalization issue
under a non-UTC server timezone. Shared Prisma connections now request UTC at startup,
preserving search-path options. A conflicting-timezone regression compares ORM and
database epoch milliseconds. No stored timestamp or migration history is rewritten.

Initial acceptance used checksum-verified portable EDB PostgreSQL 18.6 and Gitleaks
8.30.1 while Docker was unavailable. After the owner restored Docker on 02/11/2026,
the same 10 database cases passed with all 40 migrations in a disposable, resource-
limited PostgreSQL container using CI's pinned image, including a non-UTC server
timezone. The exact pinned Gitleaks container also scanned all 378 existing commits
with no leaks; the report-only follow-up is scanned separately before committing.
Repository rules and redacted output are unchanged. Both temporary database runtimes
were removed after verified cleanup, with the original local PostgreSQL/Redis
containers and Office environment preserved. No application/dev server, worker,
scheduler, SMTP or live provider is started by acceptance.

Installed-browser acceptance, genuine Meta credentials/sender/template approval and
authorized-recipient delivery remain pending for separately authorized work. Local
database and secret-scanning closure does not authorize activation or deployment.

Official references reviewed on 02/11/2026: [Meta Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api),
[Meta template component reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/component_object/)
and [WhatsApp developer hub](https://whatsappbusiness.com/developers/developer-hub/).

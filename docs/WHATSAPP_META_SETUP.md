# Meta WhatsApp test setup

Command 170 prepares the existing installation for Meta access and template review.
It does not deploy, activate delivery or authorize a test message. Keep
`NOTIFICATION_DELIVERY_MODE=disabled`, `WHATSAPP_LIVE_ENABLED=false` and any saved
provider configuration disabled throughout setup.

## Existing account and sender

Use the business account that owns the intended sender, identified in the private
local setup record. The authenticated Meta phone list was inspected on 02/11/2026:
the intended sender is already Connected with High quality; the business display
name is In review. Preserve its current registration and existing integrations.
Display-name review, template approval and application-token acceptance are separate
facts; a Connected phone does not prove that Webhost Billing has API access.

The same browser also exposes a separate Meta test account and test phone. That
test sender is not the installation's intended business sender. Never substitute
its phone-number ID into the real sender's configuration. A test account can help
explore access, but templates and credentials must be verified for the correct
owning WhatsApp Business Account (WABA).

No new phone registration, migration, Business App deregistration, display-name
edit, webhook replacement, app publishing, existing-token rotation or payment
configuration is part of this command. Existing integrations may already use the
same Meta app/WABA. In particular, leave their inbound/webhook configuration intact.

## Template submission pack

[The local draft pack](whatsapp-meta-template-drafts.json) contains 16 important
Admin/Client templates matching the application catalogue. These are authored
payload proposals, not evidence of approval. It contains fictional examples only.
The owner's review copy is retained in ignored local artifacts with the intended
business branding and portal URL; no credentials or customer information appear
in either pack.

Start with these four priority templates in the owning WABA's **Manage templates**:

| Notification                 | Proposed name                  | Language | Proposed category |
| ---------------------------- | ------------------------------ | -------- | ----------------- |
| Client invoice issued        | `whb_client_invoice_issued_v1` | `en_US`  | `UTILITY`         |
| Client overdue notice        | `whb_client_overdue_notice_v2` | `en_US`  | `UTILITY`         |
| Administrator invoice issued | `whb_admin_invoice_issued_v1`  | `en_US`  | `UTILITY`         |
| Administrator overdue notice | `whb_admin_overdue_notice_v1`  | `en_US`  | `UTILITY`         |

Select Utility, Default, English (US), positional Number variables and a text-only
body. Leave optional headers, footers, buttons and custom validity controls unused
because the current adapter sends body parameters only. Use the exact body's
`{{1}}` through `{{4}}` order and supply all four fictional samples before submitting
for review. Every body starts/ends with fixed text, includes event-specific context
and stays within 1,024 characters. Submission is a review request, not a message to
a customer. Preserve unrelated existing templates, including legacy-portal notices;
their parameter order and destination may not match Webhost Billing.

| Parameter | Application value                                                       |
| --------- | ----------------------------------------------------------------------- |
| `{{1}}`   | Current business brand name                                             |
| `{{2}}`   | Invoice number for invoice/final-warning notices; otherwise notice UUID |
| `{{3}}`   | Exact invoice balance/due date or the fixed event description           |
| `{{4}}`   | Correct Admin/Client collection URL under the configured origin         |

An amount example is `BDT 3900.00`; the due date example is `02/11/2026`. There are
no passwords, OTPs, reset/verification links, bank destinations, ticket bodies,
actual customer details, promotions or automatic payment/provisioning claims.

Record Meta's actual result separately for each exact name/language: Pending,
Approved/Active, Rejected or otherwise unavailable. Meta decides category and
approval; do not describe a local draft or pending request as approved. Verify
Utility classification before future activation; do not silently accept a
Marketing reclassification or change application mappings to an unrelated template.
An Active template at Meta does not activate billing notification delivery.

At the final authenticated check on 02/11/2026, all 16 intended templates were
Utility, English (US), In review, with zero messages sent. None is approved yet.
The earlier unused Marketing overdue version is an additional pending template;
the two older approved templates are unrelated. Actual review state is private
installation evidence, not a field to infer from this repository's proposal pack.

The first client overdue submission (`whb_client_overdue_notice_v1`) appeared as
Marketing and remains unused. Its pending-review editor did not permit category
changes. A revised `whb_client_overdue_notice_v2` was submitted after confirming
Utility in the editor and is listed as Utility, In review. Preserve the earlier
version without mapping it; do not infer approval from a successful submission.

## Private test access

The required nonsecret identifiers are the owning WABA ID, its exact sender's
phone-number ID and the API version supported by the selected Meta app. These are
different identifiers; never use the display phone number as the phone-number ID.
Retain installation identifiers outside Git. Do not infer API authorization from a
browser's administrator login.

The owner performs sign-in, OTP/phone verification and credential/permission setup
privately in Meta. Use a dedicated credential with only the required Speed Host
asset access. The transport needs messaging access and phone metadata reads; account
and template inspection use the corresponding management access. Do not reuse a
broad multi-customer token or expand access to unrelated businesses merely to avoid
setup. Review actual app/asset scopes, account identity and expiry before acceptance.

Do not paste an access token, app secret, password, recovery code or OTP in chat,
screenshots, issue reports or repository files. Temporary developer tokens can expire;
record expiry privately. The application has no public Meta credential-entry screen
yet. After access is ready, agree on a protected local input path and use the existing
`MetaWhatsAppConfigurationCipher` for an inactive encrypted configuration. Do not put
plaintext keys in `.env` or manufacture placeholder credentials that look active.

Only templates actually approved for the owning WABA may be copied into its
configuration's `templates` mapping. Keep `enabled: false`; the two process-level
delivery gates remain off as well. A local draft name is never approval evidence.

### Owner's private access steps

In Meta Business Settings, select the portfolio that owns or is explicitly assigned
the intended Speed Host WABA. Open Users, then System users. Use a dedicated
Webhost Billing system user and assign only the required app and this WhatsApp
account; do not alter the existing multi-customer integration's user or token.
If the intended WABA cannot be assigned, stop and resolve its ownership/partner
access before generating a credential. Seeing it in WhatsApp Manager alone is not
proof that a new system-user token can access it.

The owner completes asset assignment and Generate token privately. Select the
intended app, a bounded expiry suitable for test access, and only the required
`whatsapp_business_management` and `whatsapp_business_messaging` permissions.
Do not add `business_management` simply for convenience; this command does not
require programmatic administration of the whole portfolio. Actual available
permissions and asset assignment must be checked in Meta, not assumed from this
guide. Do not rotate or revoke another integration's token.

Store the generated token in the owner's secure vault and record its expiry
there. Obtain the exact WABA ID and intended number's Phone number ID from Meta;
the sender is already connected, so do not register it again or send the sample
message offered by API setup. Return only a nonsecret result such as "Token
created and stored privately" or the exact setup error with secrets removed.
Arrange a protected local input separately before any application credential is
saved. No genuine credential has been entered or verified by this command yet.

With separately supplied private access, the next acceptance can make authenticated
read-only Graph requests to confirm the exact WABA, sender/phone-number ID pair,
token access and template status/body/language/category. Read-only access does not
require enabling the application's sending gates. No send endpoint, registration,
renewal, recipient OTP dispatch or credential rotation is authorized implicitly.

## Before a later message test

A real message requires a separate exact sender/recipient and message authorization.
Use an owner-controlled test recipient and a fictional invoice. Meta's recipient
permission requirements still apply; the app's automatic-alert/no-new-opt-in-checkbox
preference does not replace provider permission. Do not change that application
workflow as part of this setup command. Keep customer/bulk delivery disabled.
Provider acceptance is not proof of delivery, and no Delivered/Read status is claimed
without trusted delivery evidence. See [the transport guide](WHATSAPP_NOTIFICATIONS.md).

## Sources and verification

Reviewed on 02/11/2026: authenticated Meta app/WhatsApp Manager screens, Meta's
[Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api),
[official API specification](https://github.com/meta/openapi/blob/main/business-messaging-api_v23.0.yaml)
and [current messaging policy](https://whatsappbusiness.com/policy/). Some developer
documentation requires a Meta login; public search results do not establish this
installation's permissions, enrollment or approval state. The versioned public API
specification informs payload structure, not the API version to assume for this app.

Offline validation checks all 16 important keys, unique legal names, four invoice
priorities, Utility/en_US proposals, body size, exact positional parameters/examples,
role-specific links and disabled local status. Template/account approval and genuine
API access must be recorded from actual Meta results as setup continues.

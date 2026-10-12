# StarGate/UK2 registration

The [live rollout section](#live-resellbiz-rollout-for-command-51) records the separately
authorized Command 51 implementation and its pending operational acceptance.

Command 50 implements the [approved registrar design](LOGICBOXES_REGISTRAR_DESIGN.md).
This is a local evaluation workflow, not provider acceptance or permission to sell
real domains. This simulated path has no network client or production fallback.
The proprietary, ionCube-encoded owner archive is not implementation source.
With `NODE_ENV=production`, simulated offers and writes remain closed. The consumer
starts only if separately permitted for live operations; it cannot dispatch simulation
in production. Existing simulated history remains read-only.
Evaluate only in a development/test installation with fictional records.

## Evaluate with fictional records

1. Upgrade only an owned local evaluation installation with the reviewed additive
   migration `20261012000100_domain_registrar`. Back up existing installations first;
   disabling the registrar is the rollback, not dropping historical records.
2. Sign in as an enrolled full administrator. Open `/admin/domains`, enter an explicit
   positive one-year BDT selling price in minor units, and type
   `Enable simulated registrar`. Networking stays disabled. This creates two fictional
   `.com`/`.net` offers; it does not synchronize live provider prices.
3. Use the existing customer manager and customer sign-in with fictional identities.
   Open `/portal/domains`, select an offer and an ordinary ASCII second-level name,
   complete all registrant fields and explicitly accept `fictional-registration-v1`.
   Nameservers are fixed to `ns1.example.test` and `ns2.example.test`. A validated offer
   and domain survive sign-in; contacts, consent and price authority never travel in URLs.
4. Request a five-minute quote. Fixed BDT revenue and observed simulated USD cost are
   independent integer amounts: there is no FX calculation or converted profit.
   Explicitly create the order and immutable unpaid invoice. Submission replay does
   not create another purchase. Expired quotes require new customer review.
5. Submit a fictional receipt using the existing invoice/manual-payment workflow.
   A pending receipt or an administrator-set paid summary is insufficient; the verified
   charge ledger must fully settle the invoice in BDT, without refund or reversal.
6. The full administrator reviews the customer/order/invoice, contacts, consent,
   nameservers and native cost, types the exact domain name and approves an immutable
   positive USD cost ceiling. This commits an outbox reference, not a registration.
7. The dedicated worker claims the operation durably before provider work, rechecks
   financial/customer/administrator eligibility, ensures fictional contact mappings
   and dispatches once. Only ownership-matched status and expiry complete the order.
   Invoice status, domain status and contact verification remain independent.

Administrator and customer lists show at most the latest 100 requests. Administrator
contact review is read-only; customer domain-detail responses omit private contacts, native cost,
provider IDs and operation evidence. The administrator screenshot is a layout reference
only: its real customer values, prices and available actions were not copied.
Request time is not registration time; observed registry expiry is not a billing date.
Renewal price and next billing date are deliberately not invented.

## Fictional outcomes and recovery

| Name prefix     | Local simulated result                                                               |
| --------------- | ------------------------------------------------------------------------------------ |
| Ordinary name   | Registered after matching lookup; contact verification remains pending               |
| `taken-`        | Unavailable; quote denied                                                            |
| `price-`        | Native cost 1,500 USD minor units rather than 1,000; a lower ceiling denies dispatch |
| `pending-`      | Pending external outcome; payment does not imply registration                        |
| `reject-`       | Rejected outcome; paid invoice is retained                                           |
| `lost-`         | Mutation succeeds but response is lost; lookup confirms without another mutation     |
| `contact-lost-` | Ambiguous mapping creation; registration is not attempted or silently retried        |

There is one outstanding mutation per registrar account. An unresolved request can
block later unclaimed approvals; after resolving it, deliberately reapprove an unclaimed
request with its original budget. Never clear a claimed operation or change its intent.
Redelivery is read-only reconciliation, including a crash before a proven send. An absent
lookup is not permission to register again. Reads are bounded to ten per operation with
backoff; failed reads also consume an attempt. After the budget is exhausted, retain
the request for operator investigation.
There is no automatic reconciliation scheduler or automatic domain renewal in this slice.

The registrar kill switch stops both dispatch and queued reconciliation. Disabling does
not cancel, refund or undo an action already in progress. Refund/reversal after claim is
new financial history and creates an attention record; reconciliation still records
the actual simulated registrar outcome, even when the local invoice has been refunded.

## Official contract mock, not a credentialed sandbox

`LogicBoxesSandboxRegistrar` accepts only an injected transport whose kind is `MOCK`,
mode `HTTP_MOCK`, fixed host `test.httpapi.com` and the public fictional mock key.
There is no socket/fetch implementation or environment credential reader. Calls have a
ten-second deadline, no redirects, a 65,536-byte response ceiling and bounded JSON shape;
duplicate keys, excessive nesting, malformed/missing prices and unsupported states deny.
Numeric financial tokens are parsed losslessly before exact minor-unit conversion.

The mock reconciles explicitly pre-bound customer/contact IDs against
[customer details by ID](https://manage.logicboxes.com/kb/answer/967) and
[contact details](https://manage.logicboxes.com/kb/answer/792), including owner and exact
contact fields. Missing, archived, mismatched or ambiguous evidence stops the operation;
no email-only adoption, automatic signup or repeated contact creation is implemented.
The fake adapter creates immutable, customer/account-bound fictional mappings.
Actual demo signup/contact creation and account-specific status vocabulary need separate
protected acceptance; this mock does not establish that those obligations are satisfied.

The registration projection uses POST, one year, `NoInvoice`, approved nameservers and
explicitly disabled auto-renew/privacy. `NoInvoice` and HTTP success are not ownership,
payment or registration proof. Independent lookup checks account, customer, domain,
status and expiry, discarding provider PINs and domain secrets. A fresh price check is
not an atomic provider charge cap. The pinned USD mock convention does not establish
the real account's cost currency, taxes, promotions or wallet effect.

## Persistence and validation boundaries

Nine additive registrar tables are separate from hosting services. Existing products
and order items default to `HOSTING`; domain products cannot enter the hosting catalogue,
hosting order creation, service creation or hosting renewal pipeline. SQL guards enforce
ownership, immutable quotes/contacts/credentials/offers/invoice snapshots and lines,
append-only evidence, single dispatch claims and domain-order completion/cancellation.
Credentials and contacts use authenticated encryption bound to account, fake mode,
purpose and credential version. Jobs contain only local references; errors and evidence
contain fixed codes, never provider responses or registrant bodies.

Prisma schema plus hand-reviewed SQL constraints/triggers form the migration contract;
do not replace custom safeguards with an unreviewed generated schema diff. Prior 28
migration bytes and existing financial rows must remain unchanged. Historical currency
acceptance retains the exact original migration pins; test-only hosting discriminator
columns make historical fixtures compatible with the current Prisma client. This does
not activate or advance currency selection, conversion or authorization.

Automated acceptance uses disposable loopback schemas, fictional users and a private
random BullMQ prefix. The mobile test exercises customer sign-in, verified manual payment,
administrator approval, actual outbox publication and the actual registrar consumer.
No screenshot/trace of registrant details is retained. Validation results and any failures
are recorded in [progress](PROGRESS.md); this guide is not a claim that every gate passed.

## Historical Command 50 authority boundary

**Command 51 — Run credentialed UK2Group test acceptance** requires the protected demo
identity, provider isolation confirmation, key/IP permissions, exact disposable inputs,
agreement, native cost/charge evidence, operator window and explicit mutation approval
listed in the design. The test hostname with live credentials is not safe isolation.
Until those prerequisites are established, keep fake/mock evaluation and stop.
Transfer, renewal, deletion, authorization-code retrieval, nameserver/contact editing,
privacy, DNS/email tools, reminders, WHMCS import and production rollout are not enabled.
Both existing unwaived tooling advisories and the currency-development hold remain.

## Live resell.biz rollout for Command 51

Owner-authorized on 2026-10-12. Source implementation and validation are in progress;
do not read this section as executed provider acceptance or completed deployment.

The new live path is independent of WHMCS. my.speedhost.bd is the final Speed Host
portal address; existing WHMCS customers stay there with no synchronization/import.
The intended first workflow uses verified manual bank payment, not a gateway redirect
or an invoice-paid setter. Configure actual bank destinations separately; never invent
an account number or treat a customer reference as a verified receipt.

## Operator configuration and registration

1. Enroll a full administrator in two-factor authentication. Open administrator domains.
2. Use a dedicated resell.biz reseller account. Confirm API access and allowlist the
   deployment's actual outbound IP in the provider panel. Do not regenerate a key used
   by the existing WHMCS installation. Never paste credentials into chat or Git.
3. Configure reseller ID, API key, reviewed public nameservers, actual HTTPS registrar
   agreement, customer terms/privacy URLs and fixed .com BDT selling price (integer minor units). Independently verify
   that this account's cost prices are native USD with two decimal places. The cost API
   response alone does not establish currency, taxes, surcharges or all-in debit semantics.
   The initial account's identity, nameservers and agreement are immutable. Incorrect
   policy values need a reviewed correction; do not edit SQL or historical snapshots.
4. Saving credentials makes no provider calls and leaves the account disabled. Run the
   explicit read-only check, then explicitly enable live offers. Both API and worker
   must have `RESELLBIZ_LIVE_ENABLED=true`; ordinary deployments default to false.
   GET settings, offers and record refresh never call the provider.
5. Create the local customer normally. The customer signs in, supplies actual registrant
   details (prefilled without guessing missing values), accepts the configured registrar
   agreement/data disclosure and customer terms/privacy, requests a quote
   and creates the order/unpaid invoice. Ordinary ASCII .com only, one year; no premium,
   trademark/EAP, IDN, transfer, privacy or auto-renewal. Other TLDs are not live.
6. After payment and separate approval, the worker prepares the provider customer and
   contact. An authenticated complete empty customer search permits one signup; a
   positive result must prove direct reseller ownership and every expected identity
   field. Email alone, errors, incomplete or ambiguous search results are not proof.
   Each creation is claimed durably before POST; an uncertain result never permits retry.
   Passwords are generated independently to the provider's documented 9–16 character
   policy, never copied from portal credentials, stored in jobs or exposed. Marketing
   and SMS consent are false. Explicit known IDs can optionally be verified read-only.
7. Submit the manual bank-transfer reference through the existing payment flow. An
   authorized administrator verifies actual receipt; full, unadjusted BDT settlement is
   mandatory. Do not fabricate a payment to test a real registrar purchase.
8. Review exact domain, nameservers/contact/consent and observed provider cost. Type the
   exact domain and approved USD preflight threshold in minor units. Explicitly acknowledge
   that this is a real paid purchase and that the provider's final debit can differ.
   This threshold is **not an atomic price cap**. `NoInvoice` does not mean no charge.
9. The worker persists one dispatch claim before external work, checks fresh eligibility
   and ownership, submits at most one registration and independently checks direct order
   ownership/expiry/status. A timeout/error never causes a repeated registration. Use
   explicit bounded read-only reconciliation; an unresolved request blocks another
   dispatch on this account. A registered domain can still need contact verification.

The owner has proposed MessageDock.com, but no real registration is executed by source
development or deployment. Native all-in budget/debit evidence, real consent/contact
details, nameservers and the exact paid pilot approval remain required for agent execution.
Owner-reported panel cancellation terms are not verified or automated. No API cancellation,
delete or guaranteed refund is implemented or promised.

## Security, current limits and next work

Credentials use immutable encrypted account/mode/version-bound snapshots. Replacement
retains old versions and disables the account. Do not revoke a credential still needed
for uncertain-outcome reconciliation without an operator recovery plan. No credential
environment fallback, arbitrary URL/proxy, redirect, retry, raw provider response, PIN,
domain secret or sensitive job payload is exposed. Requests use fixed HTTPS destinations,
10-second total deadlines, 256 KiB response and bounded lossless JSON validation. Reserve
at most five user-triggered checks per account per minute before external work; failed
checks consume that budget. Worker reads separately retain the durable ten-poll limit.

Tests use fictional credentials/injected transports only. Strict customer/contact/status
response projections need actual account acceptance after secure configuration; successful
mocks are not proof of resell.biz acceptance. Final debit/tax and verification vocabulary
remain operational checks. No live registration, cPanel operation or public SMTP acceptance
is performed by tests. The broader operating/off-site recovery/launch gates and existing
tooling advisories remain unresolved.

## Supported management workflow in the current draft

The source now includes nameserver/transfer-lock changes, contact replacement,
administrator-only authorization-code access and manual one-year renewal. Final
validation and deployment remain pending; this is not genuine provider acceptance.

Full administrators with MFA save a named action, review it, confirm the exact domain
and dispatch once. Ownership/current state is checked before any write, and a separate
read must confirm the requested outcome. A failed/lost response is uncertain, not a
successful change or permission to retry. Ten persistent read attempts and one open
action per domain prevent blind retries; claimed unknown actions block account mutations.
Customer views expose observed state/history/invoice links and direct customers to
support for administrative changes. GET reads local state only; the explicit registrar
check is POST and consumes the account read budget. Initial nameservers remain a clearly
labeled registration snapshot, separate from current observed settings.

Contact changes create a domain-scoped replacement, never modify a shared contact in
place, and do not enable designated-agent/skipIRTP/60-day-lock opt-out.
Organization-publication consent is separate, unchecked by default, and sent
explicitly as true/false for registration and contact association. Data-processing
consent is not silently converted into permission to publish organization data.
The current observed registrant contact is shown separately from the original
registration snapshot and cached only as an encrypted domain-bound payload.
Provider old/new
registrant approvals and email verification remain required. An accepted API response
does not prove completed contact association. Authorization codes require full admin
MFA and exact confirmation, use a no-store response, are never persisted or audited as
values, and disappear from browser memory/display after one minute or explicit hiding.
Page hiding/navigation also clears the displayed code. If a contact-creation response
is lost, the full administrator can identify the exact contact in the provider panel
and verify its ownership/saved snapshot read-only. This retains the returned ID for
reconciliation; it cannot resend either contact creation or contact association.
Known registrar customer/contact IDs can similarly recover a missing registration
binding through the advanced read-only verification form. Provider-panel recovery
must be explicit; do not silently repeat a purchase or edit SQL to clear a claim.

Each management mutation also persists a submission marker immediately before POST.
Only a proven local preflight/read failure before any mutation/contact-creation claim
can close as failed. Submitted/creation outcomes remain uncertain and need independent
reconciliation. This permits correcting an unsent request without resetting any claim.
Payment adjustments or paid-but-unsubmitted renewals display financial attention;
invoice history is preserved and the application never assumes an automatic refund.

Renewal creates a separate unpaid BDT invoice with explicit selling amount/native USD
threshold and previous expiry. Only a fully verified unadjusted payment permits dispatch.
The provider receives one year, exact previous epoch expiry, NoInvoice and auto-renew
false. Independent ownership/expiry advancement confirms the outcome; the original
invoice and registration contact remain unchanged. No atomic cost guarantee or refund.
An unclaimed local request can be cancelled; an unpaid renewal invoice without any
payment history is retained as cancelled. A claimed action or paid invoice cannot use
this cancellation path. This never calls registrar cancellation/deletion.

WHMCS is the workflow reference, not a claim of full feature or TLD parity. Transfer,
deletion, privacy purchases, automatic renewal, unsupported TLD/IDN rules and currency
conversion remain outside Command 51. Complete this supported registrar scope and its
validation/deployment before moving to the separately authorized cPanel phase.

Primary contracts: [customer search](https://cp.us2.net/kb/answer/1270),
[signup](https://cp.us2.net/kb/answer/804), [contact creation](https://cp.us2.net/kb/answer/790),
[password rules](https://cp.us2.net/kb/servlet/KBServlet/faq489.html#password),
[domain details](https://cp.us2.net/kb/answer/770),
[nameservers](https://cp.us2.net/kb/answer/776), [contact association](https://cp.us2.net/kb/answer/777),
[locking](https://cp.us2.net/kb/answer/902), [unlocking](https://cp.us2.net/kb/answer/903),
[renewal](https://cp.us2.net/kb/answer/746) and [cost prices](https://cp.us2.net/kb/answer/1029).

---

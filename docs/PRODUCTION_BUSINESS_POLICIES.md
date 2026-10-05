# Production Business and Launch Policies

## Approval status

- Command: 33 — Finalize Business and Launch Policies
- Record created: 2026-08-26
- Public-source review: 2026-10-05 — owner supplied `https://www.speedhost.com.bd/`
- Remaining operating-policy draft: 2026-10-05 — version `DRAFT-OPS-1`, awaiting approval
- Business owner approval: **PARTIAL NAMED APPROVAL RECORDED; REMAINING OPERATING DECISIONS OPEN**
- Policy status: **COMMAND 33 OPERATING DRAFT READY — APPROVAL AND LAUNCH EVIDENCE BLOCKED**
- Production effect: **None**

This is the non-secret approval record for the single business that will operate Webhost
Billing. It is not legal or tax advice. Values marked `UNRESOLVED` must be supplied and
approved by the business owner before this record can become effective. Application defaults
are listed only to make review easier; a default is not an owner decision and must not be
copied into production merely because it exists in code. On 2026-08-26, the owner directed
that unresolved values remain configurable and be completed later. That deferral completes
the original Command 33 record but does not satisfy the affected production launch gates.
On 2026-10-05, the owner resumed Command 33 and supplied the public Speedhost website as
business/policy source material. That instruction supplies evidence, not a choice between
contradictory policies, verification of legal/tax status, or final launch approval.

Do not add passwords, API keys, bank-account credentials, payment-provider credentials,
private contacts not intended for the operating record, or customer data to this file.

## Already confirmed scope

The following product-scope choices were explicitly established during development. They do
not approve production launch:

- The product/project display name is **Webhost Billing**. The owner's approved business
  name is **Speed Host Bangladesh**; the intended installation/display brand is **Speed Host**.
- The application is for one private web-hosting business and one operating currency.
- cPanel/WHM is the only planned hosting-panel integration.
- UK2Group is a separate future domain-registrar integration and is outside the initial
  production launch.
- Permanent hosting termination requires an administrator reason and the exact confirmation
  text `TERMINATE`; it is never automatic.
- `my.speedhost.bd` is the current staging hostname and the owner-selected same-origin
  production candidate under ADR-041. The owner reaffirmed it as the desired real operating
  portal in this Command 33 draft request. Target selection is not a passed production gate;
  the infrastructure audit, migration and launch evidence remain blocked.

## Public business and policy source review — 2026-10-05

The following is a dated, paraphrased source review, not a copy of the website's contract or
a newly effective customer policy. Public pages can change. The approving owner must resolve
conflicts and retain the approved version/reference in the protected launch record before
publishing instructions or issuing invoices. `SOURCED` does not mean `APPROVED` or applied.

| Source                                                                   | Relevant published facts                                                                                                                                                                                                                  | Decision boundary                                                                                                                                                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Contact page](https://www.speedhost.com.bd/contact-us/)                 | Operator/brand: Speedhost Bangladesh. Address: Arma Majeda Malik (AMM) Tower, Kha 215, Level-4, Merul Badda, Dhaka 1212, Bangladesh. Email: `info@speedhost.com.bd`. Phones: `09 678 366 366`, `01782391434`. WhatsApp: `+8801782391434`. | B1–B4 candidates; legal registration and approved invoice identity still need confirmation. Public support contacts are not named incident responders or tested alert routes.                 |
| [Shared hosting](https://www.speedhost.com.bd/shared-hosting/)           | BDT annual plans; yearly-package FAQ advertises a 30-day refund, requested by support ticket with a verified payment method.                                                                                                              | Supports BDT and annual pricing as source facts, not selection/import of launch products or a resolved refund policy.                                                                         |
| [Hosting terms](https://www.speedhost.com.bd/hosting-terms-of-services/) | Sections 10–11 discuss overdue remedies and cancellation; section 14 describes USD settlement and country-dependent VAT.                                                                                                                  | Conflicts below must be resolved; no automatic adoption of fees, currency conversion, tax rates, suspension or termination.                                                                   |
| [Payment options](https://www.speedhost.com.bd/payment-options/)         | Publishes bKash and BRAC Bank payment destinations.                                                                                                                                                                                       | Operator must reconfirm the destination and approve manual evidence/reconciliation requirements before exposure. No payment is initiated, and public destinations do not grant API authority. |
| [Privacy policy](https://www.speedhost.com.bd/privacy-policy/)           | Page labels its update August 2019, contains an older body phone inconsistent with its footer/contact page, and provides no exact retention durations for this application's record classes.                                              | Use current contact-page candidates; R1–R4 remain unresolved. Website privacy wording is not proof that the new billing application's data handling is covered.                               |

### Conflicts requiring owner decisions

1. **Refund window (P6):** The published 14-/30-day conflict was resolved by the owner's
   subsequent choice of **30 days**, with no additional eligibility/exclusion section
   requested. Do not silently carry exclusions from the conflicting terms into the approved
   record. Refund method/fees, processing commitment and service effect still need an
   operating decision; none is implemented or automated by this document.
2. **Currency and VAT (B5–B7):** Hosting terms section 14 describes USD settlement and
   billing-country VAT, unlike approved single-currency BDT and the BDT public plans.
   BDT remains approved. Correct inconsistent customer-facing currency wording before
   use. The 2026-10-05 optional-tax decision below resolves the application configuration
   choice without inferring a registration, rate, exemption or worldwide tax implementation.
3. **Cancellation and lifecycle (P5/A4/R1–R4):** Terms section 11 requires a Billing Issues
   ticket at least three working days before renewal. Other clauses allow overdue remedies
   after 14 days and deletion on termination. These do not replace approved three-day grace,
   explicit manual termination, or preserved financial/audit history. Define service/data
   and outstanding-invoice handling; no deletion, late fee or termination job is authorized.
4. **Operational promises (L1–L6/A5–A7):** Public marketing is not evidence of this
   application's payment/provisioning automation, SMTP, SLA or alert readiness. Keep the
   approved manual-first modes. Public support channels do not fill named primary/backup
   contacts, exact maintenance/first-renewal windows or supervised eligible-service lists.

The website is not an authoritative source for this repository's software licence. Its
service/software contract does not replace the project's Apache-2.0 licence or expand initial
scope into domains, resellers, additional currencies or other advertised services.

### Remaining approval inputs

- B1–B4 are now owner-approved below; verify them when applied to the installation. Select
  launch billing periods (B11). B6–B7 follow the optional-tax decision below; no tax input is
  required for preparation. Applicable business obligations remain the operator's responsibility.
- Approve exact manual payment destinations/evidence/review (P1–P2), administrator order
  approval (P4), and resolve cancellation/refund wording (P5–P6).
- Supply lawful retention periods and disposal/access rules for R1–R4; public website text
  supplies no numeric answer. Preserve the already approved backup proposal pending
  deployment/recovery evidence.
- Name accountable owner/role, first-renewal supervisor/list/window (A5–A7), maintenance
  and incident primary/backup contacts/window (L3–L6), and review/expiry date. Keep private
  routes and service identifiers in protected operations records, not public Git.
- Accept each G1–G3 gap with an owner and tested workaround, or separately authorize its
  remediation. This review has not re-audited those interface gaps or waived launch gates.

Use the decision IDs below when responding. Final approval must identify the owner, time
and approved record version. Until then the resumption is **BLOCKED**, not a completed
business-policy gate, and no production setting or launch authorization changes.

## Owner decision record

### Speed Host preparation before final WHMCS data — 2026-10-05

The owner requested preparation for **Speed Host**, with existing WHMCS data to be supplied
later before production. Speed Host is the intended installation/display brand; the owner
subsequently supplied **Speed Host Bangladesh** as the registered business/invoice name.
The partial approval below supplies contact, tax-position and refund-window decisions; it
does not authorize data import, provider activation or production cutover.

This checklist uses existing controls described in [Settings and Secrets](SETTINGS_AND_SECRETS.md).
It is not an executable settings payload, importer, deployed configuration or proof of
production readiness. Keep the public project's Webhost Billing identity and generic defaults
unchanged; business-specific values belong to the Speed Host installation.

| Preparation item            | Speed Host target / existing control                                               | Required before effect                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display/email brand         | Intended brand `Speed Host`; existing `email.branding`                             | Apply only in an authorized installation configuration step; verify sender/reply-to and SMTP separately                                                         |
| Invoice identity            | Approved Speed Host Bangladesh identity/address/email/phone below; optional Tax ID | Apply and verify future-invoice snapshots before real invoicing; tax fields remain optional and operator-configured when applicable                             |
| Currency and business dates | Previously approved `BDT` and `Asia/Dhaka`; `business.localization`                | Reject or explicitly resolve unsupported source currencies; verify source timezone before converting dates to UTC                                               |
| Invoice numbering           | Approved `INV` / padding 6 / starting number 1001 for an empty numbering baseline  | WHMCS history requires a collision/continuity review and approved next-number decision; never renumber issued historical invoices or blindly restart at 1001    |
| Products and periods        | Existing Products/Pricing controls                                                 | Reconcile final Speed Host product/price/period mappings; website examples and fictional seed prices are not final catalog data                                 |
| Payments and hosting        | Approved `MANUAL_FIRST`; partial payments disabled                                 | Approve payment destination/evidence and order review; keep real gateway credentials/WHM tokens absent until separate authorization and acceptance              |
| Renewal controls            | Approved 14-day lead, 7/3/1 reminders, three-day grace                             | During a separately authorized import rehearsal, disable renewal processing and stop worker/scheduler; approve eligibility/window/supervision before activation |
| Data separation             | New allowlisted isolated rehearsal database                                        | Never replace an active database with a WHMCS dump, run a development seed in production, or promote fictional staging customers/credentials                    |
| Final operational gate      | Existing production runbook and Command 33 decision IDs                            | Resolve policies, retention, named owners, contacts/windows and interface-gap acceptance; independently pass security/recovery/SMTP/monitoring gates            |

#### WHMCS migration is a separate prerequisite, not a database replacement

Read-only repository inspection found no WHMCS importer in application, package or script
sources. No WHMCS export, version, source schema or migration scope has been supplied. Do not
promise that importing final data alone will make the installation production-ready.

Official WHMCS documentation describes [client JSON exports](https://docs.whmcs.com/8-13/clients/client-management-tutorials/export-client-data/)
and [CSV reports including client/service/invoice/transaction exports](https://docs.whmcs.com/9-1/system/reports/).
These are source options, not a Webhost Billing import contract. Confirm the owner's actual
WHMCS version and the export's completeness before choosing a migration method.

Before any real migration, separately authorize a bounded assessment and implementation:

1. Inventory source version, export/schema headers, record classes, currencies/timezones,
   invoice numbering, balances, credits, tax history, recurring subscriptions and unsupported
   products/domains/add-ons. Initially use fictional or anonymized examples only. Unsupported
   records need an explicit retained-source/operational plan, not silent omission or conversion.
2. Define strict field/status mappings, stable source-ID links, idempotency, identity ownership,
   historical invoice snapshots and append-only payment/refund history. Decide authentication
   migration explicitly; do not assume WHMCS passwords or encrypted integration secrets can be
   reused by this application. Historical payment status is not new gateway/provisioning proof.
3. Test a dry-run/import in an isolated allowlisted database with customer email, callbacks,
   workers, scheduler and provider mutations blocked. Reconcile record counts, invoice lines,
   money in integer minor units, refunds/balances, ownership, service dates and duplicate reruns
   against protected source evidence. Counts alone are insufficient financial reconciliation.
4. Obtain owner acceptance, approved legal/policy/configuration values, fresh protected backups
   and tested recovery. Plan an explicit source freeze/final delta and one billing authority
   per migrated scope to prevent double billing, notices or suspension. Execute import/cutover
   only under a separately confirmed target/window/rollback plan and the production runbook.

Never put real exports, customer records, SQL dumps, configuration files, password hashes,
payment details or encryption keys in this public repository or chat. Use a protected transfer
and storage path agreed during the authorized migration assessment. None is created or used
by this preparation record.

Replace every `UNRESOLVED` value with the owner's exact approved wording. If a proposed value
is accepted, record `APPROVED` and retain the value. If it is changed, replace the proposed
value. The approval section at the end must identify the approving owner and time.

### Optional tax configuration — owner decision 2026-10-05

The owner directed: keep the tax field, require no tax input now, and let an operator set it
when needed. B6–B7 are therefore **APPROVED as an application configuration decision**, not
unresolved requests for a tax value. This does not establish a business's tax registration,
rate, exemption or compliance, and does not waive other production launch gates.

- Preserve optional `businessIdentity.taxIdentifier`; leave it absent until an operator
  supplies it. The existing administrator invoice Business identity form provides Tax ID.
- Preserve invoice-line `taxAmount`, expressed in integer minor units. Omitted input defaults
  to `0`; an operator can enter an applicable amount. This is not an automatic tax-rate or
  jurisdiction engine, and `0` does not make a legal assertion of exemption.
- No custom tax/VAT wording or identifier is required for preparation. Existing invoice/PDF
  tax amounts/totals remain; absent Tax ID is omitted from rendered identity. Do not fabricate
  tax numbers or tax-exempt wording, or rewrite previously issued invoice snapshots.
- Operators remain responsible for applicable business obligations and the accuracy of any
  entered tax. No production configuration or historical data is changed by this decision.

### Named partial business approval — recorded 2026-10-05

- Approver supplied by the owner: **Shahadat Hossain — Administrator**.
- Registered business/invoice name supplied: **Speed Host Bangladesh**. This records the
  owner's statement; no independent registration audit or legal certification was performed.
- Website address/email approved without supplied corrections: **Arma Majeda Malik (AMM)
  Tower, Kha 215, Level-4, Merul Badda, Dhaka 1212, Bangladesh**;
  **`info@speedhost.com.bd`**. Preferred invoice phone: **`+8801782391434`**.
- Tax/VAT position and wording supplied: **Not applicable** (normalized spelling).
  Preserve optional fields and do not populate a Tax ID with this phrase. This is an
  owner-declared position, not independent confirmation of a legal exemption. No new custom
  invoice wording renderer, tax calculation rule or historical tax rewrite is introduced.
- Refund window: **30 days**. For eligibility/exclusions the owner answered **No need**;
  record no additional eligibility/exclusion section, rather than copying exclusions from
  the conflicting terms. This does not expand initial product scope. Method/fees,
  processing commitment and service consequences remain open operating details.
- Review/record timestamp: **2026-10-05T23:15:42+06:00** (`Asia/Dhaka`); the instruction
  was received in the authenticated project conversation. This is a partial policy approval,
  not a final go-live approval. No approved value has been applied to a running installation.

### Business identity and invoices

| ID  | Decision                        | Current proposal or constraint                                                             | Owner-approved value                                    |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| B1  | Legal business name             | Owner-supplied registered/invoice identity; no independent registration audit              | **APPROVED — Speed Host Bangladesh**                    |
| B2  | Billing address                 | Exact website address retained in named approval above                                     | **APPROVED — website address, no corrections supplied** |
| B3  | Billing/support email           | Verify mailbox/delivery during the separate SMTP gate                                      | **APPROVED — `info@speedhost.com.bd`**                  |
| B4  | Business phone                  | Owner-selected preferred invoice phone                                                     | **APPROVED — `+8801782391434`**                         |
| B5  | Operating currency              | Application default: `BDT`                                                                 | **APPROVED — `BDT`**                                    |
| B6  | Tax/VAT registration/treatment  | Keep optional fields; no automatic rates or independent legal exemption determination      | **APPROVED — owner states Not applicable**              |
| B7  | Exact invoice tax/VAT wording   | Owner wording retained in this record; no compulsory custom renderer or Tax ID placeholder | **APPROVED — Not applicable; optional input retained**  |
| B8  | Invoice prefix                  | Application default: `INV`                                                                 | **APPROVED — `INV`**                                    |
| B9  | Invoice number padding          | Application default: `6`                                                                   | **APPROVED — `6`**                                      |
| B10 | First production invoice number | Application default: `1001`                                                                | **APPROVED — `1001`**                                   |
| B11 | Supported billing periods       | Annual BDT plans are publicly listed; select actual launch periods                         | **UNRESOLVED**                                          |

Invoice numbering must be chosen before the first production invoice. Issued invoice numbers
and snapshots are historical records and must not be renumbered casually.

### Orders, manual payments, cancellations, and refunds

| ID  | Decision                             | Current proposal or constraint                                                      | Owner-approved value                                                                  |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| P1  | Manual-payment customer instructions | Generic bank/cash/mobile-financial-service text exists only as a default            | **APPROVED — use the exact default text below**                                       |
| P2  | Required payment evidence            | Define accepted reference, receipt, sender, amount, and review criteria             | **UNRESOLVED**                                                                        |
| P3  | Partial payments                     | Safe application default: disabled                                                  | **APPROVED — disabled**                                                               |
| P4  | New-order approval                   | Define whether paid orders require administrator approval                           | **UNRESOLVED**                                                                        |
| P5  | Cancellation policy                  | Published notice rule sourced above; service/data and invoice effects need approval | **UNRESOLVED**                                                                        |
| P6  | Refund policy                        | Method/fees, processing commitment and service effect still unresolved              | **PARTIAL APPROVAL — 30 days; no additional eligibility/exclusion section requested** |

Refunds and reversals remain append-only financial transactions regardless of the selected
policy. They never rewrite or delete the original payment. Payment confirmation does not
prove successful hosting provisioning.

Approved default manual-payment text:

> Pay by bank deposit, cash, or an approved mobile financial service, then submit the
> transaction reference for review.

This wording does not resolve P2. Production customer instructions still need the actual
non-secret payment destination/channel and exact evidence/review requirements before manual
payments can be offered.

### Retention

| ID  | Record class                                | Engineering constraint or proposal                                             | Owner-approved value       |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------- |
| R1  | Customer profile and service data           | Define active-life and post-closure retention                                  | **UNRESOLVED**             |
| R2  | Invoices, payments, refunds, and reversals  | Must not be hard-deleted in normal operation; legal retention is owner-defined | **UNRESOLVED**             |
| R3  | Activity, authentication, and provider logs | Define online/archive periods and access controls                              | **UNRESOLVED**             |
| R4  | Email and support-ticket records            | Define online/archive periods and sensitive-content handling                   | **UNRESOLVED**             |
| R5  | Encrypted backups                           | Engineering proposal: 14 days six-hourly, 8 weekly, 12 monthly                 | **APPROVED — as proposed** |

Retention values must be consistent with the owner's applicable legal, tax, privacy, dispute,
and operational obligations. Expiry must use a reviewed disposal process; production records
must not be deleted merely by editing this document.

### Renewal and suspension

| ID  | Decision                           | Current safe application default                           | Owner-approved value        |
| --- | ---------------------------------- | ---------------------------------------------------------- | --------------------------- |
| A1  | Business timezone                  | `Asia/Dhaka`                                               | **APPROVED — `Asia/Dhaka`** |
| A2  | Renewal-invoice lead time          | 14 calendar days                                           | **APPROVED — 14 days**      |
| A3  | Reminder schedule                  | 7, 3, and 1 calendar days before due date                  | **APPROVED — 7/3/1 days**   |
| A4  | Suspension grace period            | 3 calendar days after due date                             | **APPROVED — 3 days**       |
| A5  | First supervised renewal date/time | Scheduler must remain stopped until an exact window exists | **UNRESOLVED**              |
| A6  | First-run eligible services        | Must be reviewed explicitly                                | **UNRESOLVED**              |
| A7  | Supervision and suspension owner   | Must be reachable during the first run                     | **UNRESOLVED**              |

The first run must be supervised. Before starting the scheduler, review the policy saved in
the administrator Automation screen, the eligible service list, generated-invoice preview,
worker/queue health, cPanel authority mode, customer communication, and rollback/escalation
contacts. Automatic permanent termination remains prohibited.

### Launch modes and contacts

| ID  | Decision                        | Available bounded choices                                     | Owner-approved value          |
| --- | ------------------------------- | ------------------------------------------------------------- | ----------------------------- |
| L1  | Payment launch mode             | Safer launch proposal: `MANUAL_FIRST`                         | **APPROVED — `MANUAL_FIRST`** |
| L2  | Hosting launch mode             | Safer launch proposal: `MANUAL_FIRST`                         | **APPROVED — `MANUAL_FIRST`** |
| L3  | Maintenance contact             | Name/role plus approved customer communication channel        | **UNRESOLVED**                |
| L4  | Incident primary contact        | Name/role plus tested private alert route                     | **UNRESOLVED**                |
| L5  | Incident backup contact         | A distinct reachable backup                                   | **UNRESOLVED**                |
| L6  | Maintenance window and timezone | Exact start/end plus status/start/completion message channels | **UNRESOLVED**                |

`MANUAL_FIRST` payment means bKash and SSLCOMMERZ production credentials stay absent and
only owner-approved manual instructions are published. `MANUAL_FIRST` hosting means every
WHM token stays absent, provisioning is performed outside the application, and only verified
service state is recorded. Choosing an adapter name alone does not grant provider authority.

### Release-checklist interface gaps

For each gap, choose `ACCEPT FOR INITIAL LAUNCH` with an operational workaround and owner, or
`REMEDIATE BEFORE LAUNCH` with the authorizing command/reference.

| ID  | Current gap                                       | Required acceptance/remediation record     | Owner-approved value |
| --- | ------------------------------------------------- | ------------------------------------------ | -------------------- |
| G1  | No dedicated recent-payments dashboard card       | Workaround or remediation owner/date       | **UNRESOLVED**       |
| G2  | No full paginated administrator activity-log page | Workaround or remediation owner/date       | **UNRESOLVED**       |
| G3  | No direct external administrator-alert delivery   | Alert workaround or remediation owner/date | **UNRESOLVED**       |

Accepting an interface gap does not waive security, financial integrity, monitoring, or
incident-response gates. Direct external monitoring and a tested alert route remain required
before launch even if the in-app alerting gap is accepted.

## Remaining Speed Host operating policies — DRAFT-OPS-1

**Review status: PROPOSED ONLY — NOT APPROVED, CUSTOMER-PUBLISHED OR APPLIED.** The owner authorized
drafting, not automatic acceptance of the following proposals. Earlier approvals above remain
intact: business identity/contact, optional tax, BDT, invoice-numbering proposal, disabled
partial payments, 30-day refund window, renewal defaults and manual-first provider modes.
Approval of a draft group does not supply missing names, dates, destinations, legal retention
periods or tested evidence, and does not authorize production execution or a new command.

### D1 — Billing periods and payment review (B11/P1–P2)

- Propose `ANNUAL` for new public hosting orders at initial launch. Reconcile actual WHMCS
  products/prices before activation; preserve any supported existing customer cycle under an
  approved migration mapping rather than converting historical agreements to annual.
- Offer only reconfirmed business bank/mobile-financial-service destinations and approved
  cash handling. Do not treat public payment links as permission to enable an online gateway.
- Customer supplies invoice, full BDT amount, channel and transaction/receipt reference through
  the existing text-proof form. Ask for payer/date where available; administrator establishes
  missing payment facts before verification. No attachment feature or credential collection.
- Administrator checks the actual business statement/provider record or controlled cash
  receipt, invoice/customer, amount/currency and duplicate reference before verification.
  A screenshot, receipt text, browser redirect or pending payment alone is not proof.
- Propose daily reconciliation while taking payments and a one-working-day review target.
  Exact destinations and named payment-review operator still require confirmation.

### D2 — Administrator order approval (P4)

Propose retaining required administrator review after verified full payment and before
fulfilment. Check requested domain/package/account facts and actual hosting availability.
Provision outside the application in manual-first mode; record only verified service state.
Do not add an approval toggle, assume a paid order is provisioned or grant WHM authority.

### D3 — Cancellation handling (P5)

Propose an authenticated support ticket and administrator confirmation. For non-renewal,
request notice three working days before the due date; late requests require manual review,
not silent rejection or automatic termination. Confirm the final paid-through date and service
effect with the customer. This notice does not shorten the approved 30-day refund window.

Review outstanding invoices separately using existing permitted cancellation/adjustment
workflows; never erase issued financial history. Do not claim a scheduled-cancellation toggle
exists. Before renewal automation starts, prove cancelled/non-renewing services cannot be
inadvertently renewed or suspended. If the existing workflow cannot enforce the approved
operating procedure, keep automation stopped and authorize a separate tested change.

### D4 — Refund processing (remaining P6 details)

Keep the approved 30-day window and no additional eligibility/exclusion section. Propose
counting 30 calendar days from the relevant payment's received date, with no extra refund
fee, a one-working-day acknowledgement and processing within five working days after
request verification. These timing/method details are new proposals, not already approved.
For these draft targets, working days mean Saturday–Thursday excluding announced business
holidays; confirm this definition before making a customer-facing promise.

Verify the requesting account and original payment. Return money through the original channel
where possible; independently verify any alternative destination. Do not exceed the remaining
refundable amount or blindly repeat an uncertain transfer. Reconcile the external outcome,
then record an append-only refund with its reference. Confirm service effects separately;
no automatic termination, deletion or new eligibility exclusion is introduced.

### D5 — Retention and access (R1–R4)

These are operational review proposals, **not invented legal retention periods**. Validate
applicable obligations and any dispute/incident hold before approval or disposal. No deletion
job, archive process or legal exemption is implemented by this draft.

| Class                                                       | Proposed operational handling                                                                                                                         | Still required                                                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| R1 profiles/service records                                 | Retain during service; propose restricted review at 12 months after closure, minimizing unnecessary personal data while preserving required snapshots | Approved lawful duration and reviewed disposal/redaction procedure                                                 |
| R2 financial records and authoritative audit/gateway events | Preserve append-only history; no hard deletion in normal operation; restricted access and encrypted recovery                                          | Owner-supplied applicable retention duration/hold/archive rules; no arbitrary seven-year or indefinite legal claim |
| R3 diagnostic/security logs                                 | Propose 90 days online and archive through 365 days total, subject to approved obligations/holds; authoritative audit/payment events follow R2        | Validated period, protected log destination/access and separately authorized lifecycle controls                    |
| R4 email/support records                                    | Propose email-body review at 90 days and closed-ticket review at 24 months; billing/dispute evidence follows its required record class                | Approved durations, sensitive-content handling and reviewed disposal; no premature removal of required evidence    |

These periods are local proposals, not numbers prescribed by a source. The
[OWASP logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#disposal-of-logs)
supports setting retention against obligations and protecting access; it does not establish
Speed Host's legal retention schedule. Keep the already approved backup proposal (R5), with
off-site integrity/restore evidence still required.

### D6 — Maintenance, incident and first-renewal operations (L3–L6/A5–A7)

- Propose Shahadat Hossain as maintenance communicator and first-renewal supervisor, subject
  to his explicit acceptance/availability. Being the approver does not appoint every role.
- Propose customer notices through the approved business email and support portal: advance
  notice, start, completion or delay. Record impact honestly; shared-host maintenance must
  also account for unrelated services. Do not promise a staffed SLA that has not been proved.
- Require a named incident primary, a distinct reachable backup and tested protected alert
  routes. The public invoice phone/email are not evidence of a tested incident route.
- Propose a two-hour maintenance window in `Asia/Dhaka`; exact calendar date/start/end and
  rollback authority remain required. No window, reminder or background task is scheduled.
- Keep production scheduler stopped until the exact first-renewal window and full eligible
  service list are reviewed. Do not assume a per-run allowlist/cap exists. Prove the intended
  manual-first behavior and absence of unapproved hosting actions before starting one scheduler.
- Propose policy review 90 days after actual launch and after any incident/material change.

### D7 — Conditional initial interface-gap acceptance (G1–G3)

Propose accepting G1 using the existing payment history and daily reconciliation; G2 using
protected, tested read-only audit review by an authorized operator; G3 using independently
configured external monitoring with tested primary/backup alerts. Name an operator and verify
each workaround against the actual release before accepting it. No gap is accepted merely by
drafting this proposal, and lack of working external monitoring still blocks production.

### D8 — Real operating portal and cutover boundary

The desired customer/admin operating origin is **`https://my.speedhost.bd`**. Anonymous
read-only verification during this draft returned HTTP 200 with the Webhost Billing page
title. Current deployment evidence still identifies staging release `6085629` and fictional
data. This is not evidence of Speed Host branding, imported customers or production readiness.

Before making that origin the real operating portal:

1. Confirm these operating policies and missing protected owners/contacts/windows, and
   complete the shared-host/security, independent-secret, SMTP, external-monitoring,
   off-site backup/restore and immutable-release gates in the production runbook.
2. Apply/verify Speed Host's approved installation settings and any separately authorized
   frontend branding work. Saving invoice identity does not rebrand every public/navigation
   surface. Preserve the open-source project's generic identity/defaults and unrelated sites.
3. Assess/build/rehearse WHMCS migration in a new isolated allowlisted database; reconcile
   balances, immutable invoices/payments, source-ID ownership, service dates and next invoice
   number. Do not replace an active database, promote demo users or reuse staging secrets.
4. Obtain final target/release/digest/backup/window/rollback confirmation. Cut over under the
   [production runbook](PRODUCTION_LAUNCH_RUNBOOK.md) with one billing authority per scope,
   tested customer/admin ownership and controlled worker/scheduler activation. No hostname,
   DNS, Nginx, database or running process is changed by this draft.

### Approval reply for DRAFT-OPS-1

Approve or edit each group `D1`–`D8`, explicitly identifying this draft/version and approver.
Supply actual product/cycle choices and protected payment/operator/contact/window references;
name the distinct incident backup and approve lawful retention durations, especially R2.
Do not paste credentials or customer exports into chat or Git. Blank inputs remain blockers
even if every proposal is accepted. Final policy approval and production go/no-go are separate.

## Deferred configuration locations

The owner will complete unresolved values later. Use the narrowest existing control below;
do not add placeholder legal/tax wording to customer documents and do not store credentials
in ordinary settings.

| Decisions     | Configuration/control location                                                                               | Pre-launch rule                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| B1–B5, B8–B10 | Administrator `/admin/settings` business identity, localization, and invoice numbering                       | Save and audit before the first production invoice; verify a fictional preview/PDF                                                      |
| B6–B7         | Optional Tax ID in administrator invoice Business identity form; manual invoice-line tax; this policy record | No mandatory tax input/custom wording; preserve accurate applicable tax and historical snapshots; no automatic jurisdiction/rate engine |
| B11           | Administrator Products/Pricing records                                                                       | Enable only owner-approved periods and BDT prices before accepting orders                                                               |
| P1–P3         | Administrator `/admin/settings` manual-payment instructions and partial-payment toggle                       | Instructions must include the approved evidence criteria before exposure                                                                |
| P4            | Current order workflow requires administrator review; no global approval toggle exists                       | Treat administrator approval as required unless a later authorized command adds a tested toggle                                         |
| P5–P6         | This approved policy record and customer-facing policy publication                                           | No automatic service consequence; refunds/reversals remain append-only                                                                  |
| R1–R5         | This policy record plus deployment backup/log/storage lifecycle controls                                     | Do not run disposal until policy, owner, evidence, and recovery boundaries are approved                                                 |
| A1–A4         | Administrator `/admin/settings` or Automation settings                                                       | Verify saved values before starting one scheduler                                                                                       |
| A5–A7         | Protected first-renewal operations record                                                                    | Keep the production scheduler stopped until completed                                                                                   |
| L1–L2         | Administrator provider selection plus evidence that production credentials/WHM authority are absent          | Manual-first remains selected until a separately authorized provider command passes                                                     |
| L3–L6         | Protected maintenance/incident runbook and alert platform                                                    | Test contacts and channels before launch; do not put private credentials here                                                           |
| G1–G3         | This policy record and release checklist                                                                     | Record acceptance/workaround or complete the relevant remediation command before final audit                                            |

Not every policy belongs in runtime application settings. Cancellation/refund wording,
retention controls, incident contacts, supervised-run evidence, and release-gap acceptance
remain document/operations controlled. Adding customer-facing policy pages, a new-order
approval toggle, tax wording behavior, or a generalized policy CMS requires a separately
authorized, tested product command; it is not silently implemented by this deferral.

## Effective configuration change record

The approved proposed values already match safe application defaults, so no code default was
changed. No production setting was applied. At deployment, record each applied setting,
responsible operator, application audit-event reference, and verification timestamp here.
Secret values must be referenced by manager entry/version only.

| Setting/configuration                 | Approved value                             | Applied by  | Evidence/time                         |
| ------------------------------------- | ------------------------------------------ | ----------- | ------------------------------------- |
| Currency/invoice numbering            | BDT / `INV` / 6 / 1001                     | Not applied | Existing code default only            |
| Manual-payment partial-payment rule   | Disabled                                   | Not applied | Existing code default only            |
| Renewal timezone/lead/reminders/grace | Asia/Dhaka / 14 / 7-3-1 / 3 days           | Not applied | Existing code default only            |
| Payment launch mode                   | `MANUAL_FIRST`                             | Not applied | Production credentials stay absent    |
| Hosting launch mode                   | `MANUAL_FIRST`                             | Not applied | Production WHM authority stays absent |
| Encrypted-backup retention            | 14 days six-hourly / 8 weekly / 12 monthly | Not applied | Deployment/recovery evidence required |

## Approval

All lines are mandatory for an effective policy:

```text
Business owner name: Shahadat Hossain
Business owner role: Administrator
Approval decision: PARTIAL NAMED APPROVAL; REMAINING OPERATING DECISIONS OPEN
Partial approval instruction: ALL proposed/default values approved
Partial approval recorded at: 2026-08-26T15:52:58+06:00
Partial approval source: authenticated project conversation; owner name unresolved
Deferral instruction: Keep unresolved fields configurable; owner will fill them later
Deferral recorded at: 2026-08-26T16:00:31+06:00
Resumption/source instruction date: 2026-10-05 (Asia/Dhaka)
Resumption/source instruction: Resume Command 33; use https://www.speedhost.com.bd/ for real business information and policy
Final approval after source-conflict review: UNRESOLVED
Optional-tax instruction date: 2026-10-05 (Asia/Dhaka)
Optional-tax decision: B6-B7 APPROVED as optional operator configuration; no mandatory tax input or custom wording; no legal exemption inferred
Named business approval recorded at: 2026-10-05T23:15:42+06:00 (review/record time, Asia/Dhaka)
Named approval scope: B1-B4; B6-B7 owner-declared Not applicable with optional fields retained; P6 30-day window/no additional eligibility-exclusion section
Approved policy record commit: The Git commit containing this Command 33 record; pin its 40-character ID in the protected launch record
Exceptions and expiry/review date: UNRESOLVED
```

Until every required value is resolved and the approval is recorded, the business/legal,
first-renewal, provider-mode, maintenance-communication, retention, and interface-acceptance
launch gates remain `BLOCKED`, production remains `NO-GO`, workers/scheduler must not be
started for production, and Command 34 must not be treated as authorization to launch.

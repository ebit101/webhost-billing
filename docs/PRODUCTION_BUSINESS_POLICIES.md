# Production Business and Launch Policies

## Approval status

- Command: 33 — Finalize Business and Launch Policies
- Record created: 2026-08-26
- Public-source review: 2026-10-05 — owner supplied `https://www.speedhost.com.bd/`
- Business owner approval: **PROPOSED VALUES APPROVED; REMAINING VALUES DEFERRED**
- Policy status: **COMMAND 33 RESUMED — SOURCE CONFLICTS AND OWNER DECISIONS BLOCKED**
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

- The product/project display name is **Webhost Billing**. The owner's legal business name
  remains separate and unresolved.
- The application is for one private web-hosting business and one operating currency.
- cPanel/WHM is the only planned hosting-panel integration.
- UK2Group is a separate future domain-registrar integration and is outside the initial
  production launch.
- Permanent hosting termination requires an administrator reason and the exact confirmation
  text `TERMINATE`; it is never automatic.
- `my.speedhost.bd` is the current staging hostname and the owner-selected same-origin
  production candidate under ADR-041. Target selection is not production approval; the
  infrastructure audit and launch gates remain blocked.

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

1. **Refund window (P6):** Hosting terms section 11 gives 14 days after initial signup;
   the shared-hosting FAQ gives 30 days for yearly packages. The terms exclude renewals,
   dedicated servers/IPs, SSL, separately purchased licences and domain fees. Decide the
   initial hosting window, eligible launch products, exclusions, refund method/fees,
   processing commitment and service effect. Neither window is selected by this review.
2. **Currency and VAT (B5–B7):** Hosting terms section 14 describes USD settlement and
   billing-country VAT, unlike approved single-currency BDT and the BDT public plans.
   BDT remains approved. Confirm corrected customer-facing wording and verified VAT/tax
   treatment; do not infer a registration, rate, exemption or worldwide tax implementation.
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

- Verify the legal invoice name and contact/address candidates (B1–B4), tax/VAT treatment
  and exact invoice wording (B6–B7), and selected launch billing periods (B11).
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

Replace every `UNRESOLVED` value with the owner's exact approved wording. If a proposed value
is accepted, record `APPROVED` and retain the value. If it is changed, replace the proposed
value. The approval section at the end must identify the approving owner and time.

### Business identity and invoices

| ID  | Decision                        | Current proposal or constraint                                             | Owner-approved value                          |
| --- | ------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- |
| B1  | Legal business name             | Public operator/brand: Speedhost Bangladesh; legal registration unverified | **UNRESOLVED — verify legal invoice name**    |
| B2  | Billing address                 | Contact-page address in source review above                                | **SOURCED — invoice approval pending**        |
| B3  | Billing/support email           | Contact page: `info@speedhost.com.bd`; mailbox control/delivery unverified | **SOURCED — invoice approval pending**        |
| B4  | Business phone                  | Contact-page phone/WhatsApp candidates in source review above              | **SOURCED — preferred invoice phone pending** |
| B5  | Operating currency              | Application default: `BDT`                                                 | **APPROVED — `BDT`**                          |
| B6  | Tax/VAT registration/treatment  | No automatic jurisdiction or tax-rate policy exists                        | **UNRESOLVED**                                |
| B7  | Exact invoice tax/VAT wording   | Must match the owner's verified legal/tax position                         | **UNRESOLVED**                                |
| B8  | Invoice prefix                  | Application default: `INV`                                                 | **APPROVED — `INV`**                          |
| B9  | Invoice number padding          | Application default: `6`                                                   | **APPROVED — `6`**                            |
| B10 | First production invoice number | Application default: `1001`                                                | **APPROVED — `1001`**                         |
| B11 | Supported billing periods       | Annual BDT plans are publicly listed; select actual launch periods         | **UNRESOLVED**                                |

Invoice numbering must be chosen before the first production invoice. Issued invoice numbers
and snapshots are historical records and must not be renumbered casually.

### Orders, manual payments, cancellations, and refunds

| ID  | Decision                             | Current proposal or constraint                                                      | Owner-approved value                            |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| P1  | Manual-payment customer instructions | Generic bank/cash/mobile-financial-service text exists only as a default            | **APPROVED — use the exact default text below** |
| P2  | Required payment evidence            | Define accepted reference, receipt, sender, amount, and review criteria             | **UNRESOLVED**                                  |
| P3  | Partial payments                     | Safe application default: disabled                                                  | **APPROVED — disabled**                         |
| P4  | New-order approval                   | Define whether paid orders require administrator approval                           | **UNRESOLVED**                                  |
| P5  | Cancellation policy                  | Published notice rule sourced above; service/data and invoice effects need approval | **UNRESOLVED**                                  |
| P6  | Refund policy                        | Conflicting published windows; resolve scope, method, fees and service effect       | **UNRESOLVED — SOURCE CONFLICT**                |

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

## Deferred configuration locations

The owner will complete unresolved values later. Use the narrowest existing control below;
do not add placeholder legal/tax wording to customer documents and do not store credentials
in ordinary settings.

| Decisions     | Configuration/control location                                                                            | Pre-launch rule                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| B1–B6, B8–B10 | Administrator `/admin/settings` business identity, localization, and invoice numbering                    | Save and audit before the first production invoice; verify a fictional preview/PDF              |
| B7            | This approved policy record plus invoice wording implementation/review if wording must appear on invoices | Do not issue production invoices until exact wording and behavior are verified                  |
| B11           | Administrator Products/Pricing records                                                                    | Enable only owner-approved periods and BDT prices before accepting orders                       |
| P1–P3         | Administrator `/admin/settings` manual-payment instructions and partial-payment toggle                    | Instructions must include the approved evidence criteria before exposure                        |
| P4            | Current order workflow requires administrator review; no global approval toggle exists                    | Treat administrator approval as required unless a later authorized command adds a tested toggle |
| P5–P6         | This approved policy record and customer-facing policy publication                                        | No automatic service consequence; refunds/reversals remain append-only                          |
| R1–R5         | This policy record plus deployment backup/log/storage lifecycle controls                                  | Do not run disposal until policy, owner, evidence, and recovery boundaries are approved         |
| A1–A4         | Administrator `/admin/settings` or Automation settings                                                    | Verify saved values before starting one scheduler                                               |
| A5–A7         | Protected first-renewal operations record                                                                 | Keep the production scheduler stopped until completed                                           |
| L1–L2         | Administrator provider selection plus evidence that production credentials/WHM authority are absent       | Manual-first remains selected until a separately authorized provider command passes             |
| L3–L6         | Protected maintenance/incident runbook and alert platform                                                 | Test contacts and channels before launch; do not put private credentials here                   |
| G1–G3         | This policy record and release checklist                                                                  | Record acceptance/workaround or complete the relevant remediation command before final audit    |

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
Business owner name: UNRESOLVED
Business owner role: UNRESOLVED
Approval decision: PROPOSED VALUES APPROVED; OTHER VALUES DEFERRED UNTIL PRE-LAUNCH CONFIGURATION
Partial approval instruction: ALL proposed/default values approved
Partial approval recorded at: 2026-08-26T15:52:58+06:00
Partial approval source: authenticated project conversation; owner name unresolved
Deferral instruction: Keep unresolved fields configurable; owner will fill them later
Deferral recorded at: 2026-08-26T16:00:31+06:00
Resumption/source instruction date: 2026-10-05 (Asia/Dhaka)
Resumption/source instruction: Resume Command 33; use https://www.speedhost.com.bd/ for real business information and policy
Final approval after source-conflict review: UNRESOLVED
Approved policy record commit: The Git commit containing this Command 33 record; pin its 40-character ID in the protected launch record
Exceptions and expiry/review date: UNRESOLVED
```

Until every required value is resolved and the approval is recorded, the business/legal,
first-renewal, provider-mode, maintenance-communication, retention, and interface-acceptance
launch gates remain `BLOCKED`, production remains `NO-GO`, workers/scheduler must not be
started for production, and Command 34 must not be treated as authorization to launch.

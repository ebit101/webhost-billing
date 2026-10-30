# Existing-domain and hosting trial readiness

Historical Command 145, 2026-10-30 (Asia/Dhaka). Preparation only; no trial execution,
provider activation, application deployment or business configuration write.
The owner subsequently requested hosting creation only, preserving the live
website/email; the owner supplied a private payment reference and authorized the exact order/invoice
emails. Receipt date/evidence remains unverified; no payment is recorded against an
invoice. Retain this approval for the exact trial without sending anything now.
Exact client/domain identifiers and provider evidence stay in protected operator
records, outside Git. This is a one-client existing-domain trial, with a separate
hosting-only order. It is not a new domain registration or a WHMCS import.

## Command 146 source follow-up

Command 146 implements the explicit administrator preservation choice locally:
remote mail routing, no existing-zone overwrite, frozen order/service snapshots
and a bounded read to verify mail routing after creation/replay. Command 147
separately deployed it at `9b912841f90fbe681da3a62acf24d3838a64da46` on 2026-10-30.
Migration 38, disabled-provider smoke and authenticated Speed dialog/legacy reviews
passed; SMTP stayed active and no real account/order or message was created.
See [the deployment report](PROGRESS.md).
Keep the historical Command 145 finding below; live trial readiness still depends
on fresh zone/cluster/public DNS/mail checks, provider read permissions, verified
settlement and the previously approved exact customer emails. No live trial or
provider activation is authorized by source deployment.

## Command 148 trial acceptance

Completed on 2026-10-30 (Asia/Dhaka). The owner reconfirmed the BDT 1,200 bank
credit/reference and authorized payment receipt and hosting activation emails.
Normal authenticated administration created one separate hidden product/price,
one hosting-only order/invoice, one verified manual Bank transfer payment and one
service with the exact app-pkg and PRESERVE_EXISTING snapshots. The invoice is
Paid with zero balance, the order Completed and the service Active. The historical
bank receipt timestamp was not supplied; the payment note states that the entry
records the owner's confirmation now, without inventing a historical date.

A new verified encrypted backup preceded the payment/provider work. Fresh reads
found zero accounts, the exact package, no target primary account and no visible
domain owner. The owner reports a new testing-only server with no DNS cluster.
The prior exact zone/IP inventory permission refusals remain visibility limits;
no access was expanded or refusal treated as proof of universal absence.

A fresh normal connection test passed. The selected WHM connection was temporarily
activated and one ordinary durable Create account operation succeeded on attempt 1,
without retry or direct state edits. Separate exact-account and account-scoped mail
reads verified app-pkg, an unsuspended account and remote/nonaccepting mail routing.
Eight recursive routing record sets and the apex HTTPS redirect match the baseline;
all four authoritative nameservers still agree with original A/MX/NS and canonical
www HTTPS HEAD remains 200. No public DNS/nameserver/contact change, migration,
registrar linking, registration or purchase occurred.

The WHM connection is Disabled again while the created hosted account/service
remains active. SMTP stays active; payment gateways, live registrars and WhatsApp
remain disabled. All four authorized ordinary emails were accepted by SMTP once
each; inbox receipt is not independently proved. Final scoped existing-record,
metadata, saved-server credential/configuration, environment/logo, container-ID
and seven-service health checks passed. No source deployment or application
change occurred. See [the complete report](PROGRESS.md).

Private target, payment reference, record identifiers and provider payloads remain
outside Git. The owner's DD-MM-YYYY display requirement remains unimplemented in
this operational command. Recommended next: Command 149 — Review the trial client
portal and hosting handover without changing public DNS/mail, credentials or
provider settings. No next command is authorized.

## Historical creation blocker discovered during Command 145

At Command 145, the installed cPanel adapter sent account username/domain/package/contact fields
without an explicit `mxcheck` mail-routing mode or `forcedns` policy. WHM's
[account-creation specification](https://api.docs.cpanel.net/specifications/whm.openapi/account-creation)
documents `mxcheck` defaulting to local delivery and `forcedns` defaulting to no
existing-zone overwrite. The owner requires current live website/email to remain
untouched. No matching primary account alone does not establish current DNS-zone,
mail-routing or alias placement, and unchanged public nameservers alone does not
prove server-local mail delivery is preserved.

Command 145 stopped before account creation. Command 146 implemented and validated
the explicit preservation intent and Command 147 deployed it separately. The live
DNS/mail/provider and verified-settlement gates above remain. Do not patch a running container,
call `createacct` outside Billing's durable operation, force service state or bypass
payment controls. This preparation creates no product, order, invoice or account.
The requested real hosting remains unfulfilled until those live prerequisites pass
and a separately authorized durable hosting operation succeeds.

## Approved scope and observed readiness

| Item                    | Evidence and remaining gate                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client                  | Owner selected the existing client; read-only staging lookup matched the label/reference and found an active, email-verified account. No trial domain, service or order item exists.                                                                                                                                                               |
| Hosting target          | Saved Rainbow WHM connection is disabled with credentials present. Fresh TLS-validated count read passed on 2026-10-30; the saved successful application test is from 2026-10-28. Neither read nor advertised capabilities proves create-account permission.                                                                                       |
| WHM package             | Fresh GET-only `listpkgs` found exact `app-pkg`; exact-domain `accountsummary` found no matching primary account. Package resource claims and DNS/mail preservation still need review before creation.                                                                                                                                             |
| Catalogue               | Global hosting adapter already selects `cpanel-whm`; the sole public development product still uses `fake-panel` / `dev_starter`. Do not order it for the real trial. Create a separate hidden trial product after authorization and package verification.                                                                                         |
| Approved hosting terms  | BDT 1,200 monthly, no setup fee: store `120000` minor units, `MONTHLY`, setup fee `0`. Existing-domain linking has no registration price, invoice or imported renewal terms.                                                                                                                                                                       |
| Registrar               | One saved Live-mode connection and credential version; connection disabled and not default, application networking false. Earlier GET evidence is historical; fresh ownership/contact/status/expiry validation is required before linking.                                                                                                         |
| Native currency         | Owner confirmed USD from the provider account. Saved `nativeCostConfirmed` remains false; no configuration was changed. Current connection activation still requires the explicit USD confirmation and a successful availability/cost check, even for linking.                                                                                     |
| Existing production use | Owner says website/email are live and must be preserved. The owner requested hosting only and did not establish current remote placement. Exact primary-account lookup passed, but DNS-zone/alias/mail placement and preservation controls remain a creation gate. No nameserver, DNS, mail-routing, contact or lock change is part of this trial. |
| Providers and records   | SMTP active; payment flags false, real WHM servers and registrar account disabled, registrar networking false, notification/WhatsApp delivery disabled. Zero registrar operations/actions, real hosting services and unresolved real WHM operations were observed.                                                                                 |

## Further read-only checks after the preservation design

Ask for authorization to run fresh provider reads for only the approved domain,
client, saved WHM connection and saved registrar credential. Keep both application
connections and all application networking gates disabled. Use narrowly allowlisted
GET-only diagnostics through the installed transports; do not invoke a provisioning,
registration, linking or activation endpoint. No credential values, raw contact
payloads or other customer account listings belong in chat or Git.

- WHM: verify TLS/authentication, exact package and limits, and an exact-domain
  `accountsummary` collision check. Do not infer absence from an authentication,
  timeout or malformed-response error. Do not create a temporary account to test
  permissions. Prior connection/package evidence is not a fresh acceptance result.
- Registrar: verify exact existing-domain order, current direct reseller/customer
  and registrant-contact ownership, active unexpired state and unchanged nameserver
  evidence. Public DNS, availability, a provider HTTP 200 or the selected client
  label alone is not sufficient ownership evidence. Submit no provider mutation.
- Record only sanitized pass/fail, evidence timestamps and opaque references in
  protected evidence. Recheck environment/logo/business/provider preservation.

If a matching account is already on Rainbow, stop the new-account branch. Reconcile
its ownership/package and separately scope existing-hosting adoption; no current
readiness evidence authorizes attaching it by forcing a service Active. For the requested parallel hosting-only account, preserve current website/email
and all public DNS/mail routing. No migration is authorized. Resolve any domain
alias, existing zone or server-local mail conflict before creating the new account.

## Exact later execution sequence for owner approval

These steps describe the remaining prerequisites and a future execution window.
The owner requested hosting-only creation and approved its two transactional emails;
this readiness work stops before execution because preservation is not established.
Source deployment and broader domain/provider changes remain separately authorized.

1. Implement, validate and separately authorize deployment of the explicit mail/DNS
   preservation path first. Resolve the hosting-location/collision gate and review fresh ownership/package
   evidence. Confirm the exact client, domain, dedicated product, price, operator,
   window, the approved customer email delivery and stop/recovery plan. Reconfirm no domain purchase, renewal, transfer,
   DNS/contact/lock changes, migration or mail cutover is allowed.
2. Verify a fresh encrypted backup and preservation baseline. Through normal
   administrator authentication/MFA, create a separate hidden hosting product with
   cPanel/WHM and `app-pkg`, the approved monthly BDT price and verified resource
   descriptions. Keep the development product, existing orders and snapshots intact.
   New orders snapshot the package identifier, so mapping must be correct first.
3. Review any registrar networking change as an API-only window. Current Compose
   wiring shares the flag with worker/scheduler: do not set the common flag true
   and recreate the whole stack. Keep worker/scheduler registrar networking false,
   payment/WhatsApp disabled and SMTP active. Use the existing checked application
   image; no source deployment is needed. Review the exact configuration delta
   before applying it and test restoration of the disabled posture.
4. After separate activation approval, enable only the selected registrar connection
   through its MFA-protected workflow, with the owner's genuine USD confirmation
   and required read-only check. Keep its default selection unchanged. Enabling may
   populate catalogue offers; inspect that delta before continuing. Link only the
   approved existing domain using exact confirmation. Verify the fresh provider
   ownership proof and client binding, Existing origin and Registered state, and
   that no quote, order, invoice, registration operation or contact was created.
5. Create a hosting-only order for the approved client and domain with the dedicated
   product. It creates an unpaid invoice; do not add a new-registration item or
   charge a domain registration fee. Do not mark the existing domain as a purchased
   new registration. Order creation queues order/invoice transactional emails through
   active SMTP; the owner has explicitly authorized these two deliveries for the
   reviewed trial. Retain that scope without repeating the approval request.
   Record an actual bank payment only after genuine settlement
   evidence and normal review; never invent payment to unlock provisioning.
6. Only if the approved hosting path is new-account creation and collision checks
   passed, run a fresh protected WHM connection test and enable only Rainbow.
   Create one Pending service from the paid order and explicitly request one
   Create account operation. Verify the returned account/domain/package/state
   independently and confirm the service becomes Active through verified success.
   A paid invoice or a successful count read is not provisioning success.
7. Stop on an ambiguous provider outcome, mismatch, unexpected account, ownership
   change or potential live-site/mail impact. Reconcile a submitted operation before
   any retry. Never terminate, delete, overwrite or change the existing account,
   credentials, DNS or registrar contact as cleanup.
8. Reconcile business records and provider status, preserve the existing website/email,
   and restore the approved disabled provider posture at the end of the trial window.
   Returning an account/connection to disabled is distinct from deleting the hosted
   account or linked domain. SMTP stays active. No automatic termination or domain
   deletion is allowed. A linked domain has no approved renewal billing terms;
   renewal remains blocked. Once links exist, rollback must retain compatible
   application/schema support and history rather than revert blindly or delete links.

## Validation and limits

Fresh staging inventory ran inside an explicit PostgreSQL read-only transaction.
All 35 compared business/email/outbox table fingerprints, full environment and logo
hashes and running-container IDs matched before/after. Seven services were healthy;
SMTP/disabled-provider and fictional Draft-invoice preservation checks passed.
After the owner requested hosting creation, a separate guarded GET-only WHM
preflight returned HTTP 200 for account count, exact package and exact-domain
account summary, with package present and no matching primary account. The server
remained disabled. No registrar request, customer message, order, payment, domain
link, product mapping or provider activation was performed. Prior registrar GET
evidence and owner currency/receipt statements remain distinct from fresh provider
acceptance and recorded financial evidence.

Recommended next command after Command 146 validation: **Command 147 — Deploy the
preservation fix to staging after fresh verified backup**, preserving environment,
logo, records and active SMTP. Keep all other real providers disabled and inspect
only the new form/review controls and protected boundaries. Do not create an order
or account in deployment acceptance. Real hosting execution resumes separately
after fresh DNS/alias/cluster baselines and genuine payment review; retain the
owner's exact existing order/invoice-email approval.

See [progress](PROGRESS.md) for Command 145 results and the exact next command.

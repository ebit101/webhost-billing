# SSLCOMMERZ activation, reconciliation and rollback

Prepared for Command 221 on 2026-11-07 (Asia/Dhaka), against local source
`3ce98e8`. **Preparation is complete; activation and operational rehearsal have
not been performed.** This command authorizes documentation only. No sandbox
connection, merchant inspection, credential change, payment, refund, SSH check,
deployment or publishing is included.

Use this with [checkout recovery](SSLCOMMERZ_CHECKOUT_RECOVERY.md),
[the readiness review](ONLINE_PAYMENT_READINESS.md) and
[the progress log](PROGRESS.md). They record local acceptance, not provider
certification. Recheck the selected release and merchant's current contract
before any later authorized provider work.

## Current gate and responsibilities

| Item                                     | Prepared status                                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Local payment acceptance                 | Command 220 recorded 58 API, 43 unit and 50 UI cases passing. Not rerun by this documentation command.          |
| Installed release                        | Not inspected here. A local commit or version label does not prove the target includes Command 220.             |
| Merchant access                          | Owner last confirmed neither provider has approved API/sandbox access. No account checked here.                 |
| Genuine sandbox acceptance               | Missing; not authorized by this request.                                                                        |
| Recovery inventory                       | Blocked: the existing local recovery inventory test fails against current mapped tables. See the finding below. |
| Live implementation                      | Missing. Current adapter, transport hosts, stored environment and refund confirmation are sandbox-only.         |
| Payment, refund and deployment authority | None in this command. Each needs separate scope and owner approval.                                             |
| Operational decision                     | Keep activation closed. Existing manual payments remain the fallback.                                           |

Name a business owner who approves scope and money limits, an operator who
changes settings and reconciles, and a recovery owner who can restore compatible
code and access protected backups/keys. One person may fill these roles; record
the names and contact route privately. Use a full-administrator account; refund
approval/reconciliation additionally requires MFA verified within 15 minutes.

Keep actual customer/payment identifiers, provider references, evidence, account
details and incident records in restricted storage. Git contains only this
procedure, blank templates and sanitized acceptance summaries. Never put store
passwords, cookies, MFA secrets, raw card data or credential-bearing URLs in
screenshots, logs, shell history or support messages.

## Preconditions for a future activation window

Complete and record these gates before changing a gateway selection:

1. **Scope:** Owner names sandbox or live, merchant account, target installation,
   release commit, operator, test customer/invoice and window. Approve the exact
   BDT amount, one initial checkout, maximum aggregate collection exposure and
   stop criteria. A refund needs its own approved amount/reason/actor. A request
   to inspect or reconcile is not permission to create another charge.
2. **Provider:** Obtain the correct private account and confirm v4 Hosted
   Checkout, allowed channels, hosting-service entitlement, limits, risk fields,
   transaction-query outcomes, expiry/retry behavior and refund permissions.
   Agree fees/settlement/dispute handling without inventing rates. Use fictional
   customers and provider-approved test identities for sandbox acceptance.
3. **Live gate:** First complete separately authorized genuine sandbox evidence.
   Live work then needs a reviewed implementation for explicit live/account
   binding, endpoints, checkout hosts, callbacks and refunds, with its own
   acceptance. **Do not paste live credentials into the current adapter, change
   a hostname, relax TLS/host pins or reuse `APPROVE_SANDBOX_REFUND` for live work.**
4. **Release and recovery:** Confirm the installed commit, schema and compiled
   assets contain the reviewed recovery code. Inventory pending legacy SSL
   payments lacking bound checkout records; hold activation until they have a
   reviewed resolution. Retain the previous compatible release, verified
   encrypted backup, restore evidence and required decryption keys. Follow the
   existing [SSH handoff](SSH_DEPLOYMENT_HANDOFF.md) only if deployment is
   separately authorized; use its version/changelog/tag requirements. No such
   command is executed here.
5. **Billing and effects:** Verify the locked base currency is BDT, the customer
   is active/verified with a valid phone and billing snapshot, and the invoice
   is payable with the approved exact balance. Do not change a locked currency.
   Identify queued email, hosting and renewal effects and whether they are
   approved for this window. Payment acceptance is separate from provisioning.
6. **Access and observability:** Verify full-administrator login, CSRF, recent
   MFA for refunds, time synchronization, health/readiness, outbox/worker state,
   safe logs and an escalation contact. Redact outbound validation/refund URLs
   in any proxy/APM instrumentation as well as application logs.

### Callback reachability acceptance — future authorized work

The operator-approved API origin must be credential-free HTTPS with no path,
query or fragment. Distinguish it from the web portal origin. Register and
verify the following routes on that installation:

| Route below the approved API origin                | Required behavior                                                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /payment-gateways/sslcommerz/webhooks`       | Provider form IPN without a browser session or browser CSRF; current verified requests return 202. Financial changes require authenticated server-side proof. |
| `POST /payment-gateways/sslcommerz/return/success` | 303 navigation to the invoice or invoice list; no settlement from return data.                                                                                |
| `POST /payment-gateways/sslcommerz/return/fail`    | Navigation only; not authoritative payment failure.                                                                                                           |
| `POST /payment-gateways/sslcommerz/return/cancel`  | Navigation only; not cancellation of a remote transaction or local invoice.                                                                                   |

Verify DNS, certificate chain, reverse-proxy routing, raw form body preservation,
body/deadline limits and rate limits without an admin cookie or an interactive
challenge. Current IPN limits are 120 requests/source/minute and an application
cap of 256 KiB; an edge/body-parser limit may be tighter. Return routes have a
separate 60/source/minute limit. Confirm actual provider acknowledgement and
retry expectations against these responses before accepting compatibility.
An HTTP success, health check or forged return alone does not prove a payment.
Do not send probes to a provider or target installation under this preparation
command. Actual reachability is an open acceptance item.

## Controlled enablement — only after the gates pass

1. Start with **Settings → General settings → Security and integrations →
   Active payment gateway → Manual payments** saved. Record the hosting adapter
   and other saved values so they are preserved. Check the effective saved
   setting; an environment flag alone is not an activation control.
2. Provision the separately approved account through the protected credential
   mechanism. Stored encrypted bundles take precedence over environment
   fallback. A masked status is evidence of configuration, not provider access.
   Keep the encryption master key available for retained checkout snapshots.
3. With the approved release/account/environment and callback acceptance in
   place, select only the approved gateway and save the integrations tab. The
   existing UI choice is **SSLCOMMERZ sandbox**; no live choice currently exists.
   Re-read the saved setting and offered gateways. Do not enable bKash or change
   the hosting adapter as part of this procedure.
4. For the approved invoice, start one checkout. Retain its internal payment ID
   and stable merchant reference in the private record. Verify amount/currency
   and account binding before continuing on the hosted page. Do not create
   another attempt because a response is slow or lost.
5. Complete only the approved payment. Verify the provider record and local
   authenticated IPN/query outcome, bank reference, one invoice credit, linked
   order state, audit and outbox evidence. Verify any separately approved email,
   renewal or provisioning outcome independently. A redirect is insufficient.
6. Stop new online checkouts after the bounded pilot, then reconcile all admitted
   attempts. Continued availability requires an explicit owner decision and
   recorded acceptance. Refund only within separately approved scope.

## Stop new checkouts while preserving pending work

Use this for an uncertain payment, risk/identity mismatch, duplicate capture,
lost response, failed monitoring or exhausted approved exposure:

1. In the integrations tab choose **Manual payments** and **Save changes**.
   Preserve the current hosting adapter. Re-read the saved selection; gateway
   listing should offer no online gateway. Existing browser tabs can have stale
   buttons, so confirm the server rejects new SSL session requests. An already
   admitted request can finish during this change; inventory in-flight attempts.
2. Keep the compatible API, IPN route, saved checkout/refund history and
   decryption capability available. Do not delete credentials or change the
   master key as a substitute for stopping checkout. Old hosted URLs can still
   complete; changing the setting does not cancel them or revoke a capture.
3. Retain callbacks and explicitly scoped authenticated reconciliation for
   existing attempts. Account snapshots allow this independently of the current
   active-gateway selection. A provider-side credential revocation or key loss
   can still block queries; escalate rather than inventing replacement identity.
4. If containment also requires pausing worker/scheduler mutations, do so using
   the approved installation procedure. Keep financial receipts durable and
   outbox work retained. Do not flush Redis, replay charges or discard queues.

This is a saved configuration change, not a new deploy. The optional API
equivalent is `PATCH /settings` as a full administrator with CSRF, sending only:

```json
{
  "activeProviders": {
    "activeGateway": "manual",
    "activeHostingPanelAdapter": "<copy the current saved value>"
  }
}
```

The placeholder is deliberately not executable: substitute the exact current
allowed hosting adapter, then preserve it. Do not use a whole-settings overwrite
or include other tabs. Record the `BUSINESS_SETTINGS_UPDATED_BY_ADMIN` audit.
No settings mutation is performed by this command.

## Reconciliation decision table

Open **Billing → Transactions → Gateway exceptions → SSLCOMMERZ checkout
review**. Load/refresh attempts and use **Reconcile payment** for the saved
payment ID. The backend calls the provider query; it does not submit a new
charge. It can, however, post local financial state and queue normal follow-up
work, so it is not a side-effect-free local read.

| Observed situation                                                                      | Operator action and required evidence                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CREATING`, `OPEN` or `UNKNOWN`; response lost                                          | Query the pre-saved merchant reference using its bound account. Preserve the attempt and submission key. No new create request or manual success override.                                                                    |
| No result, ambiguous results, `UNATTEMPTED`, timeout or locally expired URL             | Keep unresolved and escalate on the agreed bounded cadence. Local URL expiry is not definitive provider failure.                                                                                                              |
| Missing/high/unknown risk, invalid completion time or identity/amount/currency conflict | Stop new checkout; retain the hold. Require matching authenticated provider evidence. Do not edit the invoice, snapshot or risk data to make proof fit.                                                                       |
| Confirmed failed/cancelled/expired attempt                                              | Retain failure/history. A deliberate replacement is eligible only if the invoice remains payable and no unresolved hold remains; it still needs pilot scope. Delayed success remains possible.                                |
| `CAPTURED`, applied to invoice                                                          | Compare bank/merchant identity, amount/currency and one invoice credit. Verify related order/outbox outcomes separately. Repeated callbacks/query must not credit again.                                                      |
| `CAPTURED`, not applied                                                                 | Money was captured but not credited, possibly after manual payment or closure. Preserve both charges, stop new attempts and arrange approved refund review. Do not mark the capture failed or credit a settled invoice again. |
| Legacy pending payment without `SslCheckout`                                            | Current bound query cannot adopt it. Keep activation held; require separately reviewed provider/account evidence and a migration/recovery plan. No fabricated snapshot or direct state reset.                                 |
| Provider refund/chargeback outside this application                                     | Preserve private provider evidence and escalate. Automatic import/accounting is not implemented; do not create a second refund or rewrite a charge.                                                                           |

The UI exposes the latest 50 attempts, and the attention queue is also bounded.
An empty visible list does not prove that all historical attempts are resolved.
Before pilot approval or rollback closure, an authorized operator must inventory
all pending/unapplied checkouts, pending legacy SSL payments and unresolved
refunds from retained records, including those outside the visible window. Use
a reviewed read-only database/reporting method that excludes encrypted snapshots,
raw payloads and customer data from public output; this document does not add an
inventory/export endpoint.

Record the first query and its outcome. Agree a bounded retry count and backoff
with the provider/operator before the window; no rapid polling or indefinite
retry loop. The application has no automatic reconciliation schedule here.
Escalate exhausted or contradictory evidence to the recovery owner. Keep the
ledger held until evidence or a separately reviewed repair resolves it.

### Refund recovery

Refund initiation is a separate financial mutation, not rollback or automatic
compensation. With separate authorization, a recent-MFA full administrator
enters the exact decimal BDT amount, reason and explicit sandbox confirmation.
Retain the same request key after response loss. Pending, submitting, unknown
and successful requests reserve the original capture; do not resubmit them.

Use **Reconcile refund** for a saved provider reference. If initiation lost its
reference, linking requires a reason, `LINK_REFUND_REFERENCE` confirmation and
authenticated bank/amount proof. Missing amount evidence remains in review.
Only confirmed success appends a linked refund. Applied refunds reduce paid
amount and increase accounting balance while retaining refund status; they do
not enable another checkout or silently change hosting. Refunding unapplied
cash leaves the already settled invoice unchanged. The original charge remains
recorded. Current confirmation is `APPROVE_SANDBOX_REFUND`; there is no live
refund procedure implemented by this release.

## Rollback and incident recovery

### Known recovery prerequisite failure

Source review found that `scripts/backups/common.sh` has a stale required-table
inventory. The existing local command
`node --test scripts/backups/recovery-inventory.test.mjs` returned **6 passed,
2 failed**: the model inventory and database-verifier parity assertions fail.
Fourteen current mapped tables are missing, including `ssl_checkouts` and
`ssl_refunds`, plus newer domain, plan-change, department, attachment and email
history. Migration naming and all five checksum-variant cases passed.

This is an existing source mismatch, not a failure caused by the new prose.
It does not prove that a full PostgreSQL dump omits those tables; it means the
recovery verification inventory cannot currently be accepted for this source.
No database, backup, archive or restore was accessed to test that behavior.
**Keep the recovery/activation gate closed** until a separately authorized fix
aligns the inventory without weakening checks and verifies isolated recovery.
Command 225 is proposed for that work. Do not bypass the verifier or rely on an
older installed inventory to approve the current release.

### Containment and recovery choices

**Stop new checkout first; preserve financial evidence.** Use the stop procedure
above and the installation's approved containment plan. Application rollback
does not reverse money, emails, registrar actions or hosting operations.

| Failure                                                      | Containment and recovery                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Incorrect gateway selection                                  | Save Manual payments, preserve hosting selection and credentials/snapshots, drain admitted attempts and reconcile. No deploy is needed merely to stop new checkout.                                                                                                                                                                            |
| Compatible application defect                                | Retain the database and receipts; pause affected downstream mutations. A separately authorized release rollback must preserve bound callback/query/refund behavior and the current schema. Health checks alone are insufficient.                                                                                                               |
| Prior release predates Command 220                           | Do not restore it as the payment processor while bound attempts remain. Keep a trusted compatible processor available or design explicitly approved containment and forward recovery. Retain the new tables and keys.                                                                                                                          |
| Migration failure or data corruption                         | Stop writes and preserve the failed database/evidence. Follow [isolated recovery](BACKUP_AND_RECOVERY.md); no down migration or overwrite of the active database. Before cutover, reconcile every payment/refund received since the chosen recovery point. A backup cannot undo external captures or recreate later receipts by itself.        |
| Compromised credentials, key loss or unsafe callback handler | Security containment may require narrowly isolating the unsafe route/account. Preserve receipts/history, report callback unavailability and arrange a trusted compatible processor or approved provider reconciliation. Do not assume retries will recover missing receipts. Re-entry of a current bundle does not repair a lost snapshot key. |

Follow [production deployment recovery](PRODUCTION_DEPLOYMENT.md) and
[the launch rollback matrix](PRODUCTION_LAUNCH_RUNBOOK.md) for the approved target.
No SSH command, image change, migration, restore, DNS change, key rotation or
refund is authorized by this preparation. Never flush financial/outbox history
or use direct SQL to force success, fail an uncertain payment, clear a hold or
release reserved refund funds.

Close rollback only after the approved release/schema/configuration, access,
financial history, pending callbacks/refunds, outbox/worker/scheduler and service
state have been checked. Name each unresolved item and owner; do not label an
uncertain capture resolved merely because the portal is healthy. Resume checkout
or downstream processing only within renewed owner authorization.
Re-read the effective gateway selection before restoring customer traffic;
restoring old settings must not silently re-enable online checkout.

## Private acceptance and incident record

Copy this blank template into restricted operational storage when a later
window is approved. Do not fill real identifiers or secrets into Git.

```text
Window / timezone / owner / operator / recovery contact:
Approved environment, merchant account reference and test scope:
Approved release commit/version, image identities and installed schema:
Evidence for provider entitlement, callback acceptance and genuine sandbox tests:
Approved invoice/customer reference, exact BDT amount and collection ceiling:
Approved refund scope (none unless separately approved):
Protected backup, compatible rollback release and decryption-key access:
Active gateway/hosting selection before, during and after the window:
Checkout/payment/invoice IDs; merchant/session/bank references (private only):
Provider capture evidence; applied or unapplied; one invoice credit:
Refund IDs/references and reserved/confirmed amounts, if authorized:
Audit, outbox, email, order and separate fulfillment outcomes:
Stop time; in-flight/legacy inventory; queries, backoff and escalation:
Rollback choice, preserved ledger delta and recovery verification:
Outstanding items, owner, next review time and final owner decision:
```

**Command 221 outcome:** Prepared and source-reviewed only. No real payment
outcome, callback reachability, credential provisioning, rollback drill or
deployed state was verified. Merchant access, genuine sandbox scope, reviewed
live implementation and separate financial/deployment approvals remain open.
The confirmed recovery-inventory failure is also unresolved; its proposed fix
is separate work, not silently included in this preparation.

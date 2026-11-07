# Domain renewal invoices and reminders

Command 227 saves the product ID/name and catalogue revision confirmed by the
administrator on future renewal invoice lines. Older terms require review and
reconfirmation before creating another invoice. Existing issued invoices remain
unchanged, payable and eligible for their original reminders. See
[invoice attribution](INVOICE_PRODUCT_ATTRIBUTION.md).

Command 214 adds application-managed renewal billing for individually reviewed
domains. It starts off for every domain. Billing creates invoices and reminders;
it does not purchase a renewal, advance provider expiry or suspend hosting.
[Command 215](PAID_DOMAIN_RENEWALS.md) adds separately approved worker execution
and reconciliation. Payment alone cannot dispatch a renewal, and real dispatch
remains disabled by default.

## Confirm terms and choose billing responsibility

1. A full administrator with two-factor authentication opens the domain record.
   Synchronize and, where necessary, review the ownership-bound registrar facts.
2. Configure the TLD's ordinary renewal selling price in the existing catalogue.
   Registration sales may remain disabled. This price is in BDT minor units and
   the first supported renewal term is one year.
3. Choose **Confirm renewal terms**. Confirm the exact domain name, current
   catalogue price/revision, ordinary one-year pricing and application-managed
   renewal responsibility, and record a review reason. Confirmation preserves the
   current on/off preference; it does not opt the customer in automatically.
4. The owning customer or a full administrator can turn renewal billing on after
   terms are confirmed. Customer requests cannot supply a price, term, account or
   provider flag. Support sessions can view saved information only.

The global renewal automation policy controls invoice lead days, reminder days
and the business time zone. Defaults are fourteen days before expiry and
reminders seven, three and one day before expiry, using Asia/Dhaka. Disabling
global automation prevents domain billing as well as the existing hosting cycle.

## Scheduler behavior

The existing daily renewal queue runs the domain billing processor. It scans
enabled domain preferences with keyset paging, so review holds do not permanently
occupy a fixed first page. Each domain is locked for the transaction, and catalogue
edits share the existing price-revision advisory lock. Errors are counted for the
automation run and later domains are still attempted.

Billing requires all of the following:

- A registered owned domain with its recorded registrar account enabled and
  verified registration or existing-domain linking evidence.
- A successful, fresh observation from Command 213 for that same account,
  customer, domain and provider order, with matching accepted expiry. The latest
  attempt must be successful and without an unresolved review code.
- Active status, a future known expiry, explicit supported renewal eligibility
  and registrar auto-renewal confirmed off. Unknown values are review holds.
- Confirmed one-year BDT terms tied to the current ownership binding and current
  catalogue renewal price/revision, and an eligible verified customer account.
- No unresolved manual renewal action or earlier invoiced renewal term that
  conflicts with the observed expiry. Fake provider billing is disabled in
  production.

Saved facts are fresh for one hour. This command does not schedule network
synchronization; obtain a fresh authorized observation before the billing run.
The current Resellbiz observation adapter reports unknown renewal eligibility,
so live application-managed billing remains held until that capability can be
verified through separately authorized work.

## One invoice per term

Once the lead date is reached, create one issued invoice for the domain, observed
expiry and one-year term. Snapshot the selling price, customer and business
identity, reviewed terms and source observation. Keep provider expiry as the
term start and invoice due instant; do not derive it from a hosting service.
Historical registration/order/payment records remain unchanged.

The domain lock and PostgreSQL uniqueness prevent concurrent or retried runs
from issuing a second invoice. A missed lead window can still issue the ordinary
invoice while the domain is unexpired and all facts are fresh. Expired domains,
grace/redemption charges and unknown terms require administrator review instead.
No new invoice is issued to replace an unresolved earlier term just because
observed provider expiry changes.
After independently confirmed fulfillment in Command 215, a later eligible
period can receive its own invoice while completed history is retained.

Changing catalogue pricing holds future billing until the administrator confirms
the new revision. An already-issued invoice keeps its original amount and term.
The legacy manual renewal creation path rejects application-managed billing or
an existing scheduled renewal invoice, preventing a second paid renewal flow.
Renewal invoices have no hosting-service anchor and cannot trigger hosting
suspension or advance hosting periods.

## Reminders, payment and opt-out

An invoice-created message is queued in the invoice transaction. On later days,
queue the nearest reached reminder threshold once. Missed thresholds do not
produce a burst of older reminders, and the issue day needs no extra reminder.
Snapshot the reminder schedule and business time zone with the issued term;
later policy edits affect future invoices and cannot add reminders to this term.
The existing durable email delivery pipeline deduplicates delivery attempts.

Payment stops new reminders but does not complete registrar renewal. Queued
reminders are suppressed at email resolution when billing is off, the invoice
is paid/cancelled, a review hold is recorded or expiry has passed. This acceptance
uses only an in-memory local mail adapter; no customer email is sent externally.

Turning billing off stops future invoices and reminders. Issued invoices and
payments are retained for staff review; opt-out does not cancel an invoice,
refund a payment or undo a remote operation. Preference revisions reject stale
or concurrent updates, and changes/term confirmation are audited.

## Review and next work

The domain panel and audit history show review reasons such as stale facts,
unknown eligibility, changed terms, unresolved renewal responsibility or expired
ordinary pricing. Correct the underlying facts/terms and run a new authorized
cycle. Do not resolve an ownership mismatch by attaching another customer's
domain or reuse a historical invoice as proof of renewal.

Command 215 supplies [paid execution and recovery](PAID_DOMAIN_RENEWALS.md).
Live eligibility/balance readiness and actual provider scope remain separate
requirements. Billing itself adds no registrar dispatch, purchase, deployment
or live-provider authorization.

Focused local checks:

```powershell
pnpm --filter @webhost-billing/web exec tsx e2e/run-api-tests.ts domain-renewals
pnpm --filter @webhost-billing/web exec tsx e2e/run-tests.ts e2e/specs/domain-renewals.spec.ts --timeout=180000
```

The guarded runners create isolated fictional database scopes. Use the existing
local PostgreSQL/Redis prerequisites and keep real credentials/data outside tests.

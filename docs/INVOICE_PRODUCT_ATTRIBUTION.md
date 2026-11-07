# Invoice product attribution

Commands 226 and 227 save the product identity used when future hosting renewal,
recurring add-on renewal, hosting upgrade and domain renewal lines are issued. Reports
can then identify that product after the hosting plan or catalogue changes.

## Capture sources

| Invoice line             | Saved identity and reporting label                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting renewal          | The locked service's current purchased product ID, price ID and saved product name at renewal creation.                                 |
| Recurring add-on renewal | The purchased add-on order item's product ID, price ID and saved name. Keep its existing order-item link.                               |
| Hosting upgrade charge   | The accepted, saved quote's target product ID, price ID and name. Keep its existing service link.                                       |
| Domain renewal           | The product ID/name and catalogue ID/revision saved in administrator-confirmed renewal terms. Keep the renewal record and period links. |

The versioned `product_attribution_snapshot` also records product kind and source.
It contains no credentials, customer contact details or derived money. The
invoice line already saves its exact amount, currency, quantity, description and
coverage dates; reporting continues to allocate cash using those stored values.
Never recompute an old amount from a current catalogue price.

The snapshot is internal. Customers and manual invoice requests cannot supply
it. Shared runtime validation rejects malformed identifiers, unknown fields,
unsupported versions and source/kind mismatches. Invoice creation copies saved
service, purchase, quote or confirmed-term names. Reporting and payment never
substitute today's catalogue label for that saved evidence.

## Domain renewal terms

Domain renewals use version 2: product ID, saved name, catalogue ID/revision,
`DOMAIN` kind and `DOMAIN_RENEWAL` source. Their prices live in the revisioned
TLD catalogue, not hosting price rows. Do not substitute a registration price ID
or invent a renewal price record. Confirmed terms and the invoice line retain
the exact annual BDT amount and one-year coverage.

The existing full-administrator confirmation action saves this identity with
fresh facts and the current price; public requests cannot supply it. The
scheduler copies the saved label even after a catalogue name edit. Existing
price/revision-change holds still apply. Legacy terms without attribution hold
new invoices with `ATTRIBUTION_REQUIRES_REVIEW` until an administrator reviews
and reconfirms them. Already-issued legacy invoices remain payable and eligible
for their existing reminders. Never silently tag old terms or issued lines.

## Database protection

Migration `20261107000300_invoice_product_attribution` adds one nullable JSONB
column to the existing invoice-item table. It does not update or backfill rows.
Existing invoice lines retain their original evidence and a null attribution.

New non-null snapshots must have the exact supported shape and match their
capture source and invoice customer/currency. Hosting renewals must match the
service reference, add-ons their purchased item, and upgrade charges the saved
quote selected by the invoice submission key. Only issued lines can capture it.

Migration `20261107000400_domain_invoice_attribution` extends the guards without
altering rows. A deferred constraint trigger checks domain lines at commit,
after both invoice and retained renewal record are inserted. Require exact
confirmed identity, customer, catalogue/revision, amount, current expiry and
term coverage. An unbound or mismatched snapshot rolls back the transaction.
Existing version 1 hosting snapshots remain supported and protected.

Once captured, the entire attributed invoice line is immutable: reject renaming,
amount/coverage changes, moving it to another invoice, detaching attribution or
deleting the row. Adding attribution to an existing null line through an update
is also rejected. Preserve refunds and reversals as separate payment records;
invoice settlement can update balances without changing the original lines.

Null remains valid for legacy and ad-hoc lines. Both updated API and worker
writers must be used for future hosting/domain coverage. An older writer that omits the
field still produces an unattributed line; do not infer missing evidence from a
mutable service or catalogue. A future publication/deployment must deliver the
matching migration and both application components together.

## Reports and historical gaps

Collected income now prefers the invoice's saved product identity and label.
Where that snapshot is absent, retain the existing purchased order-item evidence.
Lines with neither remain **Unattributed product**, including older unmapped
renewal/plan-change lines, legacy domain renewals and unsupported ad-hoc attribution.
Issued historical invoices are not rewritten to make a report look complete.

This does not change the allocation rule: each successful charge, refund or
reversal is allocated once using positive saved line totals and exact integer
remainders. Partial payments, combined add-ons and catalogue edits must not
duplicate or reprice a charge. See [the report definitions](OPERATIONAL_REPORTS.md).

## Verification and recovery

The guarded `attribution --verify-schema` acceptance selector extends the existing
hosting upgrade/downgrade suite. Its new fictional journey exercises a paid
source renewal, an accepted upgrade, catalogue/name/price edits, a target renewal,
partial payment, concurrent refund replay and reversal. Both pre/post-change
renewals retain their captured identities, and one-time extras do not recur.
Separate cases reject forged identity, snapshot edits, detachment, line deletion
and retroactive tagging. Original legacy lines remain unchanged.

The schema verifier checks the JSONB column, shape constraint and all three
trigger events. Restore verification checks the same protections and rejects
malformed retained snapshots. The encrypted recovery fixture now retains an
attributed line and verifies its exact identity plus immutable update/deletion
guards after restoration. Inventory remains 75 tables; the source now contains
58 migrations after Command 227. The verifier also requires the enabled,
deferrable, initially deferred domain binding trigger. Recovery checks its
metadata, acceptance of the new shape and rejection of an unbound domain line
after restore, alongside retained version 1 history. Use matching source SQL
when verifying or restoring a backup.

The `domain-renewals --verify-schema` selector verifies name/price edits,
simultaneous scheduler retries, exact partial cash/refund/reversal allocation,
forged bindings and immutable lines. It also checks repeated legacy holds,
administrator reconfirmation and payment/reminders for legacy issued invoices.

Actual local checks and any limitations are recorded in [the progress log](PROGRESS.md).
No real provider connection, release change, publishing or deployment is included.

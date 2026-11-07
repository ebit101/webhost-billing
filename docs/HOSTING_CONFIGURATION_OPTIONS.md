# Configurable hosting product options

Command 223 adds fixed, manually fulfilled choices at hosting checkout. It reuses
the existing product add-on catalogue and billing cycle rather than introducing
a second price or fulfillment system.

## Set up a group

1. Open **Products**, then **Product add-ons**.
2. Create an add-on, enter its price in the business currency and choose its
   eligible hosting plans and billing period.
3. Enable **Use this product as one choice in an option group**. Enter a stable
   group key such as `storage-tier`, the group name `Storage tier`, a choice name
   such as `20 GiB storage`, and a public manual fulfillment note.
4. Create other allowed values as separate products with the same group key and
   group name, for example `40 GiB storage`. Use distinct choice names. There can
   be at most 20 enabled choices in a group for each eligible plan.

Use notes to explain what staff will apply after payment and account setup. The
note is public and retained with the purchase; enter no credentials or private
staff instructions. These prices are **additional charges**, not replacement
prices for the hosting plan. A recurring choice must match the selected hosting
cycle; a one-time choice is charged only at checkout.

## Customer checkout

Checkout shows a drop-down for each available group. Customers can choose one
allowed value, or keep **Use the included plan configuration** with no additional
charge. Ordinary add-ons retain their checkboxes. The existing limit of ten
selected add-ons includes configuration choices.

The customer submits price identifiers, never trusted amounts or provider
configuration. The server verifies availability, plan compatibility, currency,
billing period and one value per group. Integer minor-unit arithmetic includes
the selected charges in the preview, order and invoice. Concurrent retries with
the same submission key create one order and invoice; changing the selection
under that key is a conflict.

The order snapshots the group, choice, manual note, description, price and
billing period. Editing configuration metadata rotates the unsold price
identifier so a stale checkout must refresh. Catalogue edits never rewrite an
existing purchase. Database checks reject malformed configuration snapshots,
duplicate groups within an order, purchase rewrites and deletion.

## Apply and acknowledge configuration

After payment, provision the base hosting account using its normal plan. A full
administrator then applies the purchased limit manually in the hosting panel and
uses **Confirm configuration applied** on the order details page. Review the
saved fulfillment note before acknowledging it.

An unpaid order or an account that has not been successfully provisioned cannot
be acknowledged. A failed account creation leaves the choice pending; recover
account creation first. Repeating acknowledgement retains one fulfillment and
audit event. Acknowledgement records the administrator's confirmation; it does
not independently read back or prove a provider quota change.

This release has no verified per-choice provider mapping. It does not send quota
overrides to cPanel or another panel and does not infer commands from option
names. Purchases with configuration choices are held for manual review by the
existing plan-change compatibility gate, including upgrades and downgrades, to
avoid silently losing manually applied limits. Changing an existing service's
choices is outside this command.

## Renewal and cancellation

A fulfilled recurring choice renews on its hosting service's billing cycle using
the purchased amount and label, even if its catalogue entry changes or becomes
disabled. Renewal retries create one invoice and one charge for each recurring
choice. Setup fees and one-time choices do not repeat. Pending manual work keeps
the existing add-on renewal safeguards.

Recurring choices retain the existing end-of-period cancellation flow. The next
renewal excludes a cancelled choice while hosting stays active. Removing a
resource limit is separate manual work: review and acknowledge the cancellation
follow-up in the administrator service record. Retain purchased history; do not
delete financial records or silently change the base plan. See the
[progress log](PROGRESS.md) for the related add-on commands and acceptance.

## Local acceptance and limits

Acceptance uses fictional accounts, isolated PostgreSQL schemas, temporary local
Redis and the fake hosting panel. It covers incompatible/tampered/stale choices,
group limits, exact totals, concurrent checkout, immutable snapshots, failed
provisioning and retry, manual acknowledgement, purchased-price renewal and
period-end cancellation. Component checks exercise both administrator editing
and customer selection.

No metered overages, automatic quota fulfillment, in-place option changes,
multi-currency billing, live provider acceptance or deployment are included.
Migration `20261107000200_hosting_configuration_choices` adds guards to existing
tables; the 75-table recovery inventory is unchanged. The trusted migration set
now contains 56 migrations. The earlier encrypted recovery drill remains
historical evidence for its 55-migration source; it was not rerun by Command 223.

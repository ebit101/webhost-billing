# Billing upgrade and legacy renewal review

Command 228 rehearses the data/schema transition from migration 56 through
invoice attribution (57) and domain renewal attribution (58), using fictional
records in a fresh loopback-only schema. It does not deploy an application or
connect to a real payment, registrar, hosting or mail provider.

## Run locally

With the project's dependencies/packages built and local PostgreSQL/Redis
configured, run from the repository root:

```powershell
pnpm test:billing-upgrade
```

The launcher creates its own schema and ownership marker. It copies the exact
trusted migration SQL into a private temporary directory, applies the 56-file
prefix, creates the legacy fixture, then applies migrations 57 and 58 through
Prisma. A final deployment replay must be a no-op. It refuses a supplied/reused
schema and a source migration set different from the pinned 58-migration scope.
It never runs a database reset, disables a history guard or changes source SQL.

The current test harness uses schema-compatible initial registration/payment
services and explicit old-column fixture writes for pre-attribution renewal
history. This is a populated data/schema rehearsal, not a test of an old
application image or a running production installation. The development seed
selects only the unused invoice-line ID so it can populate that older column set.

## Fixture and acceptance

| Existing record                                          | Required result after upgrading                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paid hosting seed and three paid fictional registrations | Preserve amounts, identity, lines and payments.                                                                                                         |
| Enabled legacy domain terms without an invoice           | Keep a stable review hold across scheduler retries; require full-administrator reconfirmation before one new attributed invoice.                        |
| Issued legacy renewal with a pending manual payment      | Keep the invoice payable and eligible for its existing reminders; settle the retained payment once across concurrent reviews and duplicate submissions. |
| Paid renewal with a queued registrar operation           | Retain its identity, reference, approval, financial state and queued work; do not dispatch it during the rehearsal.                                     |

SHA-256 fingerprints compare every row across all 74 application tables before
and after each migration and deployment replay. The comparison removes only
the newly added nullable attribution field from invoice-line projections.
Original migration records and source checksums must remain unchanged. Old lines
must gain no attribution. The standard schema/seed verifier runs in a second
fresh owned schema at migration 58: its intentional empty-catalogue assertions
describe the unchanged seed, not a populated installation. Keep those gates
intact instead of deleting fixture business records or bypassing assertions.

After migration, the fixture exercises administrator/support/customer boundaries,
renewal retries, ledger-to-report reconciliation and a transaction that attempts
a forbidden retroactive attribution. Both the forbidden edit and a preceding
temporary setting insert must roll back. Original invoice lines are compared
again after the operational checks.

All test records use reserved fictional identities. No scheduler daemon, email
sender or registrar renewal worker is started. Only the marked schema and the
launcher's validated temporary directory are removed on exit.

## Operator review before any separately authorized release

1. Identify the installed migration level and preserve a verified, encrypted
   pre-change backup with its matching source and decryption access.
2. Pause billing writers, scheduler and provider consumers while applying the
   matching database/API/worker/shared release. A schema upgrade alone is not
   proof that every running writer has changed.
3. Inspect enabled legacy domain terms that lack product attribution. Refresh
   ownership/expiry/eligibility and ordinary renewal pricing, then use the full
   administrator's renewal configuration action to reconfirm terms. Do not tag
   issued history or bulk-enable unreviewed renewals.
4. Keep existing issued invoices and payment references intact. Review pending
   payments through the normal audited verification flow. Review queued/unknown
   registrar operations before resuming consumers; a paid invoice is not proof
   of a purchased remote renewal.
5. Reconcile product cash against verified charges/refunds/reversals. Older
   renewal cash without immutable product evidence remains unattributed.
6. If migration or data verification fails, keep writers paused and follow the
   reviewed recovery procedure. Do not force a migration, disable triggers,
   remove new history columns or reprice issued invoices to make checks pass.

## Recovery evidence and limits

This rehearsal checks row preservation, trusted migration history, safe replay
and application transaction rollback. The separately recorded Command 227
encrypted round trip verified the 58-migration schema and restored guards; see
[backup and recovery](BACKUP_AND_RECOVERY.md). Do not describe that earlier
fixture as a restore of this upgraded installation. Real pre-change backup
retrieval, installed-image compatibility and production recovery remain release
operator gates.

Actual local outcomes and any gaps are recorded in [the progress log](PROGRESS.md).

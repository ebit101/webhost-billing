# Billing upgrade and legacy renewal review

Command 230 extends Command 228 to the published alpha.4 baseline: migration 46
through all 58 migrations, using fictional records in fresh loopback-only
schemas. It also exercises a real partially applied migration failure and the
SSH script's containment behavior. These local tests do not deploy an application
or connect to a real payment, registrar, hosting or mail provider.

## Run locally

With the project's dependencies/packages built, local PostgreSQL/Redis
configured and full Git history including `v0.1.0-alpha.4`, run from the repository root:

```powershell
pnpm test:billing-upgrade
pnpm test:deployment-containment
```

The billing launcher creates its own schema and ownership marker. It pins
alpha.4 to `24af57553937574dc4f0c12cd1b0be2078ba7ed7`, verifies the 46-migration
prefix, and applies exact trusted SQL copied into a private temporary directory.
It generates alpha.4's Prisma model in an owned ignored directory and runs the
published seed with import paths adapted to that model and the current isolation
guard. It changes neither the seed's records nor its write operations. Extra
old-column SQL fixtures represent paid hosting with a cancelled recurring
add-on, an unpaid hosting renewal and bank reference, pending email and ticket
history. Only fictional seed rows can be copied in the verified owned scope.

The populated installation then migrates 46→56, adds Command 228's legacy domain
fixture and migrates 57→58. A deployment replay must be a no-op. The launcher
refuses supplied/reused schemas and a different source migration set. It does
not reset a database, disable history guards, edit trusted migration SQL or mark
failed migrations resolved. This proves populated schema/data behavior with the
published data model, not an old application image or a running installation.

## Fixture and acceptance

| Existing record                                          | Required result after upgrading                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paid hosting seed and three paid fictional registrations | Preserve amounts, identity, lines and payments.                                                                                                         |
| Enabled legacy domain terms without an invoice           | Keep a stable review hold across scheduler retries; require full-administrator reconfirmation before one new attributed invoice.                        |
| Issued legacy renewal with a pending manual payment      | Keep the invoice payable and eligible for its existing reminders; settle the retained payment once across concurrent reviews and duplicate submissions. |
| Paid renewal with a queued registrar operation           | Retain its identity, reference, approval, financial state and queued work; do not dispatch it during the rehearsal.                                     |

Command 230 additionally verifies the alpha.4 ticket's Support department
backfill without changing old columns, a retained staff-only note, purchased
add-on price/cancellation/manual-follow-up state, pending email, and concurrent
settlement of the original hosting renewal with hosting active. The renewal
contains hosting only; the cancelled add-on and its issued history remain intact.

Lossless SQL JSON text fingerprints compare all original columns and rows of
the 60 alpha.4 application tables through migration 56. New columns/tables are
checked separately, including Support backfill and empty new operation stores.
After the domain fixture is added, fingerprints compare all 74 application
tables across migrations 57/58 and replay, excluding only the new nullable
attribution field from invoice-line projections.
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
launcher's validated temporary directories/generated client are removed on exit.

## Deliberate migration failure

A separate owned schema starts from the same populated alpha.4 fixture. Trusted
migration 47 commits before a synthetic, temporary migration fails with division
by zero. Prisma must report `P3018`, retain the unfinished ledger entry and refuse
another deployment with `P3009`. All 60 original table projections and 46 ledger
rows must remain intact through that refusal. No application/provider worker is
started. After evidence is checked, only this disposable fictional scope is
removed; this is not a production repair or backup restore.

## SSH containment acceptance

The deployment test command requires the cached pinned Node image listed in its
launcher. It refuses an absent image rather than pulling one. The container has
no network, no Docker socket and only read-only mounts of the test files and real
server script; it cannot access application environments or SSH keys. Its fake
installation and command doubles execute the actual Bash control flow.

Cases cover success, backup failure, interruption, early/partial migration
failure, unfinished/unreadable ledger, environment/switch failure, candidate
startup/health failure and failed writer shutdown. Failures after the writer
boundary retain `deployment-held`, attempt to stop writers and never restart old
ones. Failed shutdown is reported as unconfirmed. A held retry cannot invoke
Docker; only successful final acceptance clears the hold. See the
[SSH handoff](SSH_DEPLOYMENT_HANDOFF.md) for the operator decision procedure.

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

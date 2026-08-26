# PostgreSQL Backup and Recovery

This runbook covers the Webhost Billing PostgreSQL system of record. The supplied scripts stream a PostgreSQL custom-format dump directly into OpenPGP symmetric AES-256 encryption. A plaintext database dump is never written to disk.

The scripts operate through the configured Docker Compose PostgreSQL service so the dump and restore client remain the same major PostgreSQL version as the server. They do not back up `.env` files, plaintext credentials, PostgreSQL roles, Redis, application images, or source code.

## Recovery objectives and retention

Use these as the minimum production baseline until the final hosting and backup destination is selected:

- Recovery point objective: at most six hours of database changes.
- Recovery time objective: restore core billing access within four hours.
- Create an encrypted logical backup at least every six hours and before every migration, master-key rotation, or high-risk maintenance event.
- Keep 14 days of six-hour backups, 8 weekly backups, and 12 monthly backups, subject to the final customer-data retention policy.
- Keep at least three copies on two storage systems, with one encrypted immutable/off-site copy.
- Keep the backup passphrase in a separate password/secret manager. Never store it with the backup or on the database host as the only copy.
- Verify every newly created backup and complete an isolated restore drill at least monthly and before launch.

Logical dumps are not point-in-time recovery. Production should add provider-managed physical backups/WAL archiving if a six-hour RPO is insufficient. Provider snapshots never replace the portable encrypted logical backup or restore drill.

## Prerequisites

- A healthy PostgreSQL Compose service and enough free space at the encrypted destination.
- GnuPG, SHA-256 tools, Docker Compose, and a PostgreSQL image matching the server major version.
- A random passphrase file containing at least 32 bytes with mode `0400` or `0600`, provided from protected storage.
- A restricted backup destination. The repository ignores `backups/` and encrypted dump artifacts, but ignore rules are not access control.

Example local-only key preparation:

```bash
install -d -m 0700 /secure/operator-only
umask 077
openssl rand -base64 48 > /secure/operator-only/webhost-billing-backup-passphrase
chmod 0400 /secure/operator-only/webhost-billing-backup-passphrase
```

Do not use the example path as the only production key location. Back up the passphrase separately using the approved secret-management recovery process.

## Create and verify an encrypted backup

Run from the repository root. `BACKUP_DATABASE_NAME` is mandatory so the operator must name the intended Compose database explicitly.

```bash
BACKUP_DATABASE_NAME=webhost_billing \
  pnpm backup:create \
  /protected-backups/webhost-billing \
  /secure/operator-only/webhost-billing-backup-passphrase
```

The command emits the final `.dump.gpg` path only after it has successfully decrypted the stream and parsed its PostgreSQL archive list. It also creates:

- `.dump.gpg.sha256` for transport/storage corruption detection;
- `.dump.gpg.metadata.json` with creation time, database name, dump client, application commit, completed migration count, encryption description, and checksum.

The metadata is advisory and contains no key. OpenPGP integrity protects the encrypted dump; the sidecar checksum alone is not an authenticity control.

Verify after copying to each destination:

```bash
pnpm backup:verify \
  /protected-backups/webhost-billing/webhost-billing-example.dump.gpg \
  /secure/operator-only/webhost-billing-backup-passphrase
```

A useful backup must pass all four checks: encrypted-file checksum, OpenPGP decryption/integrity, PostgreSQL archive parsing, and presence of required application/migration tables. A successful archive-list check still does not replace an isolated restore.

## Restore into an isolated database

Never restore directly over the active database. The restore script accepts only a new lowercase database beginning with `webhost_billing_restore_`, refuses an existing target, and requires confirmation containing the exact target name.

```bash
RECOVERY_CONFIRMATION=RESTORE_TO_webhost_billing_restore_20260826 \
  pnpm backup:restore \
  /protected-backups/webhost-billing/webhost-billing-example.dump.gpg \
  /secure/operator-only/webhost-billing-backup-passphrase \
  webhost_billing_restore_20260826
```

The restore uses `--single-transaction`, `--exit-on-error`, no ownership, and no privileges. If restore fails, only the newly created allowed target is removed. On success, structural verification checks table and migration presence, critical relationships, order/invoice arithmetic, and safe row-count totals.

Then:

1. Read the metadata application commit and inspect the restored `_prisma_migrations` history. Treat metadata as a hint; the database migration table is authoritative.
2. Check out or deploy the matching reviewed application version in an isolated environment.
3. Build a new `DATABASE_URL` from protected connection settings with the isolated database name. Do not paste it into tickets, logs, shell history, or documentation.
4. Run `DATABASE_URL=<isolated-url> pnpm db:migrate:status`.
5. If the recovery application contains reviewed migrations newer than the backup, take a second protected copy of the restored database, then run `DATABASE_URL=<isolated-url> pnpm db:migrate:deploy`. Never use `prisma db push`.
6. Run `DATABASE_URL=<isolated-url> pnpm db:verify` when the standard fictional seed is expected, or use the structural verification plus business-specific reconciliation for real data.
7. Start isolated API/web processes with workers, scheduler, SMTP, payment, and cPanel mutations disabled. Test login, customer ownership, invoice totals/PDF, payment history, service states, and audit history.
8. Perform authenticated read-only provider reconciliation for recent payments and hosting operations before enabling callbacks or workers.

For two local databases, the following command compares all 30 important table counts, complete successful migration history, critical relationships, and financial calculations:

```bash
pnpm backup:verify-restore webhost_billing_restore_20260826
scripts/backups/compare-postgres-databases.sh \
  webhost_billing_source_copy \
  webhost_billing_restore_20260826
```

## Fictional automated recovery drill

The drill is intentionally destructive only to these exact databases:

- `webhost_billing_backup_source_command28`
- `webhost_billing_restore_command28`

It recreates the source, deploys all migrations, loads the reserved `.test` seed, validates it, creates and verifies an encrypted backup, proves that a corrupted encrypted copy is rejected, restores it, compares 30 table counts and migration history, reruns migration deployment/status, and verifies the restored relationships. The temporary databases, encrypted artifact, and generated passphrase are removed on exit.

```bash
COMMAND28_RECOVERY_DRILL_CONFIRMATION=RESET_COMMAND28_FICTIONAL_DATABASES \
  pnpm backup:test-recovery
```

The script never connects to the ordinary `webhost_billing` database and cannot accept a production target name.

## Application configuration and secrets recovery

The PostgreSQL backup contains encrypted credential ciphertext, password/token hashes, MFA state, customer information, and financial history. It remains sensitive even when encrypted.

Restore deployment configuration from the approved secret manager, not from a database dump or committed `.env` file:

- Recreate the PostgreSQL application role and least-privilege grants; `pg_dump` deliberately excludes global roles and role passwords.
- Restore the exact historical `CREDENTIAL_ENCRYPTION_KEY` before reading integration credentials, cPanel tokens, administrator TOTP secrets, or pending encrypted email-action tokens. Losing it makes those restored ciphertexts unreadable.
- Restore gateway, SMTP, and infrastructure credentials through secret injection. Re-enter/rotate provider and WHM credentials through the write-only settings workflows if compromise is suspected.
- A new `SESSION_SECRET` is acceptable during disaster recovery and intentionally invalidates every browser session. Do not expect old cookies or CSRF tokens to survive.
- Generate new database/Redis passwords for rebuilt infrastructure and update only the secret manager/deployment injection.
- Restore business settings from PostgreSQL. Compare non-secret environment settings such as origins, timeouts, queue prefix, and email branding with the reviewed deployment manifest.
- Keep the database encryption key, backup passphrase, administrator recovery codes, DNS/TLS account recovery, and infrastructure-provider recovery in separate protected locations.

Never export decrypted integration credentials merely to make a configuration backup. Before key rotation, retain the old key through a completed backup/restore test and re-enter every encrypted provider/WHM credential under the new key as described in `docs/SETTINGS_AND_SECRETS.md`.

## Migration recovery and rollback decisions

- Committed migrations are forward-only deployment history. Never delete/edit an applied migration, run `prisma db push`, or improvise a production down migration.
- Take and verify an encrypted backup immediately before migration deployment. Record the application image/commit, migration list, start time, and operator.
- If a migration fails before application rollout, stop deployment, preserve logs, keep traffic on the previous version if compatible, and inspect `prisma migrate status`. Do not mark a failed migration resolved without reviewing its actual database effects.
- If the schema change is backward-compatible and the old application is verified against it, rolling back only the application image may be safe.
- If a migration removed/transformed data or the previous application is incompatible, do not run old code against the changed database. Restore the pre-migration backup into a new isolated database, validate it, then perform an explicit connection cutover.
- Prefer a roll-forward repair migration when the data is correct and the failure is application-only. Prefer isolated restore/cutover when financial history, constraints, or migration state is uncertain.
- Never overwrite the failed database during investigation. Preserve it read-only until reconciliation and incident review are complete.

## Redis and background work after database recovery

PostgreSQL is the system of record; Redis/BullMQ is a durable delivery layer but is not included in these scripts. During recovery:

1. Stop API writes, workers, and the scheduler before selecting the recovery point.
2. Restore a compatible protected Redis snapshot/AOF when available and validate the no-eviction/persistence configuration.
3. If Redis is rebuilt empty, do not blindly republish every `PUBLISHED` outbox event. Some email or cPanel mutations may already have crossed an external boundary.
4. Compare the Redis recovery time with PostgreSQL outbox, email-attempt, payment-event, hosting-operation, automation-run, and audit evidence.
5. Reconcile payment and hosting state through authenticated read-only provider queries. Use only existing explicitly safe retry controls for confirmed temporary failures.
6. Enable API traffic first, then the outbox dispatcher, ordinary workers, and finally the scheduler while monitoring queue and provider metrics.

## Disaster-recovery checklist

### Declare and contain

- Record incident start, scope, suspected compromise, last known good time, and authorized recovery operator.
- Stop writes, workers, scheduler, callbacks, SMTP, and hosting mutations. Preserve logs and the failed system read-only when possible.
- If compromise is suspected, isolate the host and rotate infrastructure/provider credentials from a trusted device. Do not destroy forensic evidence.

### Select and verify recovery material

- Identify the newest backup before corruption/compromise within the RPO.
- Confirm off-site object version/immutability, checksum, GPG integrity, archive structure, metadata commit, PostgreSQL major version, and migration history.
- Confirm access to the separate backup passphrase, historical credential-encryption key, source/image commit, infrastructure account, DNS/TLS, and administrator recovery material.

### Restore and validate

- Provision clean isolated PostgreSQL/Redis infrastructure with new passwords and restricted networking.
- Restore to a new allowlisted database; never overwrite the failed database.
- Apply only reviewed committed migrations and complete structural, row-count, relationship, financial, ownership, authentication, invoice, service, and audit checks.
- Keep all external mutations disabled while reconciling recent payment, email, renewal, outbox, and cPanel evidence.

### Cut over

- Take a final protected pre-cutover backup of the validated recovered database.
- Inject secrets from the secret manager, use a new session secret, verify TLS/origins/headers, and start API read access.
- Enable dispatcher/workers/scheduler in stages while watching readiness, queues, provider failures, and automation history.
- Change the application connection/DNS only after owner approval and a documented rollback point.

### Close and improve

- Reconcile the RPO gap manually from provider/bank/WHM evidence without inventing payments or service state.
- Notify affected parties according to legal/business obligations, record the audit/incident timeline, and retain evidence.
- Rotate temporary recovery access, verify new backups, run another isolated restore, and update the runbook from lessons learned.

## Production launch blockers

Before production, select the off-site immutable destination, secret manager, backup scheduler, alert destination, retention/legal deletion policy, managed PostgreSQL/WAL option, and Redis backup/recovery approach. Perform one restore drill on staging hardware and measure the real RPO/RTO. A successful backup command without a tested isolated restoration is not launch-ready.

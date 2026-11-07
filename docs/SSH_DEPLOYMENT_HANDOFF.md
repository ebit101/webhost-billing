# Webhost Billing SSH deployment handoff

The launcher updates the existing installation at my.speedhost.bd. It packages the exact Git commit you select, transfers it over SSH, and runs that commit’s server-side release script. Use it for an owner-authorized update after validating the candidate locally.

## Run an update

For each deployment, bump the workspace version, add a matching section to the
[changelog](../CHANGELOG.md), and publish an annotated version tag on the release
commit. The launcher checks that the tag points to the selected commit and that
the root and web package versions agree.

From the project folder in PowerShell, replace the placeholder with the full
40-character SHA of the tagged commit.

```powershell
.\scripts\deploy-ssh.ps1 -Commit '<full-commit-sha>'
.\scripts\deploy-ssh.ps1 -Commit '<full-commit-sha>' -Apply
```

The first command is a read-only SSH preflight. The second uploads the commit, checks the archive digest on the server, builds the release, verifies an encrypted database backup, runs pending migrations, and checks service health.

The default key path is `~/.ssh/webhost_billing_46_250_239_221_ed25519`. The dedicated key was enrolled on 2026-11-04. Use `-IdentityFile '<path-to-an-authorized-key>'` to override the default. Keep private keys outside the repository. SSH host key checking uses the operator’s existing known-host entry.

## Verify the release

Check that the reported server commit matches the requested commit. Confirm that the storefront, `/health`, and `/ready` respond successfully. If the release fails, record the error and inspect the active release before trying again. The [deployment runbook](STAGING_DEPLOYMENT.md) describes the rollback procedure.

The read-only preflight passed against my.speedhost.bd using the default dedicated key on 2026-11-04. On 2026-11-04, the `-Apply` path deployed commit `fe21c19719a0c7cef461179048052756f1e52f04` in 13 minutes 47 seconds, including four server image builds. All seven services were healthy, and the storefront, shared hosting, health, and readiness endpoints returned HTTP 200.

The owner-requested **v0.1.0-alpha.5** upgrade completed on 2026-11-08
(Asia/Dhaka), commit `44000fef6f111ee1bedb01639ab4beb1a92abfad`, using the default
dedicated key and this launcher. It verified an encrypted alpha.4 backup,
applied migrations 47–58, replaced the four application containers, and passed
all seven service-health and four HTTPS checks. Independent verification found
58 completed migrations, no unfinished migration/hold, and the original database,
Redis and Mailpit containers retained. See the
[release acceptance](releases/v0.1.0-alpha.5.md#deployment-acceptance).

## Recovery hold after a failed or interrupted update

Command 230 changes the server script's failure policy. Once the encrypted backup
has been verified, it exclusively creates
`/srv/webhost-billing-staging/deployment-held` before stopping writers. The hold
records the candidate and protected rollback directory. Bash error traps are
inherited by functions and substitutions. Migration/ledger, release-switch and
candidate startup/health failures attempt to stop API, worker and scheduler and
retain the hold; they do not restore the old environment or restart old binaries.
PostgreSQL, Redis, Mailpit and unrelated stacks are not stopped or replaced.

The hold includes the stage, exit status and writer-stop result on handled
failures. An interrupted process can leave `status=in-progress`. If the stop
result is nonzero, shutdown has not been established: contain writes/consumers
manually. Any existing hold blocks another launcher attempt before Docker work.
The successful path clears its own hold only after all final checks pass.

Before clearing a hold, the authorized operator must:

1. Inspect the hold and protected rollback inventory, actual `current` symlink,
   environment/image references and service state. A failed switch can leave
   these at different checkpoints; do not assume the previous version is active.
2. Keep writers contained. Inspect trusted migration status/checksums and actual
   effects; preserve the failed database, logs and post-backup payment/provider
   evidence. Do not blindly resolve a migration or restore over the failed DB.
3. Record an explicit compatible roll-forward, verified old-binary compatibility,
   or isolated restore/cutover decision with matching images, keys and queue
   reconciliation. Use [backup and recovery](BACKUP_AND_RECOVERY.md).
4. Verify the selected schema/writers and approve resumption before removing
   the hold. Removing it alone is not recovery. If the candidate is already
   `current`, repeating the same launcher is intentionally rejected; complete
   the separately reviewed startup/recovery procedure instead.

Local fault tests and the populated alpha.4 upgrade are described in
[the rehearsal guide](BILLING_UPGRADE_REHEARSAL.md). They do not certify every
installed old image or replace a real pre-change backup.

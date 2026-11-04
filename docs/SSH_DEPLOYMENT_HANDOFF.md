# Webhost Billing SSH deployment handoff

The launcher updates the existing installation at my.speedhost.bd. It packages the exact Git commit you select, transfers it over SSH, and runs that commit’s server-side release script. Use it for an owner-authorized update after validating the candidate locally.

## Run an update

From the project folder in PowerShell, replace the placeholder with the full 40-character Git commit SHA.

```powershell
.\scripts\deploy-ssh.ps1 -Commit '<full-commit-sha>'
.\scripts\deploy-ssh.ps1 -Commit '<full-commit-sha>' -Apply
```

The first command is a read-only SSH preflight. The second uploads the commit, checks the archive digest on the server, builds the release, verifies an encrypted database backup, runs pending migrations, and checks service health.

The default key path is `~/.ssh/webhost_billing_46_250_239_221_ed25519`. The dedicated key was enrolled on 2026-11-04. Use `-IdentityFile '<path-to-an-authorized-key>'` to override the default. Keep private keys outside the repository. SSH host key checking uses the operator’s existing known-host entry.

## Verify the release

Check that the reported server commit matches the requested commit. Confirm that the storefront, `/health`, and `/ready` respond successfully. If the release fails, record the error and inspect the active release before trying again. The [deployment runbook](STAGING_DEPLOYMENT.md) describes the rollback procedure.

The read-only preflight passed against my.speedhost.bd using the default dedicated key on 2026-11-04. On 2026-11-04, the `-Apply` path deployed commit `fe21c19719a0c7cef461179048052756f1e52f04` in 13 minutes 47 seconds, including four server image builds. All seven services were healthy, and the storefront, shared hosting, health, and readiness endpoints returned HTTP 200.

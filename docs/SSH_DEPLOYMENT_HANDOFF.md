# Webhost Billing SSH deployment handoff

The launcher updates the existing installation at my.speedhost.bd. It packages the exact Git commit you select, transfers it over SSH, and runs that commit’s server-side release script. Use it for an owner-authorized update after validating the candidate locally.

## Run an update

From the project folder in PowerShell, replace the placeholder with the full 40-character Git commit SHA.

```powershell
.\scripts\deploy-ssh.ps1 -Commit '<full-commit-sha>'
.\scripts\deploy-ssh.ps1 -Commit '<full-commit-sha>' -Apply
```

The first command is a read-only SSH preflight. The second uploads the commit, checks the archive digest on the server, builds the release, verifies an encrypted database backup, runs pending migrations, and checks service health.

The default key path is `~/.ssh/webhost_billing_46_250_239_221_ed25519`. That name is reserved for the dedicated Webhost Billing identity. Until that key is enrolled, add `-IdentityFile '<path-to-an-authorized-key>'` to either command. Keep private keys outside the repository. SSH host key checking uses the operator’s existing known-host entry.

## Verify the release

Check that the reported server commit matches the requested commit. Confirm that the storefront, `/health`, and `/ready` respond successfully. If the release fails, record the error and inspect the active release before trying again. The [deployment runbook](STAGING_DEPLOYMENT.md) describes the rollback procedure.

The launcher’s read-only preflight was tested against my.speedhost.bd with an existing authorized SSH key. The `-Apply` path has yet to be exercised with this launcher.

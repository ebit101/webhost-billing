# Production Infrastructure Remediation

## Control status

- Command: Command 34 Remediation — Harden the Selected Shared Host
- Date: 2026-08-26
- Target: owner-selected shared host for the final Webhost Billing production deployment
- Public application hostname: `my.speedhost.bd`
- Preflight mode: read-only SSH with strict pinned-host-key verification
- Remediation status: **BLOCKED BEFORE MUTATION — CHANGE WINDOW AND RECOVERY INPUTS MISSING**
- Production effect: none

The owner authorized a bounded hardening command but did not supply the exact maintenance
window, provider-console recovery evidence, named infrastructure/rollback owners, source-IP
policy, or disposition of the unrelated public listeners discovered on the shared host.
Changing SSH, firewall, packages, Docker, swap, or resource policy without these values could
disconnect the only known operator or interrupt unrelated production applications. The safe
preflight therefore stopped before mutation.

This record contains no password, private key, token, recovery code, provider credential, or
customer data. It does not authorize Command 35 or production launch.

## Verified target and current state

| Control                      | Observed state                                                                   | Remediation implication                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Host identity                | `vmi3398336.contaboserver.net`; KVM; `my.speedhost.bd` resolves to audited IPv4  | Owner must supply exact provider account/server ID, region, plan and contract evidence   |
| Capacity                     | 11 GiB RAM, 7.2 GiB available; no swap                                           | Define a no-swap policy or approved swap size before memory remediation                  |
| Root filesystem              | 387 GiB total, 276 GiB used, 111 GiB free, 72% used                              | Monitoring is required now; release/backup growth must stop before the documented limits |
| Time                         | Synchronized                                                                     | Retain and monitor                                                                       |
| Updates                      | 43 packages pending from the installed package metadata                          | Requires reviewed package list, backup and maintenance/reboot window                     |
| Failed units                 | `cloud-init.service`, `systemd-networkd-wait-online.service`                     | Diagnose against provider/network behavior before disabling or repairing                 |
| Docker                       | Live restore disabled                                                            | Daemon changes can affect every container and require an all-application rollback plan   |
| Host firewall                | UFW inactive; IPv4 and IPv6 INPUT default to ACCEPT                              | Do not enable default deny until every listener and operator source is approved          |
| SSH                          | Root/password/key login enabled; X11 and TCP forwarding enabled; 12 root keys    | Requires console recovery, key ownership review and a tested non-password access path    |
| Production namespace         | No production root, container or volume exists                                   | Never relabel the fictional staging namespace                                            |
| Existing staging application | Seven healthy containers; web/API published only on loopback `19500`/`19600`     | Preserve while infrastructure gates are remediated                                       |
| Off-site recovery            | No approved immutable Webhost Billing destination or production restore evidence | Command 36 remains blocked                                                               |

## Listener ownership and preserve matrix

The firewall must be generated from an owner-approved matrix. Absence from this table is not
permission to close a port.

| Listener                         | Observed owner/use                                                | Current exposure | Required owner decision                                                      |
| -------------------------------- | ----------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| TCP `22`                         | Host OpenSSH                                                      | IPv4 and IPv6    | Approved operator source CIDRs/VPN and tested provider-console fallback      |
| TCP `80`, `443`                  | Host Nginx serving Webhost Billing and multiple unrelated sites   | IPv4 and IPv6    | Preserve globally unless every site owner approves a narrower edge           |
| TCP `3101`                       | Node process under `/opt/bd-rmg360/app`                           | All interfaces   | Name owner and choose preserve, loopback-behind-Nginx, source-limit or close |
| TCP `4180`                       | Node process under `/srv/whm-backupbee-public/...`                | All interfaces   | Name owner and choose preserve, loopback-behind-Nginx, source-limit or close |
| TCP `21115`–`21119`              | RemotePilot RustDesk host-network containers                      | All interfaces   | Name owner and approve exact RustDesk public TCP requirements                |
| UDP `21116`, dynamic UDP `48724` | RemotePilot RustDesk host-network containers                      | All interfaces   | Name owner and approve exact stable UDP/firewall requirements                |
| TCP `19500`, `19600`             | Webhost Billing staging web/API Docker proxies                    | Loopback only    | Preserve loopback-only; never allow publicly                                 |
| Other `127.0.0.1` listeners      | Multiple Nginx upstreams, databases, Redis, MongoDB and app ports | Loopback only    | Preserve; verify each owning service after any host change                   |

Nginx currently serves multiple unrelated public hostnames and proxies to numerous loopback
applications. RustDesk uses Docker host networking, so its listeners do not appear as normal
published Docker ports. A firewall allowlist based only on `docker ps` would be incomplete
and unsafe.

## Required approvals before mutation

The owner must supply all of the following in a protected operations record. Do not include
passwords or private keys in the response.

1. Exact provider, account/server ID, region, plan, monthly cost/cap, and confirmation that
   the provider account is owner-controlled with MFA.
2. Provider-console or rescue-mode access confirmation and the name of the person who tested
   it. This is mandatory before SSH or firewall changes.
3. Named primary infrastructure owner and named rollback owner with reachable private contact
   routes. One person may hold both roles only if a separate emergency access custodian is
   named.
4. Exact maintenance start/end in `Asia/Dhaka`, approved interruption tolerance, and the
   applications whose owners have acknowledged the window.
5. Approved SSH source CIDRs or the approved VPN/bastion. Dynamic residential access needs a
   deliberate alternative; it cannot be silently locked out.
6. Ownership and preserve/limit/close decision for TCP `3101`, `4180`, `21115`–`21119` and
   UDP `21116`/`48724`, including whether RustDesk's dynamic UDP port is expected to remain
   dynamic.
7. Approved root-key inventory: owner and expiry/revocation decision for each of the 12
   current public-key fingerprints. Do not send private keys.
8. Approved swap/no-swap policy, Webhost Billing CPU/memory limits, and minimum resource
   reserve for unrelated applications.
9. Approved patch/reboot window and a current provider snapshot or equivalent independently
   recoverable checkpoint.

## Staged remediation sequence

After the approvals above exist, execute each phase as a separate stop/checkpoint. Do not
combine them into one shell script.

### Phase A — Recovery and evidence

1. Verify provider-console/rescue access from an independent session.
2. Capture current SSH, firewall, routes, listeners, units, container IDs/health, Nginx
   validation, DNS/TLS, disk/memory and application health without secret values.
3. Create the approved provider snapshot/checkpoint and record only its non-secret ID/time.
4. Prepare exact rollback files and commands for only the settings to be changed.

### Phase B — Production operator boundary

1. Generate a production-only Ed25519 deployment key on the trusted operator host, with a
   purpose-specific comment and protected permissions.
2. Add—not replace—the key through the existing verified session.
3. Prove a second independent login with strict host-key checking.
4. Only after console and key verification, disable SSH X11, restrict forwarding as approved,
   reduce authentication attempts, and disable password/root-password access according to the
   owner-approved operator model.
5. Keep the original verified session open through the rollback test.

### Phase C — Firewall

1. Create IPv4/IPv6 rules from the signed listener matrix and operator source policy.
2. Apply a reversible timed rollback guard before changing default policy.
3. Prove SSH from an allowed source, every retained public TCP/UDP service, Nginx sites,
   loopback-only application ports, DNS resolution and outbound dependencies.
4. Cancel the rollback guard only after the rollback owner independently confirms access.

### Phase D — Capacity, Docker and patching

1. Create only the approved swap/no-swap control and resource limits.
2. Make Docker live-restore changes only if the shared-host owner accepts daemon-level impact.
3. Create/verify the approved checkpoint, review held/removed/reboot-requiring packages, then
   patch inside the approved window.
4. Reboot only when explicitly authorized and provider console recovery is proven.
5. Validate all host units, every container ID/health/restart count, every Nginx site,
   RustDesk, Node processes, databases, certificates and Webhost Billing role smoke tests.

## Stop conditions

Stop and roll back the current phase on any target/fingerprint mismatch, console-recovery
failure, loss of a verified SSH path, unknown listener owner, changed unrelated container,
failed Nginx validation, public-site regression, database/cache failure, unexpected package
removal, disk pressure, time loss, Webhost Billing health/role failure, or inability to prove
IPv4 and IPv6 behavior.

## Current decision

No mutation was performed. The shared host remains selected but `NO-GO`. Resume this
remediation only after the required approvals are supplied; then re-run the preflight because
listener and package state can change. Command 35 production secret generation remains
blocked until the operator, recovery, and host-access boundaries pass.

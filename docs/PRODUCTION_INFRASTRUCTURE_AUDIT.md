# Production Infrastructure Audit

## Control status

- Command: 34 — Select and Audit Production Infrastructure
- Audit date: 2026-08-26
- Audit mode: Read-only SSH with strict pinned-host-key checking
- Owner-selected target: Current shared host for personal, low-traffic use
- Application hostname: `my.speedhost.bd` using one same-origin web/API edge
- Audit verdict: **BLOCKED — NOT READY FOR PRODUCTION PROMOTION**
- Production mutation performed: **None**

The separately authorized Command 34 remediation preflight is recorded in
`docs/PRODUCTION_INFRASTRUCTURE_REMEDIATION.md`. It found additional exact listener and SSH
key ownership requirements and stopped before mutation because the maintenance window,
provider-console recovery, named owners, source policy, and unrelated-service decisions were
not supplied. This audit therefore remains blocked.

The owner explicitly chose the current server instead of a separate VM/VPS and accepted that
Webhost Billing will share host resources with important applications. This exception removes
the dedicated-host selection requirement for this private low-traffic deployment only. It
does not waive security, recovery, resource-isolation, owner, or final `GO` gates, and it is
not authorization to promote staging or deploy production.

## Target identity

| Field                     | Audited value/status                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Forward DNS               | `my.speedhost.bd` resolved to IPv4 `46.250.239.221`                                                                                                                            |
| IPv6                      | `2407:3640:2339:8336::1/64` is assigned; no production AAAA decision is approved                                                                                               |
| Static server hostname    | `vmi3398336`                                                                                                                                                                   |
| Reverse DNS               | `vmi3398336.contaboserver.net`                                                                                                                                                 |
| Virtualization            | KVM/QEMU x86-64 guest                                                                                                                                                          |
| Provider/network evidence | PTR suggests Contabo; RIPE RDAP reports a YorkshireTech sub-allocation. Exact provider account, server ID, region, plan, recovery controls, and monthly cost were not supplied |
| SSH host key              | Independently pinned ED25519 fingerprint `SHA256:vCGqd2qZm9F2pbmEExLiIRrRSf9ybTW4YQT8arY7BPg`                                                                                  |
| Audit key                 | Existing app-specific staging deployment key, public fingerprint `SHA256:0A9KqXLccs5hGeOae9cdsFGZRukdneMhrG/L4VmHVAc`                                                          |
| Production deployment key | **BLOCKED:** a new production-only key and revocation record do not exist                                                                                                      |
| Infrastructure owner      | **UNRESOLVED:** owner selected the host but did not provide the accountable person's name/contact                                                                              |
| Rollback owner            | **UNRESOLVED:** no named decision authority/contact                                                                                                                            |
| Approved cost             | **UNRESOLVED:** existing plan and monthly cost/cap were not supplied                                                                                                           |

No private key, password, machine ID, boot ID, provider credential, customer record, or
secret value is stored in this report. The target was reached only through the previously
pinned application-specific SSH boundary.

## Platform and capacity inventory

| Area             | Read-only evidence                                                                | Assessment                                                                      |
| ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Operating system | Ubuntu 24.04.4 LTS, kernel 6.8.0-106                                              | Supported; Ubuntu lists standard security maintenance through May 2029          |
| CPU              | 6 virtual AMD EPYC cores                                                          | Adequate for current low-traffic shared workload; not reserved for this app     |
| Memory           | 11.68 GiB total, 4.5 GiB used, 7.2 GiB available at sample time                   | Adequate current headroom; no app-specific reservation                          |
| Swap             | None                                                                              | **BLOCKED:** no emergency memory buffer on a shared database host               |
| Root disk        | 387 GiB usable, 274 GiB used, 113 GiB available, 71% used                         | Conditional; already near the proposed 75% warning threshold                    |
| Inodes           | 18% used                                                                          | Healthy                                                                         |
| Guest filesystem | ext4 root; no LUKS/dm-crypt layer visible                                         | **BLOCKED:** provider/storage encryption and snapshot protection are unverified |
| Time             | NTP active and synchronized; RTC in UTC; host presentation timezone Europe/Berlin | Technically sound; operations must account for app business timezone Asia/Dhaka |
| Docker           | Engine 29.6.2, Compose 5.3.1, overlayfs, cgroup v2/systemd                        | Supported; `live-restore` is disabled and upgrades are pending                  |
| Uptime/load      | 61 days uptime; sampled load 2.18/1.16/0.93                                       | No immediate load pressure; one sample is not a capacity test                   |

The seven Webhost Billing staging containers used approximately 680 MiB at the sample point.
The app's worker briefly used the most CPU in its project, while unrelated Nodewatch services
also showed material CPU use. Point-in-time statistics do not prove peak migration, backup,
PDF, renewal, SMTP, or provider-callback capacity.

### Shared workload

The server is not dedicated. It ran 20 containers at audit time:

- 7 Webhost Billing staging containers;
- 5 Nodewatch Pilot containers; and
- 8 RemotePilot production/test containers.

Host Nginx, MongoDB, PostgreSQL, Redis, Node processes, and RustDesk listeners also exist.
Multiple Docker networks, persistent database volumes, host certificates, and public domains
belong to unrelated applications. A host outage, disk exhaustion, root compromise, Docker
daemon failure, Nginx error, firewall mistake, or provider recovery event can affect all of
them.

## Operating-system and patch posture

- Ubuntu 24.04 LTS remains in standard support. Source:
  [Ubuntu release cycle](https://ubuntu.com/about/release-cycle).
- `unattended-upgrades` is enabled and active; the daily upgrade service completed recent
  runs, but repeatedly logged a network-wait timeout before continuing.
- 43 packages were upgradable from the current package indexes, including Docker Engine,
  Compose, containerd, MongoDB, Python, Kerberos, `fwupd`, and system utilities.
- `cloud-init.service` and `systemd-networkd-wait-online.service` were failed at audit time.
- Docker live-restore is disabled, so an unplanned daemon restart can affect every container.
- No package update, service restart, reboot, daemon change, or failed-unit reset occurred.

Updates require an owner-approved shared-host maintenance window, a complete application
inventory, current backups, provider recovery evidence, staged version review, and health
checks for every unrelated application before and after the work.

## Network and firewall inventory

### Current exposure

- Host Nginx owns public TCP 80/443 and its configuration passed `nginx -t`.
- SSH listens publicly on IPv4 and IPv6 TCP 22.
- Unrelated services also listen publicly on TCP 4180, 3101, and 21115–21119 plus UDP 21116
  and a high UDP port. Their ownership and exposure must be reviewed with their application
  owners before any host-wide rule change.
- Webhost Billing web/API bind only to loopback TCP 19500/19600. Its PostgreSQL, Redis, and
  Mailpit ports are private to Docker networks.
- UFW is inactive. The nftables/iptables `INPUT` policy accepts traffic and contains no
  host-level allowlist. Docker supplies forwarding/NAT isolation only.
- A provider/cloud firewall could not be verified from inside the guest.
- IPv6 has a public address and default route; parity with any future IPv4 rules is mandatory.

### SSH posture

Effective SSH configuration allowed root login, password authentication, X11 forwarding,
and TCP forwarding. Public-key authentication is enabled. This is not an acceptable final
administrative boundary for a billing application with customer and future provider data.

### Required inbound plan

Do not apply this plan without a separately authorized shared-host change window and exact
inventory of every existing public service:

| Traffic                  | Proposed policy                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| TCP 80/443               | Allow globally to host Nginx; route `my.speedhost.bd` only to the app's loopback listeners        |
| TCP 22                   | Allow only approved administrator/VPN source addresses, with tested provider-console recovery     |
| Web/API 19500/19600      | Loopback only; never public                                                                       |
| PostgreSQL/Redis/Mailpit | Docker-private only; never host-published                                                         |
| Existing public ports    | Retain only after named owner, purpose, source scope, IPv4/IPv6 rule, and monitoring are recorded |
| All other inbound        | Default deny at provider firewall and host firewall, with IPv4/IPv6 parity                        |

### Required outbound plan

- Allow DNS and NTP to approved resolvers/time sources.
- Allow HTTPS for operating-system/image retrieval, SMTP-provider API if selected, public
  application dependencies, and monitored certificate operations.
- Add only the exact authenticated SMTP destination/port selected in Command 37.
- Manual-first payments require no bKash/SSLCOMMERZ production egress.
- Manual-first hosting requires no WHM egress or token.
- A later provider command must add the exact gateway/WHM destination policy before enabling
  credentials; broad unrestricted provider authority is not implied.
- Preserve required unrelated-app egress only after its owner and destinations are reviewed.

## Application and TLS evidence

- The current deployment is still `webhost-billing-staging` at release `b2b2d61`; it is not
  the current Git release or a production data set.
- All seven project containers were healthy with no reported restart loop.
- Local API liveness and PostgreSQL/Redis readiness passed.
- Public `https://my.speedhost.bd/health` passed.
- Host Nginx validation passed; Nodewatch and RemotePilot public edges returned redirects,
  confirming the edges responded without asserting their authenticated business health.
- The Let's Encrypt certificate for `my.speedhost.bd` was valid through 2026-11-24, and the
  Certbot timer is active. Certificate renewal still needs scoped monitoring.
- No DNS, certificate, Nginx, Docker, Compose, volume, image, container, or app setting was
  changed.

## Backup and recovery evidence

- One encrypted Webhost Billing staging PostgreSQL artifact and checksum/metadata sidecars
  exist on this same host from Command 31.
- No Webhost Billing recurring backup timer/cron job was found.
- No off-site/immutable object, provider snapshot/backup policy, retention execution, or
  independent restore drill was evidenced.
- No host-level backup tool was identified through the bounded command/path checks.
- Same-host ciphertext is useful rollback evidence but does not survive account loss, host
  disk loss, ransomware/root compromise, or provider deletion.

Command 36 must establish off-site immutable backups and prove isolated restoration before
this target can store production business records.

## Capacity and isolation plan

These are initial guardrails for a personal, low-traffic deployment, not measured sizing:

1. Keep Webhost Billing in its own Compose project, directories, networks, volumes, secrets,
   loopback ports, queue prefix, database, backup namespace, and release symlink.
2. Define and validate explicit container CPU/memory reservations/limits that leave capacity
   for every existing application; do not infer safety from current idle use.
3. Maintain at least 100 GiB and 25% root-disk free space. Alert at 75%, page at 85%, and stop
   release/backup growth before 90%. Current usage is already 71%.
4. Provide a reviewed swap or equivalent memory-failure policy; investigate rather than
   masking sustained memory pressure.
5. Alert on host memory, load, disk/inodes, Docker/process health, database/Redis readiness,
   queue/outbox failures, backup age, certificate age, clock drift, and all unrelated critical
   applications.
6. Keep exactly one production scheduler and start it only after the first-renewal gate.
7. Never use Docker prune, global Compose down, host-wide container stop/restart, broad Nginx
   replacement, or unreviewed firewall reload on this shared host.

## Blocking findings and remediation ownership

| Finding                | Status / required evidence                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared host            | Owner accepted the architecture risk for personal low traffic; final launch record must name the owner and explicitly accept cross-application availability/security impact                     |
| Provider identity/cost | Exact provider account, server ID, region, plan, monthly cost/cap, backup/recovery controls, and infrastructure owner remain missing                                                            |
| Production SSH         | Create a new production-only key, install it through a controlled window, verify fingerprint/access, define revocation, then remove password/root exposure only after recovery access is proven |
| Firewall               | Inventory all unrelated listeners/owners, configure provider plus host default-deny rules with IPv4/IPv6 parity, and test every app/rollback path                                               |
| Patch state            | Review/apply 43 updates in a shared maintenance window; investigate failed cloud-init/network-wait units; prove every app healthy afterward                                                     |
| Disk/memory            | Add monitoring and resource limits, keep disk below thresholds, and approve a no-swap remediation/failure policy                                                                                |
| Encryption             | Obtain provider evidence for at-rest encryption, snapshot encryption, account MFA, deletion protection, and recovery controls                                                                   |
| Recovery               | Configure immutable off-site backups, separate passphrase/key custody, and a timed isolated restore                                                                                             |
| Owners                 | Name infrastructure, rollback, backup/recovery, security, and incident primary/backup owners                                                                                                    |
| Production topology    | Review a same-origin shared-edge production override; do not overwrite or silently relabel the fictional staging database                                                                       |

## Decision

The target has enough observed CPU, RAM, disk, and supported Docker capability for the stated
low-traffic use, and the existing isolated staging deployment demonstrates coexistence.
Nevertheless, the target identity gate remains **BLOCKED**. Production promotion/deployment
must not start until the table above has evidence and the final release audit returns `GO`.

The current staging application remains unchanged and available at `my.speedhost.bd`. This
audit authorizes no production secret creation, provider credential, real customer data,
package install/update, firewall/SSH change, backup mutation, DNS/TLS change, or application
promotion.

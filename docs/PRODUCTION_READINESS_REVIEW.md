# Production-readiness review

## Decision and scope

- Review: Command 158, started 2026-10-31 (Asia/Dhaka).
- Source baseline: `8b1235222c8311a2029b8ffd6ee1a33704525aba`, plus this command's validated recovery and runtime dependency repairs.
- Installed staging release: `6e5856facabdfa336fff697dae622b63f6610cdd`.
- Production decision: **NO-GO**. A closed source defect is not a passed operating gate.
- Owner-selected first-launch direction: bank payments with controlled WHM and registrar API actions.
- Primary operating role: Super admin, mapped to the existing full-administrator role. The owner selected the saved administrator email for alerts; its address remains protected. No new role, privilege or alert send is created. Named backup operator, delivery configuration/test and recovery contacts remain unconfirmed.
- The owner reports on-server backups only. Managed independent storage, immutability and independent secret escrow are not established.

The owner substituted this review for the previously suggested Command 158 bank
reconciliation. A particular unpaid trial invoice is not a launch-readiness gate:
leave it unchanged. Future real payments still require genuine receipt verification.
This command does not authorize a production promotion, hosting/domain mutation,
registrar charge, customer message, SSH/firewall change or provider activation.
SMTP remains active and payment, real hosting, registrar and WhatsApp remain disabled.

## Current evidence

The read-only shared-host audit observed seven healthy services, no application
restarts, 39 completed migrations and none unfinished, mode 0600 for the staging
environment, synchronized system time and a certificate expiring on 2027-01-23.
The host reported six CPUs, approximately 3.2 GiB available memory and 43 GiB free
storage at the observation time. These are availability observations, not reserved
resources or a customer-capacity benchmark.

The latest backup was 30,228 seconds old at the initial audit, exceeding the documented
six-hour recovery-point target. A fresh encrypted backup was then created and verified,
with all 37 monitored business-table fingerprints unchanged. One fresh snapshot does
not establish recurring backup success, independent storage or disaster recovery.

Host-access hardening is not accepted and container resource budgets are not assigned.
The protected audit retains exact effective access-policy and resource findings;
do not publish live access weaknesses or unrelated-service details. The existing
shared-host exception does not waive these findings. Preserve unrelated services and require verified
console access, named SSH identities, source policy and a maintenance/rollback plan
before changing host access or resource allocation.

Detailed private outputs and identifiers remain outside Git under the protected
Command 158 acceptance directory. Public reports contain no credentials, customer
records, raw provider payloads or personal alert destinations.

## Gate register

| Gate                                      | Current assessment                                        | Evidence and remaining closure                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application source and billing boundaries | Implemented; production acceptance separate               | Existing protected CI covers billing, authorization and fake-provider workflows. Command 156 passed 62 related API cases; payment and fulfillment remain separate.                                                                                                                                                                  |
| Release/schema recovery checks            | Source repair validated locally                           | All 56 tables and exact trusted release migrations are required. Eight unit cases and the actual encrypted drill passed, including missing newer tables, equal-count alteration, changed/unfinished migrations and destructive-target refusals. Protected CI is required for delivery.                                              |
| Current encrypted server backup           | Verified snapshot; schedule still open                    | Fresh encrypted checksum, OpenPGP integrity and archive checks passed. Prove an automated cadence, failure alert and approved retention before closing the recurring-backup gate.                                                                                                                                                   |
| Independent backup and secret recovery    | Interim copy/retrieval passed; operating gate open        | Encrypted snapshot copied to a restricted Office PC directory without its passphrase, retrieved and restored successfully. Managed immutable retention, recurring copies and independent key recovery are not established.                                                                                                          |
| Timed restoration                         | Database-only restoration passed; full RTO open           | Retrieved snapshot restored in 14 seconds into a temporary container with no network or published ports; all 56 table contents and 39 migrations matched. Workers/providers stayed off and the container was removed. Core billing access, keys/configuration/images/DNS and operator recovery within four hours remain unmeasured. |
| Renewal lifecycle                         | Fictional acceptance passed; production supervision open  | One API case and seven worker/calendar/scheduler cases passed, including invoice/reminder/suspension/payment/reactivation, concurrent scheduler replay and time boundaries. Actual eligible services, the first supervised run and genuine provider outcomes remain unapproved.                                                     |
| WHM operations                            | Partial                                                   | An earlier controlled account-creation trial and mail/DNS preservation checks passed. Production credential scope, egress and controlled failure/suspend/reactivate/reconciliation acceptance remain before live operation. No new hosting action is submitted here.                                                                |
| Registrar operations                      | Partial                                                   | Saved-account read compatibility and existing-domain ownership/linking were verified earlier. Registration, paid renewal and remote management actions still need exact disposable targets, consent, charge ceilings and separately authorized acceptance. Existing-domain billing does not itself register or renew.               |
| Bank payment process                      | Implemented; operator evidence required for real receipts | Use verified bank credits and duplicate-reference controls. Fictional samples are not real bank evidence. Online payment gateways may remain disabled for the selected launch mode.                                                                                                                                                 |
| SMTP and communication                    | Partial                                                   | Selected staging messages were accepted and customer verification was reported successful. Production SPF/DKIM/DMARC, sender reputation, quotas, bounce handling, rotation and incident delivery still require evidence. No test message is sent in this review.                                                                    |
| Monitoring and incident alerts            | Open                                                      | Health/readiness and an administrator operational view exist. Super admin and the saved admin email are owner-selected; an independent monitor, confirmed recipient mapping, tested delivery, escalation and backup contact are not established.                                                                                    |
| Shared-host security and capacity         | Blocked                                                   | Protected host-access findings need remediation, resource budgets are unset and the global domain inventory stops at 100 records. Confirm console recovery and unrelated-service ownership before access changes; do not infer production limits from a read baseline.                                                              |
| Production separation and release         | Open                                                      | Approve target, independent secrets/database/queues, compatible rollback images, final source/image digests, vulnerability review and cutover. Do not silently promote seeded staging accounts or reuse staging secrets.                                                                                                            |
| Business policies and staffing            | Partial                                                   | D1–D4 were accepted and staging billing identity/instructions were configured. D5–D8, lawful retention, named primary/backup contacts, maintenance/incident communication and final sign-off remain open.                                                                                                                           |

## Local closures

The old archive inventory checked only the early application tables. Later domain,
notification, catalogue and combined-order history could be absent without being
explicitly rejected. The restored-database check accepted a broad table minimum and
any nonzero completed migration count. The comparison checked counts and migration
names, allowing changed row contents with the same counts to escape detection.

Recovery now targets the matching source release: a complete table inventory, exact
applied/source migration checksums and no unfinished migration. Source and recovered
databases are fingerprinted through read-only repeatable-read transactions. Only
SHA-256 row hashes leave PostgreSQL for comparison; duplicate rows remain significant,
and customer contents are not written to comparison files. Historical backups must
be checked with their matching release sources, not relabelled as the current schema.

The inventory is checked against both Prisma models and the database verifier. The
existing fictional recovery drill is extended to reject missing notification and
combined-order tables, equal-count row alteration, changed/unfinished migrations,
source-database targeting and replacement of an existing recovery database. Its GnuPG
home and cleanup paths are isolated. CI runs this actual backup/restore acceptance,
in addition to the fast inventory regression tests. Final results are recorded in
[the command report](PROGRESS.md).

The production dependency audit also found the moderate
[qs comma-serialization advisory](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw).
Updated only the existing qs override from 6.16.0 to the upstream fixed 6.16.1 and
its lockfile references. Three new runtime-consumer regression cases cover the
actual Express/body-parser resolution, hostile/null-prototype serialization and
normal query compatibility. All 18 tooling/runtime security cases and a frozen
install pass; `pnpm audit --prod` reports no known vulnerabilities at this review.
That audit result does not cover installed staging or all development dependencies.
No application image was deployed; rebuild and verify the final reviewed release
before claiming the installed environment includes this repair.

The separate all-dependency audit reports 11 development/build findings: two high,
seven moderate and two low. The high paths include
[Vite's Windows editor integration](https://github.com/advisories/GHSA-587h-7wmj-h5pm)
and [Zod collection validation](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
through the lint toolchain. Runtime shared Zod is already pinned to 4.6.6; the
production-only audit is clear. Other affected tools include Vitest's mocker,
minimatch, glob and deepmerge. These findings are unresolved, not waived by existing
tooling patches or a passing high-severity production-only audit. Keep development
servers private and review compatible fixes rather than forcing incompatible major
versions through all consumers. Remediation and full toolchain regression acceptance
are the next recommended command before returning to the domain inventory work.

## Workload assessment

The owner targets 200 customers and explicitly allows multiple services per customer.
For assessment, use a fictional profile of 200 customers with one to five services
and domains each (600 of each), plus two administrator sessions. These volumes and
staff concurrency are test assumptions, not owner-approved production limits.
Billing record capacity and a WHM server's licensed/account capacity are separate.
Do not raise an actual server limit to make a billing benchmark pass.

The installed global domain endpoint takes at most 100 rows and expands detail for
each row, including additional database reads and decryption. It has no complete
global pagination/count/search contract. Customer scoping occurs before the bound,
but the global inventory cannot present all domains in this profile. This functional
gap blocks full inventory acceptance regardless of observed response latency.

An internal-only, resource-capped laboratory uses the existing installed API artifact,
a new disposable database/Redis pair, fictional records, two synthetic authenticated
administrators, preview mail and disabled provider networking. It mounts no staging
secrets or customer data and starts no worker/scheduler. Its result is a read baseline;
it does not test public browser load, renewal batching, writes, provider latency or
production saturation. Retain protected results and cleanup evidence with the command.

The baseline passed 329 authenticated GETs with zero HTTP errors. All 200 customers
and 600 services were reachable through their pages, and all 600 domains were checked
through their owning client scopes. The two-session measurement covered 120 reads:
median 97.99 ms, p95 366.08 ms and maximum 492.20 ms. The global domain response returned
only 100 of 600 records, so inventory acceptance is **blocked**. No provider operation,
email attempt or outbox event was added. These figures describe one short API-only
read run under laboratory limits, not a throughput, write-load or production guarantee.

## Operating acceptance still required

Use Super admin as the primary role and the selected saved administrator email without
inventing a backup person or sending an alert during review. Confirm the recipient mapping
privately and supply backup recovery/incident contacts before testing delivery.
Use the existing [alert policy](OBSERVABILITY.md#alert-policy)
for liveness/readiness, stuck queues/outbox, uncertain provider outcomes, failed renewal,
email and backup-age escalation.

The owner reconfirmed on-server storage; no recurring independent destination was supplied.
Choose approved independent backup storage and key escrow. Document retention and
retrieval ownership; measure restore from that stored copy with workers and provider
dispatch closed. A copy stored next to its only passphrase does not survive complete
host loss. Keep the existing six-hour RPO/four-hour RTO as documented targets, not
as measured production achievements.

Complete the shared-host remediation using the [existing approval and rollback
procedure](PRODUCTION_INFRASTRUCTURE_REMEDIATION.md). Do not narrow the host firewall,
disable SSH methods, restart shared infrastructure or impose guessed memory limits
without console recovery, named access and an approved allocation. Match a later
load test to the owner's intended account/domain and concurrent-operator volume.

Use separately authorized disposable provider targets and explicit costs/actions.
There is no need to pay a particular staging invoice to finish this review. Do not
adopt a sample payment, change current websites/mail/DNS, or create duplicate hosting
to manufacture a passing acceptance result.

The [production launch runbook](PRODUCTION_LAUNCH_RUNBOOK.md) remains the final
checkpoint procedure. Each open gate needs actual evidence and an owner before a
new go/no-go decision; this review is not deployment authorization.

# Independent backup and recovery acceptance

Command 162 requires an owner-approved independent destination, recovery operators
and secure key recovery. It does not authorize paid storage, a production launch,
provider activation or restoration over the active database. Exact destinations,
contacts, credentials and operational evidence stay outside Git.

## Owner decisions and WHMCS reference

On 2026-11-01 the owner confirmed that no off-site destination is available,
requested the WHMCS backup model and could not confirm independent key escrow.
No backup operator beyond the recorded primary role/contact was supplied.
Independent recovery acceptance therefore remains open. A software workflow does
not establish a destination, operator access or recoverable keys.

[WHMCS documents](https://docs.whmcs.com/9-0/system/database-and-storage/database-backups/)
scheduled database backups, manual downloads and configured SFTP/FTP or email
delivery. Remote connections must pass a test before activation. Its configuration
encryption hash must also be retained securely for encrypted-data recovery. The
cPanel account-backup option requests a backup but does not verify completion or
transfer it. Email attachment delivery can fail as databases grow.

For this Docker/PostgreSQL installation, retain the encrypted PostgreSQL archive
and existing six-hour recovery-point target. A future approved SFTP workflow must
verify retrieval and independent decryption, not merely connection or upload
success. Keep remote delivery inactive until its destination and access are
approved. Do not email database archives, activate a WHM connection or assume a
cPanel account backup covers this installation. Active application SMTP is not
authorization to send backups.

The owner chose configuration of the existing encrypted backup scripts only.
The reviewed [host schedule configuration](BACKUP_AND_RECOVERY.md#optional-host-schedule-for-existing-scripts)
uses the verified creation script with a six-hour systemd timer and overlap lock.
No administrator page, remote delivery or automatic retention deletion is added.
After local validation and host-specific review, Command 162 installed the
configuration on staging, verified one fresh encrypted backup and enabled the
timer. No application deployment, remote delivery or archive deletion occurred.
This first manual run does not prove an observed recurring/off-site cadence,
independent restoration or full application recovery.

## Acceptance gates

| Gate                     | Required evidence                                                                                                                                                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Destination and access   | Owner-approved storage outside the staging host, restricted access and an independently recoverable read identity. Record who can overwrite or delete copies and which retention protections actually apply.                                                                                                         |
| Backup point             | Fresh encrypted backup from the matching installed source, complete release table inventory, trusted completed migrations and no unfinished history. Capture a stable read-only source fingerprint around the dump; do not compare a later changing live database as if it were the same snapshot.                   |
| Transfer                 | Copy ciphertext, checksum and advisory metadata only. Verify the destination copy by retrieval and SHA-256 comparison; object names or a successful upload alone are insufficient.                                                                                                                                   |
| Independent key recovery | Retrieve the backup passphrase from owner-controlled independent escrow, without falling back to the staging host. Never put it in chat, Git, logs or the archive directory. Application encryption/session keys require their own verified recovery for full application acceptance.                                |
| Isolated restoration     | Restore the retrieved archive into a new, explicitly identified disposable target. No active database overwrite, published port, external network, worker, scheduler, SMTP delivery or live provider. Verify exact release tables/migrations, relationships, financial arithmetic and full row-content fingerprints. |
| Recovery timing          | Record retrieval, verification and database restoration times separately. A database-only result does not establish recovery of billing access, keys, configuration, application images or the four-hour application recovery objective.                                                                             |
| Operating continuity     | Demonstrate the approved cadence, retention, restricted deletion and recovery after a missed/failed run. A manual Office copy does not demonstrate an always-available recurring destination, immutable retention or the six-hour recovery-point objective.                                                          |
| Operators and alerts     | Confirm the primary and backup operators and their independent access. Prepare the failure-alert recipient and payload; obtain explicit authorization before sending an alert. Record tested delivery separately from configured contact details.                                                                    |
| Preservation and cleanup | Keep staging release, environment, logo, business records, providers and unrelated services unchanged. Remove only exact-identity disposable drill resources and retain protected audit evidence.                                                                                                                    |

## Execution order

1. Obtain the destination, access/retention policy, operators and key-escrow facts.
2. Inspect existing destination permissions and recovery access without changing them.
   Prepare any proposed irreversible retention or permission change for owner review.
3. Verify a fresh encrypted backup and its source-release fingerprint. If source
   rows change while capturing the backup point, retain the valid archive and
   establish a new consistent reference; do not erase the evidence or rewrite history.
4. Copy and retrieve the artifact through the approved independent destination.
5. Verify integrity and decrypt using independent escrow, then restore only into
   an isolated disposable target with all outward delivery and providers absent.
6. Compare all release tables and full row contents to the backup-point reference.
   Retain failure diagnostics and any surviving failed target; do not retry or
   overwrite an unexplained result. The restore runbook's owned-target failure
   cleanup rules still apply.
7. Validate the approved recurring schedule, retention and operator recovery path.
   Send a failure-alert test only after the exact recipient/message is authorized.
8. Recheck staging preservation, clean up owned drill resources and publish only
   sanitized results and unresolved gates in the command report.

## Existing evidence and limits

Command 158 proved an encrypted Office PC copy, retrieval and an isolated database
restore matching 56 tables and 39 migrations. It did not verify independent key
escrow, immutable storage, recurring off-site copies or a backup operator. Command
161 installed the validated recovery checks and verified fresh same-host backups;
that deployment did not close the independent recovery operating gates.

The Command 162 read-only preflight confirms the prior encrypted Office artifact
still matches its recorded checksum and its directory has inheritance disabled.
Staging remains healthy with SMTP active and other live providers disabled. No
project-named backup cron entry or systemd timer was found by the bounded check;
external jobs, provider snapshots and jobs with unrelated names remain unverified.
The later staging service configuration passed its first manual encrypted backup
and now has an enabled six-hour timer. Its protected host evidence confirms the
environment, passphrase, logo, container identities and 37 monitored business-table
fingerprints are preserved, with SMTP active and other providers disabled. No
recurring trigger has yet been observed. No new destination, credential, retention
policy or key escrow is approved by this document. Production remains NO-GO until
the applicable operating gates are closed.

Use [the recovery runbook](BACKUP_AND_RECOVERY.md) for exact source/restore guards
and [the readiness review](PRODUCTION_READINESS_REVIEW.md) for the remaining launch
requirements. A partial result must keep its remaining gates open explicitly.

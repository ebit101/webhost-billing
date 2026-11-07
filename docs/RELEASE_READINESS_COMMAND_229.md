# Accumulated release readiness and operator actions

Reviewed on 2026-11-07 (Asia/Dhaka), under Command 229. This is a source and
recorded-evidence review. It does not publish, tag, deploy, connect a provider,
inspect a production database or establish current server readiness.

## Decision and exact source

**Hold deployment of the accumulated batch.** Focused local acceptance supports
the implemented features, but a complete upgrade from the published baseline,
migration-failure containment and final-candidate validation are still required.
Real online payments, registrar purchases, support email and attachment intake
retain their separate activation gates. Manual payment operation does not depend
on enabling those optional integrations.

| Item                             | Evidence at this review                                                                                                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Published baseline               | GitHub `main` was read with `git ls-remote`: `24af57553937574dc4f0c12cd1b0be2078ba7ed7`, matching local `origin/main` and tag `v0.1.0-alpha.4`.                                                                                          |
| Reviewed local candidate         | `5aa33a8c92d66e3f253e27d7e3fb19b51c4443a5`, before this documentation command. Clean tracked working tree at review start.                                                                                                               |
| Unpublished implementation batch | 22 commits, 239 changed files; Commands 205, 208 and 210–228, including Command 225's earlier recovery prerequisite. This review's documentation commit is additional.                                                                   |
| Release metadata                 | All eight root/workspace manifests remain `0.1.0-alpha.4`; no tag points to the candidate. `CHANGELOG.md` has an empty Unreleased section and no release entry for the accumulated features.                                             |
| Database boundary                | Published baseline: 46 migrations, 60 application tables plus the migration ledger. Candidate: 58 migrations, 74 application tables plus the ledger. Twelve migrations are added; no published migration Git blob was edited or removed. |
| Installed target                 | Not inspected by Command 229. A published tag, local Docker health or historical deployment receipt does not prove what is running there today.                                                                                          |

Counts describe the implementation candidate above, not a future tagged release.
The existing alpha.4 changelog and immutable tag remain historical release facts.
Select a new release number only when the owner authorizes release preparation.

## Recorded acceptance and its limits

The [progress log](PROGRESS.md) contains each command's executed checks. These
are retained evidence, not tests rerun by this documentation review.

| Area                                                  | Recorded local evidence                                                                                                                                                                                                     | Remaining boundary                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add-on cancellation follow-up, Commands 205/208       | Admin views, purchased price/end date, concurrent acknowledgement and guarded Chromium acceptance.                                                                                                                          | Staff acknowledgement records manual work; it neither removes resources nor proves provider shutdown.                                                                                                                                                  |
| Plan changes, Commands 210–212                        | Integer proration; 13 upgrade/downgrade database cases in Command 212, frontend/contracts and guarded browser journeys.                                                                                                     | Same-server/cycle pilot restrictions remain. Downgrades need due-date capacity/add-on review; no mid-period credit or automatic refund. See [plan changes](HOSTING_PLAN_CHANGES.md).                                                                   |
| Domain facts, billing and execution, Commands 213–215 | Owned observations, invoice/reminder retries, paid approval, lost-reply recovery and isolated browser/API acceptance. Commands 227/228 extend legacy-term and attribution coverage.                                         | Genuine eligibility/balance and provider outcomes are not accepted. See [facts](DOMAIN_FACT_SYNCHRONIZATION.md), [billing](DOMAIN_RENEWAL_BILLING.md) and [paid execution](PAID_DOMAIN_RENEWALS.md).                                                   |
| Support, Commands 216–218                             | Department/MFA isolation, screened private files, retention and signed/deduplicated fictional email imports. Command 218 records 57 API cases across six suites.                                                            | Real scanner signatures/connectivity and trusted MIME/sender-verifying gateway acceptance remain open. See [departments](SUPPORT_DEPARTMENTS.md), [attachments](TICKET_ATTACHMENTS.md) and [email replies](SUPPORT_EMAIL_REPLIES.md).                  |
| SSLCOMMERZ, Commands 219–221                          | Command 220 records 58 API, 43 unit and 50 UI/helper cases using mocked responses; activation/reconciliation/rollback runbook prepared.                                                                                     | No genuine merchant/sandbox evidence or live-capable implementation. This is not a live configuration toggle. See [activation gates](SSLCOMMERZ_ACTIVATION_RUNBOOK.md).                                                                                |
| Hosting usage and configuration, Commands 222/223     | Eight usage API cases and six configuration database cases, contracts, provider mocks and component checks.                                                                                                                 | Usage is informational; cPanel access is not genuinely accepted. Options require manual fulfillment; configuration-bearing services hold plan changes for review. See [usage](HOSTING_USAGE.md) and [configuration](HOSTING_CONFIGURATION_OPTIONS.md). |
| Reports and attribution, Commands 224/226/227         | Report database reconciliation, exact minor units, refunds/reversals, immutable source bindings and domain/hosting attribution regressions.                                                                                 | Historical unknown cash stays unknown; forecasts are not collected income or MRR. See [reports](OPERATIONAL_REPORTS.md) and [attribution](INVOICE_PRODUCT_ATTRIBUTION.md).                                                                             |
| Encrypted recovery, Commands 225–227                  | Command 225's full fictional drill; Command 226's extended guard/tampering coverage; Command 227's focused 75-table/58-migration encrypted round trip.                                                                      | These fixtures do not establish installed-release backup retrieval, real key custody or whole-application recovery. See [recovery](BACKUP_AND_RECOVERY.md).                                                                                            |
| Populated upgrade, Command 228                        | Four cases passed across populated migration 56→57→58; all 74 application-table fingerprints and old ledger rows retained; one settlement and one renewal across retries. Separate clean schema/seed verifier passed at 58. | This does not populate the published 46-migration schema and exercise migrations 47–56, run the old application image, or restore this exact upgraded fixture. See [the rehearsal](BILLING_UPGRADE_REHEARSAL.md).                                      |

Do not add case counts from different commands into a supposed final-batch test
total: suites overlap and were executed against different source revisions.

## Release blockers and closure evidence

| Priority          | Finding                                                                                                        | Required closure and owner                                                                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0                | The published baseline is 46 migrations; the populated upgrade rehearsal starts at 56.                         | Developer/recovery operator: rehearse a populated fictional alpha.4 baseline through all 58 migrations. Preserve legacy customers, tickets, services, add-ons, issued money and pending work; verify retry, recovery and cleanup. Do not describe a fresh 58-migration install as this upgrade.  |
| P0                | The SSH script's failure path resumes previous writers without a schema compatibility decision.                | Developer/recovery operator: contain migration/unfinished-ledger failures, retain diagnostic state and prove no incompatible old API/worker/scheduler resumes automatically. Test failure after some candidate migrations have applied, not just a no-op failure before the first SQL statement. |
| P0                | Per-command acceptance does not certify the combined final candidate.                                          | Developer: validate the exact frozen delivery batch once, then record source/image identities and all unresolved failures. Any fixes change the candidate and require affected checks again. Do not repeat the full application suite for this prose review.                                     |
| P0 before release | Version/tag/changelog do not describe these features.                                                          | Release owner/developer: authorize a new version, align manifests, record features, all twelve migrations and manual follow-up, and create a matching immutable release tag only after validation. Do not move alpha.4's tag.                                                                    |
| P0 before cutover | Installed version, legacy terms, in-flight money/provider work and recovery access are unknown in this review. | Installation/recovery operator: perform the privately recorded, owner-authorized inventory and cutover checks below. Do not infer a clear queue from local test results.                                                                                                                         |

The first two findings define the recommended next command. This review does
not change the launcher or perform a deployment rehearsal.

### Source evidence for migration-failure containment

The dedicated [SSH launcher](../scripts/deploy-ssh.ps1) correctly checks the
selected commit's root/web version, dated changelog and exact tag target before
contacting the server. Its [server script](../deploy/staging/deploy-release.sh)
builds the candidate and creates/verifies an encrypted backup using the previous
release's sources. It stops API, worker and scheduler before migration, then
recreates the matching application services after a successful switch.

However, `recover_before_switch` calls `restart_previous`, which restores the old
environment and starts the old API, worker and scheduler. Both migration failure
and an unfinished migration count call that path; it does not first verify old
binary/schema compatibility or reconcile any already-applied migration effects.
The general ERR trap also reaches it before the release switch. This is a
confirmed containment gap, not evidence of an actual production incident.
The [recovery policy](BACKUP_AND_RECOVERY.md) already requires compatibility or
an isolated restore/cutover decision; bring implementation and tests into line.

The script targets the existing `my.speedhost.bd` installation using paths and
Compose overrides named staging. This review does not redefine that target,
create another environment or authorize real-customer use of seeded accounts.

### Final-candidate validation plan

Use one isolated checkout/environment for the eventual authorized delivery batch.
Follow the application path of [CI](../.github/workflows/ci.yml): frozen install,
secret scan, fresh migration/seed verification, formatting/lint/types, package and
API/invariant tests, encrypted recovery, browser/staff acceptance, production
dependency/license checks and production artifacts/container builds. Include
Linux/native-image acceptance for the new direct `sharp` dependency. Obtain
candidate CodeQL results through the normal [workflow](../.github/workflows/codeql.yml)
when publication is authorized; an old main-branch result is not candidate proof.

Also run `pnpm test:billing-upgrade` explicitly. Its suite is phase-gated and is
skipped by an ordinary API suite without the guarded launcher's environment;
the current CI file does not invoke that root script. Add the full-baseline and
failure-path rehearsals from the next command to the delivery evidence.

The accumulated batch contains application, migration, dependency and deployment
changes. It must take the full application-check path when published, even if
this final review commit contains only documentation. No push or hosted CI run
was triggered by Command 229.

## Operator actions before an authorized cutover

Record real identifiers and evidence privately; keep only sanitized outcomes in Git.

1. **Owner and target:** Name the release owner, installation operator, recovery
   operator and escalation contact. Confirm the target, installed commit, schema,
   compatible images, actual provider flags and access/MFA. Historical alpha.4
   receipts are not a current inspection.
2. **Recovery:** Verify an encrypted pre-change backup with its matching sources,
   all required tables/checksums and independent retrieval/decryption access.
   Retain credential-encryption key versions separately. Preserve financial and
   provider evidence after the recovery point; do not overwrite the failed DB or
   treat switching old images as reversing captured money. Review PostgreSQL and
   Redis/outbox recovery together.
3. **Quiescence and artifacts:** Inventory active requests, callbacks, outbox,
   scheduler leases and queue operations. Pause writers/consumers during schema
   transition; deploy matching migration/API/worker/scheduler/shared artifacts.
   Resume only after compatibility and financial checks, under supervision.
4. **Legacy domain billing:** Refresh owned facts and reconfirm ordinary terms
   with full-administrator review where attribution is missing or catalogue/
   expiry changed. Keep issued invoices and payment references; do not backfill
   labels, cancel invoices or auto-enable domains to clear a review hold.
5. **Pending money and mutations:** Review pending bank references against actual
   receipts, legacy unbound SSL attempts, uncertain captures/refunds, paid pending
   registrar operations and hosting package changes. Reconcile first; do not
   blindly retry a possibly submitted purchase or provisioning action.
6. **Manual service work:** Assign owners for due downgrades, cancelled add-on
   resource removal and purchased configuration fulfillment. Confirm due date,
   usage/limits and customer effect before acknowledging completion. Watch billing
   holds that intentionally wait for these decisions.
7. **Support and communication:** Review legacy tickets assigned to Support and
   any restricted memberships. Keep file intake and inbound email disabled until
   the separate scanner/gateway gates pass. Verify approved outbound delivery,
   sender/DNS posture, retention/storage and incident routing independently.
8. **Acceptance and observation:** Confirm installed commit/version, Billing,
   Reports and critical customer/admin paths after any authorized release. Track
   first renewal, payment review, jobs, queue backlog, errors and rollback stop
   criteria. Name an observer and an incident/recovery decision maker.

Independent backup cadence/retention, key recovery, monitoring/alert delivery,
host access/capacity and full application recovery remain operating gates from
the dated [production-readiness review](PRODUCTION_READINESS_REVIEW.md). No
current host audit or claim that those gates are closed is made here.

## Optional capability activation gates

| Capability                         | Keep closed until                                                                                                                                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real online payments/refunds       | Merchant access, genuine approved sandbox proof, live-specific implementation and separately approved payment/refund scope. Manual bank review can remain the chosen payment path.                                                                                           |
| Real domain renewal purchase       | Independently verified ownership, supported live eligibility/balance, cost ceilings and separately approved account/domain purchase/recovery acceptance. The current live adapter's unknown eligibility/balance prevents execution; flags alone cannot supply that evidence. |
| Support file intake                | Private ClamAV service, current signatures, isolated connectivity, fail-closed/proxy acceptance, storage and backup retention are approved and tested.                                                                                                                       |
| Customer email replies             | Trusted MIME/sender-verifying gateway, private shared secret/reply domain, DNS/transport, replay/retry and current access/scanner acceptance are established.                                                                                                                |
| Real hosting usage/package changes | Scoped cPanel access and genuine account-bound read/change/reconciliation acceptance. Usage readings do not independently attest target-plan capacity. Other usage adapters remain unsupported.                                                                              |

Committed defaults are not proof of the installed environment. Do not change a
flag or saved provider merely to make a readiness table green.

## Recommended next command

**Command 230 — Rehearse the full alpha.4 upgrade and contain failed migrations.**
Populate an isolated fictional 46-migration installation, upgrade to the current
candidate, preserve commercial/support history and pending work, and test
partial-migration failure with writers held until an explicit compatibility or
recovery decision. Align the dedicated SSH failure path with that policy and
verify it locally using controlled command doubles. Update the progress log.
No deployment or real provider connection. Requires separate owner authorization.

# Webhost Billing project handoff

Webhost Billing is a self-hosted application for one hosting business. It manages
customers, hosting, domains, invoices, payments, renewals and support. The
administrator Billing workspace contains Invoices and Transactions. Reports
contains revenue, overdue invoice aging and audited CSV exports.

## Source and release

- The source of record is [GitHub main](https://github.com/ebit101/webhost-billing/tree/main).
- The current published and installed release is **v0.1.0-alpha.5**, commit
  `44000fef6f111ee1bedb01639ab4beb1a92abfad`. Its
  [release notes](releases/v0.1.0-alpha.5.md) and [changelog](../CHANGELOG.md)
  describe the accumulated work through Command 230.
- The dedicated SSH launcher upgraded the existing installation from alpha.4
  (`24af575`) on **2026-11-08 (Asia/Dhaka)**. All 58 migrations are complete,
  none are unfinished, and all seven services are healthy. Full CI and CodeQL
  passed on the tagged commit. The prior alpha.4 tag is unchanged.
- [The progress log](PROGRESS.md) records independent public HTTP, infrastructure
  retention and disabled-provider checks. Refer to the installed commit when
  comparing it with later documentation-only commits on main.
- The [Command 229 review](RELEASE_READINESS_COMMAND_229.md) is a dated snapshot.
  Command 230 closed the populated-upgrade and failure-containment gaps locally;
  genuine provider and installed recovery gates remain separate.
- The operator installation is [my.speedhost.bd](https://my.speedhost.bd/).
  Sign in as an administrator to check
  [Billing](https://my.speedhost.bd/admin/invoices) and
  [Reports](https://my.speedhost.bd/admin/reports).

## Develop and verify

- The pnpm workspace uses Node.js 24. The Next.js web app is in `apps/web`,
  the NestJS API in `apps/api`, and the queue worker and scheduler in `apps/worker`.
  Shared contracts live in `packages/shared`, and Prisma and migrations live in
  `packages/database`.
- Use the [installation guide](INSTALLATION_GUIDE.md) to start a fictional
  local evaluation. Use separate test data and fake providers. Keep production
  secrets and the SSH identity outside Git.
- Read [the project instructions](../AGENTS.md), [the plan](../HOSTING_BILLING_SYSTEM_PLAN.md)
  and [the progress log](PROGRESS.md) before starting a new command. Run the
  focused checks for each change, and validate the complete batch before release.

## Deploy and recover

1. Update workspace package versions, add the matching changelog section and
   commit the validated candidate. Create a new annotated version tag on that
   commit and publish the commit and tag to GitHub.
2. Follow the [dedicated SSH handoff](SSH_DEPLOYMENT_HANDOFF.md). Run preflight
   and apply against the exact published commit. The launcher checks that the
   version, tag and changelog agree before contacting the server.
3. Confirm the active commit, all service health checks, the public storefront
   and readiness endpoint. With an existing administrator session, open Billing
   and Reports and check the version and changelog link in the header.
4. On failure, inspect the active release before retrying. Follow the
   [deployment and rollback runbook](STAGING_DEPLOYMENT.md) and the
   [backup and restore procedure](BACKUP_AND_RECOVERY.md).

Command 230 completed the full local alpha.4 upgrade and failure-containment
acceptance. The owner-requested alpha.5 delivery is complete; see the progress
log for the acceptance record. Never resume old writers
after a partial migration without the documented compatibility/recovery decision.
The next proposed development command is **Command 231 — Review first-cycle
billing and manual follow-up after alpha.5**; it requires owner authorization.
The [Phase 2 pilot backlog](PHASE_2_PILOT.md) retains the earlier pilot history.

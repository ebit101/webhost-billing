# Webhost Billing project handoff

Webhost Billing is a self-hosted application for one hosting business. It manages
customers, hosting, domains, invoices, payments, renewals and support. The
administrator Billing workspace contains Invoices and Transactions. Reports
contains revenue, overdue invoice aging and audited CSV exports.

## Source and release

- The source of record is [GitHub main](https://github.com/ebit101/webhost-billing/tree/main).
- This handoff accompanies **v0.1.0-alpha.3**. The
  [release notes](releases/v0.1.0-alpha.3.md) and [changelog](../CHANGELOG.md)
  describe the changes. Use the deployment output to confirm the active commit.
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

The next proposed development command is **Command 202 — Let customers cancel
recurring hosting add-ons at period end**. The [Phase 2 pilot backlog](PHASE_2_PILOT.md)
tracks the remaining acceptance work.

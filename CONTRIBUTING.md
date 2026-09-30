# Contributing to Webhost Billing

Thank you for helping improve Webhost Billing. This project handles authentication,
billing, payments, and hosting operations, so correctness and safe failure behavior
take priority over speed.

## Before starting

1. Search existing issues and pull requests.
2. Open an issue before large features, schema changes, provider integrations, or
   changes to financial and provisioning rules.
3. Never use real customer data, production credentials, or live payment/hosting
   systems in a contribution.
4. Read `AGENTS.md`, `HOSTING_BILLING_SYSTEM_PLAN.md`, `docs/DECISIONS.md`, and the
   relevant module documentation.

Small bug fixes, documentation improvements, and tests may be submitted directly.

## Development setup

Requirements: Node.js 24, pnpm 11.22, Git, and Docker.

For orientation, start with the isolated fictional-data demo:

```bash
corepack pnpm demo:up
```

Use the generated logins only at `http://localhost:3100`, follow
[`docs/SAFE_EVALUATION_DEMO.md`](docs/SAFE_EVALUATION_DEMO.md), and stop it with
`corepack pnpm demo:down`. The demo uses separate volumes and does not replace the
development setup below.

New contributors can choose a bounded task from
[`docs/STARTER_ISSUES.md`](docs/STARTER_ISSUES.md).

```bash
corepack enable
corepack prepare pnpm@11.22.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up --detach --wait postgres redis
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

## Pull-request requirements

- Keep each pull request focused and explain the problem, approach, risk, and
  validation performed.
- Add or update tests for behavior changes.
- Preserve integer minor-unit money, immutable financial history, idempotency,
  authorization, ownership, and payment/provisioning state separation.
- Treat browser redirects as untrusted. Never treat them as payment proof.
- Do not automatically retry an uncertain external mutation.
- Do not add automatic permanent service termination.
- Add a reviewed, forward-only Prisma migration for schema changes. Never use
  `prisma db push` as a migration substitute.
- Update relevant documentation and `CHANGELOG.md` for user-visible changes.
- Do not include generated output, `.env` files, logs, dumps, credentials, or
  test artifacts.

Run the applicable validation before requesting review:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Database, Redis, integration, or browser changes also require the relevant E2E
or invariant suites documented in `docs/DEVELOPMENT.md` and
`docs/END_TO_END_TESTING.md`.

## Commit and review policy

- Write clear imperative commit subjects.
- Keep unrelated refactoring out of a behavioral fix.
- All changes are reviewed through pull requests; do not ask maintainers to merge
  failing or unverified work.
- A maintainer may request security, migration, provider, accessibility, or
  backwards-compatibility changes before merge.

## Licensing contributions

Unless explicitly marked otherwise in writing, an intentional contribution is
submitted under the Apache License 2.0 as described by section 5 of that license.
Only submit work you have the right to contribute. Identify copied or adapted
third-party material and its license in the pull request.

## Security reports

Do not open a public issue for a suspected vulnerability. Follow
[`SECURITY.md`](SECURITY.md) and use GitHub private vulnerability reporting.

Participation in this project is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

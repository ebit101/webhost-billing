# Contributor Change-Path Map

Use this map to find the smallest source, test, documentation, and validation surface
for a contribution. It is navigation guidance, not a new code-ownership system. Read
the project scope and safety rules in [the product plan](../HOSTING_BILLING_SYSTEM_PLAN.md),
[the contribution guide](../CONTRIBUTING.md), and [the architecture decisions](DECISIONS.md)
before changing behavior.

Every repository path below is a local Markdown link. Every command in a `bash` block
invokes a script from the [root package manifest](../package.json).
`corepack pnpm docs:paths` checks all of those paths and commands, plus the six
required product/architecture map areas. The contributor-documentation path below is
an additional project-maintenance route.

## Change paths

### Demo tooling

- **Owning paths:** [demo lifecycle scripts](../scripts/demo/),
  [the isolated Compose definition](../demo/), and
  [safe-demo browser helpers](../apps/web/e2e/). Screenshot capture and offline
  validation share the [demo screenshot contract](../scripts/demo/demo-screenshot-contract.json).
- **Nearest focused tests:** [doctor tests](../scripts/demo/demo-doctor.test.mjs),
  [inspection-command tests](../scripts/demo/demo-inspection.test.mjs),
  [reset tests](../scripts/demo/demo-reset.test.mjs), and
  [smoke-command tests](../scripts/demo/demo-smoke.test.mjs),
  [screenshot-asset contract tests](../scripts/docs/check-demo-screenshot-assets.test.mjs),
  [the functional browser verifier](../apps/web/e2e/smoke-safe-demo.ts), and
  [the accessibility runner](../apps/web/e2e/audit-safe-demo-accessibility.ts).
- **Relevant documentation:** [safe evaluation](SAFE_EVALUATION_DEMO.md),
  [development setup](DEVELOPMENT.md), and
  [capability boundaries](CAPABILITY_MATRIX.md).
- **Minimum validation:**

```bash
corepack pnpm test:demo-doctor
corepack pnpm test:demo-inspection
corepack pnpm test:demo-reset
corepack pnpm test:demo-smoke
corepack pnpm test:demo-assets
corepack pnpm docs:demo-assets
corepack pnpm docs:paths
corepack pnpm docs:links
corepack pnpm format:check
```

**Safety invariants:** keep the demo loopback-only, fictional, and isolated from
development and production. Never print generated credentials, enable real providers,
turn `demo:down` into a destructive operation, weaken the exact reset confirmation,
add generic Docker pruning, let inspection commands create missing runtime state, or
let read-only verification mutate business or Docker state. Keep `demo:logs` finite
and manually review its redacted snapshot before sharing it.

### Next.js UI

- **Owning paths:** [App Router pages and layouts](../apps/web/src/app/),
  [reusable interface components](../apps/web/src/components/),
  [browser/server helpers](../apps/web/src/lib/), and
  [browser lifecycle coverage](../apps/web/e2e/).
- **Nearest focused tests:** [UI interaction coverage](../apps/web/src/components/ui/ui-interactions.test.tsx),
  [customer overview coverage](../apps/web/src/components/dashboard/customer-portal-overview.test.tsx),
  [server authentication coverage](../apps/web/src/lib/server-auth.test.ts), and
  [the hosting lifecycle test](../apps/web/e2e/specs/hosting-lifecycle.spec.ts).
- **Relevant documentation:** [frontend design system](FRONTEND_DESIGN_SYSTEM.md),
  [authentication](AUTHENTICATION.md), and
  [end-to-end testing](END_TO_END_TESTING.md).
- **Minimum validation:**

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
```

Add `corepack pnpm test:e2e` when navigation, authentication, checkout, or a principal
browser workflow changes.

**Safety invariants:** preserve secure HttpOnly cookie sessions, accessible loading,
empty, and error states, customer ownership boundaries, string-safe minor-unit money,
and server-authoritative billing or provisioning decisions. Presentation must never
turn a redirect or optimistic browser state into proof of payment or service success.

### NestJS API modules

- **Owning paths:** [business modules](../apps/api/src/modules/),
  [shared API infrastructure](../apps/api/src/common/), and
  [API integration tests](../apps/api/test/).
- **Nearest focused tests:** [invoice service tests](../apps/api/src/modules/invoices/invoice.service.spec.ts),
  [payment money tests](../apps/api/src/modules/payment-gateways/payment-money.spec.ts),
  [payment integration tests](../apps/api/test/payments.e2e-spec.ts), and
  [service integration tests](../apps/api/test/services.e2e-spec.ts).
- **Relevant documentation:** [API contracts](API_CONTRACTS.md),
  [critical business invariants](CRITICAL_BUSINESS_INVARIANTS.md),
  [authentication](AUTHENTICATION.md), and the module-specific guides in
  [the documentation index](../README.md#project-documentation).
- **Minimum validation:**

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:invariants
```

**Safety invariants:** enforce roles and ownership in the service/API layer, validate
unknown input at runtime, keep order, invoice, payment, provisioning, and service
states separate, make callbacks idempotent, and preserve issued financial history.
Provider errors and responses must remain normalized and redacted.

### Worker and scheduler jobs

- **Owning paths:** [worker and scheduler code](../apps/worker/src/),
  [queue contracts and helpers](../packages/queue/src/), and
  [worker application entry points](../apps/worker/).
- **Nearest focused tests:** [renewal scheduler integration](../apps/worker/src/renewal/renewal-scheduler.integration.spec.ts),
  [renewal lifecycle integration](../apps/worker/src/renewal/renewal-lifecycle.integration.spec.ts),
  [outbox dispatcher integration](../apps/worker/src/outbox/outbox-dispatcher.integration.spec.ts),
  and [queue integration](../packages/queue/src/background-queue.integration.spec.ts).
- **Relevant documentation:** [background jobs](BACKGROUND_JOBS.md),
  [renewal automation](RENEWAL_AUTOMATION.md), and
  [email notifications](EMAIL_NOTIFICATIONS.md).
- **Minimum validation:**

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:invariants:worker
```

**Safety invariants:** make retryable work idempotent, keep job payloads reference-only
and secret-free, use database-backed scheduler locking, bound retries, expose permanent
failures, and never automatically schedule permanent hosting termination. Uncertain
external mutations must not be retried blindly.

### Shared contracts

- **Owning paths:** [runtime contracts](../packages/shared/src/contracts/),
  [the browser-compatible package entry](../packages/shared/src/index.ts), and
  [Node-only observability helpers](../packages/shared/src/observability.ts).
- **Nearest focused tests:** [contract tests](../packages/shared/test/contracts.spec.ts),
  [settings tests](../packages/shared/test/settings.spec.ts),
  [observability tests](../packages/shared/test/observability.spec.ts), and
  [package-boundary tests](../packages/shared/test/package-boundaries.spec.ts).
- **Relevant documentation:** [API contracts](API_CONTRACTS.md),
  [settings and secrets](SETTINGS_AND_SECRETS.md), and
  [critical business invariants](CRITICAL_BUSINESS_INVARIANTS.md).
- **Minimum validation:**

```bash
corepack pnpm typecheck
corepack pnpm test:invariants:contracts
corepack pnpm test
```

**Safety invariants:** validate external and boundary data with runtime schemas,
serialize monetary integers losslessly, keep browser exports free of Node-only code,
redact sensitive fields, and treat contract changes as compatibility changes for all
API, web, worker, and queue consumers.

### Database migrations

- **Owning paths:** [Prisma schema](../packages/database/prisma/schema.prisma),
  [forward migrations](../packages/database/prisma/migrations/),
  [fictional seed data](../packages/database/prisma/seed.ts), and
  [database verification](../packages/database/prisma/verify.ts).
- **Nearest focused tests:** [invoice integration tests](../apps/api/test/invoices.e2e-spec.ts),
  [order integration tests](../apps/api/test/orders.e2e-spec.ts),
  [payment integration tests](../apps/api/test/payments.e2e-spec.ts), and
  [service integration tests](../apps/api/test/services.e2e-spec.ts).
- **Relevant documentation:** [database rules](DATABASE.md),
  [backup and recovery](BACKUP_AND_RECOVERY.md), and
  [critical business invariants](CRITICAL_BUSINESS_INVARIANTS.md).
- **Minimum validation:**

```bash
corepack pnpm db:format
corepack pnpm db:validate
corepack pnpm db:generate
corepack pnpm db:migrate:status
corepack pnpm db:verify
```

Run database-state commands only against disposable local or explicitly authorized
test infrastructure.

**Safety invariants:** use reviewed forward-only migrations, never substitute
`prisma db push`, preserve integer minor-unit money and immutable issued financial or
audit history, keep timestamps in UTC, use fictional seed data, and pair destructive
schema work with verified backup and restore procedures.

### Contributor documentation and project metadata

- **Owning paths:** [repository documentation](./),
  [offline documentation tooling](../scripts/docs/), and
  [GitHub issue forms](../.github/ISSUE_TEMPLATE/).
- **Nearest focused tests:** [Markdown-link validator tests](../scripts/docs/check-markdown-links.test.mjs),
  [contributor-map validator tests](../scripts/docs/check-contributor-paths.test.mjs),
  [issue-form validator tests](../scripts/docs/check-issue-forms.test.mjs), and
  [safe-demo screenshot validator tests](../scripts/docs/check-demo-screenshot-assets.test.mjs).
- **Relevant documentation:** [contribution guide](../CONTRIBUTING.md),
  [support policy](../SUPPORT.md), [security policy](../SECURITY.md), and
  [starter-issue catalogue](STARTER_ISSUES.md).
- **Minimum validation:**

```bash
corepack pnpm test:docs-links
corepack pnpm test:docs-paths
corepack pnpm test:issue-forms
corepack pnpm test:demo-assets
corepack pnpm docs:links
corepack pnpm docs:paths
corepack pnpm docs:issue-forms
corepack pnpm docs:demo-assets
corepack pnpm format:check
```

The Markdown-link check resolves repository-local files and verifies fragments on
tracked Markdown targets against ordinary GitHub-style ATX heading anchors. It
remains offline and does not inspect external URLs or fragments on non-Markdown
files.
The issue-form check uses the [offline validator](../scripts/docs/check-issue-forms.mjs)
to parse every template YAML file and retain required bug fields, unique field IDs,
safe-demo guidance, redaction confirmation, and confined local or HTTPS guidance
links.
The screenshot check uses the [offline asset validator](../scripts/docs/check-demo-screenshot-assets.mjs)
and the shared contract to verify the four tracked PNG headers, dimensions, byte
bounds, repository confinement, unique names, and canonical-guide references. It
does not decode pixels, launch a browser or Docker, or access the network; visual
review remains a human responsibility.

**Safety invariants:** keep documentation validation offline and repository-bound,
keep public issue paths free of credentials and real customer/provider data, route
suspected vulnerabilities to private reporting, keep commands and links current, and
do not turn documentation changes into production, provider, release, or business
rule authority.

## First contribution flow

1. Read [the contribution guide](../CONTRIBUTING.md), then check
   [the starter-issue catalogue](STARTER_ISSUES.md) and its linked GitHub issues for
   the current status. Comment before starting a listed task. If no task is open,
   propose a small documentation or test change before implementing it.
2. Pick one change path above. Read its linked guide and the nearest focused tests
   before editing.
3. Reproduce with fictional data and local infrastructure only. Never use production
   identities, credentials, payments, email delivery, or hosting accounts.
4. Run that path's minimum commands plus formatting, the map check, and the local-link
   check. Record only checks that actually passed.
5. Submit one focused pull request explaining the problem, approach, risks, and
   validation. Update relevant documentation when behavior changes.

Suspected vulnerabilities do not belong in a public starter issue or pull request.
Follow [the private security-reporting process](../SECURITY.md), which links directly
to GitHub private vulnerability reporting.

## Validate this map

```bash
corepack pnpm test:docs-paths
corepack pnpm docs:paths
corepack pnpm docs:links
corepack pnpm format:check
```

The focused tests exercise valid entries, simultaneous missing paths and scripts,
missing areas, unlinked repository-path literals, and invalid pnpm-option commands.
The validator stays offline and does not inspect or mutate external services.

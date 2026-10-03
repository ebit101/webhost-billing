# Contributor Starter Issues

These tasks are deliberately bounded so a new contributor can learn the codebase
without changing financial rules, provider authority, migrations, or production
policy. Search GitHub first and comment on the issue before starting. Never use real
customer data or credentials.

## Current starter set

No starter issue is currently open. Run the required phase review before defining or
implementing another contributor task.

## Latest completed starter set

### 14. [Add one offline documentation validation command](https://github.com/ebit101/webhost-billing/issues/31)

**Status:** Completed by Command 74 on 2026-10-03.

**Suggested labels:** `good first issue`, `help wanted`, `documentation`,
`javascript`, `github_actions`

Added one fixed Node.js aggregate for the four offline documentation validators. It
runs them sequentially with deterministic per-check evidence, returns the first
failure, stops later dispatch, and discards raw child output and non-allowlisted
environment values. Every focused command remains available.

### 13. [Validate safe-demo screenshot assets offline](https://github.com/ebit101/webhost-billing/issues/30)

**Status:** Completed by Command 73 on 2026-10-03.

**Suggested labels:** `good first issue`, `help wanted`, `documentation`,
`javascript`

Added one shared capture/validation contract and an offline validator for the four
reviewed PNGs. It checks repository confinement, regular-file metadata, Git tracking,
PNG signature/IHDR dimensions, conservative byte bounds, unique identities, and
canonical-guide references without decoding pixels or launching Docker, a browser,
or the network.

### 12. [Keep safe-demo inspection commands side-effect-free](https://github.com/ebit101/webhost-billing/issues/29)

**Status:** Completed by Command 72 on 2026-10-03.

**Suggested labels:** `good first issue`, `help wanted`, `docker`, `javascript`

Made credentials, status, logs, and down require an existing safe regular runtime
file before Docker can run. Docker dispatch is fixed and captured, log output is a
redacted no-color snapshot capped at the latest 100 lines, and down retains the
fictional volumes and generated runtime.

### 11. [Add a safe-demo path to the GitHub bug-report form](https://github.com/ebit101/webhost-billing/issues/28)

**Status:** Completed by Command 70 on 2026-10-02.

**Suggested labels:** `good first issue`, `help wanted`, `documentation`

Added **Safe evaluation demo** to the existing bug form with bounded environment and
health-stage context, explicit diagnostic commands, a required sensitive-data
confirmation, troubleshooting and private-reporting links, plus an offline
self-validating issue-form contract.

### 9. [Add a read-only `demo:smoke` verification command](https://github.com/ebit101/webhost-billing/issues/26)

**Status:** Completed by Command 68 on 2026-10-02.

**Suggested labels:** `good first issue`, `help wanted`, `docker`, `javascript`

Added a cross-platform, fixed-loopback `demo:smoke` command that verifies readiness,
the public catalogue, customer overview, and administrator dashboard against an
already-running fictional demo. It retains no browser artifacts, changes no
business or Docker state, and emits only bounded allowlisted results.

### 10. [Validate local Markdown heading anchors offline](https://github.com/ebit101/webhost-billing/issues/27)

**Status:** Completed by Command 69 on 2026-10-02.

**Suggested labels:** `good first issue`, `help wanted`, `documentation`,
`javascript`

Extended the offline Markdown link validator to check same-document and cross-file
fragments on tracked Markdown targets. The bounded checker covers ordinary ATX
headings, repeated suffixes, punctuation, Unicode, and percent-encoded fragments
while preserving repository and symbolic-link confinement before target reads.

### 5. [Add offline Markdown link validation to CI](https://github.com/ebit101/webhost-billing/issues/22)

**Status:** Completed by Command 63 on 2026-10-01.

**Suggested labels:** `good first issue`, `help wanted`, `documentation`,
`javascript`

Add a cross-platform Node.js validator for local links and images in tracked
Markdown files. The check must remain offline, report every broken target with its
source location, and run through a root pnpm script and ordinary CI.

Acceptance:

- resolves relative files and images from the source document after removing query
  strings/fragments and decoding URL-encoded path segments;
- permits valid parent-directory references inside the repository but rejects paths
  that resolve outside it;
- ignores absolute web URLs, `mailto:` references, and document-only fragments
  without fetching external content;
- exits non-zero and reports every broken target with its source file and line;
- includes fixture-based tests for valid, missing, encoded, ignored, and traversal
  cases; and
- documents and runs the command in the normal contributor/CI validation path.

Validation: focused tests, the new link check, `pnpm format:check`, `pnpm lint`,
`pnpm typecheck`, and `pnpm test`.

Excluded: external crawling, a hosted link service, heading-anchor validation,
application behavior, schemas, providers, releases, or production-readiness changes.

### 6. [Add a safe-demo accessibility smoke audit](https://github.com/ebit101/webhost-billing/issues/23)

**Status:** Completed by Command 64 on 2026-10-01.

**Suggested labels:** `good first issue`, `help wanted`, `accessibility`,
`javascript`

Add a `demo:a11y` Playwright command for the principal evaluator pages in the
running loopback-only fictional demo. This complements the component accessibility
tests; it is not a certification.

Acceptance:

- audits the public catalogue, login page, authenticated customer overview, and
  authenticated administrator dashboard at `http://localhost:3100`;
- uses the repository-pinned Chromium and a pinned accessibility engine;
- reads only generated fictional logins internally and never prints or attaches a
  password, cookie, token, or runtime-file value;
- fails on serious or critical WCAG A/AA findings with a bounded redacted summary;
- asserts the skip link and one responsive keyboard-navigation path;
- waits for semantic application state instead of arbitrary delays and leaves demo
  data/provider state unchanged; and
- documents the audit's command, coverage, and limits.

Validation: the focused audit against a healthy safe demo, relevant web tests,
`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and the web
production build.

Excluded: hosted scanning, staging/production targets, real identities, full WCAG
certification, a browser matrix, general redesign, financial/schema/provider
changes, or a production-readiness claim.

### 7. [Add an explicitly guarded safe-demo reset command](https://github.com/ebit101/webhost-billing/issues/24)

**Status:** Completed by Command 65 on 2026-10-02.

**Suggested labels:** `help wanted`, `docker`, `javascript`

Add a deliberate `demo:reset` path for removing only the safe demo's fictional
containers, volumes, and generated runtime file. `demo:down` must remain the normal
non-destructive stop command.

Acceptance:

- requires an exact documented confirmation flag and refuses without changing
  anything when it is absent;
- targets only the fixed demo Compose file/project identity, dedicated demo
  resources, and exact `.demo-runtime/demo.env` path;
- refuses symlinks, non-regular runtime paths, traversal, overrides, or resolved
  targets outside the dedicated demo boundary;
- removes demo Docker state before deleting the runtime file, and preserves that
  file when Docker cleanup fails or is uncertain;
- is idempotent when the demo has never run or was already reset;
- prints no runtime values or raw command errors and never targets development,
  staging, production, or unrelated Docker resources;
- has injected process/filesystem tests for confirmation, success, absent state,
  failure, invalid paths, redaction, and exact targeting; and
- documents the destructive warning and safe start-again workflow.

Validation: focused tests, a disposable first-run/reset/restart smoke cycle, demo
Compose rendering, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and
`pnpm test`.

Excluded: generic Docker pruning, development-data reset, arbitrary project/path
options, staging/production mutation, schemas, providers, releases, or production
`NO-GO` changes.

### 8. [Add a contributor change-path map](https://github.com/ebit101/webhost-billing/issues/25)

**Status:** Completed by Command 66 on 2026-10-02.

**Suggested labels:** `good first issue`, `help wanted`, `documentation`

Add `docs/CONTRIBUTOR_PATHS.md` so a first-time contributor can map a small change
to the correct source, focused tests, documentation, validation, and invariant
boundary.

Acceptance:

- covers demo tooling, Next.js UI, NestJS API modules, worker/scheduler jobs, shared
  contracts, and database migrations;
- names the owning directories, nearest focused tests, relevant documentation,
  minimum validation commands, and safety invariants for each path;
- includes a short first-contribution flow that points to the current starter issues
  and private security reporting;
- keeps commands and repository paths literal and current;
- links the map from `CONTRIBUTING.md` and the README documentation index; and
- verifies every referenced repository path and root pnpm script exists.

Validation: `pnpm format:check`, the repository link check when available, automated
path/script existence checks, and manual terminology/security review.

Excluded: code ownership changes, architecture/schema changes, generated API
reference, full documentation rewrite, providers, production procedures, releases,
or production-readiness changes.

## Earlier completed starter set

### 1. [Add a read-only demo preflight command](https://github.com/ebit101/webhost-billing/issues/18)

**Status:** Completed by Command 58 on 2026-10-01.

**Suggested labels:** `good first issue`, `help wanted`, `docker`

Add `demo:doctor` to report the installed Docker/Compose versions, Docker Engine
availability, whether loopback port `3100` is available, and whether the local demo
runtime file exists. The command must be read-only, must redact all values, and must
not start, stop, rebuild, or remove anything.

Acceptance:

- works on supported PowerShell and Unix-like shells through Node.js;
- returns a non-zero status with a clear remediation for each failed prerequisite;
- never prints `.demo-runtime/demo.env` values;
- has focused automated tests for success and representative failures; and
- updates the safe-demo documentation.

Validation: focused tests, `pnpm format:check`, `pnpm lint`, and `pnpm typecheck`.

### 2. [Replace customer portal overview fixtures with authenticated data](https://github.com/ebit101/webhost-billing/issues/19)

**Status:** Completed by Command 59 on 2026-10-01.

**Suggested labels:** `help wanted`, `enhancement`, `javascript`

The portal overview currently labels its values as fictional presentation data. Use
existing authenticated customer APIs to show the signed-in customer's name and an
accurate, bounded service/invoice/ticket summary without weakening ownership checks.

Acceptance:

- no hard-coded customer name, invoice, domain, amount, or date remains on the portal
  overview;
- empty and error states are explicit and accessible;
- monetary values continue to use string-safe integer minor units and shared
  formatting;
- another customer cannot observe the data; and
- component/server tests cover populated and empty states.

Excluded: new API capabilities, schema changes, payment/provider behavior, or a
general dashboard redesign.

### 3. [Add a mobile safe-demo screenshot](https://github.com/ebit101/webhost-billing/issues/20)

**Status:** Completed by Command 60 on 2026-10-01.

**Suggested labels:** `good first issue`, `help wanted`, `accessibility`

Extend the existing Playwright capture script with one useful mobile viewport image
of the public catalogue or customer service list. Keep screenshots deterministic and
fictional, and document the new asset.

Acceptance:

- uses the repository-pinned Chromium and the safe demo URL;
- waits on semantic UI state rather than arbitrary timeouts;
- captures no password, cookie, token, generated secret, or private host detail;
- image text and primary actions remain legible at the chosen viewport; and
- the contributor records a visual review with the normal validation.

Excluded: adding a visual-regression service or changing application behavior.

### 4. [Add a Bengali safe-demo quick-start translation](https://github.com/ebit101/webhost-billing/issues/21)

**Status:** Completed by Command 61 on 2026-10-01.

**Suggested labels:** `good first issue`, `help wanted`, `documentation`

Add a concise Bengali companion for the safe-demo warning, prerequisites, startup,
fictional logins, walkthrough, shutdown, and secret-reporting rules. Link it from the
English guide while keeping the English guide canonical.

Acceptance:

- preserves “technical preview,” “not fit for live use,” fictional-data-only, and
  production `NO-GO` meanings;
- does not translate commands, routes, email addresses, or filenames;
- contains no generated credential value or live-system instruction; and
- passes Markdown formatting and link checks.

Excluded: application localization or translating the full documentation set.

## Contribution boundary

Open a design issue before attempting schema changes, provider integrations,
financial logic, authentication policy, or provisioning behavior. Suspected security
vulnerabilities must use the private process in [`SECURITY.md`](../SECURITY.md), not
a public starter issue.

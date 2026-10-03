# Changelog

All notable changes to Webhost Billing will be documented in this file.

The project follows [Semantic Versioning](https://semver.org/) after a public API is
declared. During the `0.x` series, breaking changes may occur between minor releases
and will be called out in release notes.

## [Unreleased]

### Changed

- Safe-demo credentials, status, logs, and down now refuse missing or unsafe runtime
  paths before Docker; logs return a redacted, no-color, non-following 100-line
  snapshot and down remains non-destructive.

### Added

- Added one shared safe-demo screenshot contract plus an offline CI validator for
  repository confinement, Git tracking, PNG headers/dimensions, conservative byte
  bounds, unique filenames, and canonical-guide references.
- Added a fourth bounded contributor starter-issue set covering side-effect-free
  safe-demo inspection, offline screenshot contracts, and one aggregate offline
  documentation check.
- Added an offline GitHub issue-form validator with focused parsing, unique-ID,
  safe-demo guidance, redaction-confirmation, and link-confinement tests.
- Added a fixed-origin, read-only `demo:smoke` verifier for the running fictional
  catalogue, customer overview, and administrator dashboard with bounded redacted
  output and focused guard/dispatch tests.
- Added a self-validating contributor change-path map for demo tooling, web UI, API
  modules, worker/scheduler jobs, shared contracts, and database migrations.
- Added a third bounded contributor starter-issue set covering read-only safe-demo
  functional verification, offline Markdown anchors, and safer demo bug reports.
- Added an exact-confirmation `demo:reset` command that validates fixed paths,
  removes and verifies only dedicated fictional demo Docker state, retains runtime
  credentials on uncertain cleanup, and never performs generic pruning.
- Added a loopback-only safe-demo accessibility smoke audit for four evaluator
  routes, serious/critical WCAG A/AA findings, the skip link, and responsive keyboard
  navigation with redacted bounded output.
- Added an offline, cross-platform Markdown link validator with fixture coverage,
  contributor documentation, and an ordinary CI gate.
- Added the second bounded contributor starter-issue set covering offline Markdown
  link validation, safe-demo accessibility auditing, guarded demo reset, and a
  contributor change-path map.
- Added a concise Bengali safe-demo quick-start companion while retaining the
  English guide as canonical and preserving every evaluation safety boundary.
- Added a reviewed 390-pixel-wide mobile safe-demo catalogue screenshot with
  transition-stable Playwright capture and a visible primary checkout action.
- Added a cross-platform, read-only `demo:doctor` preflight with redacted Docker,
  Compose, Engine, port, and runtime-file diagnostics plus focused failure tests.
- Added a one-command, loopback-only fictional evaluation demo with isolated
  PostgreSQL/Redis state, generated logins, disabled external providers, and
  repeatable admin/customer screenshot capture.
- Added an evaluator walkthrough, capability/limitation matrix, and bounded
  contributor starter-issue pack.

### Changed

- Reviewed the completed third starter-issue set, corrected contributor discovery
  and validation guidance, and defined a separately gated planning command for the
  next bounded contributor set.
- Added a bounded **Safe evaluation demo** path to the bug-report form with explicit
  diagnostic, health-stage, troubleshooting, and private-security-reporting guidance.
- Extended the offline Markdown validator to check same-file and cross-file heading
  anchors with duplicate, punctuation, Unicode, and percent-encoded slug coverage.
- Corrected contributor discovery after issues #18–#25 closed so the repository no
  longer presents completed tasks as currently available work.
- Replaced the customer portal overview presentation fixtures with an
  ownership-bound authenticated summary, bounded recent records, and explicit
  loading, empty, and error states.
- Positioned the project explicitly as an AI-assisted technical preview, documented
  its human-directed and human-reviewed Codex work path, and strengthened the warning
  that it is not fit for live use.
- Made production-built web images support a separate container-internal API origin
  while retaining the public origin for browser traffic and HTTPS-only production
  headers.

## [0.1.0-alpha.1] - 2026-09-30

### Added

- Apache License 2.0 and public-project governance documentation.
- Contribution, support, security-reporting, and community conduct policies.
- GitHub issue and pull-request templates, dependency updates, CI, and CodeQL
  automation.

### Changed

- Project metadata and documentation now describe the repository as open source.
- Updated Next.js, NestJS, Nodemailer, Prisma, and vulnerable transitive
  dependencies to audited releases.
- Made package and browser test commands portable across Windows and Unix-like
  development environments.
- Hardened the web test configuration so generated Next.js output cannot be
  collected as application tests.

### Security

- Added a private vulnerability-reporting policy and documented safe-research
  boundaries.
- Added full-history Gitleaks scanning with a narrow reviewed false-positive
  allowlist; the production dependency audit now reports no known vulnerabilities.
- Updated Vitest and pinned patched `brace-expansion` and `js-yaml` lines after
  release-day advisories, clearing the repository's open Dependabot alerts.

[Unreleased]: https://github.com/ebit101/webhost-billing/compare/v0.1.0-alpha.1...HEAD
[0.1.0-alpha.1]: https://github.com/ebit101/webhost-billing/releases/tag/v0.1.0-alpha.1

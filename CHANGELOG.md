# Changelog

All notable changes to Webhost Billing will be documented in this file.

The project follows [Semantic Versioning](https://semver.org/) after a public API is
declared. During the `0.x` series, breaking changes may occur between minor releases
and will be called out in release notes.

## [Unreleased]

### Changed

- Positioned the project explicitly as an AI-assisted technical preview, documented
  its human-directed and human-reviewed Codex work path, and strengthened the warning
  that it is not fit for live use.

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

# Changelog

All notable changes to Webhost Billing will be documented in this file.

The project follows [Semantic Versioning](https://semver.org/) after a public API is
declared. During the `0.x` series, breaking changes may occur between minor releases
and will be called out in release notes.

## [Unreleased]

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

[Unreleased]: https://github.com/ebit101/webhost-billing/compare/main...HEAD

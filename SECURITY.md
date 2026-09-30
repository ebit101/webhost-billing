# Security Policy

Webhost Billing handles authentication, customer records, billing history, payment
evidence, and hosting-panel authority. Please report vulnerabilities privately and
avoid actions that could affect real users or infrastructure.

## Supported versions

The project is currently pre-1.0. Security fixes are provided for the latest tagged
release and the current `main` branch. Older prereleases may not receive fixes.

| Version               | Supported   |
| --------------------- | ----------- |
| Latest tagged release | Yes         |
| `main`                | Best effort |
| Older versions        | No          |

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/ebit101/webhost-billing/security/advisories/new).
Do not include credentials, personal data, payment proof, or exploit details in a
public issue, discussion, or pull request.

Include, when possible:

- affected commit or version;
- affected component and configuration;
- reproduction steps using fictional data and local infrastructure;
- impact and realistic attack preconditions;
- a minimal proof of concept with secrets removed;
- suggested mitigation, if known.

Maintainers aim to acknowledge a complete report within five business days. Fix and
disclosure timing depends on severity, reproducibility, downstream risk, and release
coordination. Reporters will be credited when desired and appropriate.

## Safe-research boundaries

- Test a local installation you control.
- Do not test `my.speedhost.bd` or another public deployment without separate,
  written authorization from its operator.
- Do not access, modify, retain, or disclose another person's data.
- Do not perform denial-of-service, social engineering, spam, credential stuffing,
  destructive hosting operations, or real payment transactions.
- Stop when access beyond your own fictional test account is demonstrated.
- Give maintainers a reasonable opportunity to remediate before public disclosure.

Good-faith research that follows these boundaries will not be treated as malicious
by the project maintainers. This statement cannot authorize testing of third-party
services or override applicable law.

## Deployment responsibility

The source distribution is provided without warranty. Operators are responsible for
TLS, secrets, MFA, network controls, backups, monitoring, provider permissions,
regulatory requirements, and the production checklist in
[`docs/SECURITY_HARDENING.md`](docs/SECURITY_HARDENING.md).

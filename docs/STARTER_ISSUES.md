# Contributor Starter Issues

These tasks are deliberately bounded so a new contributor can learn the codebase
without changing financial rules, provider authority, migrations, or production
policy. Search GitHub first and comment on the issue before starting. Never use real
customer data or credentials.

## 1. [Add a read-only demo preflight command](https://github.com/ebit101/webhost-billing/issues/18)

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

## 2. [Replace customer portal overview fixtures with authenticated data](https://github.com/ebit101/webhost-billing/issues/19)

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

## 3. [Add a mobile safe-demo screenshot](https://github.com/ebit101/webhost-billing/issues/20)

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

## 4. [Add a Bengali safe-demo quick-start translation](https://github.com/ebit101/webhost-billing/issues/21)

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

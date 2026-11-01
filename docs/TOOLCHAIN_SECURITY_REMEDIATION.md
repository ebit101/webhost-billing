# Development and build dependency remediation

## Scope and evidence

Command 159, authorized 2026-10-31, remediates the development/build findings from
the Command 158 review. Baseline is `41952bffd0a6929c00fa86cf1dd5c441c8374dd8`.
Use Node 24 and pinned pnpm 11.22.0. This work changes development dependencies,
an exact-version patch and regression checks; it does not authorize deployment,
provider activation, real customer/payment changes or messages. Production remains
NO-GO under the [operating gate register](PRODUCTION_READINESS_REVIEW.md).

The initial full audit reported 11 findings: 2 high, 7 moderate and 2 low. The
production-only audit was clear. Installed dependency paths were inspected through
the actual consumers, including Nest CLI, Jest, ESLint, TypeScript ESLint, Vitest
and vite-tsconfig-paths, rather than assuming a package-store path was active.

## Remediation register

| Package family   | Source repair                                                                          | Evidence and limits                                                                                                                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite             | Pin 7.3.7 on the current major line                                                    | [Upstream release](https://github.com/vitejs/vite/releases/tag/v7.3.7); both test-tool consumers resolve the fixed release. No development server is exposed to test an editor command.                                                                                      |
| Vitest / mocker  | Update the directly pinned runner and matching internal packages from 4.1.11 to 4.1.12 | [Upstream backport](https://github.com/vitest-dev/vitest/releases/tag/v4.1.12); exercise manual mock-source escaping and both slash/backslash redirect traversal through the installed plugin, without starting a network server.                                            |
| Zod              | Align the lint dependency with existing runtime 4.6.6                                  | React Hooks explicitly accepts Zod 4; [collection-bound advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). An oversized invalid collection is rejected with bounded error output in a memory-limited child.                                                       |
| Modern glob      | Use upstream 14.0.2 for consumers requesting version 9 or newer                        | [Cancellation advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4). Test actual CLI/Jest resolution, async/sync/iterator results and no continued directory reads after cancellation. Legacy callback glob 7 stays on its original API.                              |
| Modern minimatch | Use upstream 11.0.1 for consumers requesting version 9 or newer                        | [Maintainer advisory](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249). Test pattern-cloning budgets and normal matching. Legacy callable minimatch 3 stays compatible with ESLint and callback glob.                                            |
| Deepmerge        | Mandatory pnpm patch for exact 4.3.1                                                   | No fixed release is published. The source, CommonJS and UMD entry points reject `__proto__` keys while copying both target and source. Test actual Nest/Jest consumers and the shipped UMD entry, null-prototype/null-target/array paths and ordinary configuration merging. |

The modern glob and minimatch changes cross major versions deliberately and only
for consumers already using their modern named APIs. Their acceptance includes
actual consumer resolution and full lint/type/package/API/browser/build validation.
Legacy callable and callback APIs are retained. Runtime shared Zod stays 4.6.6;
financial contracts, database migration history and application behavior are not
changed to make tooling validation pass.

The deepmerge finding was reproduced before patching through both active build-tool
consumers. The patch blocks that reproduction afterward and covers the unguarded
target-copy path as well as source merging. It preserves ordinary arrays, symbols,
dates, clone selection and custom array merging. This is a local security repair,
not an upstream release or a promise to sanitize arbitrary trusted custom callbacks.
See the [upstream report](https://github.com/TehShrike/deepmerge/issues/273).

The patch retains upstream tabbed context and empty unified-diff context lines.
Whitespace handling is scoped to this exact patch artifact in `.gitattributes`;
ordinary source whitespace checks remain unchanged. Its exact bytes, registered
checksum, successful installation and executed guards are verified separately.

## Raw audit results and applicability

After the repairs, `pnpm audit` still returns nonzero and reports two version-based
findings: one moderate minimatch warning and one low deepmerge warning. There are
no high-severity findings. `pnpm audit --prod` reports no known vulnerabilities.
No advisory is hidden, ignored, relabelled in package metadata or waived. Preserve
the raw output; do not describe the full graph as having zero audit findings.

The registry's minimatch range includes every version below 11.0.1, while the
maintainer's report identifies the `firstPhasePreProcess` cloning routine in 10.2.6.
The retained legacy 3.1.5 implementation lacks that routine and `globParts.push`
amplification. Regression checks inspect the actual legacy consumer source and run
the reported pattern family with optimization requested, verifying one unchanged
globparts entry. This is evidence about this specific advisory path, not a blanket
claim that an old major has no other risks. Reassess if the legacy consumer changes.

The deepmerge version remains 4.3.1, so the scanner cannot recognize the source
repair. Its patch is registered with an exact-version hash in the lockfile; patch
failure or an unexpected consumer/version fails tests. Do not claim a nonexistent
4.3.2 release resolves it, suppress the raw warning or disable the patch. Prefer a
reviewed upstream fix when one becomes available and rerun the poisoning probes.

## Validation

Focused installed security acceptance passed 28 cases, including ten new bounded
toolchain probes. Each new probe has a 128 MiB heap, a 15-second process deadline,
strict unhandled rejection behavior and a minimal inherited environment. Filesystem
fixtures contain only generated files and use exact-file cleanup. Mock plugins
are invoked directly; no editor, public development server or provider is started.

An initial matching probe incorrectly expected an exception; upstream bounds
cloning without throwing, so the corrected test measures the actual budget.
An initial hierarchical URL fixture normalized traversal before reaching the
plugin; opaque URL fixtures now retain it until the plugin checks the path.
These were test-harness corrections, not ignored failures or relaxed security
outcomes. Record the final full validation in [the command report](PROGRESS.md).

The first combined local package run passed its earlier suites, then refused the
last privilege fixture at the existing daemon-resource preflight before creating
a container. The Office PC had limited memory headroom. Do not lower that guard,
change shared Docker settings or stop unrelated applications to claim success.
Run the resource-heavy fixture separately and the remaining constituent suites
in sequence; retain the original failure. Hosted CI must also pass the unchanged
canonical package command before delivery. A partial local run is not a passed
`pnpm test` invocation.

The Office checkout also contained large generated `.next-e2e`/staff build trees.
Vitest now excludes every `.next*` output and resolves aliases from the web app's
explicit tsconfig, keeping generated copies out of discovery. The source inventory
contains 78 unit-test files. The full run included all 78 and passed all 720 tests.
No generated tree was deleted. A private driver initially inherited the E2E API
origin while unit mocks expected the default local origin; correcting the driver
made all 14 cases in the reported file pass without changing their assertions.

The initial browser run passed 32 cases and exceeded the existing 180-second
deadline in the complete hosting lifecycle case. Its trace reached administrator
order/payment navigation without a preceding assertion failure. Preserve that
failed run and trace; do not label it a passed full browser invocation. The focused
lifecycle and guest-checkout retry passed both cases against a fresh fictional
database without increasing the timeout or changing assertions. Hosted CI must
pass the full browser command before delivery.

The private staff driver also initially retained `NODE_ENV=test` for a Next
development server, selecting production-style CSP and producing a React debugging
warning. Two no-write checks detected an unexpected POST. With the canonical
development mode restored, all four staff browser cases passed in 26.8 seconds.
No application CSP or no-write assertion was weakened.

Local acceptance completed on 2026-11-01 with Node 24.20.0 and pinned pnpm 11.22.0.
Frozen install, all package constituents, lint, types, API integration, critical
invariants, the recorded browser retry, staff checks and production builds pass.
The final production audit is clear; the raw full audit still reports the two
documented version-based findings. The Office environment and both original
running container identities match, and all owned test containers were removed.
See the command report for counts, initial failures and the protected delivery gate.

Command 161 rebuilt and deployed the validated source at
`e2c207a72511b13578dba84e63979ea794449455` to staging with Node 24 and frozen pinned
pnpm image builds. Production dependency audit passed exact-release CI; this does
not clear the two documented raw full-graph warnings. Later Dependabot legacy-minimatch
update attempts reported `security_update_not_possible`; no additional upgrade or
waiver is claimed. See [the deployment record](STAGING_DEPLOYMENT.md).
Staging installation does not close unrelated operating gates. Keep SMTP active and
payment, real hosting, registrar and WhatsApp disabled there.

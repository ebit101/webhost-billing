# Development-tooling mitigations

Command 95 registers exact-version, repository-maintained pnpm patches. These are
local mitigations, not upstream releases or an assertion that registry advisories
are closed. Package names, versions, registry integrity and existing production
overrides remain unchanged. No vulnerability is ignored or severity changed.

## Scope and behavior

- `braces@3.0.3.patch` mitigates [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
  in the Next lint / fast-glob / micromatch development chain. An iterative preflight
  bounds AST depth to 128 edges, total visits to 65,536 and parent ancestry to 128
  edges; cyclic child/parent links are rejected. Parser nesting allows 127 blocks
  plus their leaf nodes. Direct compile/expand/stringify callers receive the same
  checks. Expansion's nested-array helpers also enforce a 128-level limit. Unbalanced
  patterns retain the upstream parser's legitimate old parent links. Unsupported
  input raises a stable `SyntaxError` before stack exhaustion; callers must catch
  it and report invalid configuration rather than continuing with unsafe input.
- `sprintf-js@1.0.3.patch` mitigates [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
  in Jest / Istanbul / YAML / argparse development tooling. Numeric `e`/`f` precision
  accepts 0–100; `g` accepts 1–100. An out-of-range directive is rendered literally,
  consuming its implicit argument but preserving explicit/named positions. It does
  not invoke native numeric formatting, throw a new precision exception or silently
  clamp the result. For example, `sprintf('%.101f %s', 1, 'after')` returns
  `%.101f after`. Normal formats are unchanged; other existing malformed-format
  errors retain their behavior. This formatter is not an application money API.

These patches address the named depth/precision paths, not every possible resource
exhaustion scenario. Expansion output/range controls, trusted executable configurations,
arbitrary JavaScript getters/proxies, huge format widths and cache/input budgets require
their own review. Do not expose development tooling as a public rendering service or
assume a local patch makes untrusted repository code safe to execute with secrets.

## Verify and maintain

```bash
pnpm install --frozen-lockfile
pnpm test:tooling-security
pnpm audit
pnpm audit --prod
```

The mitigation suite resolves through actual Next lint and Jest coverage consumers,
verifies registered patch hashes, and runs normal/adversarial cases in child processes
with bounded heap, stack, output and duration. It is part of root `pnpm test` and an
explicit early CI step. Audit is independent: full audit can still return exit 1 for
the original version-based findings even when mitigation verification passes. The
existing production audit gate remains mandatory. Do not call full audit clean or
close a repository alert based solely on patch test results.

Container install layers copy the patch directory before their frozen install. The
mitigation suite checks all seven existing pnpm Dockerfiles for this ordering; the
ordinary application entrypoints and deployment settings are unchanged.

Use [pnpm's patch mechanism](https://pnpm.io/cli/patch), never hand-edit installed
`node_modules`. Keep exact versions and unused-patch tolerance disabled. Review any
patch/hash change with these tests, real lint/coverage, complete acceptance and frozen
installation. The original upstream code/licenses remain in the packages; reproduced
notices for redistributed patch context are in [License notices](LICENSES.txt).

Remove a patch only in a separately authorized change after a verified published
upstream release or compatible consumer change eliminates the affected path, passes
the same regression/acceptance gates and reconciles audit/alert evidence. At Command 95
start, registry metadata contained no `braces` 3.0.4 or `sprintf-js` 1.1.4 release.
The [sprintf-js proposal](https://github.com/alexei/sprintf.js/pull/238) is unmerged;
its code was not installed or copied as an approved fix. Local changes here are authored
for the installed versions from the advisory/source evidence, with no upstream endorsement.

Sources: [braces upstream](https://github.com/micromatch/braces),
[sprintf-js upstream](https://github.com/alexei/sprintf.js).

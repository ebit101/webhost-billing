import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  checkContributorPathMap,
  contributorPathContract,
  formatContributorPathReport,
  runContributorPathCheck,
} from './check-contributor-paths.mjs';

function createRepository(context, options = {}) {
  const repositoryRoot = mkdtempSync(
    join(tmpdir(), 'webhost-billing-contributor-paths-'),
  );
  context.after(() => rmSync(repositoryRoot, { force: true, recursive: true }));
  mkdirSync(join(repositoryRoot, 'docs'), { recursive: true });
  mkdirSync(join(repositoryRoot, 'apps', 'example'), { recursive: true });
  writeFileSync(
    join(repositoryRoot, 'apps', 'example', 'test.spec.ts'),
    'export {};\n',
  );
  writeFileSync(join(repositoryRoot, 'docs', 'guide.md'), '# Guide\n');
  writeFileSync(
    join(repositoryRoot, 'package.json'),
    JSON.stringify({ scripts: options.scripts ?? { test: 'node --test' } }),
  );
  return repositoryRoot;
}

function mapDocument(options = {}) {
  const headings =
    options.headings ?? contributorPathContract.requiredAreaHeadings;
  const sections = headings
    .map(
      (heading) =>
        `### ${heading}\n\n- [Source](../apps/example/)\n- [Test](../apps/example/test.spec.ts)\n- [Guide](guide.md)\n\n\`\`\`bash\ncorepack pnpm ${options.script ?? 'test'}\n\`\`\``,
    )
    .join('\n\n');
  return `# Contributor paths\n\n${sections}\n${options.extra ?? ''}`;
}

test('accepts current local links and existing root pnpm scripts', (context) => {
  const repositoryRoot = createRepository(context);
  writeFileSync(
    join(repositoryRoot, contributorPathContract.mapFile),
    mapDocument({ extra: '\nRun `corepack pnpm test`.\n' }),
  );

  const result = checkContributorPathMap({ repositoryRoot });

  assert.deepEqual(result.failures, []);
  assert.equal(result.checkedPathCount, 18);
  assert.equal(result.checkedScriptCount, 1);
  assert.match(
    formatContributorPathReport(result),
    /18 contributor-map paths/u,
  );
});

test('reports missing paths and root scripts together', (context) => {
  const repositoryRoot = createRepository(context);
  writeFileSync(
    join(repositoryRoot, contributorPathContract.mapFile),
    mapDocument({
      extra: '\n[Missing](../apps/missing/)\n',
      script: 'missing:script',
    }),
  );

  const result = checkContributorPathMap({ repositoryRoot });

  assert.equal(
    result.failures.filter((failure) =>
      failure.reason.includes('root pnpm script'),
    ).length,
    6,
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes('target does not exist'),
    ),
  );
});

test('rejects missing areas, unlinked paths, and pnpm option commands', (context) => {
  const repositoryRoot = createRepository(context);
  writeFileSync(
    join(repositoryRoot, contributorPathContract.mapFile),
    mapDocument({
      extra:
        '\nUse `apps/example/unsafe.ts` and run `corepack pnpm missing:inline`.\n\n```bash\ncorepack pnpm --filter example test\n```\n',
      headings: contributorPathContract.requiredAreaHeadings.slice(1),
    }),
  );

  const result = checkContributorPathMap({ repositoryRoot });

  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes(
        'required area heading "Demo tooling" is missing',
      ),
    ),
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes('must be a local Markdown link'),
    ),
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes('without pnpm options'),
    ),
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes(
        'root pnpm script "missing:inline" does not exist',
      ),
    ),
  );

  let output = '';
  const exitCode = runContributorPathCheck({
    repositoryRoot,
    write: (value) => {
      output += value;
    },
  });
  assert.equal(exitCode, 1);
  assert.match(output, /Contributor path validation failed/u);
});

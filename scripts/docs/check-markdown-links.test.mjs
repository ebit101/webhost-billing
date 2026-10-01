import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  checkMarkdownFiles,
  formatLinkCheckReport,
  runMarkdownLinkCheck,
} from './check-markdown-links.mjs';

const fixturesDirectory = join(import.meta.dirname, '__fixtures__');

function createRepository(context, fixtureName) {
  const repositoryRoot = mkdtempSync(
    join(tmpdir(), 'webhost-billing-markdown-links-'),
  );
  context.after(() => rmSync(repositoryRoot, { force: true, recursive: true }));
  mkdirSync(join(repositoryRoot, 'docs', 'assets'), { recursive: true });
  writeFileSync(
    join(repositoryRoot, 'docs', 'source.md'),
    readFileSync(join(fixturesDirectory, fixtureName), 'utf8'),
  );
  return repositoryRoot;
}

test('accepts valid links, images, encoded paths, and safe parent references', (context) => {
  const repositoryRoot = createRepository(context, 'valid.md.fixture');
  writeFileSync(join(repositoryRoot, 'README.md'), '# Root\n');
  writeFileSync(join(repositoryRoot, 'docs', 'guide.md'), '# Guide\n');
  writeFileSync(join(repositoryRoot, 'docs', 'encoded name.md'), '# Encoded\n');
  writeFileSync(
    join(repositoryRoot, 'docs', 'assets', 'example image.png'),
    'fake',
  );

  const result = checkMarkdownFiles({
    files: ['docs/source.md'],
    repositoryRoot,
  });

  assert.equal(result.checkedReferenceCount, 5);
  assert.deepEqual(result.failures, []);
});

test('ignores external, mailto, document-fragment, and code references', (context) => {
  const repositoryRoot = createRepository(context, 'ignored.md.fixture');

  const result = checkMarkdownFiles({
    files: ['docs/source.md'],
    repositoryRoot,
  });

  assert.equal(result.checkedReferenceCount, 0);
  assert.deepEqual(result.failures, []);
});

test('reports every missing file and image with source lines', (context) => {
  const repositoryRoot = createRepository(context, 'missing.md.fixture');

  const result = checkMarkdownFiles({
    files: ['docs/source.md'],
    repositoryRoot,
  });

  assert.equal(result.failures.length, 2);
  assert.deepEqual(
    result.failures.map(({ line, reason, target }) => ({
      line,
      reason,
      target,
    })),
    [
      { line: 2, reason: 'target does not exist', target: 'missing.md' },
      {
        line: 4,
        reason: 'target does not exist',
        target: 'assets/missing.png',
      },
    ],
  );
  const report = formatLinkCheckReport(result, 1);
  assert.match(report, /docs\/source\.md:2 "missing\.md"/u);
  assert.match(report, /docs\/source\.md:4 "assets\/missing\.png"/u);

  let commandOutput = '';
  const exitCode = runMarkdownLinkCheck({
    files: ['docs/source.md'],
    repositoryRoot,
    write: (value) => {
      commandOutput += value;
    },
  });
  assert.equal(exitCode, 1);
  assert.match(commandOutput, /failed with 2 broken references/u);
});

test('rejects traversal outside the repository and invalid URL encoding', (context) => {
  const repositoryRoot = createRepository(context, 'unsafe.md.fixture');

  const result = checkMarkdownFiles({
    files: ['docs/source.md'],
    repositoryRoot,
  });

  assert.deepEqual(
    result.failures.map(({ reason, target }) => ({ reason, target })),
    [
      {
        reason: 'resolves outside the repository',
        target: '../../outside.md',
      },
      { reason: 'contains invalid URL encoding', target: 'bad%ZZ.md' },
    ],
  );
});

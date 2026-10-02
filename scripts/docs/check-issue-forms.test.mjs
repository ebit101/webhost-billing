import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkIssueForms,
  formatIssueFormReport,
  issueFormContract,
  runIssueFormCheck,
} from './check-issue-forms.mjs';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const currentBugReport = readFileSync(
  join(
    repositoryRoot,
    issueFormContract.templateDirectory,
    issueFormContract.bugReportFile,
  ),
  'utf8',
);

function createRepository(context, bugReport = currentBugReport) {
  const root = mkdtempSync(join(tmpdir(), 'webhost-billing-issue-forms-'));
  context.after(() => rmSync(root, { force: true, recursive: true }));
  mkdirSync(join(root, '.github', 'ISSUE_TEMPLATE'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(
    join(root, '.github', 'ISSUE_TEMPLATE', 'bug_report.yml'),
    bugReport,
  );
  writeFileSync(
    join(root, '.github', 'ISSUE_TEMPLATE', 'config.yml'),
    'blank_issues_enabled: false\n',
  );
  writeFileSync(
    join(root, 'docs', 'SAFE_EVALUATION_DEMO.md'),
    '# Safe Evaluation Demo\n\n## Troubleshooting\n',
  );
  writeFileSync(
    join(root, 'SECURITY.md'),
    '# Security Policy\n\n## Reporting a vulnerability\n',
  );
  return root;
}

test('parses every current issue-form YAML file and enforces the safe-demo contract', () => {
  const result = checkIssueForms({ repositoryRoot });

  assert.deepEqual(result.failures, []);
  assert.equal(result.issueFormCount, 3);
  assert.equal(result.parsedYamlCount, 4);
  assert.equal(result.guidanceLinkCount, 2);
  assert.match(
    formatIssueFormReport(result),
    /Validated 3 GitHub issue forms/u,
  );
});

test('reports malformed YAML without echoing document content', (context) => {
  const malformed = 'name: Bug report\ndescription: [unterminated\n';
  const root = createRepository(context, malformed);

  const result = checkIssueForms({ repositoryRoot: root });

  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes('does not parse as one YAML mapping'),
    ),
  );
  assert.doesNotMatch(formatIssueFormReport(result), /unterminated/u);
});

test('rejects a missing safe-demo option, required core field, and safety term', (context) => {
  const unsafeReport = currentBugReport
    .replace('        - Safe evaluation demo\n', '')
    .replace('    id: steps\n', '    id: optional_steps\n')
    .replace(
      '  - type: input\n    id: operating_system\n',
      '  - type: textarea\n    id: operating_system\n',
    )
    .replaceAll('database contents', 'stored records');
  const root = createRepository(context, unsafeReport);

  const result = checkIssueForms({ repositoryRoot: root });

  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes('deployment options must include'),
    ),
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes('bug field "steps" must exist and be required'),
    ),
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes('must cover "database content"'),
    ),
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes('field "operating_system" must use input'),
    ),
  );
});

test('reports duplicate ids and invalid guidance links together', (context) => {
  const invalidReport = currentBugReport
    .replace('    id: actual\n', '    id: expected\n')
    .replace(
      '../../docs/SAFE_EVALUATION_DEMO.md#troubleshooting',
      '../../docs/SAFE_EVALUATION_DEMO.md#missing-heading',
    )
    .replace(
      '../../SECURITY.md#reporting-a-vulnerability',
      'http://example.test/security',
    );
  const root = createRepository(context, invalidReport);

  const result = checkIssueForms({ repositoryRoot: root });

  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes('field id "expected" is duplicated'),
    ),
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes('guidance link heading anchor does not exist'),
    ),
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes(
        'must use HTTPS or a repository-local relative path',
      ),
    ),
  );

  let output = '';
  const exitCode = runIssueFormCheck({
    repositoryRoot: root,
    write: (value) => {
      output += value;
    },
  });
  assert.equal(exitCode, 1);
  assert.match(output, /Issue-form validation failed/u);
});

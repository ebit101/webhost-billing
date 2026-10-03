import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  documentationCheckContract,
  runDocumentationChecks,
} from './check-documentation.mjs';

function captureRun(runner, options = {}) {
  let output = '';
  const status = runDocumentationChecks({
    environment: options.environment,
    repositoryRoot: resolve('fixture', 'repository'),
    runner,
    write: (value) => {
      output += value;
    },
  });
  return { output, status };
}

test('dispatches the complete allowlist in deterministic order', () => {
  const calls = [];
  const result = captureRun((invocation) => {
    calls.push(invocation);
    return { status: 0 };
  });

  assert.equal(result.status, 0);
  assert.deepEqual(
    calls.map((call) => call.validator.script),
    documentationCheckContract.validators.map((validator) => validator.script),
  );
  assert.deepEqual(
    calls.map((call) => call.source),
    documentationCheckContract.validators.map((validator) =>
      resolve('fixture', 'repository', validator.source),
    ),
  );
  assert.match(result.output, /1\/4 RUN pnpm docs:links/u);
  assert.match(result.output, /4\/4 PASS pnpm docs:demo-assets/u);
  assert.match(result.output, /PASS 4 offline documentation validators/u);
});

test('returns the first failing child status', () => {
  let callCount = 0;
  const result = captureRun(() => {
    callCount += 1;
    return { status: callCount === 2 ? 23 : 0 };
  });

  assert.equal(result.status, 23);
  assert.match(result.output, /2\/4 FAIL pnpm docs:paths \(exit 23\)/u);
});

test('does not dispatch validators after a failure', () => {
  const calls = [];
  const result = captureRun((invocation) => {
    calls.push(invocation.validator.script);
    if (calls.length === 2) throw new Error('UNTRUSTED_CHILD_ERROR');
    return { status: 0 };
  });

  assert.equal(result.status, 1);
  assert.deepEqual(calls, ['docs:links', 'docs:paths']);
  assert.doesNotMatch(result.output, /docs:issue-forms|docs:demo-assets/u);
  assert.doesNotMatch(result.output, /UNTRUSTED_CHILD_ERROR/u);
});

test('discards raw child output and does not forward ambient secrets', () => {
  const secret = 'SUPER_SECRET_ENVIRONMENT_VALUE';
  const environments = [];
  const result = captureRun(
    (invocation) => {
      environments.push(invocation.environment);
      return {
        error: new Error(secret),
        status: 7,
        stderr: `stderr:${secret}`,
        stdout: `stdout:${secret}`,
      };
    },
    {
      environment: {
        PATH: 'safe-path',
        WEBHOST_BILLING_SECRET: secret,
      },
    },
  );

  assert.equal(result.status, 7);
  assert.deepEqual(environments, [{ PATH: 'safe-path' }]);
  assert.doesNotMatch(result.output, new RegExp(secret, 'u'));
  assert.match(result.output, /Run the focused command for safe diagnostics/u);
});

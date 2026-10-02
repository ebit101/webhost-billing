import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runDemoSmoke } from './demo-smoke.mjs';

const secretSentinel = 'SMOKE_SECRET_SENTINEL';

function runtimeBody(overrides = {}) {
  return `${Object.entries({
    DEMO_ADMIN_PASSWORD: `${secretSentinel}-admin`,
    DEMO_CUSTOMER_PASSWORD: `${secretSentinel}-customer`,
    DEMO_PUBLIC_ORIGIN: 'http://localhost:3100',
    ...overrides,
  })
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')}\n`;
}

function createRuntime(context, body = runtimeBody()) {
  const directory = mkdtempSync(join(tmpdir(), 'webhost-billing-smoke-'));
  const runtimePath = join(directory, 'demo.env');
  writeFileSync(runtimePath, body, 'utf8');
  context.after(() => rmSync(directory, { force: true, recursive: true }));
  return runtimePath;
}

function trustedBrowserOutput(failedRoute) {
  return `${JSON.stringify({
    checks: ['/hosting', '/portal', '/admin'].map((route) => ({
      passed: route !== failedRoute,
      route,
    })),
    version: 1,
  })}\n`;
}

async function executeSmoke(options) {
  let output = '';
  const exitCode = await runDemoSmoke({
    browserVerifier: 'smoke-safe-demo.ts',
    processExecutable: 'node',
    sourceEnvironment: { SAFE_PARENT_VALUE: 'retained' },
    tsxEntry: 'tsx-cli.mjs',
    write: (value) => {
      output += value;
    },
    ...options,
  });
  return { exitCode, output };
}

test('refuses a missing runtime file before readiness or browser dispatch', async () => {
  let touched = false;
  const result = await executeSmoke({
    processRunner: () => {
      touched = true;
      throw new Error('must not run');
    },
    readinessProbe: async () => {
      touched = true;
      return true;
    },
    runtimePath: join(tmpdir(), 'missing-smoke-runtime', 'demo.env'),
  });

  assert.equal(result.exitCode, 1);
  assert.equal(touched, false);
  assert.match(
    result.output,
    /FAIL preflight: generated demo runtime file is missing/u,
  );
  assert.match(result.output, /pnpm demo:up/u);
});

test('refuses non-regular runtime metadata before reading values', async (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'webhost-billing-smoke-dir-'));
  const runtimePath = join(directory, 'demo.env');
  mkdirSync(runtimePath);
  context.after(() => rmSync(directory, { force: true, recursive: true }));

  const result = await executeSmoke({ runtimePath });

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /not a readable regular file/u);
});

test('refuses a non-fixed origin without leaking runtime values', async (context) => {
  const runtimePath = createRuntime(
    context,
    runtimeBody({ DEMO_PUBLIC_ORIGIN: 'https://example.invalid' }),
  );

  const result = await executeSmoke({ runtimePath });

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /fixed demo origin is not configured/u);
  assert.doesNotMatch(result.output, /example\.invalid|SMOKE_SECRET_SENTINEL/u);
});

test('refuses ambiguous runtime entries without dispatching a browser', async (context) => {
  const runtimePath = createRuntime(
    context,
    `${runtimeBody()}DEMO_PUBLIC_ORIGIN=http://localhost:3100\n`,
  );
  let processCalled = false;

  const result = await executeSmoke({
    processRunner: () => {
      processCalled = true;
      throw new Error('must not run');
    },
    runtimePath,
  });

  assert.equal(result.exitCode, 1);
  assert.equal(processCalled, false);
  assert.match(result.output, /fixed demo origin is not configured/u);
  assert.doesNotMatch(result.output, /SMOKE_SECRET_SENTINEL/u);
});

test('fails with fixed remediation when the existing demo is not ready', async (context) => {
  const runtimePath = createRuntime(context);
  let processCallCount = 0;

  const result = await executeSmoke({
    processRunner: () => {
      processCallCount += 1;
      throw new Error('must not run');
    },
    readinessProbe: async () => false,
    runtimePath,
  });

  assert.equal(result.exitCode, 1);
  assert.equal(processCallCount, 0);
  assert.match(result.output, /fixed loopback demo is not ready/u);
  assert.match(result.output, /pnpm demo:status/u);
});

test('dispatches pinned Chromium and the browser verifier with only fixed targets', async (context) => {
  const runtimePath = createRuntime(context);
  const calls = [];
  const processRunner = (command, args, options) => {
    calls.push({ args, command, options });
    return {
      error: false,
      status: 0,
      stderr: '',
      stdout: trustedBrowserOutput(),
    };
  };

  const result = await executeSmoke({
    processRunner,
    readinessProbe: async () => true,
    runtimePath,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['tsx-cli.mjs', 'smoke-safe-demo.ts']);
  assert.equal(
    calls[0].options.env.DEMO_PUBLIC_ORIGIN,
    'http://localhost:3100',
  );
  assert.equal(calls[0].options.env.SAFE_PARENT_VALUE, 'retained');
  assert.match(result.output, /PASS \/ready/u);
  assert.match(result.output, /PASS \/hosting/u);
  assert.match(result.output, /PASS \/portal/u);
  assert.match(result.output, /PASS \/admin/u);
  assert.match(result.output, /RESULT Passed 4 read-only checks/u);
  assert.doesNotMatch(result.output, /SMOKE_SECRET_SENTINEL/u);
});

test('reports a bounded route failure and discards raw process errors', async (context) => {
  const runtimePath = createRuntime(context);
  const result = await executeSmoke({
    processRunner: () => ({
      error: false,
      status: 1,
      stderr: `browser error ${secretSentinel}`,
      stdout: trustedBrowserOutput('/portal'),
    }),
    readinessProbe: async () => true,
    runtimePath,
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /PASS \/hosting/u);
  assert.match(result.output, /FAIL \/portal/u);
  assert.match(result.output, /PASS \/admin/u);
  assert.doesNotMatch(result.output, /browser error|SMOKE_SECRET_SENTINEL/u);
});

test('rejects untrusted browser output without echoing it', async (context) => {
  const runtimePath = createRuntime(context);
  const result = await executeSmoke({
    processRunner: () => ({
      error: false,
      status: 1,
      stderr: '',
      stdout: `not-json ${secretSentinel}`,
    }),
    readinessProbe: async () => true,
    runtimePath,
  });

  assert.equal(result.exitCode, 1);
  assert.match(
    result.output,
    /browser verifier did not return a trusted result/u,
  );
  assert.doesNotMatch(result.output, /not-json|SMOKE_SECRET_SENTINEL/u);
});

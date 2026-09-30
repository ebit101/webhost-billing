import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runDemoDoctor } from './demo-doctor.mjs';

function passingCommand(command, args) {
  assert.equal(command, 'docker');
  if (args[0] === '--version') {
    return { status: 0, stdout: 'Docker version 29.6.2, build fictional' };
  }
  if (args[0] === 'compose') {
    return { status: 0, stdout: 'v5.3.1' };
  }
  return { status: 0, stdout: '29.6.2' };
}

async function capture(options) {
  let output = '';
  const exitCode = await runDemoDoctor({
    ...options,
    write: (value) => {
      output += value;
    },
  });
  return { exitCode, output };
}

test('passes with supported Docker, an available port, and redacted runtime metadata', async (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'webhost-billing-doctor-'));
  context.after(() => rmSync(directory, { force: true, recursive: true }));
  const runtimePath = join(directory, 'demo.env');
  const sentinel = 'DOCTOR_SENTINEL=must-never-be-printed';
  writeFileSync(runtimePath, `${sentinel}\n`, 'utf8');

  const result = await capture({
    commandRunner: passingCommand,
    portProbe: async () => ({ available: true }),
    runtimePath,
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /PASS Docker CLI: version 29\.6\.2/u);
  assert.match(result.output, /PASS Docker Compose: version 5\.3\.1/u);
  assert.match(
    result.output,
    /PASS Docker Engine: available \(server 29\.6\.2\)/u,
  );
  assert.match(result.output, /PASS Loopback port 3100: available/u);
  assert.match(
    result.output,
    /contents were not read; all values remain redacted/u,
  );
  assert.doesNotMatch(result.output, /must-never-be-printed/u);
  assert.match(result.output, /RESULT Ready\. No changes were made\./u);
});

test('treats an absent runtime file as safe first-run information', async () => {
  const result = await capture({
    commandRunner: passingCommand,
    portProbe: async () => ({ available: true }),
    runtimePath: join(tmpdir(), 'webhost-billing-doctor-missing', 'demo.env'),
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /INFO Demo runtime file: not present/u);
});

test('fails with fixed remediation when the Docker CLI is unavailable', async () => {
  const leakedError = 'DOCTOR_SENTINEL=never-show-this';
  const result = await capture({
    commandRunner: () => ({
      errorCode: 'ENOENT',
      status: null,
      stdout: leakedError,
    }),
    portProbe: async () => ({ available: true }),
    runtimeInspector: () => 'missing',
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /FAIL Docker CLI/u);
  assert.match(
    result.output,
    /Install a supported Docker Engine or Docker Desktop/u,
  );
  assert.match(result.output, /FAIL Docker Compose/u);
  assert.match(result.output, /FAIL Docker Engine/u);
  assert.doesNotMatch(result.output, /never-show-this/u);
});

test('fails when Compose is unsupported and Engine is unavailable without leaking errors', async () => {
  const result = await capture({
    commandRunner: (_command, args) => {
      if (args[0] === '--version') {
        return { status: 0, stdout: 'Docker version 29.6.2' };
      }
      if (args[0] === 'compose') {
        return { status: 0, stdout: '1.29.2' };
      }
      return {
        status: 1,
        stdout: 'DOCTOR_SENTINEL=must-stay-redacted',
      };
    },
    portProbe: async () => ({ available: true }),
    runtimeInspector: () => 'file',
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /unsupported version 1\.29\.2/u);
  assert.match(result.output, /Start Docker Engine or Docker Desktop/u);
  assert.doesNotMatch(result.output, /must-stay-redacted/u);
});

test('fails with port-specific remediation when loopback port 3100 is busy', async () => {
  const result = await capture({
    commandRunner: passingCommand,
    portProbe: async () => ({
      available: false,
      errorCode: 'EADDRINUSE',
    }),
    runtimeInspector: () => 'missing',
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /FAIL Loopback port 3100: already in use/u);
  assert.match(result.output, /pnpm demo:down/u);
  assert.match(result.output, /RESULT Not ready: 1 prerequisite check failed/u);
});

test('fails safely when the runtime path is not a regular file', async () => {
  const result = await capture({
    commandRunner: passingCommand,
    portProbe: async () => ({ available: true }),
    runtimeInspector: () => 'invalid',
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /FAIL Demo runtime file/u);
  assert.match(result.output, /move the conflicting non-file path/u);
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { repositoryRoot } from './tooling-dependencies.mjs';

const child = resolve(
  repositoryRoot,
  'scripts/security/tooling-mitigation-child.mjs',
);
const handlebarsChild = resolve(
  repositoryRoot,
  'scripts/security/handlebars-security-child.mjs',
);
const allowedEnvironment = new Set([
  'path',
  'pathext',
  'systemroot',
  'windir',
  'lang',
  'lc_all',
]);
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    allowedEnvironment.has(key.toLowerCase()),
  ),
);

test('both exact-version patches are registered and required', () => {
  const workspace = readFileSync(
    resolve(repositoryRoot, 'pnpm-workspace.yaml'),
    'utf8',
  );
  const lockfile = readFileSync(
    resolve(repositoryRoot, 'pnpm-lock.yaml'),
    'utf8',
  );
  for (const [name, version] of [
    ['braces', '3.0.3'],
    ['sprintf-js', '1.0.3'],
  ]) {
    const file = `patches/${name}@${version}.patch`;
    assert.ok(workspace.includes(`${name}@${version}: ${file}`));
    const patch = readFileSync(resolve(repositoryRoot, file), 'utf8');
    const hash = createHash('sha256').update(patch).digest('hex');
    assert.ok(lockfile.includes(`${name}@${version}: ${hash}`));
    assert.ok(patch.includes('Local'));
  }
  assert.doesNotMatch(
    workspace,
    /allowUnusedPatches:\s*true|ignorePatchFailures:\s*true/,
  );
});

test('every container pnpm install layer receives the registered patches first', () => {
  for (const file of [
    'apps/api/Dockerfile',
    'apps/api/Dockerfile.dev',
    'apps/web/Dockerfile',
    'apps/web/Dockerfile.dev',
    'apps/worker/Dockerfile',
    'apps/worker/Dockerfile.dev',
    'deploy/production/migration/Dockerfile',
  ]) {
    const source = readFileSync(resolve(repositoryRoot, file), 'utf8');
    const copy = source.indexOf('COPY patches/ ./patches/');
    const install = source.indexOf('pnpm install');
    assert.ok(copy >= 0 && install > copy, file);
  }
});

for (const name of [
  'brace-patterns',
  'brace-ast',
  'brace-consumers',
  'formatter-invalid',
  'formatter-normal',
  'formatter-native-bounds',
  'formatter-async',
  'coverage-consumers',
]) {
  test(`installed tooling mitigation: ${name}`, { timeout: 20_000 }, () => {
    const result = spawnSync(
      process.execPath,
      [
        '--max-old-space-size=128',
        '--stack-size=512',
        '--unhandled-rejections=strict',
        child,
        name,
      ],
      {
        cwd: repositoryRoot,
        env: environment,
        encoding: 'utf8',
        timeout: 15_000,
        maxBuffer: 64 * 1024,
        windowsHide: true,
      },
    );
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`${name}: passed`));
    assert.doesNotMatch(
      result.stderr,
      /Maximum call stack|FATAL ERROR|uncaught/i,
    );
  });
}

for (const name of [
  'handlebars-consumers',
  'handlebars-ast',
  'handlebars-constructors',
  'handlebars-inline',
  'handlebars-compatibility',
]) {
  test(`installed Handlebars repair: ${name}`, { timeout: 20_000 }, () => {
    const result = spawnSync(
      process.execPath,
      [
        '--max-old-space-size=128',
        '--stack-size=512',
        '--unhandled-rejections=strict',
        handlebarsChild,
        name,
      ],
      {
        cwd: repositoryRoot,
        env: environment,
        encoding: 'utf8',
        timeout: 15_000,
        maxBuffer: 64 * 1024,
        windowsHide: true,
      },
    );
    // Deliberately do not echo generated code or a failing probe's raw error.
    assert.equal(result.error, undefined, 'Bounded child did not complete');
    assert.equal(result.signal, null, 'Bounded child was terminated');
    assert.equal(result.status, 0, `${name}: regression failed`);
    assert.ok(
      result.stdout.trim() === `${name}: passed`,
      'Unexpected child output',
    );
    assert.ok(result.stderr === '', 'Unexpected child diagnostic');
  });
}

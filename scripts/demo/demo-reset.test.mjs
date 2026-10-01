import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { demoResetContract, runDemoReset } from './demo-reset.mjs';

const root = resolve('fictional', 'webhost-billing');
const composeDirectory = join(root, 'demo');
const composePath = join(composeDirectory, 'compose.demo.yaml');
const runtimeDirectory = join(root, '.demo-runtime');
const runtimePath = join(runtimeDirectory, 'demo.env');

function metadata(type) {
  return {
    isDirectory: () => type === 'directory',
    isFile: () => type === 'file',
    isSymbolicLink: () => type === 'symlink',
  };
}

function missingError() {
  return Object.assign(new Error('not found'), { code: 'ENOENT' });
}

function createFileSystem(options = {}) {
  const entries = new Map([
    [root, 'directory'],
    [composeDirectory, 'directory'],
    [composePath, 'file'],
    [runtimeDirectory, options.runtimeDirectoryType ?? 'directory'],
    ...(options.runtimeType === 'missing'
      ? []
      : [[runtimePath, options.runtimeType ?? 'file']]),
  ]);
  const unlinked = [];
  return {
    api: {
      lstat: (path) => {
        const type = entries.get(path);
        if (!type) throw missingError();
        return metadata(type);
      },
      realpath: (path) => options.realpaths?.get(path) ?? path,
      unlink: (path) => {
        if (options.unlinkError) throw new Error('RESET_SECRET_SENTINEL');
        unlinked.push(path);
        entries.delete(path);
      },
    },
    entries,
    unlinked,
  };
}

function successfulDocker(calls, options = {}) {
  return (command, args, commandOptions) => {
    calls.push({ args, command, options: commandOptions });
    if (args[2] === 'compose') {
      return options.downResult ?? { status: 0, stdout: '' };
    }
    return options.inspectResult?.(args) ?? { status: 0, stdout: '' };
  };
}

async function capture(options = {}) {
  let output = '';
  const exitCode = await runDemoReset({
    args: [demoResetContract.confirmationFlag],
    environment: {},
    repositoryRoot: root,
    write: (value) => {
      output += value;
    },
    ...options,
  });
  return { exitCode, output };
}

test('refuses without the one exact confirmation flag and changes nothing', async () => {
  for (const args of [
    [],
    ['--yes'],
    [demoResetContract.confirmationFlag, '--project-name=other'],
  ]) {
    let commandCalled = false;
    let fileSystemCalled = false;
    const result = await capture({
      args,
      commandRunner: () => {
        commandCalled = true;
        return { status: 0, stdout: '' };
      },
      fileSystem: {
        lstat: () => {
          fileSystemCalled = true;
          return metadata('file');
        },
      },
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.output, /Safe demo reset refused/u);
    assert.match(result.output, /--confirm-reset-demo/u);
    assert.equal(commandCalled, false);
    assert.equal(fileSystemCalled, false);
  }
});

test('accepts the pnpm argument separator only with the exact confirmation flag', async () => {
  const fileSystem = createFileSystem({ runtimeType: 'missing' });
  const calls = [];
  const result = await capture({
    args: ['--', demoResetContract.confirmationFlag],
    commandRunner: successfulDocker(calls),
    fileSystem: fileSystem.api,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 4);
});

test('removes only the fixed project state before the exact runtime file', async () => {
  const fileSystem = createFileSystem();
  const calls = [];
  const unlink = fileSystem.api.unlink;
  fileSystem.api.unlink = (path) => {
    assert.equal(
      calls.length,
      4,
      'Docker cleanup must be verified before unlink',
    );
    unlink(path);
  };
  const result = await capture({
    commandRunner: successfulDocker(calls),
    environment: {},
    fileSystem: fileSystem.api,
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(fileSystem.unlinked, [runtimePath]);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0].args, [
    '--context',
    'default',
    'compose',
    '--project-name',
    'webhost-billing-demo',
    '--project-directory',
    composeDirectory,
    '--file',
    composePath,
    'down',
    '--volumes',
    '--remove-orphans',
    '--timeout',
    '30',
  ]);
  assert.deepEqual(
    calls.slice(1).map((call) => call.args),
    [
      [
        '--context',
        'default',
        'ps',
        '--all',
        '--quiet',
        '--filter',
        'label=com.docker.compose.project=webhost-billing-demo',
      ],
      [
        '--context',
        'default',
        'network',
        'ls',
        '--quiet',
        '--filter',
        'label=com.docker.compose.project=webhost-billing-demo',
      ],
      [
        '--context',
        'default',
        'volume',
        'ls',
        '--quiet',
        '--filter',
        'label=com.docker.compose.project=webhost-billing-demo',
      ],
    ],
  );
  assert.ok(calls.every((call) => call.command === 'docker'));
  assert.ok(calls.every((call) => call.options.cwd === root));
  assert.equal(calls[0].options.env.COMPOSE_FILE, undefined);
  assert.equal(calls[0].options.env.COMPOSE_PROJECT_NAME, undefined);
  assert.match(
    result.output,
    /webhost-billing-demo containers, networks, and volumes/u,
  );
  assert.match(result.output, /Run `pnpm demo:up`/u);
});

test('refuses Docker and Compose target environment overrides', async () => {
  for (const environment of [
    { COMPOSE_FILE: 'unsafe.yaml' },
    { COMPOSE_PROJECT_NAME: 'unsafe-project' },
    { DOCKER_HOST: 'tcp://example.test:2375' },
  ]) {
    let commandCalled = false;
    let fileSystemCalled = false;
    const result = await capture({
      commandRunner: () => {
        commandCalled = true;
        return { status: 0, stdout: '' };
      },
      environment,
      fileSystem: {
        lstat: () => {
          fileSystemCalled = true;
          return metadata('file');
        },
      },
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.output, /target overrides are not accepted/u);
    assert.equal(commandCalled, false);
    assert.equal(fileSystemCalled, false);
  }
});

test('is idempotent when runtime credentials and Docker state are absent', async () => {
  const fileSystem = createFileSystem({ runtimeType: 'missing' });
  const calls = [];
  const result = await capture({
    commandRunner: successfulDocker(calls),
    fileSystem: fileSystem.api,
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(fileSystem.unlinked, []);
  assert.equal(calls.length, 4);
  assert.match(result.output, /credentials were already absent/u);
});

test('preserves the runtime file and redacts Docker cleanup failures', async () => {
  const fileSystem = createFileSystem();
  const calls = [];
  const result = await capture({
    commandRunner: successfulDocker(calls, {
      downResult: {
        errorCode: 'EFAIL',
        status: 1,
        stdout: 'DEMO_ADMIN_PASSWORD=RESET_SECRET_SENTINEL',
      },
    }),
    fileSystem: fileSystem.api,
  });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(fileSystem.unlinked, []);
  assert.equal(fileSystem.entries.get(runtimePath), 'file');
  assert.equal(calls.length, 1);
  assert.match(result.output, /runtime credentials were retained/u);
  assert.doesNotMatch(result.output, /RESET_SECRET_SENTINEL/u);
});

test('preserves the runtime file when Docker cleanup cannot be confirmed', async () => {
  const fileSystem = createFileSystem();
  const calls = [];
  const result = await capture({
    commandRunner: successfulDocker(calls, {
      inspectResult: (args) =>
        args[2] === 'network'
          ? { status: 0, stdout: 'fictional-leftover-id' }
          : { status: 0, stdout: '' },
    }),
    fileSystem: fileSystem.api,
  });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(fileSystem.unlinked, []);
  assert.equal(fileSystem.entries.get(runtimePath), 'file');
  assert.equal(calls.length, 3);
  assert.doesNotMatch(result.output, /fictional-leftover-id/u);
});

test('revalidates the runtime boundary after Docker cleanup before unlinking', async () => {
  const fileSystem = createFileSystem();
  const calls = [];
  const result = await capture({
    commandRunner: successfulDocker(calls, {
      inspectResult: (args) => {
        if (args[2] === 'volume') {
          fileSystem.entries.set(runtimeDirectory, 'symlink');
        }
        return { status: 0, stdout: '' };
      },
    }),
    fileSystem: fileSystem.api,
  });

  assert.equal(result.exitCode, 1);
  assert.equal(calls.length, 4);
  assert.deepEqual(fileSystem.unlinked, []);
  assert.equal(fileSystem.entries.get(runtimePath), 'file');
  assert.match(result.output, /runtime file could not be confirmed absent/u);
});

test('refuses symbolic links and non-regular runtime paths before Docker', async () => {
  for (const runtimeType of ['symlink', 'directory']) {
    const fileSystem = createFileSystem({ runtimeType });
    let commandCalled = false;
    const result = await capture({
      commandRunner: () => {
        commandCalled = true;
        return { status: 0, stdout: '' };
      },
      fileSystem: fileSystem.api,
    });

    assert.equal(result.exitCode, 1);
    assert.equal(commandCalled, false);
    assert.deepEqual(fileSystem.unlinked, []);
    assert.match(result.output, /paths failed safety validation/u);
  }
});

test('refuses a symbolic-link runtime directory before Docker', async () => {
  const fileSystem = createFileSystem({ runtimeDirectoryType: 'symlink' });
  let commandCalled = false;
  const result = await capture({
    commandRunner: () => {
      commandCalled = true;
      return { status: 0, stdout: '' };
    },
    fileSystem: fileSystem.api,
  });

  assert.equal(result.exitCode, 1);
  assert.equal(commandCalled, false);
  assert.deepEqual(fileSystem.unlinked, []);
});

test('refuses a runtime directory that resolves outside the repository', async () => {
  const fileSystem = createFileSystem({
    realpaths: new Map([
      [runtimeDirectory, join('C:', 'outside-demo-runtime')],
    ]),
  });
  let commandCalled = false;
  const result = await capture({
    commandRunner: () => {
      commandCalled = true;
      return { status: 0, stdout: '' };
    },
    fileSystem: fileSystem.api,
  });

  assert.equal(result.exitCode, 1);
  assert.equal(commandCalled, false);
  assert.deepEqual(fileSystem.unlinked, []);
});

test('reports an exact runtime unlink failure without leaking filesystem errors', async () => {
  const fileSystem = createFileSystem({ unlinkError: true });
  const result = await capture({
    commandRunner: successfulDocker([]),
    fileSystem: fileSystem.api,
  });

  assert.equal(result.exitCode, 1);
  assert.equal(fileSystem.entries.get(runtimePath), 'file');
  assert.match(result.output, /runtime file could not be confirmed absent/u);
  assert.doesNotMatch(result.output, /RESET_SECRET_SENTINEL/u);
});

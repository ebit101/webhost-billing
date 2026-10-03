import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  demoInspectionContract,
  runDemoInspection,
} from './demo-inspection.mjs';

const root = resolve('fictional', 'webhost-billing');
const runtimeDirectory = join(root, '.demo-runtime');
const runtimePath = join(runtimeDirectory, 'demo.env');
const composeDirectory = join(root, 'demo');
const composePath = join(composeDirectory, 'compose.demo.yaml');
const runtimeBody = [
  'DEMO_PUBLIC_ORIGIN=http://localhost:3100',
  'DEMO_ADMIN_PASSWORD=FICTIONAL_ADMIN_SECRET',
  'DEMO_CUSTOMER_PASSWORD=FICTIONAL_CUSTOMER_SECRET',
  'DEMO_SESSION_SECRET=FICTIONAL_SESSION_SECRET',
  '',
].join('\n');

function metadata(type) {
  return {
    isDirectory: () => type === 'directory',
    isFile: () => type === 'file',
    isSymbolicLink: () => type === 'symlink',
  };
}

function missingError() {
  return Object.assign(new Error('SECRET_PATH_DETAIL'), { code: 'ENOENT' });
}

function createFileSystem(options = {}) {
  const entries = new Map([
    [runtimeDirectory, options.directoryType ?? 'directory'],
    ...(options.runtimeType === 'missing'
      ? []
      : [[runtimePath, options.runtimeType ?? 'file']]),
  ]);
  const reads = [];
  return {
    entries,
    reads,
    api: {
      lstat: (path) => {
        if (options.lstatErrorPath === path) {
          throw new Error('SECRET_LSTAT_DETAIL');
        }
        const type = entries.get(path);
        if (!type) throw missingError();
        return metadata(type);
      },
      probeReadable: (path) => {
        if (options.unreadable) throw new Error('SECRET_READ_DETAIL');
        reads.push(['probe', path]);
      },
      readFile: (path) => {
        if (options.readError) throw new Error('SECRET_READ_DETAIL');
        reads.push(['read', path]);
        return options.runtimeBody ?? runtimeBody;
      },
    },
  };
}

async function capture(command, options = {}) {
  let output = '';
  const exitCode = await runDemoInspection({
    command,
    environment: {},
    repositoryRoot: root,
    write: (value) => {
      output += value;
    },
    ...options,
  });
  return { exitCode, output };
}

function successfulRunner(calls, result = {}) {
  return (command, args, options) => {
    calls.push({ args, command, options });
    return { status: 0, stderr: '', stdout: '', ...result };
  };
}

test('all four commands refuse a missing runtime before Docker or reads', async () => {
  for (const command of ['credentials', 'status', 'logs', 'down']) {
    const fileSystem = createFileSystem({ runtimeType: 'missing' });
    let commandCalled = false;
    const result = await capture(command, {
      commandRunner: () => {
        commandCalled = true;
        return { status: 0, stdout: '' };
      },
      fileSystem: fileSystem.api,
    });

    assert.equal(result.exitCode, 1);
    assert.equal(commandCalled, false);
    assert.deepEqual(fileSystem.reads, []);
    assert.match(result.output, /runtime is missing/u);
    assert.match(result.output, /pnpm demo:up/u);
    assert.doesNotMatch(result.output, /SECRET_PATH_DETAIL/u);
  }
});

test('refuses unreadable, symbolic-link, and non-regular paths before Docker', async () => {
  const cases = [
    { directoryType: 'symlink' },
    { directoryType: 'file' },
    { runtimeType: 'symlink' },
    { runtimeType: 'directory' },
    { unreadable: true },
    { lstatErrorPath: runtimePath },
  ];
  for (const fileSystemOptions of cases) {
    const fileSystem = createFileSystem(fileSystemOptions);
    let commandCalled = false;
    const result = await capture('status', {
      commandRunner: () => {
        commandCalled = true;
        return { status: 0, stdout: '' };
      },
      fileSystem: fileSystem.api,
    });

    assert.equal(result.exitCode, 1);
    assert.equal(commandCalled, false);
    assert.match(result.output, /No Docker command was run/u);
    assert.doesNotMatch(result.output, /SECRET_/u);
  }
});

test('credentials reads existing runtime without invoking Docker or writing state', async () => {
  const fileSystem = createFileSystem();
  let commandCalled = false;
  const result = await capture('credentials', {
    commandRunner: () => {
      commandCalled = true;
      return { status: 0, stdout: '' };
    },
    fileSystem: fileSystem.api,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(commandCalled, false);
  assert.deepEqual(fileSystem.reads, [
    ['probe', runtimePath],
    ['read', runtimePath],
  ]);
  assert.match(result.output, /admin@example\.test/u);
  assert.match(result.output, /FICTIONAL_ADMIN_SECRET/u);
});

test('status uses exact fixed targeting and prints successful output only', async () => {
  const fileSystem = createFileSystem();
  const calls = [];
  const result = await capture('status', {
    commandRunner: successfulRunner(calls, {
      stdout: 'NAME  STATUS\ndemo  healthy\n',
    }),
    environment: {
      COMPOSE_FILE: 'unsafe.yaml',
      COMPOSE_PROJECT_NAME: 'unsafe-project',
      DOCKER_HOST: 'tcp://unsafe.test:2375',
    },
    fileSystem: fileSystem.api,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.output, 'NAME  STATUS\ndemo  healthy\n');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'docker');
  assert.deepEqual(calls[0].args, [
    '--context',
    'default',
    'compose',
    '--project-name',
    demoInspectionContract.projectName,
    '--project-directory',
    composeDirectory,
    '--env-file',
    runtimePath,
    '--file',
    composePath,
    'ps',
  ]);
  assert.equal(calls[0].options.cwd, root);
  assert.equal(calls[0].options.env.COMPOSE_FILE, undefined);
  assert.equal(calls[0].options.env.COMPOSE_PROJECT_NAME, undefined);
  assert.equal(calls[0].options.env.DOCKER_HOST, undefined);
});

test('logs are non-following, no-color, redacted, and capped to 100 lines', async () => {
  const fileSystem = createFileSystem();
  const calls = [];
  const lines = Array.from(
    { length: 130 },
    (_, index) =>
      `\u001b[31mline-${index} FICTIONAL_SESSION_SECRET${index === 129 ? ' authorization: Bearer visible-token' : ''}\u001b[0m`,
  );
  const result = await capture('logs', {
    commandRunner: successfulRunner(calls, {
      stdout: `${lines.join('\n')}\n`,
    }),
    fileSystem: fileSystem.api,
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(calls[0].args.slice(-4), [
    'logs',
    '--no-color',
    '--tail',
    String(demoInspectionContract.logLineLimit),
  ]);
  assert.equal(calls[0].args.includes('--follow'), false);
  const outputLines = result.output.trimEnd().split('\n');
  assert.equal(outputLines.length, demoInspectionContract.logLineLimit);
  assert.match(outputLines[0], /line-30/u);
  assert.match(outputLines.at(-1), /line-129/u);
  assert.doesNotMatch(result.output, /\u001b/u);
  assert.doesNotMatch(result.output, /FICTIONAL_SESSION_SECRET/u);
  assert.doesNotMatch(result.output, /visible-token/u);
  assert.match(result.output, /authorization: \[REDACTED\]/u);
});

test('down dispatches without destructive flags and retains the runtime file', async () => {
  const fileSystem = createFileSystem();
  const calls = [];
  const result = await capture('down', {
    commandRunner: successfulRunner(calls, {
      stdout: 'raw Docker lifecycle chatter',
    }),
    fileSystem: fileSystem.api,
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(calls[0].args.slice(-1), ['down']);
  assert.equal(calls[0].args.includes('--volumes'), false);
  assert.equal(calls[0].args.includes('--remove-orphans'), false);
  assert.equal(fileSystem.entries.get(runtimePath), 'file');
  assert.match(result.output, /credentials were retained/u);
  assert.doesNotMatch(result.output, /raw Docker/u);
});

test('Docker failures and exceptions discard raw command output', async () => {
  for (const commandRunner of [
    () => ({
      errorCode: 'SECRET_ERROR_CODE',
      status: 1,
      stderr: 'FICTIONAL_ADMIN_SECRET',
      stdout: 'Bearer SECRET_TOKEN',
    }),
    () => {
      throw new Error('FICTIONAL_CUSTOMER_SECRET');
    },
  ]) {
    const result = await capture('logs', {
      commandRunner,
      fileSystem: createFileSystem().api,
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.output, /No raw Docker output was printed/u);
    assert.doesNotMatch(result.output, /FICTIONAL_/u);
    assert.doesNotMatch(result.output, /SECRET_TOKEN/u);
    assert.doesNotMatch(result.output, /SECRET_ERROR_CODE/u);
  }
});

test('a runtime read failure is fixed and redacted', async () => {
  for (const command of ['credentials', 'logs']) {
    let commandCalled = false;
    const result = await capture(command, {
      commandRunner: () => {
        commandCalled = true;
        return { status: 0, stdout: '' };
      },
      fileSystem: createFileSystem({ readError: true }).api,
    });

    assert.equal(result.exitCode, 1);
    assert.equal(commandCalled, false);
    assert.match(result.output, /runtime is unreadable/u);
    assert.doesNotMatch(result.output, /SECRET_READ_DETAIL/u);
  }
});

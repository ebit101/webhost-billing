import { spawnSync } from 'node:child_process';
import { closeSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRepositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const projectName = 'webhost-billing-demo';
const logLineLimit = 100;
const logLineCharacterLimit = 1_000;

function defaultFileSystem() {
  return {
    lstat: (path) => lstatSync(path),
    probeReadable: (path) => {
      const descriptor = openSync(path, 'r');
      closeSync(descriptor);
    },
    readFile: (path) => readFileSync(path, 'utf8'),
  };
}

function execute(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    stdio: 'pipe',
    windowsHide: true,
  });
  return {
    errorCode:
      result.error && 'code' in result.error
        ? String(result.error.code)
        : undefined,
    status: result.status,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

function pathState(fileSystem, path, expectedType) {
  let metadata;
  try {
    metadata = fileSystem.lstat(path);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return 'missing';
    }
    return 'unreadable';
  }
  if (metadata.isSymbolicLink()) return 'invalid';
  if (expectedType === 'directory' && !metadata.isDirectory()) return 'invalid';
  if (expectedType === 'file' && !metadata.isFile()) return 'invalid';
  return 'valid';
}

function inspectRuntime(fileSystem, runtimeDirectory, runtimePath) {
  const directoryState = pathState(fileSystem, runtimeDirectory, 'directory');
  if (directoryState !== 'valid') return directoryState;

  const fileState = pathState(fileSystem, runtimePath, 'file');
  if (fileState !== 'valid') return fileState;

  try {
    fileSystem.probeReadable(runtimePath);
  } catch {
    return 'unreadable';
  }
  return 'valid';
}

function runtimeRefusal(state) {
  const reason =
    state === 'missing'
      ? 'is missing'
      : state === 'unreadable'
        ? 'is unreadable'
        : 'must be a regular non-symbolic-link file';
  return [
    `Safe demo runtime ${reason}. No Docker command was run.`,
    'Restore `.demo-runtime/demo.env` as a readable regular file, or remove the unsafe path and run `pnpm demo:up`.',
    '',
  ].join('\n');
}

function safeEnvironment(source) {
  const environment = { ...source, COMPOSE_PARALLEL_LIMIT: '1' };
  for (const name of [
    'COMPOSE_ENV_FILES',
    'COMPOSE_FILE',
    'COMPOSE_PATH_SEPARATOR',
    'COMPOSE_PROFILES',
    'COMPOSE_PROJECT_NAME',
    'DOCKER_CERT_PATH',
    'DOCKER_CONTEXT',
    'DOCKER_HOST',
    'DOCKER_TLS_VERIFY',
  ]) {
    delete environment[name];
  }
  return environment;
}

function parseEnvironment(body) {
  const values = {};
  for (const line of body.split(/\r?\n/u)) {
    if (!line) continue;
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error('invalid runtime');
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function readRuntime(fileSystem, runtimePath) {
  try {
    return parseEnvironment(fileSystem.readFile(runtimePath));
  } catch {
    return undefined;
  }
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function redactLogOutput(output, environment) {
  let redacted = output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '');
  for (const [name, value] of Object.entries(environment)) {
    if (
      /(?:PASSWORD|SECRET|TOKEN|KEY|COOKIE)/u.test(name) &&
      value.length >= 4
    ) {
      redacted = redacted.replace(
        new RegExp(escapeRegularExpression(value), 'gu'),
        '[REDACTED]',
      );
    }
  }
  redacted = redacted
    .replace(/\bBearer\s+[^\s,;]+/giu, 'Bearer [REDACTED]')
    .replace(
      /\b(authorization|cookie|set-cookie)(\s*[:=]\s*)[^\r\n]*/giu,
      '$1$2[REDACTED]',
    );

  const lines = redacted.split(/\r?\n/u);
  if (lines.at(-1) === '') lines.pop();
  return lines
    .slice(-logLineLimit)
    .map((line) => line.slice(0, logLineCharacterLimit))
    .join('\n');
}

function commandSucceeded(result) {
  return result.status === 0 && !result.errorCode;
}

function dockerFailure(command) {
  return [
    `Safe demo ${command} failed. No raw Docker output was printed.`,
    'Run `pnpm demo:doctor`, confirm Docker is running, and retry.',
    '',
  ].join('\n');
}

function buildDockerArgs(targets, command) {
  const action =
    command === 'status'
      ? ['ps']
      : command === 'logs'
        ? ['logs', '--no-color', '--tail', String(logLineLimit)]
        : ['down'];
  return [
    '--context',
    'default',
    'compose',
    '--project-name',
    projectName,
    '--project-directory',
    targets.composeDirectory,
    '--env-file',
    targets.runtimePath,
    '--file',
    targets.composePath,
    ...action,
  ];
}

export function runDemoInspection(options = {}) {
  const command = options.command;
  if (!['credentials', 'status', 'logs', 'down'].includes(command)) {
    throw new Error('Unsupported safe-demo inspection command');
  }

  const write = options.write ?? ((value) => process.stdout.write(value));
  const repositoryRoot = resolve(
    options.repositoryRoot ?? defaultRepositoryRoot,
  );
  const targets = {
    composeDirectory: join(repositoryRoot, 'demo'),
    composePath: join(repositoryRoot, 'demo', 'compose.demo.yaml'),
    runtimeDirectory: join(repositoryRoot, '.demo-runtime'),
    runtimePath: join(repositoryRoot, '.demo-runtime', 'demo.env'),
  };
  const fileSystem = options.fileSystem ?? defaultFileSystem();
  const runtimeState = inspectRuntime(
    fileSystem,
    targets.runtimeDirectory,
    targets.runtimePath,
  );
  if (runtimeState !== 'valid') {
    write(runtimeRefusal(runtimeState));
    return 1;
  }

  let runtimeEnvironment;
  if (command === 'credentials' || command === 'logs') {
    runtimeEnvironment = readRuntime(fileSystem, targets.runtimePath);
    if (!runtimeEnvironment) {
      write(runtimeRefusal('unreadable'));
      return 1;
    }
  }

  if (command === 'credentials') {
    write('\nSafe fictional demo\n');
    write(`URL:      ${runtimeEnvironment.DEMO_PUBLIC_ORIGIN}\n`);
    write(
      `Admin:    admin@example.test / ${runtimeEnvironment.DEMO_ADMIN_PASSWORD}\n`,
    );
    write(
      `Customer: customer@example.test / ${runtimeEnvironment.DEMO_CUSTOMER_PASSWORD}\n\n`,
    );
    return 0;
  }

  let result;
  try {
    result = (options.commandRunner ?? execute)(
      'docker',
      buildDockerArgs(targets, command),
      {
        cwd: repositoryRoot,
        env: safeEnvironment(options.environment ?? process.env),
      },
    );
  } catch {
    write(dockerFailure(command));
    return 1;
  }
  if (!commandSucceeded(result)) {
    write(dockerFailure(command));
    return 1;
  }

  if (command === 'status' && result.stdout) {
    write(result.stdout);
    if (!result.stdout.endsWith('\n')) write('\n');
  }
  if (command === 'logs') {
    const snapshot = redactLogOutput(result.stdout ?? '', runtimeEnvironment);
    if (snapshot) write(`${snapshot}\n`);
  }
  if (command === 'down') {
    write(
      'Demo containers stopped. Fictional database volumes and generated credentials were retained.\n',
    );
  }
  return 0;
}

export const demoInspectionContract = Object.freeze({
  logLineCharacterLimit,
  logLineLimit,
  projectName,
});

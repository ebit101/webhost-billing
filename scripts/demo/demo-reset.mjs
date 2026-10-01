import { spawnSync } from 'node:child_process';
import { lstatSync, realpathSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRepositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const confirmationFlag = '--confirm-reset-demo';
const projectName = 'webhost-billing-demo';

const resetEnvironment = Object.freeze({
  DEMO_ADMIN_PASSWORD: 'reset-not-used',
  DEMO_CREDENTIAL_ENCRYPTION_KEY: '0'.repeat(64),
  DEMO_CUSTOMER_PASSWORD: 'reset-not-used',
  DEMO_IMAGE_TAG: 'local',
  DEMO_POSTGRES_PASSWORD: 'reset-not-used',
  DEMO_PUBLIC_ORIGIN: 'http://localhost:3100',
  DEMO_REDIS_PASSWORD: 'reset-not-used',
  DEMO_SESSION_SECRET: '0'.repeat(64),
  DEMO_WEB_PORT: '3100',
});

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
    stdout: result.stdout ?? '',
  };
}

function defaultFileSystem() {
  return {
    lstat: (path) => lstatSync(path),
    realpath: (path) => realpathSync(path),
    unlink: (path) => unlinkSync(path),
  };
}

function pathState(fileSystem, path) {
  try {
    return { metadata: fileSystem.lstat(path), status: 'present' };
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return { status: 'missing' };
    }
    return { status: 'unreadable' };
  }
}

function samePath(left, right) {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function isInside(parent, child) {
  const pathFromParent = relative(parent, child);
  return (
    pathFromParent !== '' &&
    pathFromParent !== '..' &&
    !pathFromParent.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromParent)
  );
}

function validateDirectory(fileSystem, path) {
  const state = pathState(fileSystem, path);
  if (state.status !== 'present') return state.status;
  if (state.metadata.isSymbolicLink() || !state.metadata.isDirectory()) {
    return 'invalid';
  }
  return 'valid';
}

function validateFile(fileSystem, path, allowMissing) {
  const state = pathState(fileSystem, path);
  if (state.status === 'missing' && allowMissing) return 'missing';
  if (state.status !== 'present') return state.status;
  if (state.metadata.isSymbolicLink() || !state.metadata.isFile()) {
    return 'invalid';
  }
  return 'valid';
}

function validateTargets(fileSystem, repositoryRoot) {
  const runtimeDirectory = join(repositoryRoot, '.demo-runtime');
  const runtimePath = join(runtimeDirectory, 'demo.env');
  const composeDirectory = join(repositoryRoot, 'demo');
  const composePath = join(composeDirectory, 'compose.demo.yaml');

  if (validateDirectory(fileSystem, repositoryRoot) !== 'valid') {
    return { ok: false };
  }
  if (validateDirectory(fileSystem, composeDirectory) !== 'valid') {
    return { ok: false };
  }
  if (validateFile(fileSystem, composePath, false) !== 'valid') {
    return { ok: false };
  }

  const runtimeDirectoryStatus = validateDirectory(
    fileSystem,
    runtimeDirectory,
  );
  if (
    runtimeDirectoryStatus !== 'valid' &&
    runtimeDirectoryStatus !== 'missing'
  ) {
    return { ok: false };
  }
  const runtimeStatus = validateFile(fileSystem, runtimePath, true);
  if (runtimeStatus !== 'valid' && runtimeStatus !== 'missing') {
    return { ok: false };
  }

  try {
    const canonicalRoot = fileSystem.realpath(repositoryRoot);
    const canonicalComposeDirectory = fileSystem.realpath(composeDirectory);
    const canonicalComposePath = fileSystem.realpath(composePath);
    if (
      !isInside(canonicalRoot, canonicalComposeDirectory) ||
      !isInside(canonicalComposeDirectory, canonicalComposePath) ||
      !samePath(
        canonicalComposePath,
        join(canonicalComposeDirectory, 'compose.demo.yaml'),
      )
    ) {
      return { ok: false };
    }

    if (runtimeDirectoryStatus === 'valid') {
      const canonicalRuntimeDirectory = fileSystem.realpath(runtimeDirectory);
      if (
        !isInside(canonicalRoot, canonicalRuntimeDirectory) ||
        !samePath(
          canonicalRuntimeDirectory,
          join(canonicalRoot, '.demo-runtime'),
        )
      ) {
        return { ok: false };
      }
      if (runtimeStatus === 'valid') {
        const canonicalRuntimePath = fileSystem.realpath(runtimePath);
        if (
          !isInside(canonicalRuntimeDirectory, canonicalRuntimePath) ||
          !samePath(
            canonicalRuntimePath,
            join(canonicalRuntimeDirectory, 'demo.env'),
          )
        ) {
          return { ok: false };
        }
      }
    }
  } catch {
    return { ok: false };
  }

  return {
    composeDirectory,
    composePath,
    ok: true,
    runtimePath,
    runtimePresent: runtimeStatus === 'valid',
  };
}

function safeEnvironment(source) {
  const environment = {
    ...source,
    ...resetEnvironment,
    COMPOSE_PARALLEL_LIMIT: '1',
  };
  for (const name of [
    'COMPOSE_ENV_FILES',
    'COMPOSE_FILE',
    'COMPOSE_PATH_SEPARATOR',
    'COMPOSE_PROFILES',
    'COMPOSE_PROJECT_NAME',
  ]) {
    delete environment[name];
  }
  return environment;
}

function hasTargetOverride(environment) {
  return [
    'COMPOSE_ENV_FILES',
    'COMPOSE_FILE',
    'COMPOSE_PATH_SEPARATOR',
    'COMPOSE_PROFILES',
    'COMPOSE_PROJECT_NAME',
    'DOCKER_CERT_PATH',
    'DOCKER_CONTEXT',
    'DOCKER_HOST',
    'DOCKER_TLS_VERIFY',
  ].some((name) => environment[name] !== undefined);
}

function commandSucceeded(result) {
  return result.status === 0 && !result.errorCode;
}

function formatRefusal() {
  return [
    'Safe demo reset refused. No changes were made.',
    'Run exactly:',
    '  pnpm demo:reset -- --confirm-reset-demo',
    '',
  ].join('\n');
}

function formatPathFailure() {
  return [
    'Safe demo reset refused: dedicated demo paths failed safety validation.',
    'No Docker or filesystem changes were made.',
    '',
  ].join('\n');
}

function formatOverrideFailure() {
  return [
    'Safe demo reset refused: Docker or Compose target overrides are not accepted.',
    'Unset the target override and rerun the exact documented command. No changes were made.',
    '',
  ].join('\n');
}

function formatDockerFailure() {
  return [
    'Safe demo reset failed: dedicated Docker cleanup did not complete or could not be confirmed.',
    'Generated runtime credentials were retained when present. No raw command output was printed.',
    '',
  ].join('\n');
}

function formatRuntimeFailure() {
  return [
    'Safe demo Docker state was removed, but the exact generated runtime file could not be confirmed absent.',
    'Inspect `.demo-runtime/demo.env` locally. No raw filesystem error was printed.',
    '',
  ].join('\n');
}

function formatSuccess(runtimeWasPresent) {
  return [
    'Safe demo reset complete.',
    `Removed only the ${projectName} containers, networks, and volumes.`,
    runtimeWasPresent
      ? 'Removed the generated fictional demo credentials.'
      : 'Generated fictional demo credentials were already absent.',
    'Run `pnpm demo:up` to create a fresh fictional demo.',
    '',
  ].join('\n');
}

export async function runDemoReset(options = {}) {
  const args = options.args ?? [];
  const write = options.write ?? ((value) => process.stdout.write(value));
  const confirmed =
    (args.length === 1 && args[0] === confirmationFlag) ||
    (args.length === 2 && args[0] === '--' && args[1] === confirmationFlag);
  if (!confirmed) {
    write(formatRefusal());
    return 1;
  }

  const sourceEnvironment = options.environment ?? process.env;
  if (hasTargetOverride(sourceEnvironment)) {
    write(formatOverrideFailure());
    return 1;
  }

  const repositoryRoot = resolve(
    options.repositoryRoot ?? defaultRepositoryRoot,
  );
  const fileSystem = options.fileSystem ?? defaultFileSystem();
  const targets = validateTargets(fileSystem, repositoryRoot);
  if (!targets.ok) {
    write(formatPathFailure());
    return 1;
  }

  const commandRunner = options.commandRunner ?? execute;
  const commandOptions = {
    cwd: repositoryRoot,
    env: safeEnvironment(sourceEnvironment),
  };
  let downResult;
  try {
    downResult = commandRunner(
      'docker',
      [
        '--context',
        'default',
        'compose',
        '--project-name',
        projectName,
        '--project-directory',
        targets.composeDirectory,
        '--file',
        targets.composePath,
        'down',
        '--volumes',
        '--remove-orphans',
        '--timeout',
        '30',
      ],
      commandOptions,
    );
  } catch {
    write(formatDockerFailure());
    return 1;
  }
  if (!commandSucceeded(downResult)) {
    write(formatDockerFailure());
    return 1;
  }

  const inspections = [
    ['ps', '--all', '--quiet'],
    ['network', 'ls', '--quiet'],
    ['volume', 'ls', '--quiet'],
  ];
  for (const inspection of inspections) {
    let result;
    try {
      result = commandRunner(
        'docker',
        [
          '--context',
          'default',
          ...inspection,
          '--filter',
          `label=com.docker.compose.project=${projectName}`,
        ],
        commandOptions,
      );
    } catch {
      write(formatDockerFailure());
      return 1;
    }
    if (!commandSucceeded(result) || result.stdout.trim() !== '') {
      write(formatDockerFailure());
      return 1;
    }
  }

  const finalTargets = validateTargets(fileSystem, repositoryRoot);
  if (
    !finalTargets.ok ||
    (!targets.runtimePresent && finalTargets.runtimePresent)
  ) {
    write(formatRuntimeFailure());
    return 1;
  }

  if (finalTargets.runtimePresent) {
    try {
      fileSystem.unlink(finalTargets.runtimePath);
    } catch {
      write(formatRuntimeFailure());
      return 1;
    }
  }
  if (pathState(fileSystem, finalTargets.runtimePath).status !== 'missing') {
    write(formatRuntimeFailure());
    return 1;
  }

  write(formatSuccess(targets.runtimePresent));
  return 0;
}

export const demoResetContract = Object.freeze({
  confirmationFlag,
  projectName,
});

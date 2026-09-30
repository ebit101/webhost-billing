import { spawnSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const defaultRuntimePath = join(repositoryRoot, '.demo-runtime', 'demo.env');
const loopbackHost = '127.0.0.1';
const demoPort = 3100;

function execute(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
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

function extractVersion(value) {
  return value.match(/\bv?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/u)?.[1];
}

function inspectRuntimeFile(runtimePath) {
  try {
    const metadata = lstatSync(runtimePath);
    return metadata.isFile() ? 'file' : 'invalid';
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'ENOENT') return 'missing';
    }
    return 'unreadable';
  }
}

function probePort(host = loopbackHost, port = demoPort) {
  return new Promise((resolveProbe) => {
    const server = createServer();
    let finished = false;

    const finish = (result) => {
      if (finished) return;
      finished = true;
      resolveProbe(result);
    };

    server.unref();
    server.once('error', (error) => {
      finish({
        available: false,
        errorCode:
          error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : 'UNKNOWN',
      });
    });
    server.listen({ exclusive: true, host, port }, () => {
      server.close((error) => {
        if (error) {
          finish({
            available: false,
            errorCode:
              typeof error === 'object' && 'code' in error
                ? String(error.code)
                : 'UNKNOWN',
          });
          return;
        }
        finish({ available: true });
      });
    });
  });
}

function pass(label, detail) {
  return { detail, label, status: 'PASS' };
}

function info(label, detail) {
  return { detail, label, status: 'INFO' };
}

function fail(label, detail, remediation) {
  return { detail, label, remediation, status: 'FAIL' };
}

export async function inspectDemoPrerequisites(options = {}) {
  const commandRunner = options.commandRunner ?? execute;
  const portProbe = options.portProbe ?? probePort;
  const runtimeInspector = options.runtimeInspector ?? inspectRuntimeFile;
  const runtimePath = options.runtimePath ?? defaultRuntimePath;
  const checks = [];

  const docker = commandRunner('docker', ['--version']);
  const dockerVersion = extractVersion(docker.stdout);
  if (docker.status !== 0 || docker.errorCode || !dockerVersion) {
    checks.push(
      fail(
        'Docker CLI',
        'not available or its version could not be determined',
        'Install a supported Docker Engine or Docker Desktop release, then ensure `docker` is on PATH.',
      ),
    );
  } else {
    checks.push(pass('Docker CLI', `version ${dockerVersion}`));
  }

  if (checks[0].status === 'PASS') {
    const compose = commandRunner('docker', ['compose', 'version', '--short']);
    const composeVersion = extractVersion(compose.stdout);
    if (compose.status !== 0 || compose.errorCode || !composeVersion) {
      checks.push(
        fail(
          'Docker Compose',
          'version 2 or newer was not detected',
          'Install or enable the Docker Compose v2 plugin, then rerun `docker compose version`.',
        ),
      );
    } else if (Number.parseInt(composeVersion.split('.')[0], 10) < 2) {
      checks.push(
        fail(
          'Docker Compose',
          `unsupported version ${composeVersion}`,
          'Upgrade to Docker Compose v2 or newer.',
        ),
      );
    } else {
      checks.push(pass('Docker Compose', `version ${composeVersion}`));
    }

    const engine = commandRunner('docker', [
      'info',
      '--format',
      '{{.ServerVersion}}',
    ]);
    const engineVersion = extractVersion(engine.stdout);
    if (engine.status !== 0 || engine.errorCode) {
      checks.push(
        fail(
          'Docker Engine',
          'not reachable',
          'Start Docker Engine or Docker Desktop and wait until `docker info` succeeds.',
        ),
      );
    } else {
      checks.push(
        pass(
          'Docker Engine',
          engineVersion ? `available (server ${engineVersion})` : 'available',
        ),
      );
    }
  } else {
    checks.push(
      fail(
        'Docker Compose',
        'could not be checked because the Docker CLI is unavailable',
        'Install Docker with the Compose v2 plugin, then rerun this preflight.',
      ),
    );
    checks.push(
      fail(
        'Docker Engine',
        'could not be checked because the Docker CLI is unavailable',
        'Install and start Docker Engine or Docker Desktop, then rerun this preflight.',
      ),
    );
  }

  const port = await portProbe(loopbackHost, demoPort);
  if (port.available) {
    checks.push(pass('Loopback port 3100', 'available on 127.0.0.1'));
  } else if (port.errorCode === 'EADDRINUSE') {
    checks.push(
      fail(
        'Loopback port 3100',
        'already in use on 127.0.0.1',
        'Stop the existing local listener, or run `pnpm demo:down` if the safe demo is already running.',
      ),
    );
  } else if (port.errorCode === 'EACCES') {
    checks.push(
      fail(
        'Loopback port 3100',
        'cannot be bound by this user',
        'Remove the local port reservation or use a shell/account allowed to bind 127.0.0.1:3100.',
      ),
    );
  } else {
    checks.push(
      fail(
        'Loopback port 3100',
        'availability could not be determined',
        'Resolve the local 127.0.0.1:3100 bind error, then rerun this preflight.',
      ),
    );
  }

  const runtimeStatus = runtimeInspector(runtimePath);
  if (runtimeStatus === 'file') {
    checks.push(
      info(
        'Demo runtime file',
        'present (contents were not read; all values remain redacted)',
      ),
    );
  } else if (runtimeStatus === 'missing') {
    checks.push(
      info(
        'Demo runtime file',
        'not present (expected before the first `demo:up`; it will be generated locally)',
      ),
    );
  } else if (runtimeStatus === 'invalid') {
    checks.push(
      fail(
        'Demo runtime file',
        'the expected path exists but is not a regular file',
        'Inspect `.demo-runtime/demo.env` and move the conflicting non-file path before starting the demo.',
      ),
    );
  } else {
    checks.push(
      fail(
        'Demo runtime file',
        'metadata could not be inspected',
        'Restore local read access to `.demo-runtime/demo.env` or its parent directory, then rerun this preflight.',
      ),
    );
  }

  return checks;
}

export function formatDemoDoctorReport(checks) {
  const lines = [
    'Safe demo preflight (read-only)',
    'No runtime values, command errors, or credentials are printed.',
    '',
  ];

  for (const check of checks) {
    lines.push(`${check.status} ${check.label}: ${check.detail}`);
    if (check.status === 'FAIL') {
      lines.push(`  Remediation: ${check.remediation}`);
    }
  }

  const failureCount = checks.filter((check) => check.status === 'FAIL').length;
  lines.push('');
  lines.push(
    failureCount === 0
      ? 'RESULT Ready. No changes were made.'
      : `RESULT Not ready: ${failureCount} prerequisite check${failureCount === 1 ? '' : 's'} failed. No changes were made.`,
  );

  return `${lines.join('\n')}\n`;
}

export async function runDemoDoctor(options = {}) {
  const checks = await inspectDemoPrerequisites(options);
  const output = formatDemoDoctorReport(checks);
  const write = options.write ?? ((value) => process.stdout.write(value));
  write(output);
  return checks.some((check) => check.status === 'FAIL') ? 1 : 0;
}

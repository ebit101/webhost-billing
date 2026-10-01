import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { runDemoDoctor } from './demo-doctor.mjs';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const runtimeDirectory = join(repositoryRoot, '.demo-runtime');
const environmentPath = join(runtimeDirectory, 'demo.env');
const composePath = join(repositoryRoot, 'demo', 'compose.demo.yaml');
const publicOrigin = 'http://localhost:3100';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture
      ? `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
      : '';
    throw new Error(
      `${command} exited with status ${result.status}${detail ? `: ${detail}` : ''}`,
    );
  }
  return result.stdout?.trim() ?? '';
}

function dockerCompose(...args) {
  return run(
    'docker',
    ['compose', '--env-file', environmentPath, '--file', composePath, ...args],
    {
      env: { ...process.env, COMPOSE_PARALLEL_LIMIT: '1' },
    },
  );
}

function generatedPassword() {
  return `Demo-${randomBytes(18).toString('base64url')}-Aa1!`;
}

function initializeRuntime() {
  if (existsSync(environmentPath)) return;
  mkdirSync(runtimeDirectory, { recursive: true });
  const values = {
    DEMO_ADMIN_PASSWORD: generatedPassword(),
    DEMO_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    DEMO_CUSTOMER_PASSWORD: generatedPassword(),
    DEMO_IMAGE_TAG: 'local',
    DEMO_POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
    DEMO_PUBLIC_ORIGIN: publicOrigin,
    DEMO_REDIS_PASSWORD: randomBytes(24).toString('hex'),
    DEMO_SESSION_SECRET: randomBytes(32).toString('hex'),
    DEMO_WEB_PORT: '3100',
  };
  const body = `${Object.entries(values)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')}\n`;
  writeFileSync(environmentPath, body, { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(environmentPath, 0o600);
  } catch {
    // Windows applies access control through the containing user profile.
  }
}

function readEnvironment(options = {}) {
  if (options.createIfMissing === false) {
    if (!existsSync(environmentPath)) {
      throw new Error('Start the safe demo before running this command');
    }
  } else {
    initializeRuntime();
  }
  return Object.fromEntries(
    readFileSync(environmentPath, 'utf8')
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function printCredentials() {
  const environment = readEnvironment();
  process.stdout.write(`\nSafe fictional demo\n`);
  process.stdout.write(`URL:      ${environment.DEMO_PUBLIC_ORIGIN}\n`);
  process.stdout.write(
    `Admin:    admin@example.test / ${environment.DEMO_ADMIN_PASSWORD}\n`,
  );
  process.stdout.write(
    `Customer: customer@example.test / ${environment.DEMO_CUSTOMER_PASSWORD}\n\n`,
  );
}

function ensureDocker() {
  run('docker', ['info'], { capture: true });
  run('docker', ['compose', 'version'], { capture: true });
}

async function waitForReady() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${publicOrigin}/ready`);
      if (response.ok) return;
    } catch {
      // Docker health checks can become ready just before the host port accepts.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
  throw new Error(`Demo gateway did not become ready at ${publicOrigin}`);
}

function runPnpm(args, environment) {
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry) {
    throw new Error('Run screenshot capture through pnpm demo:screenshots');
  }
  run(process.execPath, [pnpmEntry, ...args], {
    env: { ...process.env, ...environment },
  });
}

async function main() {
  const command = process.argv[2] ?? 'help';
  if (command === 'doctor') {
    process.exitCode = await runDemoDoctor();
    return;
  }
  if (command === 'up') {
    initializeRuntime();
    ensureDocker();
    try {
      dockerCompose('up', '--build', '--detach', '--wait');
      await waitForReady();
    } catch (error) {
      try {
        dockerCompose('logs', '--tail', '120');
      } catch {
        // Preserve the original startup failure.
      }
      throw error;
    }
    printCredentials();
    process.stdout.write(
      'All data and credentials are local, fictional, and ignored by Git. Application and data services stay on an internal network.\n',
    );
    return;
  }
  if (command === 'credentials') {
    printCredentials();
    return;
  }
  if (command === 'status') {
    initializeRuntime();
    dockerCompose('ps');
    return;
  }
  if (command === 'logs') {
    initializeRuntime();
    dockerCompose('logs', '--follow', '--tail', '100');
    return;
  }
  if (command === 'down') {
    initializeRuntime();
    dockerCompose('down');
    process.stdout.write(
      'Demo containers stopped. Fictional database volumes and generated credentials were retained.\n',
    );
    return;
  }
  if (command === 'screenshots') {
    ensureDocker();
    const environment = readEnvironment();
    await waitForReady();
    runPnpm(
      [
        '--filter',
        '@webhost-billing/web',
        'exec',
        'playwright',
        'install',
        'chromium',
      ],
      environment,
    );
    runPnpm(
      [
        '--filter',
        '@webhost-billing/web',
        'exec',
        'tsx',
        'e2e/capture-demo-screenshots.ts',
      ],
      environment,
    );
    return;
  }
  if (command === 'a11y') {
    ensureDocker();
    const environment = readEnvironment({ createIfMissing: false });
    await waitForReady();
    runPnpm(
      [
        '--filter',
        '@webhost-billing/web',
        'exec',
        'playwright',
        'install',
        'chromium',
      ],
      environment,
    );
    runPnpm(
      [
        '--filter',
        '@webhost-billing/web',
        'exec',
        'tsx',
        'e2e/audit-safe-demo-accessibility.ts',
      ],
      environment,
    );
    return;
  }

  process.stdout.write(`Safe evaluation demo commands:\n\n`);
  process.stdout.write(
    `  pnpm demo:doctor       Check local prerequisites without changing anything\n`,
  );
  process.stdout.write(
    `  pnpm demo:up           Build and start the fictional demo\n`,
  );
  process.stdout.write(`  pnpm demo:credentials  Show generated demo logins\n`);
  process.stdout.write(`  pnpm demo:status       Show container health\n`);
  process.stdout.write(`  pnpm demo:logs         Follow demo logs\n`);
  process.stdout.write(
    `  pnpm demo:screenshots  Refresh reviewed screenshots\n`,
  );
  process.stdout.write(
    `  pnpm demo:a11y         Audit the running fictional demo\n`,
  );
  process.stdout.write(
    `  pnpm demo:down         Stop containers and retain data\n`,
  );
}

main().catch((error) =>
  fail(error instanceof Error ? error.message : 'Demo command failed'),
);

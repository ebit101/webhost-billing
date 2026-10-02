import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const fixedOrigin = 'http://localhost:3100';
const defaultRuntimePath = join(repositoryRoot, '.demo-runtime', 'demo.env');
const defaultTsxEntry = join(
  repositoryRoot,
  'apps',
  'web',
  'node_modules',
  'tsx',
  'dist',
  'cli.mjs',
);
const defaultBrowserVerifier = join(
  repositoryRoot,
  'apps',
  'web',
  'e2e',
  'smoke-safe-demo.ts',
);
const browserRoutes = Object.freeze(['/hosting', '/portal', '/admin']);

function inspectRuntimeFile(runtimePath) {
  try {
    const directoryMetadata = lstatSync(dirname(runtimePath));
    const metadata = lstatSync(runtimePath);
    return directoryMetadata.isDirectory() &&
      !directoryMetadata.isSymbolicLink() &&
      metadata.isFile() &&
      !metadata.isSymbolicLink()
      ? 'file'
      : 'invalid';
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'ENOENT') return 'missing';
    }
    return 'unreadable';
  }
}

function readRuntimeEnvironment(runtimePath) {
  const entries = [];
  const names = new Set();
  for (const line of readFileSync(runtimePath, 'utf8').split(/\r?\n/u)) {
    if (!line) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) return undefined;
    const name = line.slice(0, separator);
    if (names.has(name)) return undefined;
    names.add(name);
    entries.push([name, line.slice(separator + 1)]);
  }
  return Object.fromEntries(entries);
}

async function probeReadiness() {
  try {
    const response = await fetch(`${fixedOrigin}/ready`, {
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function execute(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true,
    ...options,
  });
  return {
    error: Boolean(result.error),
    status: result.status,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

function failure(detail, remediation) {
  return {
    checks: [],
    detail,
    passed: false,
    remediation,
  };
}

function parseBrowserResult(value) {
  let parsed;
  try {
    parsed = JSON.parse(value.trim());
  } catch {
    return undefined;
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.checks) ||
    parsed.checks.length !== browserRoutes.length
  ) {
    return undefined;
  }

  const checks = [];
  for (let index = 0; index < browserRoutes.length; index += 1) {
    const check = parsed.checks[index];
    if (
      !check ||
      typeof check !== 'object' ||
      check.route !== browserRoutes[index] ||
      typeof check.passed !== 'boolean'
    ) {
      return undefined;
    }
    checks.push({ passed: check.passed, route: check.route });
  }
  return checks;
}

export function formatDemoSmokeReport(result) {
  const lines = [
    'Safe-demo functional smoke check',
    'Scope: fixed loopback origin, fictional identities, read-only evaluator paths.',
    '',
  ];

  if (!result.passed && result.checks.length === 0) {
    lines.push(`FAIL preflight: ${result.detail}`);
    lines.push(`  Remediation: ${result.remediation}`);
  } else {
    lines.push('PASS /ready');
    for (const check of result.checks) {
      lines.push(`${check.passed ? 'PASS' : 'FAIL'} ${check.route}`);
    }
    if (result.checks.some((check) => !check.passed)) {
      lines.push(
        '  Remediation: Confirm demo health and Chromium, then retry after the normal login-rate window if runs were repeated.',
      );
    }
  }

  lines.push('');
  lines.push(
    result.passed
      ? 'RESULT Passed 4 read-only checks. No business or Docker state was changed.'
      : 'RESULT Failed. No business or Docker state was changed.',
  );
  return `${lines.join('\n')}\n`;
}

export async function inspectDemoSmoke(options = {}) {
  const runtimePath = options.runtimePath ?? defaultRuntimePath;
  const runtimeInspector = options.runtimeInspector ?? inspectRuntimeFile;
  const environmentReader = options.environmentReader ?? readRuntimeEnvironment;
  const readinessProbe = options.readinessProbe ?? probeReadiness;
  const processRunner = options.processRunner ?? execute;
  const sourceEnvironment = options.sourceEnvironment ?? process.env;
  const processExecutable = options.processExecutable ?? process.execPath;
  const tsxEntry = options.tsxEntry ?? defaultTsxEntry;
  const browserVerifier = options.browserVerifier ?? defaultBrowserVerifier;

  const runtimeStatus = runtimeInspector(runtimePath);
  if (runtimeStatus === 'missing') {
    return failure(
      'generated demo runtime file is missing',
      'Run `pnpm demo:up` and wait for the existing safe demo to become healthy.',
    );
  }
  if (runtimeStatus !== 'file') {
    return failure(
      'generated demo runtime path is not a readable regular file',
      'Inspect `.demo-runtime/demo.env` locally and restore the fixed safe-demo runtime file.',
    );
  }

  let runtimeEnvironment;
  try {
    runtimeEnvironment = environmentReader(runtimePath);
  } catch {
    return failure(
      'generated demo runtime file could not be read safely',
      'Restore local read access to `.demo-runtime/demo.env` and retry.',
    );
  }
  if (
    !runtimeEnvironment ||
    runtimeEnvironment.DEMO_PUBLIC_ORIGIN !== fixedOrigin
  ) {
    return failure(
      'fixed demo origin is not configured',
      'Restore `DEMO_PUBLIC_ORIGIN=http://localhost:3100` in the generated safe-demo runtime.',
    );
  }
  if (
    !runtimeEnvironment.DEMO_ADMIN_PASSWORD ||
    !runtimeEnvironment.DEMO_CUSTOMER_PASSWORD
  ) {
    return failure(
      'generated fictional credentials are unavailable',
      'Run the guarded demo reset/start workflow to regenerate fictional credentials.',
    );
  }

  if (!(await readinessProbe())) {
    return failure(
      'the fixed loopback demo is not ready',
      'Run `pnpm demo:status`, restore the existing safe demo, and retry without changing targets.',
    );
  }
  const childEnvironment = {
    ...sourceEnvironment,
    DEMO_ADMIN_PASSWORD: runtimeEnvironment.DEMO_ADMIN_PASSWORD,
    DEMO_CUSTOMER_PASSWORD: runtimeEnvironment.DEMO_CUSTOMER_PASSWORD,
    DEMO_PUBLIC_ORIGIN: fixedOrigin,
  };
  const browserResult = processRunner(
    processExecutable,
    [tsxEntry, browserVerifier],
    { env: childEnvironment },
  );
  const checks = parseBrowserResult(browserResult.stdout);
  if (
    browserResult.error ||
    !checks ||
    (browserResult.status === 0 && checks.some((check) => !check.passed)) ||
    (browserResult.status !== 0 && checks.every((check) => check.passed))
  ) {
    return failure(
      'the browser verifier did not return a trusted result',
      'Check the local safe-demo health and Chromium installation, then rerun the fixed smoke command.',
    );
  }

  return {
    checks,
    passed: checks.every((check) => check.passed),
  };
}

export async function runDemoSmoke(options = {}) {
  const result = await inspectDemoSmoke(options);
  const write = options.write ?? ((value) => process.stdout.write(value));
  write(formatDemoSmokeReport(result));
  return result.passed ? 0 : 1;
}

export const demoSmokeContract = Object.freeze({
  browserRoutes,
  fixedOrigin,
});

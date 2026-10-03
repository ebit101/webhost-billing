import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRepositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const validators = Object.freeze([
  Object.freeze({
    label: 'Markdown links and anchors',
    script: 'docs:links',
    source: 'scripts/docs/check-markdown-links.mjs',
  }),
  Object.freeze({
    label: 'contributor paths and scripts',
    script: 'docs:paths',
    source: 'scripts/docs/check-contributor-paths.mjs',
  }),
  Object.freeze({
    label: 'GitHub issue forms',
    script: 'docs:issue-forms',
    source: 'scripts/docs/check-issue-forms.mjs',
  }),
  Object.freeze({
    label: 'safe-demo screenshot assets',
    script: 'docs:demo-assets',
    source: 'scripts/docs/check-demo-screenshot-assets.mjs',
  }),
]);

const forwardedEnvironmentNames = new Set([
  'comspec',
  'lang',
  'lc_all',
  'path',
  'pathext',
  'systemroot',
  'windir',
]);

function createChildEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) =>
      forwardedEnvironmentNames.has(name.toLowerCase()),
    ),
  );
}

function runValidator(invocation) {
  return spawnSync(invocation.executable, [invocation.source], {
    cwd: invocation.repositoryRoot,
    encoding: 'utf8',
    env: invocation.environment,
    stdio: 'pipe',
    windowsHide: true,
  });
}

function failureStatus(result) {
  if (
    result &&
    Number.isInteger(result.status) &&
    result.status > 0 &&
    result.status <= 255
  ) {
    return result.status;
  }
  return 1;
}

export function runDocumentationChecks(options = {}) {
  const repositoryRoot = resolve(
    options.repositoryRoot ?? defaultRepositoryRoot,
  );
  const runner = options.runner ?? runValidator;
  const write = options.write ?? ((value) => process.stdout.write(value));
  const environment = createChildEnvironment(
    options.environment ?? process.env,
  );

  for (const [index, validator] of validators.entries()) {
    const position = `${index + 1}/${validators.length}`;
    write(`[docs:check] ${position} RUN pnpm ${validator.script}\n`);

    let result;
    try {
      result = runner({
        environment,
        executable: process.execPath,
        repositoryRoot,
        source: resolve(repositoryRoot, validator.source),
        validator,
      });
    } catch {
      result = undefined;
    }

    if (!result || result.error || result.status !== 0) {
      const status = failureStatus(result);
      write(
        `[docs:check] ${position} FAIL pnpm ${validator.script} (exit ${status}). ` +
          `Run the focused command for safe diagnostics.\n`,
      );
      return status;
    }

    write(
      `[docs:check] ${position} PASS pnpm ${validator.script} — ${validator.label}.\n`,
    );
  }

  write(
    `[docs:check] PASS ${validators.length} offline documentation validators.\n`,
  );
  return 0;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) {
  try {
    process.exitCode = runDocumentationChecks();
  } catch {
    process.stderr.write('Documentation validation could not run safely.\n');
    process.exitCode = 1;
  }
}

export const documentationCheckContract = Object.freeze({
  validators,
});

import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run the existing database-backed acceptance checks without touching application
// tables. Each invocation owns an empty, freshly migrated fictional schema.
const gates: Record<string, string[][]> = {
  packages: [
    ...[
      'tooling-security',
      'demo-doctor',
      'demo-inspection',
      'demo-reset',
      'demo-smoke',
      'demo-assets',
      'docs-check',
      'docs-paths',
      'docs-links',
      'issue-forms',
    ].map((name) => ['run', `test:${name}`]),
    ['--filter', '@webhost-billing/shared', 'test'],
    ['--filter', '@webhost-billing/queue', 'test', '--runInBand'],
    ['--filter', '@webhost-billing/api', 'test', '--runInBand'],
    ['--filter', '@webhost-billing/worker', 'test', '--runInBand'],
    ['--filter', '@webhost-billing/web', 'test', '--maxWorkers=1'],
  ],
  api: [['--filter', '@webhost-billing/api', 'test:e2e', '--runInBand']],
  invariants: [['test:invariants']],
};
const commands = gates[process.argv[2] ?? ''];
if (!commands || process.env.WEBHOST_BROWSER_E2E_SCHEMA) {
  throw new Error(
    'Select packages, api or invariants without a schema override.',
  );
}
process.env.WEBHOST_BROWSER_E2E_SCHEMA = `command26_e2e_${randomUUID().replaceAll('-', '')}`;

async function main(): Promise<void> {
  const { prepareEnvironment, prepareLegacyApiCustomer } =
    await import('./prepare-environment');
  const { E2E_DATABASE_URL, E2E_SCHEMA, e2eApiEnvironment } =
    await import('./environment');
  const { assertBrowserDatabaseScope } = await import('./database-scope');
  const { createPrismaClient } = await import('@webhost-billing/database');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  await prepareEnvironment(false);
  try {
    if (process.argv[2] === 'api') await prepareLegacyApiCustomer();
    for (const args of commands!) {
      console.log(`Validating: pnpm ${args.join(' ')}`);
      const windows = process.platform === 'win32';
      execFileSync(
        windows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm',
        windows ? ['/d', '/s', '/c', 'pnpm', ...args] : args,
        { cwd: root, env: e2eApiEnvironment, stdio: 'inherit' },
      );
    }
  } finally {
    const prisma = createPrismaClient(E2E_DATABASE_URL);
    try {
      await assertBrowserDatabaseScope(prisma, E2E_DATABASE_URL, E2E_SCHEMA);
      await prisma.$executeRawUnsafe(`DROP SCHEMA "${E2E_SCHEMA}" CASCADE`);
    } finally {
      await prisma.$disconnect();
    }
  }
}

main().catch(() => {
  console.error(
    'Isolated acceptance validation failed; see the preceding diagnostics.',
  );
  process.exitCode = 1;
});

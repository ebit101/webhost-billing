import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  browserIsolationPatterns,
  isolatedBrowserGroups,
} from './browser-isolation';

if (process.env.WEBHOST_BROWSER_E2E_SCHEMA) {
  throw new Error(
    'Start browser tests without a pre-existing schema override.',
  );
}
if (process.env.WEBHOST_BROWSER_ACCEPTANCE_GROUP)
  throw new Error('Start browser tests without an inherited acceptance group.');

async function main(): Promise<void> {
  if (process.argv.length === 2) {
    for (const group of ['core', ...isolatedBrowserGroups]) {
      console.log(`Running isolated browser acceptance group: ${group}`);
      const args = [
        'exec',
        'tsx',
        'e2e/run-tests.ts',
        '--isolation-group',
        group,
      ];
      const windows = process.platform === 'win32';
      execFileSync(
        windows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm',
        windows ? ['/d', '/s', '/c', 'pnpm', ...args] : args,
        { env: process.env, stdio: 'inherit' },
      );
    }
    return;
  }
  let browserArgs = process.argv.slice(2);
  if (browserArgs[0] === '--isolation-group') {
    const group = browserArgs[1];
    if (!group) throw new Error('A browser isolation group is required.');
    browserIsolationPatterns(group);
    process.env.WEBHOST_BROWSER_ACCEPTANCE_GROUP = group;
    browserArgs = browserArgs.slice(2);
  }
  process.env.WEBHOST_BROWSER_E2E_SCHEMA = `command26_e2e_${randomUUID().replaceAll('-', '')}`;
  const { prepareEnvironment } = await import('./prepare-environment');
  const { E2E_DATABASE_URL, E2E_SCHEMA } = await import('./environment');
  const { assertBrowserDatabaseScope } = await import('./database-scope');
  const { createPrismaClient } = await import('@webhost-billing/database');
  await prepareEnvironment();
  try {
    const args = ['exec', 'playwright', 'test', ...browserArgs];
    const windows = process.platform === 'win32';
    execFileSync(
      windows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm',
      windows ? ['/d', '/s', '/c', 'pnpm', ...args] : args,
      { env: process.env, stdio: 'inherit' },
    );
  } finally {
    const prisma = createPrismaClient(E2E_DATABASE_URL);
    try {
      // Only this run's fresh, marked fictional schema is disposable.
      await assertBrowserDatabaseScope(prisma, E2E_DATABASE_URL, E2E_SCHEMA);
      await prisma.$executeRawUnsafe(`DROP SCHEMA "${E2E_SCHEMA}" CASCADE`);
    } finally {
      await prisma.$disconnect();
    }
  }
}

main().catch(() => {
  console.error(
    'Guarded browser validation failed. Review the preceding test diagnostics.',
  );
  process.exitCode = 1;
});

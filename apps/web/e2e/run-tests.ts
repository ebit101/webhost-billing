import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

if (process.env.WEBHOST_BROWSER_E2E_SCHEMA) {
  throw new Error(
    'Start browser tests without a pre-existing schema override.',
  );
}
process.env.WEBHOST_BROWSER_E2E_SCHEMA = `command26_e2e_${randomUUID().replaceAll('-', '')}`;

async function main(): Promise<void> {
  const { prepareEnvironment } = await import('./prepare-environment');
  const { E2E_DATABASE_URL, E2E_SCHEMA } = await import('./environment');
  const { assertBrowserDatabaseScope } = await import('./database-scope');
  const { createPrismaClient } = await import('@webhost-billing/database');
  await prepareEnvironment();
  try {
    const args = ['exec', 'playwright', 'test', ...process.argv.slice(2)];
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

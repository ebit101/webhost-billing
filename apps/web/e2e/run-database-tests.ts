import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBrowserDatabaseUrl } from './database-scope';

// Dedicated test-only launcher. Never adopt an existing application/test scope.
// A guarded parent may pass its verified scope, but it is never reused here.
if (process.env.WEBHOST_BROWSER_E2E_SCHEMA) {
  validateBrowserDatabaseUrl(
    process.env.DATABASE_URL ?? '',
    process.env.WEBHOST_BROWSER_E2E_SCHEMA,
  );
}
process.env.WEBHOST_BROWSER_E2E_SCHEMA = `command26_e2e_${randomUUID().replaceAll('-', '')}`;

async function main(): Promise<void> {
  const { prepareEnvironment } = await import('./prepare-environment');
  const { E2E_DATABASE_URL, E2E_SCHEMA, e2eApiEnvironment } =
    await import('./environment');
  const { assertBrowserDatabaseScope } = await import('./database-scope');
  const { createPrismaClient } = await import('@webhost-billing/database');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  await prepareEnvironment(false);
  try {
    const baseArgs = [
      '--filter',
      '@webhost-billing/database',
      'exec',
      'tsx',
      '--test',
      '--test-concurrency=1',
    ];
    const windows = process.platform === 'win32';
    // Preserve the empty-unit assertion before policy fixtures add context.
    for (const file of [
      'currency-units',
      'currency-policies',
      'currency-adoption-preflight',
      'currency-coordination',
      'currency-coordination-guards',
      'currency-control',
    ]) {
      const args = [...baseArgs, `test/${file}.integration.spec.ts`];
      execFileSync(
        windows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm',
        windows ? ['/d', '/s', '/c', 'pnpm', ...args] : args,
        { cwd: root, env: e2eApiEnvironment, stdio: 'inherit' },
      );
    }
    // Verify the ordinary schema/seed assertions only in this marked fictional
    // scope. Seed and verifier independently repeat the guard before doing work.
    for (const command of ['db:seed', 'db:verify']) {
      const args = ['--filter', '@webhost-billing/database', command];
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
    'Guarded database acceptance failed; see preceding diagnostics.',
  );
  process.exitCode = 1;
});

import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
if (process.env.WEBHOST_BROWSER_E2E_SCHEMA)
  throw new Error('Do not reuse a test schema.');
process.env.WEBHOST_BROWSER_E2E_SCHEMA = `command26_e2e_${randomUUID().replaceAll('-', '')}`;
async function main() {
  const { prepareEnvironment } = await import('./prepare-environment');
  const { E2E_DATABASE_URL, E2E_SCHEMA, e2eApiEnvironment } =
    await import('./environment');
  const { assertBrowserDatabaseScope } = await import('./database-scope');
  const { createPrismaClient } = await import('@webhost-billing/database');
  await prepareEnvironment(false);
  try {
    const seedArgs = ['--filter', '@webhost-billing/database', 'db:seed'];
    execFileSync(
      process.platform === 'win32'
        ? (process.env.ComSpec ?? 'cmd.exe')
        : 'pnpm',
      process.platform === 'win32'
        ? ['/d', '/s', '/c', 'pnpm', ...seedArgs]
        : seedArgs,
      { cwd: '../..', env: e2eApiEnvironment, stdio: 'inherit' },
    );
    const args =
      process.argv[2] === 'packages'
        ? ['test']
        : process.argv[2] === 'domains' || process.argv[2] === 'smtp'
          ? [
              '--filter',
              '@webhost-billing/api',
              'exec',
              'cross-env',
              'NODE_OPTIONS=--experimental-vm-modules',
              'jest',
              '--config',
              './test/jest-e2e.json',
              '--runInBand',
              '--runTestsByPath',
              process.argv[2] === 'smtp'
                ? 'test/smtp-settings.e2e-spec.ts'
                : 'test/domains.e2e-spec.ts',
            ]
          : process.argv[2] === 'invariants'
            ? ['test:invariants']
            : process.argv[2] === 'worker'
              ? ['--filter', '@webhost-billing/worker', 'test']
              : ['--filter', '@webhost-billing/api', 'test:e2e', '--runInBand'];
    execFileSync(
      process.platform === 'win32'
        ? (process.env.ComSpec ?? 'cmd.exe')
        : 'pnpm',
      process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm', ...args] : args,
      { cwd: '../..', env: e2eApiEnvironment, stdio: 'inherit' },
    );
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
  console.error('Isolated API acceptance failed; see prior diagnostics.');
  process.exitCode = 1;
});

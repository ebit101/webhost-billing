import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

if (process.env.WEBHOST_BROWSER_E2E_SCHEMA)
  throw new Error('Do not reuse a test schema.');
process.env.WEBHOST_BROWSER_E2E_SCHEMA = `command26_e2e_${randomUUID().replaceAll('-', '')}`;

async function main() {
  const cleanSeedOnly = process.argv.includes('--verify-clean-seed');
  const { E2E_DATABASE_URL, E2E_SCHEMA, e2eApiEnvironment } =
    await import('../../web/e2e/environment.js');
  const { assertBrowserDatabaseScope, validateBrowserDatabaseUrl } =
    await import('../../web/e2e/database-scope.js');
  const { createPrismaClient } = await import('@webhost-billing/database');
  validateBrowserDatabaseUrl(E2E_DATABASE_URL, E2E_SCHEMA);
  const root = resolve(__dirname, '../../..');
  const source = join(root, 'packages/database/prisma/migrations');
  const expectedTables = [
    ...readFileSync(
      join(root, 'packages/database/prisma/schema.prisma'),
      'utf8',
    ).matchAll(/@@map\("([a-z_]+)"\)/g),
  ]
    .map((match) => match[1])
    .sort();
  assert.equal(expectedTables.length, 74);
  const names = readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const first = '20261107000300_invoice_product_attribution';
  const second = '20261107000400_domain_invoice_attribution';
  assert.equal(names.indexOf(first), 56);
  assert.equal(names.indexOf(second), 57);
  assert.equal(
    names.length,
    58,
    'Update the pinned rehearsal before testing a different source schema.',
  );
  assert.ok(
    process.env.npm_execpath,
    'Run pnpm test:billing-upgrade from the repository root.',
  );
  const pnpmCli = realpathSync(process.env.npm_execpath);
  assert.match(pnpmCli, /pnpm\.(?:cjs|mjs|js)$/);
  const temporaryParent = realpathSync(tmpdir());
  const temporary = mkdtempSync(
    join(temporaryParent, 'webhost-billing-upgrade-'),
  );
  const migrations = join(temporary, 'migrations');
  const config = join(temporary, 'prisma.config.mjs');
  mkdirSync(migrations);
  cpSync(
    join(source, 'migration_lock.toml'),
    join(migrations, 'migration_lock.toml'),
    { recursive: true },
  );
  writeFileSync(
    config,
    `export default {schema: ${JSON.stringify(join(root, 'packages/database/prisma/schema.prisma'))}, migrations: {path: ${JSON.stringify(migrations)}}, datasource: {url: process.env.DATABASE_URL}};\n`,
  );
  const database = createPrismaClient(E2E_DATABASE_URL);
  let created = false;
  let marked = false;
  let namespaceOid: string | undefined;
  function pnpm(args: string[], extra: Record<string, string> = {}) {
    execFileSync(process.execPath, [pnpmCli, ...args], {
      cwd: root,
      env: { ...e2eApiEnvironment, ...extra },
      stdio: 'inherit',
    });
  }
  async function owned() {
    validateBrowserDatabaseUrl(E2E_DATABASE_URL, E2E_SCHEMA);
    const rows = await database.$queryRaw<
      Array<{ schema: string; path: string; owner: string }>
    >`
      SELECT current_schema() AS schema, current_setting('search_path') AS path, owner FROM __browser_e2e_scope
    `;
    assert.deepEqual(rows, [
      { schema: E2E_SCHEMA, path: E2E_SCHEMA, owner: E2E_SCHEMA },
    ]);
  }
  async function ledger() {
    return database.$queryRaw<
      Array<{ row: string }>
    >`SELECT to_jsonb(m)::text AS row FROM _prisma_migrations m ORDER BY migration_name`;
  }
  async function fingerprint() {
    await owned();
    const tables = await database.$queryRaw<Array<{ name: string }>>`
      SELECT tablename AS name FROM pg_tables WHERE schemaname=${E2E_SCHEMA} AND tablename NOT IN ('_prisma_migrations','__browser_e2e_scope') ORDER BY tablename
    `;
    assert.deepEqual(
      tables.map((table) => table.name),
      expectedTables,
    );
    const result: Record<string, string> = {};
    for (const { name } of tables) {
      assert.match(name, /^[a-z_]+$/);
      // Subtract the nullable new column for a comparable pre/post projection.
      const rows = await database.$queryRawUnsafe<Array<{ row: string }>>(
        `SELECT (to_jsonb(r) - ${name === 'invoice_items' ? "'product_attribution_snapshot'" : "'__no_such_field__'"})::text AS row FROM "${E2E_SCHEMA}"."${name}" r ORDER BY (to_jsonb(r) - 'product_attribution_snapshot')::text`,
      );
      result[name] = createHash('sha256')
        .update(JSON.stringify(rows))
        .digest('hex');
    }
    return result;
  }
  async function migrate(count: number) {
    for (const name of names.slice(0, count))
      cpSync(join(source, name), join(migrations, name), { recursive: true });
    pnpm([
      '--filter',
      '@webhost-billing/database',
      'exec',
      'prisma',
      'migrate',
      'deploy',
      '--config',
      config,
    ]);
    const history = await database.$queryRaw<
      Array<{
        name: string;
        checksum: string;
        finished: Date | null;
        rolled: Date | null;
      }>
    >`
      SELECT migration_name AS name, checksum, finished_at AS finished, rolled_back_at AS rolled FROM _prisma_migrations ORDER BY migration_name
    `;
    assert.deepEqual(
      history.map((row) => row.name),
      names.slice(0, count),
    );
    for (const row of history) {
      assert.ok(row.finished && !row.rolled);
      assert.equal(
        row.checksum,
        createHash('sha256')
          .update(readFileSync(join(source, row.name, 'migration.sql')))
          .digest('hex'),
      );
    }
  }
  function acceptance(phase: string) {
    pnpm(
      [
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
        'test/billing-upgrade.e2e-spec.ts',
      ],
      { WEBHOST_BILLING_UPGRADE_PHASE: phase },
    );
  }
  try {
    const administrationUrl = new URL(E2E_DATABASE_URL);
    administrationUrl.searchParams.set('schema', 'public');
    administrationUrl.searchParams.delete('options');
    const administration = createPrismaClient(administrationUrl.toString());
    try {
      await administration.$executeRawUnsafe(`CREATE SCHEMA "${E2E_SCHEMA}"`);
      created = true;
    } finally {
      await administration.$disconnect();
    }
    const namespace = await database.$queryRaw<
      Array<{ id: string }>
    >`SELECT oid::text AS id FROM pg_namespace WHERE nspname=${E2E_SCHEMA}`;
    namespaceOid = namespace[0]?.id;
    assert.ok(namespaceOid);
    await migrate(cleanSeedOnly ? 58 : 56);
    await database.$executeRaw`CREATE TABLE __browser_e2e_scope (owner text NOT NULL, fixture jsonb)`;
    await database.$executeRaw`INSERT INTO __browser_e2e_scope(owner) VALUES (${E2E_SCHEMA})`;
    marked = true;
    await assertBrowserDatabaseScope(database, E2E_DATABASE_URL, E2E_SCHEMA);
    pnpm(['--filter', '@webhost-billing/database', 'db:seed']);
    if (cleanSeedOnly) {
      pnpm(['--filter', '@webhost-billing/database', 'db:verify']);
      console.log(
        'Current schema and unchanged fictional seed verification passed in a separate owned schema.',
      );
      return;
    }
    acceptance('legacy');
    const baseline = await fingerprint();
    const baselineMigrations = await ledger();
    await migrate(57);
    assert.deepEqual(await fingerprint(), baseline);
    assert.deepEqual((await ledger()).slice(0, 56), baselineMigrations);
    const oldLines = await database.invoiceItem.findMany({
      orderBy: { id: 'asc' },
    });
    assert.ok(oldLines.length >= 6);
    assert.ok(
      oldLines.every((line) => line.productAttributionSnapshot === null),
    );
    console.log(
      'Migration 57 preserved all 74 application tables and added no historical attribution.',
    );
    await migrate(58);
    assert.deepEqual(await fingerprint(), baseline);
    assert.deepEqual((await ledger()).slice(0, 56), baselineMigrations);
    await migrate(58);
    assert.deepEqual(await fingerprint(), baseline);
    console.log(
      'Migration 58 and deploy replay preserved all existing rows and trusted history.',
    );
    acceptance('current');
    assert.deepEqual(
      await database.invoiceItem.findMany({
        where: { id: { in: oldLines.map((line) => line.id) } },
        orderBy: { id: 'asc' },
      }),
      oldLines,
    );
    // The standard verifier deliberately requires an empty domain catalogue.
    // Keep those seed-only gates intact and verify in a separate owned schema.
    pnpm(
      [
        '--filter',
        '@webhost-billing/web',
        'exec',
        'tsx',
        '../api/test/run-billing-upgrade.ts',
        '--verify-clean-seed',
      ],
      { WEBHOST_BROWSER_E2E_SCHEMA: '' },
    );
    console.log(
      'Billing upgrade rehearsal passed: 56 → 57 → 58, legacy review, pending settlement and immutable invoice history.',
    );
  } finally {
    try {
      if (created) {
        if (marked) await owned();
        else {
          // Prisma requires an empty schema before the first migration. Retain
          // the OID from this successful CREATE as pre-marker ownership proof.
          const namespace = await database.$queryRaw<
            Array<{ id: string; schema: string; path: string }>
          >`SELECT oid::text AS id, current_schema() AS schema, current_setting('search_path') AS path FROM pg_namespace WHERE nspname=${E2E_SCHEMA}`;
          assert.deepEqual(namespace, [
            { id: namespaceOid, schema: E2E_SCHEMA, path: E2E_SCHEMA },
          ]);
        }
        await database.$executeRawUnsafe(`DROP SCHEMA "${E2E_SCHEMA}" CASCADE`);
        console.log('Removed only the owned billing-upgrade schema.');
      }
    } finally {
      await database.$disconnect();
      assert.equal(dirname(realpathSync(temporary)), temporaryParent);
      assert.ok(
        temporary.startsWith(join(temporaryParent, 'webhost-billing-upgrade-')),
      );
      rmSync(temporary, { recursive: true });
    }
  }
}
void main().catch((error: unknown) => {
  if (error instanceof Error)
    console.error(
      error.message.replace(
        /postgres(?:ql)?:\/\/\S+/g,
        '[redacted connection]',
      ),
    );
  console.error(
    'Isolated billing upgrade rehearsal failed; review preceding diagnostics.',
  );
  process.exitCode = 1;
});

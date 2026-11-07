import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
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
import { pathToFileURL } from 'node:url';

if (process.env.WEBHOST_BROWSER_E2E_SCHEMA)
  throw new Error('Do not reuse a test schema.');
process.env.WEBHOST_BROWSER_E2E_SCHEMA = `command26_e2e_${randomUUID().replaceAll('-', '')}`;

async function main() {
  const cleanSeedOnly = process.argv.includes('--verify-clean-seed');
  const failureOnly = process.argv.includes('--failure-rehearsal');
  const { E2E_DATABASE_URL, E2E_SCHEMA, e2eApiEnvironment } =
    await import('../../web/e2e/environment.js');
  const { assertBrowserDatabaseScope, validateBrowserDatabaseUrl } =
    await import('../../web/e2e/database-scope.js');
  const { createPrismaClient } = await import('@webhost-billing/database');
  validateBrowserDatabaseUrl(E2E_DATABASE_URL, E2E_SCHEMA);
  const root = resolve(__dirname, '../../..');
  const published = '24af57553937574dc4f0c12cd1b0be2078ba7ed7';
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trimEnd();
  assert.equal(git(['rev-parse', 'v0.1.0-alpha.4^{commit}']), published);
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
  const publishedNames = git([
    'ls-tree',
    '--name-only',
    `${published}:packages/database/prisma/migrations`,
  ])
    .split('\n')
    .filter((name) => /^\d{14}_/.test(name));
  assert.equal(publishedNames.length, 46);
  assert.deepEqual(names.slice(0, 46), publishedNames);
  assert.equal(
    git([
      'diff',
      '--name-only',
      published,
      'HEAD',
      '--',
      ...publishedNames.map(
        (name) => `packages/database/prisma/migrations/${name}/migration.sql`,
      ),
    ]),
    '',
  );
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
  let historicalDirectory: string | undefined;
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
  async function originalColumns() {
    await owned();
    const rows = await database.$queryRaw<
      Array<{ table: string; column: string }>
    >`SELECT table_name AS table, column_name AS column FROM information_schema.columns WHERE table_schema=current_schema() AND table_name NOT IN ('_prisma_migrations','__browser_e2e_scope') ORDER BY table_name,ordinal_position`;
    const columns: Record<string, string[]> = {};
    for (const row of rows) {
      assert.match(row.table, /^[a-z_]+$/);
      assert.match(row.column, /^[a-z0-9_]+$/);
      (columns[row.table] ??= []).push(row.column);
    }
    assert.equal(Object.keys(columns).length, 60);
    return columns;
  }
  async function fingerprintOriginal(columns: Record<string, string[]>) {
    await owned();
    const values: Record<string, string> = {};
    for (const [table, fields] of Object.entries(columns)) {
      const rows = await database.$queryRawUnsafe<Array<{ row: string }>>(
        `SELECT to_jsonb(original)::text AS row FROM (SELECT ${fields.map((field) => `"${field}"`).join(',')} FROM "${E2E_SCHEMA}"."${table}") original ORDER BY to_jsonb(original)::text`,
      );
      values[table] = createHash('sha256')
        .update(JSON.stringify(rows))
        .digest('hex');
    }
    return values;
  }
  const deployArgs = [
    '--filter',
    '@webhost-billing/database',
    'exec',
    'prisma',
    'migrate',
    'deploy',
    '--config',
    config,
  ];
  function expectedMigrationFailure(code: string) {
    const result = spawnSync(process.execPath, [pnpmCli, ...deployArgs], {
      cwd: root,
      env: e2eApiEnvironment,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.ok(result.status !== null && result.status !== 0);
    const output = (result.stdout + result.stderr).replace(
      /postgres(?:ql)?:\/\/\S+/g,
      '[redacted connection]',
    );
    assert.ok(
      output.includes(code),
      `Expected isolated migration refusal ${code}: ${output.slice(-4000)}`,
    );
    console.log(
      `Expected isolated migration failure ${code}; no migration was marked resolved.`,
    );
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
    await migrate(cleanSeedOnly ? 58 : 46);
    await database.$executeRaw`CREATE TABLE __browser_e2e_scope (owner text NOT NULL, fixture jsonb, alpha4_fixture jsonb)`;
    await database.$executeRaw`INSERT INTO __browser_e2e_scope(owner) VALUES (${E2E_SCHEMA})`;
    marked = true;
    await assertBrowserDatabaseScope(database, E2E_DATABASE_URL, E2E_SCHEMA);
    if (cleanSeedOnly) {
      pnpm(['--filter', '@webhost-billing/database', 'db:seed']);
      pnpm(['--filter', '@webhost-billing/database', 'db:verify']);
      console.log(
        'Current schema and unchanged fictional seed verification passed in a separate owned schema.',
      );
      return;
    }
    // Generate the published data model in a private ignored directory, so its
    // seed never selects/inserts defaults for columns introduced after alpha.4.
    const generatedParent = realpathSync(
      join(root, 'packages/database/src/generated'),
    );
    historicalDirectory = mkdtempSync(
      join(generatedParent, 'command230-alpha4-'),
    );
    const historicalSchema = join(historicalDirectory, 'schema.prisma');
    writeFileSync(
      historicalSchema,
      git([
        'show',
        `${published}:packages/database/prisma/schema.prisma`,
      ]).replace(/output\s*=\s*"[^"]+"/, 'output = "./client"'),
    );
    pnpm([
      '--filter',
      '@webhost-billing/database',
      'exec',
      'prisma',
      'generate',
      '--schema',
      historicalSchema,
    ]);
    const clientFactory = join(historicalDirectory, 'client-factory.ts');
    writeFileSync(
      clientFactory,
      readFileSync(
        join(root, 'packages/database/src/client.ts'),
        'utf8',
      ).replace(
        "'./generated/prisma/client'",
        JSON.stringify(join(historicalDirectory, 'client/client.ts')),
      ),
    );
    let oldSeed = git([
      'show',
      `${published}:packages/database/prisma/seed.ts`,
    ]);
    for (const [from, to] of [
      ['../src/client', clientFactory],
      [
        '../src/generated/prisma/enums',
        join(historicalDirectory, 'client/enums.ts'),
      ],
      [
        '../../../apps/web/e2e/database-scope.js',
        pathToFileURL(join(root, 'apps/web/e2e/database-scope.ts')).href,
      ],
    ]) {
      assert.ok(oldSeed.includes(`'${from}'`));
      oldSeed = oldSeed.replaceAll(`'${from}'`, JSON.stringify(to));
    }
    const legacySeed = join(temporary, 'alpha4-seed.ts');
    writeFileSync(legacySeed, oldSeed);
    pnpm(['--filter', '@webhost-billing/web', 'exec', 'tsx', legacySeed]);
    const { populateAlpha4Fixture, verifyAlpha4Migration } =
      await import('./fixtures/alpha4-billing.fixture.js');
    const alpha4 = await populateAlpha4Fixture(
      database,
      E2E_DATABASE_URL,
      E2E_SCHEMA,
    );
    const columns = await originalColumns();
    const original = await fingerprintOriginal(columns);
    const originalMigrations = await ledger();
    if (failureOnly) {
      await migrate(47);
      assert.deepEqual(await fingerprintOriginal(columns), original);
      const failedName = '20261105000150_command230_forced_failure';
      mkdirSync(join(migrations, failedName));
      writeFileSync(
        join(migrations, failedName, 'migration.sql'),
        'SELECT 1 / 0;\n',
      );
      // A real trusted migration has committed before this synthetic fault.
      expectedMigrationFailure('P3018');
      const failedLedger = await ledger();
      const failed = await database.$queryRaw<
        Array<{ name: string; finished: Date | null }>
      >`SELECT migration_name AS name, finished_at AS finished FROM _prisma_migrations ORDER BY migration_name`;
      assert.equal(failed.length, 48);
      assert.deepEqual(
        failed.slice(0, 47).map((row) => row.name),
        names.slice(0, 47),
      );
      assert.equal(failed[47].name, failedName);
      assert.equal(failed[47].finished, null);
      assert.deepEqual(await fingerprintOriginal(columns), original);
      expectedMigrationFailure('P3009');
      assert.deepEqual(await ledger(), failedLedger);
      assert.deepEqual(await fingerprintOriginal(columns), original);
      assert.deepEqual((await ledger()).slice(0, 46), originalMigrations);
      console.log(
        'Partial-migration evidence retained through blocked replay; all 60 original tables and 46 trusted ledger rows preserved. Owned fictional scope may now be disposed.',
      );
      return;
    }
    await migrate(56);
    assert.deepEqual(await fingerprintOriginal(columns), original);
    assert.deepEqual((await ledger()).slice(0, 46), originalMigrations);
    await verifyAlpha4Migration(database, alpha4);
    console.log(
      'Populated alpha.4 upgraded 46 → 56 with all 60 original table projections and trusted history preserved.',
    );
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
    assert.deepEqual((await ledger()).slice(0, 46), originalMigrations);
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
    pnpm(
      [
        '--filter',
        '@webhost-billing/web',
        'exec',
        'tsx',
        '../api/test/run-billing-upgrade.ts',
        '--failure-rehearsal',
      ],
      { WEBHOST_BROWSER_E2E_SCHEMA: '' },
    );
    console.log(
      'Billing upgrade rehearsal passed: published alpha.4 46 → 56 → 57 → 58, legacy review, pending settlement, partial-migration refusal and immutable invoice history.',
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
      if (historicalDirectory) {
        assert.equal(
          dirname(realpathSync(historicalDirectory)),
          realpathSync(join(root, 'packages/database/src/generated')),
        );
        assert.ok(
          historicalDirectory.startsWith(
            join(root, 'packages/database/src/generated/command230-alpha4-'),
          ),
        );
        rmSync(historicalDirectory, { recursive: true });
      }
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

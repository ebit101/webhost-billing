import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { loadPinnedMigrations } from './currency-privilege-harness.fixtures';

const db = resolve(__dirname, '..');
const root = resolve(db, '../..');
const schema = readFileSync(resolve(db, 'prisma/schema.prisma'), 'utf8');
const sql = readFileSync(
  resolve(
    db,
    'prisma/migrations/20261010090000_inert_currency_identity/migration.sql',
  ),
  'utf8',
);
function model(name: string) {
  const body = schema.match(new RegExp(`model ${name} \\{([^}]+)\\}`))?.[1];
  assert.ok(body);
  return body;
}

test('the two inert models have explicit facts and only their restricted relationship', () => {
  const installation = model('CurrencyInstallation');
  const domain = model('CurrencyExecutionDomain');
  assert.match(installation, /id\s+Int\s+@id @db.SmallInt/);
  assert.match(installation, /installationId\s+String\s+@unique/);
  assert.match(domain, /id\s+String\s+@id @db.Uuid/);
  assert.match(domain, /@@unique\(\[installationId, id\]/);
  assert.match(domain, /onDelete: Restrict, onUpdate: Restrict/);
  for (const body of [installation, domain]) {
    assert.match(
      body,
      /createdAt\s+DateTime\s+@map\("created_at"\) @db.Timestamptz\(3\)/,
    );
    assert.doesNotMatch(
      body,
      /@default|@updatedAt|active|current|CurrencyControl|User|Setting/,
    );
  }
  assert.equal((domain.match(/@db.VarChar\(63\)/g) ?? []).length, 2);
  assert.equal((domain.match(/@db.VarChar\(64\)/g) ?? []).length, 1);
});

test('one additive pinned migration retains all 25 original content pins and the old control index', () => {
  const migrations = loadPinnedMigrations();
  assert.equal(migrations.length, 26);
  assert.equal(
    migrations[24]?.name,
    '20261008090000_unselected_currency_control',
  );
  assert.equal(migrations[25]?.sql, sql);
  assert.deepEqual(
    [...sql.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map((m) => m[1]),
    ['currency_installations', 'currency_execution_domains'],
  );
  assert.doesNotMatch(
    sql,
    /\b(?:DEFAULT|INSERT|UPDATE\s+"|DELETE\s+FROM|ALTER|GRANT|CASCADE)\b/,
  );
  assert.match(sql, /ON DELETE RESTRICT ON UPDATE RESTRICT/);
  assert.match(sql, /"id" = 1/);
});

test('full stored-value placement and manifest checks do not rely on a newline-permissive end anchor', () => {
  assert.equal((sql.match(/COLLATE pg_catalog\."C"/g) ?? []).length, 3);
  for (const name of ['database_name', 'schema_name']) {
    assert.ok(sql.includes(`pg_catalog.length("${name}") BETWEEN 1 AND 63`));
    assert.ok(
      sql.includes(`"${name}" ~ '^[a-z_]' AND "${name}" !~ '[^a-z0-9_]'`),
    );
    assert.ok(sql.includes(`pg_catalog.left("${name}", 3) <> 'pg_'`));
    assert.ok(sql.includes(`"${name}" <> 'information_schema'`));
  }
  assert.match(sql, /length\("placement_manifest_digest"\) = 64/);
  assert.match(sql, /"placement_manifest_digest" !~ '\[\^a-f0-9\]'/);
  assert.equal(
    (sql.match(/pg_catalog.isfinite\("created_at"\)/g) ?? []).length,
    2,
  );
});

test('six statement mutation guards use a fixed invoker and explicit new-object PUBLIC revocation', () => {
  assert.equal((sql.match(/CREATE FUNCTION /g) ?? []).length, 1);
  assert.match(sql, /SECURITY INVOKER SET search_path = pg_catalog/);
  assert.match(
    sql,
    /ERRCODE = '23514', MESSAGE = 'Immutable currency identity mutation denied.'/,
  );
  assert.equal(
    (
      sql.match(
        /FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_identity_mutation\(\)/g,
      ) ?? []
    ).length,
    6,
  );
  for (const name of ['currency_installations', 'currency_execution_domains'])
    for (const event of ['UPDATE', 'DELETE', 'TRUNCATE'])
      assert.ok(sql.includes(`BEFORE ${event} ON "${name}"`));
  assert.match(
    sql,
    /REVOKE ALL ON TABLE "currency_installations", "currency_execution_domains" FROM PUBLIC/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION deny_currency_identity_mutation\(\) FROM PUBLIC/,
  );
  assert.doesNotMatch(
    sql,
    /SECURITY DEFINER|current_setting|current_user|session_user|set_config/,
  );
});

test('mandatory source and SQL wiring append identity acceptance without changing existing gate order', () => {
  const pkg = JSON.parse(readFileSync(resolve(db, 'package.json'), 'utf8'));
  assert.ok(
    pkg.scripts['test:unit'].endsWith(
      'currency-privilege-harness.spec.ts test/currency-identity.spec.ts test/currency-selection-intent.spec.ts',
    ),
  );
  assert.equal(
    pkg.scripts.test,
    'pnpm test:unit && pnpm test:privileges && pnpm --filter @webhost-billing/web exec tsx e2e/run-database-tests.ts',
  );
  assert.ok(
    !Object.keys(pkg.exports).some((key) =>
      /identity|installation|domain/.test(key),
    ),
  );
  const launcher = readFileSync(
    resolve(root, 'apps/web/e2e/run-database-tests.ts'),
    'utf8',
  );
  assert.match(
    launcher,
    /'currency-units',\s+'currency-policies',\s+'currency-adoption-preflight',\s+'currency-coordination',\s+'currency-coordination-guards',\s+'currency-control',\s+'currency-identity',/,
  );
  assert.ok(launcher.includes("['db:seed', 'db:verify']"));
});

test('ordinary application sources and seed have no identity reader, initializer, writer or consumer', () => {
  const forbidden =
    /currencyInstallation|currencyExecutionDomain|currency_installations|currency_execution_domains/;
  function visit(directory: string) {
    for (const file of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, file.name);
      if (file.isDirectory()) visit(path);
      else if (/\.(?:ts|tsx)$/.test(file.name))
        assert.doesNotMatch(readFileSync(path, 'utf8'), forbidden, path);
    }
  }
  for (const name of ['api', 'web', 'worker'])
    visit(resolve(root, `apps/${name}/src`));
  assert.doesNotMatch(
    readFileSync(resolve(db, 'prisma/seed.ts'), 'utf8'),
    forbidden,
  );
  assert.doesNotMatch(
    readFileSync(resolve(db, 'src/index.ts'), 'utf8'),
    forbidden,
  );
  const verifier = readFileSync(resolve(db, 'prisma/verify.ts'), 'utf8');
  assert.ok(
    verifier.includes(
      'assert.equal(await prisma.currencyInstallation.count(), 0)',
    ),
  );
  assert.ok(
    verifier.includes(
      'assert.equal(await prisma.currencyExecutionDomain.count(), 0)',
    ),
  );
});

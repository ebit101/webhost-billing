import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { loadPinnedMigrations } from './currency-privilege-harness.fixtures';
import { facts, canonicalArgs } from './currency-intent-storage.fixtures';
import { stableVectors } from './currency-canonical-parity.vectors';

const db = resolve(__dirname, '..');
const root = resolve(db, '../..');
const schema = readFileSync(resolve(db, 'prisma/schema.prisma'), 'utf8');
const migration = loadPinnedMigrations()[26]!;
const sql = migration.sql;
test('one pinned atomic closed-store migration follows all 26 retained migrations', () => {
  const all = loadPinnedMigrations();
  assert.equal(all.length, 28);
  assert.equal(all[25]?.name, '20261010090000_inert_currency_identity');
  assert.equal(
    migration.name,
    '20261011090000_closed_currency_selection_intents',
  );
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
  assert.deepEqual(
    [...sql.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map((m) => m[1]),
    ['currency_selection_intents'],
  );
  assert.match(
    sql,
    /ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_id_user_id_key" UNIQUE \("id", "user_id"\)/,
  );
  assert.doesNotMatch(
    sql,
    /DEFAULT|SECURITY DEFINER|\bGRANT\b|\bCASCADE\b|current_setting|set_config|current_user|session_user|\bEXECUTE\s+format|\bINSERT\s+INTO|\bUPDATE\s+"|\bDELETE\s+FROM/i,
  );
});
test('exact model has no defaults, state flags, auth/proof facts or consumers', () => {
  const body = schema.match(/model CurrencySelectionIntent \{([^}]+)\}/)?.[1];
  assert.ok(body);
  assert.match(body, /@@id\(\[installationId, requestKeyUuid\]/);
  assert.match(
    body,
    /fields: \[sessionId, actorUserId\], references: \[id, userId\]/,
  );
  assert.equal(
    (body.match(/onDelete: Restrict, onUpdate: Restrict/g) ?? []).length,
    6,
  );
  assert.doesNotMatch(
    body,
    /@default|@updatedAt|createdAt|usable|selected|approved|status|tokenHash|proof|authEpoch/,
  );
  assert.match(
    schema,
    /@@unique\(\[id, userId\], map: "auth_sessions_id_user_id_key"\)/,
  );
});
test('independent bounded scalar SQL reconstruction is pure, private and canonical-only', () => {
  assert.equal((sql.match(/CREATE FUNCTION /g) ?? []).length, 2);
  assert.match(sql, /IMMUTABLE SECURITY INVOKER/);
  assert.equal(
    (sql.match(/SET search_path = pg_catalog, pg_temp/g) ?? []).length,
    2,
  );
  assert.ok(
    sql.indexOf('octet_length(key_text) <> 36') < sql.indexOf('result :='),
  );
  assert.ok(
    sql.indexOf('octet_length(next_revision) NOT BETWEEN 1 AND 64') <
      sql.indexOf('result :='),
  );
  assert.match(sql, /generation <= 0 OR prior_revision = next_revision/);
  assert.match(
    sql,
    /WHEN pg_catalog.octet_length\("canonical_text"\) BETWEEN 1 AND 1024/,
  );
  assert.match(
    sql,
    /pg_catalog.encode\(pg_catalog.sha256\(pg_catalog.convert_to\(/,
  );
  assert.doesNotMatch(
    sql,
    /jsonb::text|\b(?:SELECT|PERFORM)\b|now\(|clock_timestamp|random|gen_random|WHEN OTHERS/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION currency_selection_intent_canonical\(uuid,uuid,uuid,uuid,text,text,text,bigint,text\) FROM PUBLIC/,
  );
});
test('four unconditional statement write refusals protect empty and no-op paths', () => {
  for (const event of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'])
    assert.ok(sql.includes(`BEFORE ${event} ON "currency_selection_intents"`));
  assert.equal(
    (
      sql.match(
        /FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_selection_intent_mutation\(\)/g,
      ) ?? []
    ).length,
    4,
  );
  assert.match(
    sql,
    /ERRCODE = '23514', MESSAGE = 'Closed currency selection intent mutation denied.'/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON TABLE "currency_selection_intents" FROM PUBLIC/,
  );
});
test('literal S fixtures retain exact key text and string generations without Number conversion', () => {
  for (const [text, bytes, hash] of stableVectors) {
    const row = facts(text);
    assert.equal(row[10], text);
    assert.equal(row[11], hash);
    assert.equal(Buffer.byteLength(text), bytes);
    assert.equal(canonicalArgs(row)[7], row[8]);
  }
});
test('mandatory test appends retain root, P1-first, parity and all old SQL acceptance', () => {
  const pkg = JSON.parse(readFileSync(resolve(db, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
    exports: Record<string, unknown>;
  };
  assert.ok(
    pkg.scripts['test:unit']!.endsWith(
      'test/currency-canonical-parity.spec.ts test/currency-intent-storage.spec.ts test/currency-authorization-storage.spec.ts',
    ),
  );
  assert.equal(
    pkg.scripts['test:privileges'],
    'tsx --test --test-concurrency=1 test/currency-privilege-harness.integration.spec.ts && tsx --test --test-concurrency=1 test/currency-canonical-parity.integration.spec.ts && tsx --test --test-concurrency=1 test/currency-intent-storage.privileges.spec.ts && tsx --test --test-concurrency=1 test/currency-authorization-storage.privileges.spec.ts',
  );
  assert.equal(
    pkg.scripts.test,
    'pnpm test:unit && pnpm test:privileges && pnpm --filter @webhost-billing/web exec tsx e2e/run-database-tests.ts',
  );
  assert.ok(
    !Object.keys(pkg.exports).some((k) => /intent|identity|assessment/.test(k)),
  );
  assert.match(
    readFileSync(resolve(root, 'apps/web/e2e/run-database-tests.ts'), 'utf8'),
    /'currency-identity',\s+'currency-intent-storage',/,
  );
  const probe = readFileSync(
    resolve(__dirname, 'currency-intent-storage.fixtures.ts'),
    'utf8',
  );
  assert.match(probe, /INCLUDING ALL/);
  assert.match(probe, /pg_get_constraintdef/);
  assert.doesNotMatch(
    probe,
    /DISABLE TRIGGER|session_replication_role|DROP (?:TABLE|TRIGGER|FUNCTION)|process\.env/,
  );
});
test('application, root, provider, worker and seed sources do not consume the intent store', () => {
  const forbidden =
    /currencySelectionIntent|CurrencySelectionIntent|currency_selection_intents|currency_selection_intent_canonical/;
  function visit(dir: string) {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, f.name);
      if (f.isDirectory()) visit(path);
      else if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(f.name))
        assert.doesNotMatch(readFileSync(path, 'utf8'), forbidden, path);
    }
  }
  for (const name of ['api', 'web', 'worker'])
    visit(resolve(root, 'apps', name, 'src'));
  for (const file of ['src/index.ts', 'prisma/seed.ts'])
    assert.doesNotMatch(readFileSync(resolve(db, file), 'utf8'), forbidden);
  assert.ok(
    readFileSync(resolve(db, 'prisma/verify.ts'), 'utf8').includes(
      'assert.equal(await prisma.currencySelectionIntent.count(), 0)',
    ),
  );
});

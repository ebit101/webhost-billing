import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { loadPinnedMigrations } from './currency-privilege-harness.fixtures';
import {
  facts,
  baseH,
  columns,
} from './currency-authorization-storage.fixtures';
const db = resolve(__dirname, '..'),
  root = resolve(db, '../..');
const schema = readFileSync(resolve(db, 'prisma/schema.prisma'), 'utf8');
const sql = loadPinnedMigrations()[27]!.sql;
test('one pinned atomic evidence addition retains all 27 prior migrations and adds only one redundant profile key', () => {
  const all = loadPinnedMigrations();
  assert.equal(all.length, 28);
  assert.equal(
    all[26]?.name,
    '20261011090000_closed_currency_selection_intents',
  );
  assert.equal(
    all[27]?.name,
    '20261011100000_closed_currency_authorization_evidence',
  );
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
  assert.deepEqual(
    [...sql.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map((m) => m[1]),
    ['currency_authorization_evidence'],
  );
  assert.deepEqual(
    [...sql.matchAll(/ALTER TABLE "([a-z_]+)"/g)].map((m) => m[1]),
    ['admin_profiles'],
  );
  assert.match(sql, /UNIQUE \("id", "user_id"\)/);
  assert.doesNotMatch(
    sql,
    /DEFAULT|SECURITY DEFINER|\bGRANT\b|\bCASCADE\b|current_setting|set_config|current_user|session_user|\bINSERT\s+INTO|\bUPDATE\s+"|\bDELETE\s+FROM/i,
  );
});
test('H model has exactly public historical identities and no secret-row references or runtime state', () => {
  const body = schema.match(
    /model CurrencyAuthorizationEvidence \{([^}]+)\}/,
  )?.[1];
  assert.ok(body);
  assert.equal(
    (body.match(/onDelete: Restrict, onUpdate: Restrict/g) ?? []).length,
    5,
  );
  assert.match(
    body,
    /fields: \[adminProfileId, actorUserId\], references: \[id, userId\]/,
  );
  assert.match(
    body,
    /fields: \[sessionId, actorUserId\], references: \[id, userId\]/,
  );
  assert.match(
    schema,
    /@@unique\(\[id, userId\], map: "admin_profiles_id_user_id_key"\)/,
  );
  assert.match(
    schema,
    /@@unique\(\[id, userId\], map: "auth_sessions_id_user_id_key"\)/,
  );
  assert.doesNotMatch(
    body,
    /@default|@updatedAt|AdminTotpCredential|AdminRecoveryCode|usable|approved|selected|token|hash|ciphertext|canonical|digest/i,
  );
  assert.equal(columns.length, 12);
  assert.deepEqual(facts().slice(0, 10), baseH);
});
test('typed UUID, positive exact BIGINT, factor/null and finite explicit millisecond timestamp checks are installed', () => {
  for (const field of [
    'id',
    'execution_domain_id',
    'actor_user_id',
    'admin_profile_id',
    'session_id',
    'credential_id',
    'installation_id',
    'recovery_code_id',
  ])
    assert.ok(sql.includes(`"${field}"::text ~`));
  assert.equal((sql.match(/\[1-8\]\[0-9a-f\]\{3\}-\[89ab\]/g) ?? []).length, 8);
  assert.match(
    sql,
    /"auth_epoch" BETWEEN 1 AND 9223372036854775807 AND "recovery_set_epoch" BETWEEN 1 AND 9223372036854775807/,
  );
  assert.match(
    sql,
    /"factor_kind" VARCHAR\(8\) COLLATE pg_catalog\."C" NOT NULL/,
  );
  assert.match(sql, /"factor_kind" = 'totp' AND "recovery_code_id" IS NULL/);
  assert.match(
    sql,
    /"factor_kind" = 'recovery' AND "recovery_code_id" IS NOT NULL/,
  );
  assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL/);
  assert.match(sql, /pg_catalog\.isfinite\("created_at"\)/);
});
test('four unconditional fixed invoker statement guards and atomic PUBLIC revocations have no opening path', () => {
  assert.equal((sql.match(/CREATE FUNCTION /g) ?? []).length, 1);
  assert.match(sql, /SECURITY INVOKER SET search_path = pg_catalog, pg_temp/);
  for (const event of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'])
    assert.ok(
      sql.includes(`BEFORE ${event} ON "currency_authorization_evidence"`),
    );
  assert.equal(
    (
      sql.match(
        /FOR EACH STATEMENT EXECUTE FUNCTION deny_currency_authorization_evidence_mutation\(\)/g,
      ) ?? []
    ).length,
    4,
  );
  assert.match(
    sql,
    /ERRCODE = '23514', MESSAGE = 'Closed currency authorization evidence mutation denied.'/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON TABLE "currency_authorization_evidence" FROM PUBLIC/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION deny_currency_authorization_evidence_mutation\(\) FROM PUBLIC/,
  );
  assert.doesNotMatch(
    sql,
    /\bIF\b|\bRETURN\b|WHEN OTHERS|SELECT|PERFORM|EXECUTE\s+format/,
  );
});
test('mandatory append retains P1, parity, intent and ordinary SQL acceptance without skips', () => {
  const pkg = JSON.parse(readFileSync(resolve(db, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
    exports: Record<string, unknown>;
  };
  assert.ok(
    pkg.scripts['test:unit']!.endsWith(
      'test/currency-intent-storage.spec.ts test/currency-authorization-storage.spec.ts',
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
    !Object.keys(pkg.exports).some((k) => /authorization|evidence/.test(k)),
  );
  assert.match(
    readFileSync(resolve(root, 'apps/web/e2e/run-database-tests.ts'), 'utf8'),
    /'currency-intent-storage',\s+'currency-authorization-storage',/,
  );
  const fixture = readFileSync(
    resolve(__dirname, 'currency-authorization-storage.fixtures.ts'),
    'utf8',
  );
  assert.match(fixture, /INCLUDING ALL/);
  assert.match(fixture, /pg_get_constraintdef/);
  assert.doesNotMatch(
    fixture,
    /DISABLE TRIGGER|session_replication_role|DROP (?:TABLE|TRIGGER|FUNCTION)|process\.env/,
  );
});
test('application, workers, seed and database exports have no evidence consumer or H hash protocol', () => {
  const forbidden =
    /currencyAuthorizationEvidence|CurrencyAuthorizationEvidence|currency_authorization_evidence|deny_currency_authorization_evidence_mutation/;
  function visit(dir: string) {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, f.name);
      if (f.isDirectory()) visit(path);
      else if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(f.name))
        assert.doesNotMatch(readFileSync(path, 'utf8'), forbidden, path);
    }
  }
  for (const app of ['api', 'web', 'worker'])
    visit(resolve(root, 'apps', app, 'src'));
  for (const file of ['src/index.ts', 'prisma/seed.ts'])
    assert.doesNotMatch(readFileSync(resolve(db, file), 'utf8'), forbidden);
  assert.ok(
    readFileSync(resolve(db, 'prisma/verify.ts'), 'utf8').includes(
      'assert.equal(await prisma.currencyAuthorizationEvidence.count(), 0)',
    ),
  );
});

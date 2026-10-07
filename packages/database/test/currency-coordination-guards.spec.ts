import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { renderCurrencyCoordinationGuardPrototype as render } from '../src/currency-coordination-guards';

test('pure deterministic separate entry produces fixed qualified statement guards only', () => {
  const sql = render({ schema: 'fictional_guard' });
  assert.equal(
    sql,
    render(Object.assign(Object.create(null), { schema: 'fictional_guard' })),
  );
  assert.match(sql, /VOLATILE SECURITY INVOKER SET search_path = pg_catalog/);
  assert.equal((sql.match(/CREATE TRIGGER /g) ?? []).length, 18);
  assert.equal((sql.match(/CREATE FUNCTION /g) ?? []).length, 1);
  assert.match(sql, /pg_catalog.hashtext\(TG_TABLE_SCHEMA\)/);
  assert.match(sql, /webhost-billing\.currency-coordination\.v1:/);
  assert.match(sql, /s\.setting::pg_catalog.int8 > 0/);
  assert.match(
    sql,
    /WHEN 'lock_timeout' THEN 500 WHEN 'statement_timeout' THEN 2000 ELSE 10000/,
  );
  assert.doesNotMatch(
    sql,
    /SECURITY DEFINER|OR REPLACE|GRANT|ALTER ROLE|SET LOCAL|pg_advisory_lock\(|pg_advisory_unlock|current_setting\('webhost/,
  );
  const source = readFileSync('src/currency-coordination-guards.ts', 'utf8');
  assert.doesNotMatch(
    source,
    /\bimport\b|process\.|require\(|fetch\(|readFile|Prisma|\$execute/,
  );
  assert.doesNotMatch(
    readFileSync('src/index.ts', 'utf8'),
    /currency-coordination/,
  );
});

test('unknown caller authority and unsupported input deny before SQL rendering', () => {
  for (const input of [
    undefined,
    null,
    [],
    'fictional',
    {},
    new Date(),
    ...[
      '',
      'pg_catalog',
      'pg_custom',
      'information_schema',
      'Mixed',
      'a'.repeat(64),
      'x";--',
      'a.b',
      'x\n',
      'é',
    ].map((schema) => ({ schema })),
    ...[
      'tables',
      'key',
      'namespace',
      'body',
      'privileges',
      'exempt',
      'client',
      'limits',
    ].map((field) => ({ schema: 'fictional', [field]: true })),
    { schema: 'fictional', [Symbol('authority')]: true },
    Object.create({ schema: 'fictional' }),
  ])
    assert.throws(() => render(input), {
      message: 'Invalid currency coordination guard input.',
    });
  assert.throws(
    () =>
      render({
        get schema() {
          throw new Error('fictional-sensitive');
        },
      }),
    { message: 'Invalid currency coordination guard input.' },
  );
  assert.throws(
    () =>
      render(
        new Proxy(
          {},
          {
            ownKeys() {
              throw new Error('fictional-sensitive');
            },
          },
        ),
      ),
    { message: 'Invalid currency coordination guard input.' },
  );
});

test('fixed function verifies actual context and never reads policy or historical rows', () => {
  const sql = render({ schema: '_fixture' });
  for (const check of [
    'TG_RELID',
    'TG_TABLE_SCHEMA',
    'TG_TABLE_NAME',
    'TG_NARGS',
    'TG_LEVEL',
    'TG_WHEN',
    'TG_NAME',
    't.tgfoid',
    'pg_catalog.pg_inherits',
    "c.relkind = 'r'",
    'NOT c.relispartition',
    't.tgqual IS NULL',
    'transaction_isolation',
    'transaction_read_only',
    'pg_catalog.pg_locks',
  ])
    assert.ok(sql.includes(check));
  assert.doesNotMatch(
    sql,
    /currency_policies|currency_units|currency_adoption|920006|INSERT INTO|UPDATE .* SET |DELETE FROM|session_replication_role/,
  );
  assert.match(sql, /WHEN query_canceled THEN/);
  assert.match(sql, /\) IS DISTINCT FROM true THEN/);
  assert.equal(
    (sql.match(/MESSAGE = 'Currency coordination guard failed\.'/g) ?? [])
      .length,
    2,
  );
});

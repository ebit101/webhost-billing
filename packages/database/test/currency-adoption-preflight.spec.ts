import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  inspectCurrencyAdoption,
  CurrencyAdoptionPreflightError,
  type CurrencyAdoptionPreflightClient,
} from '../src/currency-adoption-preflight';

const sourceNames = [
  'product_prices',
  'orders',
  'order_items',
  'services',
  'invoices',
  'invoice_items',
  'payments',
  'payment_events',
];
function fake() {
  const calls: string[] = [];
  const options: unknown[] = [];
  const modes = {
    isolation: 'repeatable read',
    readOnly: 'on',
    rowSecurity: 'off',
    lockTimeout: '500ms',
    statementTimeout: '2s',
    transactionTimeout: '10s',
    observedAt: '2026-10-07T00:00:00.000Z',
  };
  let totals: unknown = [{ rowCount: '0', unresolvedCodeRowCount: '0' }];
  let groups: unknown = [];
  let events: unknown = [
    {
      rowCount: '0',
      linkedRowCount: '0',
      unlinkedRowCount: '0',
      normalizedEvidenceRowCount: '0',
    },
  ];
  let failure = false;
  const tx = {
    $executeRawUnsafe: async (sql: string) => {
      calls.push(sql);
      return 0;
    },
    $queryRawUnsafe: async (sql: string) => {
      calls.push(sql);
      if (failure) throw new Error('Authored secret connection detail');
      if (sql.includes('transaction_isolation')) return [modes];
      if (sql.includes('pg_class'))
        return sourceNames.map((name) => ({ name, kind: 'r' }));
      if (sql.includes('payment_events')) return events;
      return sql.includes('GROUP BY') ? groups : totals;
    },
  };
  const client = {
    $transaction: async (
      body: (client: typeof tx) => Promise<unknown>,
      opts: unknown,
    ) => {
      options.push(opts);
      return body(tx);
    },
  } as unknown as CurrencyAdoptionPreflightClient;
  return {
    client,
    calls,
    options,
    modes,
    setTotals: (value: unknown) => {
      totals = value;
    },
    setGroups: (value: unknown) => {
      groups = value;
    },
    setEvents: (value: unknown) => {
      events = value;
    },
    fail: () => {
      failure = true;
    },
  };
}
const input = { schema: 'eval_schema' };
const rejectedObservation = (error: unknown) => {
  assert.ok(error instanceof CurrencyAdoptionPreflightError);
  assert.equal(error.code, 'OBSERVATION_FAILED');
  assert.equal(error.cause, undefined);
  assert.doesNotMatch(String(error), /secret connection detail/);
  return true;
};

test('separate unused entry has no runtime client, root or application consumer', () => {
  const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  assert.equal(
    manifest.exports['./currency-adoption-preflight'].default,
    './dist/currency-adoption-preflight.js',
  );
  assert.doesNotMatch(
    readFileSync(resolve('src/index.ts'), 'utf8'),
    /currency-adoption-preflight/,
  );
  const source = readFileSync(
    resolve('src/currency-adoption-preflight.ts'),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /process\.env|createPrismaClient|fetch\(|node:|\.\/client['"]/,
  );
  assert.doesNotMatch(
    source,
    /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE|CREATE TABLE|ALTER TABLE|FOR UPDATE|pg_advisory|SUM\()\b/,
  );
});

test('strict schema and budget input rejects before transaction work', async () => {
  for (const value of [
    null,
    [],
    {},
    { schema: '' },
    { schema: 'public\n' },
    { schema: 'a'.repeat(64) },
    { schema: 'evil";drop' },
    { schema: 'pg_catalog' },
    { schema: 'information_schema' },
    { schema: 'a.b' },
    { schema: 'Schema' },
    { ...input, history: false },
    { ...input, readOnly: true },
    { ...input, limits: null },
    { ...input, limits: { statementMs: 0 } },
    { ...input, limits: { transactionMs: 10_001 } },
    { ...input, limits: { lockMs: 501 } },
    { ...input, limits: { acquisitionMs: 2_001 } },
    { ...input, limits: { statementMs: 2_001 } },
    { ...input, limits: { lockMs: 0.5 } },
    { ...input, limits: { statementMs: '50' } },
    { ...input, limits: { lockMs: null } },
    { ...input, limits: { transactionMs: Infinity } },
    { ...input, limits: { extra: 1 } },
    { ...input, limits: { lockMs: undefined } },
    { ...input, [Symbol('authority')]: true },
  ]) {
    const f = fake();
    await assert.rejects(
      inspectCurrencyAdoption(f.client, value),
      (error: unknown) => {
        assert.ok(error instanceof CurrencyAdoptionPreflightError);
        assert.equal(error.code, 'INVALID_INPUT');
        return true;
      },
    );
    assert.equal(f.options.length, 0);
    assert.equal(f.calls.length, 0);
  }
});

test('one owned read-only snapshot uses qualified count-only SQL and explicit modes/deadlines', async () => {
  const f = fake();
  const result = await inspectCurrencyAdoption(f.client, input);
  assert.deepEqual(f.options, [
    { isolationLevel: 'RepeatableRead', maxWait: 2_000, timeout: 10_000 },
  ]);
  assert.equal(f.calls[0], 'SET TRANSACTION READ ONLY');
  assert.ok(
    f.calls.indexOf('SET LOCAL row_security = off') <
      f.calls.findIndex((sql) => sql.includes('SELECT')),
  );
  assert.equal(f.calls.filter((sql) => sql.includes('LIMIT 33')).length, 7);
  assert.ok(
    f.calls.every((sql) => sql.startsWith('SET ') || sql.startsWith('SELECT')),
  );
  assert.doesNotMatch(
    f.calls.join('\n'),
    /\b(?:amount|total|subtotal|balance_due|customer_id|payload_hash|FOR UPDATE)\b/,
  );
  assert.equal(result.tables.length, 7);
  assert.equal(result.financialHistoryObserved, false);
  assert.equal(result.tables[0]!.category, 'configuration');
  assert.equal(result.tables[1]!.category, 'financial_history');
  assert.ok(result.limitations.includes('selection_authority_not_implemented'));
  assert.ok(result.limitations.includes('writer_coverage_not_established'));
  assert.ok(result.limitations.includes('adoption_assessment_not_established'));
  assert.equal('eligible' in result, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('shorter positive budgets are set and verified without changing session defaults', async () => {
  const f = fake();
  Object.assign(f.modes, {
    lockTimeout: '1ms',
    statementTimeout: '50ms',
    transactionTimeout: '500ms',
  });
  await inspectCurrencyAdoption(f.client, {
    ...input,
    limits: {
      acquisitionMs: 100,
      lockMs: 1,
      statementMs: 50,
      transactionMs: 500,
    },
  });
  assert.deepEqual(f.options, [
    { isolationLevel: 'RepeatableRead', maxWait: 100, timeout: 500 },
  ]);
  assert.ok(f.calls.includes("SET LOCAL statement_timeout = '50ms'"));
  assert.ok(f.calls.includes("SET LOCAL transaction_timeout = '500ms'"));
  assert.ok(
    f.calls
      .filter((sql) => sql.startsWith('SET '))
      .every(
        (sql) =>
          sql.startsWith('SET LOCAL ') || sql === 'SET TRANSACTION READ ONLY',
      ),
  );
});

test('counts above Number precision remain exact strings and returned facts are copied', async () => {
  const f = fake();
  const large = '9007199254740993';
  const groups = [{ code: 'XZZ', rowCount: large }];
  f.setTotals([{ rowCount: large, unresolvedCodeRowCount: '0' }]);
  f.setGroups(groups);
  const result = await inspectCurrencyAdoption(f.client, input);
  assert.equal(result.tables[1]!.rowCount, large);
  assert.equal(result.financialHistoryObserved, true);
  result.tables[0]!.codeGroups[0]!.code = 'BDT';
  assert.equal(groups[0]!.code, 'XZZ');
  const next = await inspectCurrencyAdoption(f.client, input);
  assert.equal(next.tables[0]!.codeGroups[0]!.code, 'XZZ');
});

test('malformed codes are unresolved counts, shape-valid unknown codes remain visible', async () => {
  const f = fake();
  f.setTotals([{ rowCount: '5', unresolvedCodeRowCount: '3' }]);
  f.setGroups([{ code: 'XZZ', rowCount: '2' }]);
  const result = await inspectCurrencyAdoption(f.client, input);
  assert.equal(result.tables[0]!.unresolvedCodeRowCount, '3');
  assert.equal(result.tables[0]!.legacyUnitAndPolicy, 'not_recorded_in_schema');
  assert.deepEqual(result.tables[0]!.codeGroups, [
    { code: 'XZZ', rowCount: '2' },
  ]);
});

test('32/33-group boundary exposes truncation and exact omitted rows without hiding history', async () => {
  for (const size of [32, 33]) {
    const f = fake();
    const groups = Array.from({ length: size }, (_, i) => ({
      code: `X${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
      rowCount: '1',
    }));
    const total = size === 33 ? '50' : '32';
    f.setGroups(groups);
    f.setTotals([{ rowCount: total, unresolvedCodeRowCount: '0' }]);
    const result = await inspectCurrencyAdoption(f.client, input);
    assert.equal(result.tables[0]!.codeGroups.length, 32);
    assert.equal(result.tables[0]!.codeGroupsTruncated, size === 33);
    assert.equal(
      result.tables[0]!.omittedCodeRowCount,
      size === 33 ? '18' : '0',
    );
    assert.equal(result.tables[0]!.rowCount, total);
    assert.equal(result.financialHistoryObserved, true);
  }
});

test('oversized rows reject before traversing members, no partial result', async () => {
  const f = fake();
  const groups = new Array(34);
  Object.defineProperty(groups, 0, {
    get() {
      throw new Error('Oversized member traversed');
    },
  });
  f.setGroups(groups);
  await assert.rejects(
    inspectCurrencyAdoption(f.client, input),
    rejectedObservation,
  );
  assert.equal(f.calls.filter((sql) => sql.includes('GROUP BY')).length, 1);
});

test('numeric/noncanonical/negative/oversized counts and corrupt group facts fail closed', async () => {
  for (const value of [
    0,
    -1,
    0n,
    '-1',
    '01',
    '1.0',
    '1e2',
    '1\n',
    '9'.repeat(20),
    '9223372036854775808',
    null,
  ]) {
    const f = fake();
    f.setTotals([{ rowCount: value, unresolvedCodeRowCount: '0' }]);
    await assert.rejects(
      inspectCurrencyAdoption(f.client, input),
      rejectedObservation,
    );
  }
  for (const groups of [
    [{ code: 'BDT', rowCount: '0' }],
    [{ code: 'bDt', rowCount: '1' }],
    [{ code: 'BDT\n', rowCount: '1' }],
    [
      { code: 'USD', rowCount: '1' },
      { code: 'BDT', rowCount: '1' },
    ],
    [
      { code: 'BDT', rowCount: '1' },
      { code: 'BDT', rowCount: '1' },
    ],
    [{ code: 'BDT', rowCount: '1', amount: '100' }],
  ]) {
    const f = fake();
    f.setTotals([{ rowCount: '2', unresolvedCodeRowCount: '0' }]);
    f.setGroups(groups);
    await assert.rejects(
      inspectCurrencyAdoption(f.client, input),
      rejectedObservation,
    );
  }
});

test('unverified transaction modes, budgets and dates deny observation', async () => {
  for (const replacement of [
    { isolation: 'read committed' },
    { readOnly: 'off' },
    { rowSecurity: 'on' },
    { lockTimeout: '0' },
    { statementTimeout: '3s' },
    { transactionTimeout: '0' },
    { observedAt: '2026-02-31T00:00:00.000Z' },
    { observedAt: 'not a date' },
  ]) {
    const f = fake();
    Object.assign(f.modes, replacement);
    await assert.rejects(
      inspectCurrencyAdoption(f.client, input),
      rejectedObservation,
    );
    assert.equal(f.calls.filter((sql) => sql.includes('GROUP BY')).length, 0);
  }
});

test('event counts are aggregate-only and reject inconsistent evidence', async () => {
  const f = fake();
  f.setEvents([
    {
      rowCount: '3',
      linkedRowCount: '1',
      unlinkedRowCount: '2',
      normalizedEvidenceRowCount: '2',
    },
  ]);
  assert.equal(
    (await inspectCurrencyAdoption(f.client, input)).gatewayEvidence.rowCount,
    '3',
  );
  for (const event of [
    {
      rowCount: '1',
      linkedRowCount: '1',
      unlinkedRowCount: '1',
      normalizedEvidenceRowCount: '0',
    },
    {
      rowCount: '0',
      linkedRowCount: '0',
      unlinkedRowCount: '0',
      normalizedEvidenceRowCount: '1',
    },
  ]) {
    f.setEvents([event]);
    await assert.rejects(
      inspectCurrencyAdoption(f.client, input),
      rejectedObservation,
    );
  }
});

test('SQL failures are redacted, not retried or swallowed into partial success', async () => {
  const f = fake();
  f.fail();
  await assert.rejects(
    inspectCurrencyAdoption(f.client, input),
    rejectedObservation,
  );
  assert.equal(f.options.length, 1);
  assert.equal(f.calls.filter((sql) => sql.includes('SELECT')).length, 1);
});

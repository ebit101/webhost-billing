import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  readCurrencyControl as read,
  stageCurrencyControl as stage,
  CurrencyControlError,
} from '../src/currency-control';
import type { CurrencyCoordinationClient } from '../src/currency-coordination';

const input = { schema: 'fictional_control', staffMutex: 'not_required' };
const row = () => ({
  id: 1,
  generation: 0n,
  selectedPolicyRevision: null,
  historyLatched: null,
  baseCode: null,
  baseMetadataVersion: null,
  baseMinorUnitExponent: null,
  createdAt: new Date('2026-10-08T00:00:00.000Z'),
});
function fake() {
  const calls: string[] = [];
  let rows: unknown[] = [];
  let rawRows: unknown[] | undefined;
  let lockSchema = input.schema;
  let oid = '789';
  let held = false;
  let staff = false;
  let failCommit = false;
  let failSql = false;
  let commitGate: Promise<void> | undefined;
  const limits = {
    lockTimeout: '500ms',
    statementTimeout: '2000ms',
    transactionTimeout: '10000ms',
  };
  const tx = {
    currencyControl: {
      findMany: async (arg: unknown) => {
        calls.push('model');
        assert.ok(arg);
        return rows;
      },
      createMany: async (arg: unknown) => {
        calls.push('insert');
        assert.deepEqual(arg, {
          data: [
            {
              id: 1,
              generation: 0n,
              selectedPolicyRevision: null,
              historyLatched: null,
              baseCode: null,
              baseMetadataVersion: null,
              baseMinorUnitExponent: null,
            },
          ],
          skipDuplicates: true,
        });
        const count = rows.length ? 0 : 1;
        if (count) rows = [row()];
        return { count };
      },
    },
    $executeRawUnsafe: async (sql: string) => {
      calls.push(sql);
      for (const [setting, key] of [
        ['lock_timeout', 'lockTimeout'],
        ['statement_timeout', 'statementTimeout'],
        ['transaction_timeout', 'transactionTimeout'],
      ] as const)
        if (sql.includes(`SET LOCAL ${setting}`))
          limits[key] = sql.split("'")[1]!;
      return 0;
    },
    $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
      calls.push(sql);
      if (failSql) throw new Error('Fictional sensitive SQL details');
      if (sql.includes('pg_advisory_xact_lock')) {
        if (sql.includes('920006')) staff = true;
        else held = true;
        return [{ value: 1 }];
      }
      if (sql.includes('current_setting'))
        return [
          {
            isolation: 'read committed',
            readOnly: 'off',
            searchPath: 'pg_catalog',
            rowSecurity: 'off',
            ...limits,
            actor: 'fictional',
            pid: '123',
            schemaOid: '456',
            currencyHeld: held,
            staffHeld: staff,
          },
        ];
      if (sql.includes("l.mode='AccessShareLock'"))
        return [{ oid: '789', schema: lockSchema }];
      if (sql.includes("c.relname='currency_controls'")) {
        assert.equal(values[0], input.schema);
        return oid ? [{ oid }] : [];
      }
      assert.ok(sql.includes(`FROM "${input.schema}"."currency_controls"`));
      return (
        rawRows ??
        rows.map((r) => ({
          ...(r as ReturnType<typeof row>),
          generation: String((r as ReturnType<typeof row>).generation),
        }))
      );
    },
  };
  const client = {
    $transaction: async (
      body: (t: typeof tx) => Promise<void>,
      options: unknown,
    ) => {
      held = false;
      staff = false;
      calls.push('transaction');
      assert.ok(options);
      await body(tx);
      if (commitGate) await commitGate;
      if (failCommit) throw new Error('Fictional sensitive commit details');
      calls.push('commit');
    },
  } as unknown as CurrencyCoordinationClient;
  return {
    client,
    calls,
    setRows: (r: unknown[]) => {
      rows = r;
    },
    setRaw: (r: unknown[]) => {
      rawRows = r;
    },
    wrongModel: () => {
      lockSchema = 'decoy';
    },
    missing: () => {
      oid = '';
    },
    failSql: () => {
      failSql = true;
    },
    failCommit: () => {
      failCommit = true;
    },
    commitGate: (p: Promise<void>) => {
      commitGate = p;
    },
  };
}
function unavailable(e: unknown) {
  assert.ok(e instanceof CurrencyControlError);
  assert.equal(e.code, 'CONTROL_UNAVAILABLE');
  assert.equal(e.cause, undefined);
  assert.doesNotMatch(String(e), /sensitive|credential|SQL/);
  return true;
}

test('separate unused entry exposes no runtime discovery, root consumer or history assessment', () => {
  const source = readFileSync('src/currency-control.ts', 'utf8');
  assert.doesNotMatch(
    source,
    /process\.|createPrismaClient|fetch\(|node:|\.\/client['"]|currency-adoption-preflight|currency-policies|SELECT.*(orders|invoices|settings)/,
  );
  assert.doesNotMatch(readFileSync('src/index.ts', 'utf8'), /currency-control/);
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(
    manifest.exports['./currency-control'].default,
    './dist/currency-control.js',
  );
});
test('strict schema/composition/budgets and supplied authority reject before database work', async () => {
  for (const bad of [
    null,
    [],
    {},
    { schema: 'fictional' },
    { ...input, schema: 'pg_temp' },
    { ...input, schema: 'x\n' },
    { ...input, schema: 'X' },
    { ...input, schema: 'a'.repeat(64) },
    { ...input, schema: 'information_schema' },
    { ...input, staffMutex: false },
    { ...input, [Symbol('authority')]: true },
    { ...input, limits: { extra: 1 } },
    ...[
      'history',
      'policy',
      'generation',
      'anchor',
      'eligible',
      'approval',
      'client',
      'transaction',
      'bypass',
    ].map((k) => ({ ...input, [k]: false })),
    ...[0, -1, 0.5, Infinity, 10001, '50', null, undefined].map((n) => ({
      ...input,
      limits: { transactionMs: n },
    })),
  ]) {
    const f = fake();
    await assert.rejects(
      stage(f.client, bad),
      (e) => e instanceof CurrencyControlError && e.code === 'INVALID_INPUT',
    );
    assert.deepEqual(f.calls, []);
  }
});
test('bounded read acquires coordination before model facts and never inserts an absent row', async () => {
  const f = fake();
  assert.deepEqual(await read(f.client, input), { state: 'absent' });
  assert.ok(
    f.calls.findIndex((s) => s.includes('pg_advisory_xact_lock')) <
      f.calls.indexOf('model'),
  );
  assert.ok(!f.calls.includes('insert'));
  assert.equal(f.calls.at(-1), 'commit');
});
test('explicit constant staging and replays return copied unknown facts with stable original time', async () => {
  const f = fake();
  const first = await stage(f.client, input);
  // New transaction stub reset, retaining only the stored constant row.
  const replay = fake();
  replay.setRows([row()]);
  assert.deepEqual(await stage(replay.client, input), first);
  assert.equal(first.state, 'unassessed');
  if (first.state === 'unassessed') {
    assert.equal(first.generation, '0');
    assert.equal(first.historyLatched, null);
    first.createdAt = 'changed';
  }
  assert.notDeepEqual(await read(replay.client, input), first);
});
test('unknown is not false, selected, anchored or an eligibility verdict; corrupt rows fail closed', async () => {
  for (const bad of [
    [],
    [row(), row()],
    [null],
    ...[false, true].map((v) => [{ ...row(), historyLatched: v }]),
    ...[
      'selectedPolicyRevision',
      'baseCode',
      'baseMetadataVersion',
      'baseMinorUnitExponent',
    ].map((k) => [{ ...row(), [k]: 'claimed' }]),
    [{ ...row(), generation: 1n }],
    [{ ...row(), id: 2 }],
    [{ ...row(), createdAt: new Date(NaN) }],
    [{ ...row(), eligible: true }],
  ]) {
    const f = fake();
    f.setRows(bad);
    if (bad.length === 0) {
      f.setRaw([row()]);
    }
    await assert.rejects(read(f.client, input), unavailable);
  }
});
test('actual model relation identity and raw facts reject mismatches even when both schemas are empty', async () => {
  const f = fake();
  f.wrongModel();
  await assert.rejects(read(f.client, input), unavailable);
  const missing = fake();
  missing.missing();
  await assert.rejects(read(missing.client, input), unavailable);
  const corrupt = fake();
  corrupt.setRows([row()]);
  corrupt.setRaw([{ ...row(), generation: '1' }]);
  await assert.rejects(read(corrupt.client, input), unavailable);
});
test('shorter explicit staff-first budgets survive composition without caller-owned handles', async () => {
  const f = fake();
  await read(f.client, {
    ...input,
    staffMutex: 'required',
    limits: { lockMs: 50, statementMs: 100, transactionMs: 500 },
  });
  assert.ok(f.calls.some((s) => s.includes('920006')));
  assert.ok(f.calls.some((s) => s.includes("lock_timeout = '50ms'")));
});
test('SQL/commit failure is redacted, not retried, and no captured partial result escapes', async () => {
  for (const fail of ['failSql', 'failCommit'] as const) {
    const f = fake();
    f[fail]();
    await assert.rejects(stage(f.client, input), unavailable);
    assert.equal(f.calls.filter((s) => s === 'transaction').length, 1);
  }
});
test('result waits for successful commit and contains no transaction, release or approval token', async () => {
  const f = fake();
  let release!: () => void;
  f.commitGate(
    new Promise<void>((r) => {
      release = r;
    }),
  );
  let resolved = false;
  const pending = read(f.client, input).then((r) => {
    resolved = true;
    return r;
  });
  await new Promise<void>((r) => setImmediate(r));
  assert.equal(resolved, false);
  release();
  assert.deepEqual(await pending, { state: 'absent' });
});

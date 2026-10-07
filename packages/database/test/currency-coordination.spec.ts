import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  withCurrencyCoordination,
  CurrencyCoordinationError,
  type CurrencyCoordinationClient,
  type CurrencyCoordinationBody,
} from '../src/currency-coordination';

const input = { schema: 'fictional_schema', staffMutex: 'not_required' };
function fake() {
  const calls: { sql: string; values: unknown[] }[] = [];
  const options: unknown[] = [];
  const state = {
    isolation: 'read committed',
    readOnly: 'off',
    searchPath: 'pg_catalog',
    rowSecurity: 'off',
    lockTimeout: '500ms',
    statementTimeout: '2s',
    transactionTimeout: '10s',
    actor: 'fictional_actor',
    pid: '123',
    schemaOid: '456',
    currencyHeld: false,
    staffHeld: false,
  };
  let onState: (() => void) | undefined;
  let failCommit = false;
  let commitWait: Promise<void> | undefined;
  const tx = {
    $executeRawUnsafe: async (sql: string) => {
      calls.push({ sql, values: [] });
      return 0;
    },
    $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes('pg_advisory_xact_lock')) {
        if (sql.includes('920006')) state.staffHeld = true;
        else state.currencyHeld = true;
        return [{ '?column?': 1 }];
      }
      onState?.();
      return [{ ...state }];
    },
  };
  const client = {
    $transaction: async (
      body: (transaction: typeof tx) => Promise<void>,
      opts: unknown,
    ) => {
      options.push(opts);
      await body(tx);
      if (commitWait) await commitWait;
      if (failCommit) throw new Error('Fictional sensitive commit detail');
    },
  } as unknown as CurrencyCoordinationClient;
  return {
    client,
    calls,
    options,
    state,
    onState: (body: () => void) => {
      onState = body;
    },
    failCommit: () => {
      failCommit = true;
    },
    waitCommit: (wait: Promise<void>) => {
      commitWait = wait;
    },
  };
}
function denied(error: unknown): boolean {
  assert.ok(error instanceof CurrencyCoordinationError);
  assert.equal(error.code, 'COORDINATION_FAILED');
  assert.equal(error.cause, undefined);
  assert.doesNotMatch(String(error), /sensitive|SQL|credential/i);
  return true;
}

test('separate unused entry has no root/application/runtime connection or external I/O', () => {
  const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  assert.equal(
    manifest.exports['./currency-coordination'].default,
    './dist/currency-coordination.js',
  );
  assert.doesNotMatch(
    readFileSync(resolve('src/index.ts'), 'utf8'),
    /currency-coordination/,
  );
  const source = readFileSync(resolve('src/currency-coordination.ts'), 'utf8');
  assert.doesNotMatch(
    source,
    /process\.env|createPrismaClient|fetch\(|node:|\.\/client['"]/,
  );
  assert.doesNotMatch(
    source,
    /pg_advisory_lock\(|pg_advisory_unlock|INSERT INTO|UPDATE |DELETE FROM|CREATE TABLE|ALTER TABLE/,
  );
});

test('explicit strict schema, composition and budgets reject before transaction/body', async () => {
  for (const value of [
    null,
    [],
    {},
    { schema: 'public' },
    { ...input, schema: '' },
    { ...input, schema: 'public\n' },
    { ...input, schema: 'pg_temp' },
    { ...input, schema: 'information_schema' },
    { ...input, schema: 'a'.repeat(64) },
    { ...input, schema: 'a";drop' },
    { ...input, schema: 'Foo' },
    { ...input, schema: 'a.b' },
    { ...input, staffMutex: true },
    { ...input, staffMutex: undefined },
    { ...input, staffMutex: 'auto' },
    { ...input, key: 1 },
    { ...input, history: false },
    { ...input, isolation: 'ReadCommitted' },
    { ...input, [Symbol('authority')]: true },
    { ...input, limits: null },
    ...['acquisitionMs', 'lockMs', 'statementMs', 'transactionMs'].flatMap(
      (key) =>
        [0, -1, 0.5, Infinity, undefined, null, '30', 100_000].map((value) => ({
          ...input,
          limits: { [key]: value },
        })),
    ),
    { ...input, limits: { extra: 1 } },
  ]) {
    const f = fake();
    let entered = false;
    await assert.rejects(
      withCurrencyCoordination(f.client, value, async () => {
        entered = true;
      }),
      (error: unknown) =>
        error instanceof CurrencyCoordinationError &&
        error.code === 'INVALID_INPUT',
    );
    assert.equal(f.options.length, 0);
    assert.equal(entered, false);
  }
  const f = fake();
  await assert.rejects(
    withCurrencyCoordination(
      f.client,
      input,
      null as unknown as CurrencyCoordinationBody,
    ),
    (error: unknown) =>
      error instanceof CurrencyCoordinationError &&
      error.code === 'INVALID_INPUT',
  );
  assert.equal(f.options.length, 0);
});

test('owned explicit transaction, frozen two-int SQL key and fresh body follow lock acquisition', async () => {
  const f = fake();
  const result = await withCurrencyCoordination(f.client, input, async () => {
    assert.equal(f.state.currencyHeld, true);
    assert.equal(
      f.calls.filter(({ sql }) => sql.includes('transaction_isolation')).length,
      2,
    );
    assert.equal(f.state.staffHeld, false);
  });
  assert.equal(result, undefined);
  assert.deepEqual(f.options, [
    { isolationLevel: 'ReadCommitted', maxWait: 2_000, timeout: 10_000 },
  ]);
  assert.equal(f.calls[0]!.sql, 'SET TRANSACTION READ WRITE');
  assert.equal(
    f.calls.filter(({ sql }) => sql.includes('transaction_isolation')).length,
    3,
  );
  const locks = f.calls.filter(({ sql }) =>
    sql.includes('pg_advisory_xact_lock'),
  );
  assert.equal(locks.length, 1);
  assert.match(
    locks[0]!.sql,
    /pg_catalog\.hashtext\('webhost-billing\.currency-coordination\.v1:' \|\| pg_catalog\.current_database\(\)\), pg_catalog\.hashtext\(\$1::text\)/,
  );
  assert.deepEqual(locks[0]!.values, ['fictional_schema']);
  assert.ok(
    f.calls.every(
      ({ sql }) => sql.startsWith('SET ') || sql.startsWith('SELECT'),
    ),
  );
});

test('explicit trusted staff composition takes existing mutex before currency, never auth facts', async () => {
  const f = fake();
  await withCurrencyCoordination(
    f.client,
    { ...input, staffMutex: 'required' },
    async () => {
      assert.ok(f.state.staffHeld && f.state.currencyHeld);
    },
  );
  const locks = f.calls.filter(({ sql }) =>
    sql.includes('pg_advisory_xact_lock'),
  );
  assert.equal(locks.length, 2);
  assert.match(locks[0]!.sql, /920006::bigint/);
  assert.match(locks[1]!.sql, /currency-coordination/);
  assert.doesNotMatch(
    f.calls.map((c) => c.sql).join('\n'),
    /FROM .*users|sessions|mfa|policy_revisions|invoices/,
  );
});

test('shorter budgets are verified and all settings remain transaction-local', async () => {
  const f = fake();
  Object.assign(f.state, {
    lockTimeout: '1ms',
    statementTimeout: '30ms',
    transactionTimeout: '100ms',
  });
  await withCurrencyCoordination(
    f.client,
    {
      ...input,
      limits: {
        acquisitionMs: 10,
        lockMs: 1,
        statementMs: 30,
        transactionMs: 100,
      },
    },
    async () => {},
  );
  assert.deepEqual(f.options, [
    { isolationLevel: 'ReadCommitted', maxWait: 10, timeout: 100 },
  ]);
  assert.ok(
    f.calls
      .filter(({ sql }) => sql.startsWith('SET '))
      .every(
        ({ sql }) =>
          sql.startsWith('SET LOCAL ') || sql === 'SET TRANSACTION READ WRITE',
      ),
  );
});

test('unverified modes, schema/lock permission context and deadlines deny before body', async () => {
  for (const replacement of [
    { isolation: 'repeatable read' },
    { isolation: 'serializable' },
    { readOnly: 'on' },
    { searchPath: 'public' },
    { rowSecurity: 'on' },
    { schemaOid: null },
    { pid: '1\n' },
    { lockTimeout: '0' },
    { statementTimeout: '3s' },
    { transactionTimeout: '0' },
    { actor: '' },
    { currencyHeld: true },
  ]) {
    const f = fake();
    Object.assign(f.state, replacement);
    let entered = false;
    await assert.rejects(
      withCurrencyCoordination(f.client, input, async () => {
        entered = true;
      }),
      denied,
    );
    assert.equal(entered, false);
    assert.equal(
      f.calls.filter(({ sql }) => sql.includes('pg_advisory_xact_lock')).length,
      0,
    );
  }
  const f = fake();
  let states = 0;
  f.onState(() => {
    if (++states === 2) f.state.currencyHeld = false;
  });
  await assert.rejects(
    withCurrencyCoordination(f.client, input, async () => {
      assert.fail('No lock');
    }),
    denied,
  );
});

test('body mode/identity/lock tampering and returned handles deny rather than escape', async () => {
  for (const replacement of [
    { readOnly: 'on' },
    { actor: 'other' },
    { schemaOid: '789' },
    { currencyHeld: false },
    { searchPath: 'public' },
    { statementTimeout: '0' },
    { staffHeld: true },
  ]) {
    const f = fake();
    await assert.rejects(
      withCurrencyCoordination(f.client, input, async () => {
        Object.assign(f.state, replacement);
      }),
      denied,
    );
    assert.equal(f.options.length, 1);
  }
  const f = fake();
  await assert.rejects(
    withCurrencyCoordination(f.client, input, (async () => ({
      authority: true,
    })) as unknown as CurrencyCoordinationBody),
    denied,
  );
});

test('body and commit failures are redacted without partial return or retry', async () => {
  const f = fake();
  let entered = 0;
  await assert.rejects(
    withCurrencyCoordination(f.client, input, async () => {
      entered++;
      throw new Error('Fictional sensitive credential detail');
    }),
    denied,
  );
  assert.equal(entered, 1);
  assert.equal(f.options.length, 1);
  const g = fake();
  g.failCommit();
  await assert.rejects(
    withCurrencyCoordination(g.client, input, async () => {}),
    denied,
  );
  assert.equal(g.options.length, 1);
});

test('success resolves only after transaction commit, with no handle or authority result', async () => {
  const f = fake();
  let commit!: () => void;
  let entered!: () => void;
  let completed = false;
  f.waitCommit(
    new Promise<void>((resolve) => {
      commit = resolve;
    }),
  );
  const bodyDone = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = withCurrencyCoordination(f.client, input, async () => {
    entered();
  }).then((result) => {
    assert.equal(result, undefined);
    completed = true;
  });
  await bodyDone;
  assert.equal(completed, false);
  commit();
  await pending;
  assert.equal(completed, true);
});

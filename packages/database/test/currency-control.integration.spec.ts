import assert from 'node:assert/strict';
import { before, after, afterEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, Pool, Query } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client';
import { createPrismaClient } from '../src/client';
import {
  withCurrencyCoordination,
  type CurrencyCoordinationClient,
} from '../src/currency-coordination';
import {
  readCurrencyControl as read,
  stageCurrencyControl as stage,
  CurrencyControlError,
} from '../src/currency-control';
import { appendCurrencyUnit } from '../src/currency-units';
import { appendCurrencyPolicyRevision } from '../src/currency-policies';
import {
  assertBrowserDatabaseScope,
  browserDatabaseUrl,
  validateBrowserDatabaseUrl,
} from '../../../apps/web/e2e/database-scope';

const parentSchema = process.env.WEBHOST_BROWSER_E2E_SCHEMA ?? '';
const parentUrl = process.env.DATABASE_URL ?? '';
const schema = `command26_e2e_${randomUUID().replaceAll('-', '')}`;
const url = browserDatabaseUrl(parentUrl, schema);
const table = `"${schema}"."currency_controls"`;
const input = { schema, staffMutex: 'not_required' };
const dir = resolve('prisma/migrations');
const migrations = readdirSync(dir)
  .filter((n) => /^\d{14}_/.test(n))
  .sort();
let parent: PrismaClient;
let prisma: PrismaClient;
let raw: Client;
let observer: Client;
let poolA: Pool;
let poolB: Pool;
let a: PrismaClient;
let b: PrismaClient;
let parentBaseline: Record<string, string[]>;
let baseline: Record<string, string[]>;
let owned: Awaited<ReturnType<typeof bootstrap>>;

async function snapshot(
  client: PrismaClient,
  targetUrl: string,
  target: string,
  excludeControl = false,
) {
  await assertBrowserDatabaseScope(client, targetUrl, target);
  const names = await client.$queryRawUnsafe<{ name: string }[]>(
    `SELECT c.relname::text AS name FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r' ORDER BY c.relname`,
    target,
  );
  const rows: Record<string, string[]> = {};
  for (const { name } of names) {
    if (excludeControl && name === 'currency_controls') continue;
    assert.match(name, /^[a-z_][a-z0-9_]*$/);
    rows[name] = (
      await client.$queryRawUnsafe<{ row: string }[]>(
        `SELECT pg_catalog.to_jsonb(t)::text AS row FROM "${target}"."${name}" t ORDER BY pg_catalog.to_jsonb(t)::text`,
      )
    ).map((r) => r.row);
  }
  return rows;
}
async function bootstrap(target: string, count = 26) {
  await assertBrowserDatabaseScope(parent, parentUrl, parentSchema);
  const targetUrl = browserDatabaseUrl(parentUrl, target);
  await parent.$executeRawUnsafe(`CREATE SCHEMA "${target}"`);
  const pg = new Client({ connectionString: targetUrl });
  const models = createPrismaClient(targetUrl);
  // A failure before marking is deliberately preserved, not guessed cleanup ownership.
  await pg.connect();
  assert.equal(migrations.length, 26);
  for (const name of migrations.slice(0, count))
    await pg.query(readFileSync(resolve(dir, name, 'migration.sql'), 'utf8'));
  await assertBrowserDatabaseScope(models, targetUrl, target, false);
  await pg.query(
    `CREATE TABLE "${target}".__browser_e2e_scope(owner text NOT NULL)`,
  );
  await pg.query(
    `INSERT INTO "${target}".__browser_e2e_scope(owner) VALUES($1)`,
    [target],
  );
  await assertBrowserDatabaseScope(models, targetUrl, target);
  return { pg, models, targetUrl, target };
}
async function cleanup(scope: Awaited<ReturnType<typeof bootstrap>>) {
  await scope.pg.query('ROLLBACK');
  await assertBrowserDatabaseScope(scope.models, scope.targetUrl, scope.target);
  await scope.models.$executeRawUnsafe(`DROP SCHEMA "${scope.target}" CASCADE`);
  await scope.pg.end();
  await scope.models.$disconnect();
}
function unavailable(e: unknown) {
  assert.ok(e instanceof CurrencyControlError);
  assert.equal(e.code, 'CONTROL_UNAVAILABLE');
  assert.equal(e.cause, undefined);
  return true;
}
async function setup(pg: Client, role?: string) {
  await pg.query('BEGIN');
  if (role) await pg.query(`SET LOCAL ROLE ${role}`);
}
function deferred() {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((r) => {
      resolve = r;
    }),
    resolve: () => resolve(),
  };
}
async function waiting(pid: number, target = schema) {
  const end = Date.now() + 420;
  do {
    const result = await observer.query<{ waiting: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE pid=$1 AND NOT granted AND locktype='advisory'
    AND classid=pg_catalog.hashtext('webhost-billing.currency-coordination.v1:'||pg_catalog.current_database())::oid
    AND objid=pg_catalog.hashtext($2::text)::oid AND objsubid=2) AS waiting`,
      [pid, target],
    );
    if (result.rows[0]?.waiting) return;
    await new Promise<void>((r) => setTimeout(r, 3));
  } while (Date.now() < end);
  assert.fail('Expected real coordination wait was not observed');
}
function wrapped(
  base: PrismaClient,
  role?: string,
  failCommit = false,
): CurrencyCoordinationClient {
  return {
    $transaction: async (
      body: (tx: Prisma.TransactionClient) => Promise<void>,
      options: unknown,
    ) =>
      base.$transaction(
        async (tx) => {
          if (role) await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await body(tx);
          if (failCommit)
            throw new Error('Fictional rollback after captured facts.');
        },
        options as {
          isolationLevel: 'ReadCommitted';
          maxWait: number;
          timeout: number;
        },
      ),
  } as unknown as CurrencyCoordinationClient;
}
before(async () => {
  validateBrowserDatabaseUrl(parentUrl, parentSchema);
  parent = createPrismaClient(parentUrl);
  await assertBrowserDatabaseScope(parent, parentUrl, parentSchema);
  parentBaseline = await snapshot(parent, parentUrl, parentSchema);
  owned = await bootstrap(schema);
  prisma = owned.models;
  raw = owned.pg;
  baseline = await snapshot(prisma, url, schema, true);
  observer = new Client({ connectionString: url });
  await observer.connect();
  poolA = new Pool({ connectionString: url, max: 1 });
  poolB = new Pool({ connectionString: url, max: 1 });
  a = new PrismaClient({ adapter: new PrismaPg(poolA, { schema }) });
  b = new PrismaClient({ adapter: new PrismaPg(poolB, { schema }) });
  await assertBrowserDatabaseScope(a, url, schema);
  await assertBrowserDatabaseScope(b, url, schema);
});
afterEach(async () => {
  if (raw) await raw.query('ROLLBACK');
});
after(async () => {
  try {
    if (raw) await raw.query('ROLLBACK');
    if (baseline)
      assert.deepEqual(await snapshot(prisma, url, schema, true), baseline);
    if (parentBaseline)
      assert.deepEqual(
        await snapshot(parent, parentUrl, parentSchema),
        parentBaseline,
      );
  } finally {
    if (a) await a.$disconnect();
    if (b) await b.$disconnect();
    if (poolA) await poolA.end();
    if (poolB) await poolB.end();
    if (observer) await observer.end();
    if (owned) await cleanup(owned);
    if (parent) await parent.$disconnect();
  }
});

test('empty additive migration and read never stage, assess or choose a policy', async () => {
  assert.equal(await prisma.currencyControl.count(), 0);
  assert.deepEqual(await read(a, input), { state: 'absent' });
  assert.equal(await prisma.currencyControl.count(), 0);
  const constraints = await raw.query<{
    name: string;
    type: string;
    delete: string;
    update: string;
  }>(
    `SELECT conname AS name,contype AS type,confdeltype AS delete,confupdtype AS update FROM pg_catalog.pg_constraint WHERE conrelid=$1::regclass`,
    [table],
  );
  assert.equal(constraints.rows.filter((r) => r.type === 'f').length, 2);
  assert.ok(
    constraints.rows
      .filter((r) => r.type === 'f')
      .every((r) => r.delete === 'r' && r.update === 'r'),
  );
  const triggers = await raw.query<{
    name: string;
    type: number;
    definer: boolean;
    config: string[];
  }>(
    `SELECT t.tgname AS name,t.tgtype::int AS type,p.prosecdef AS definer,p.proconfig AS config FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=$1::regclass AND NOT t.tgisinternal ORDER BY t.tgname`,
    [table],
  );
  assert.deepEqual(
    triggers.rows.map((r) => r.type).sort((x, y) => x - y),
    [10, 18, 34],
  );
  assert.ok(
    triggers.rows.every(
      (r) =>
        !r.definer &&
        JSON.stringify(r.config) === JSON.stringify(['search_path=pg_catalog']),
    ),
  );
});
test('real empty model/raw schema mismatch denies before any control insertion', async () => {
  const other = await bootstrap(
    `command26_e2e_${randomUUID().replaceAll('-', '')}`,
  );
  const pool = new Pool({ connectionString: url, max: 1 });
  const wrong = new PrismaClient({
    adapter: new PrismaPg(pool, { schema: other.target }),
  });
  try {
    assert.equal(await other.models.currencyControl.count(), 0);
    assert.equal(await prisma.currencyControl.count(), 0);
    await assert.rejects(stage(wrong, input), unavailable);
    assert.equal(await other.models.currencyControl.count(), 0);
    assert.equal(await prisma.currencyControl.count(), 0);
  } finally {
    await wrong.$disconnect();
    await pool.end();
    await cleanup(other);
  }
});
test('captured stage facts do not escape a later rollback or commit failure', async () => {
  await assert.rejects(stage(wrapped(a, undefined, true), input), unavailable);
  assert.equal(await prisma.currencyControl.count(), 0);
  // Test-only deferred FK fails at PostgreSQL COMMIT, after the entry captured facts.
  await assertBrowserDatabaseScope(prisma, url, schema);
  await raw.query(
    `CREATE TABLE "${schema}".__control_commit_parent(id integer PRIMARY KEY)`,
  );
  try {
    await raw.query(
      `CREATE TABLE "${schema}".__control_commit_child(id integer REFERENCES "${schema}".__control_commit_parent(id) DEFERRABLE INITIALLY DEFERRED)`,
    );
    try {
      let deferredViolationReached = false;
      const commitFailure = {
        $transaction: (
          body: (tx: Prisma.TransactionClient) => Promise<void>,
          options: unknown,
        ) =>
          a.$transaction(
            async (tx) => {
              await body(tx);
              await tx.$executeRawUnsafe(
                `INSERT INTO "${schema}".__control_commit_child(id) VALUES(1)`,
              );
              deferredViolationReached = true;
            },
            options as {
              isolationLevel: 'ReadCommitted';
              maxWait: number;
              timeout: number;
            },
          ),
      } as unknown as CurrencyCoordinationClient;
      await assert.rejects(stage(commitFailure, input), unavailable);
      assert.equal(deferredViolationReached, true);
      assert.equal(await prisma.currencyControl.count(), 0);
      assert.equal(
        (
          await raw.query(
            `SELECT count(*)::text AS count FROM "${schema}".__control_commit_child`,
          )
        ).rows[0]?.count,
        '0',
      );
    } finally {
      await assertBrowserDatabaseScope(prisma, url, schema);
      await raw.query(`DROP TABLE "${schema}".__control_commit_child`);
    }
  } finally {
    await assertBrowserDatabaseScope(prisma, url, schema);
    await raw.query(`DROP TABLE "${schema}".__control_commit_parent`);
  }
  assert.deepEqual(await read(a, input), { state: 'absent' });
});
test('SQL null/shape/key constraints reject claimed history, anchors, generation and selected policy', async () => {
  for (const sql of [
    `INSERT INTO ${table}(id) VALUES(0)`,
    `INSERT INTO ${table}(id) VALUES(2)`,
    `INSERT INTO ${table}(id) VALUES(NULL)`,
    ...['NULL', '-1', '1', '9223372036854775807'].map(
      (v) => `INSERT INTO ${table}(id,generation) VALUES(1,${v})`,
    ),
    ...['true', 'false'].map(
      (v) => `INSERT INTO ${table}(id,history_latched) VALUES(1,${v})`,
    ),
    ...[
      ['selected_policy_revision', "'claimed'"],
      ['base_code', "'XAA'"],
      ['base_metadata_version', "'claimed'"],
      ['base_minor_unit_exponent', '2'],
    ].map(([c, v]) => `INSERT INTO ${table}(id,${c}) VALUES(1,${v})`),
  ])
    await assert.rejects(raw.query(sql));
  assert.equal(await prisma.currencyControl.count(), 0);
});
test('actual non-owner may stage uncertainty, while read-only role cannot insert and RLS/missing privileges deny', async () => {
  assert.deepEqual(await read(wrapped(a, 'pg_read_all_data'), input), {
    state: 'absent',
  });
  await assert.rejects(
    stage(wrapped(a, 'pg_read_all_data'), input),
    unavailable,
  );
  await setup(raw, 'pg_write_all_data');
  await raw.query(`INSERT INTO ${table}(id) VALUES(1)`);
  assert.equal(
    (await raw.query('SELECT current_user AS actor')).rows[0]?.actor,
    'pg_write_all_data',
  );
  await raw.query('ROLLBACK');
  await setup(raw, 'pg_write_all_data');
  await copy(raw);
  // COPY can stage only the same uncertainty; it cannot grant history authority.
  await raw.query('ROLLBACK');
  assert.equal(await prisma.currencyControl.count(), 0);
  for (const sql of [
    `UPDATE ${table} SET id=id WHERE false`,
    `DELETE FROM ${table} WHERE false`,
    `TRUNCATE ${table}`,
  ])
    await assert.rejects(raw.query(sql));
  await raw.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  try {
    await setup(raw, 'pg_read_all_data');
    await raw.query('SET LOCAL row_security=off');
    await assert.rejects(raw.query(`SELECT id FROM ${table}`), (e: unknown) => {
      assert.ok(e instanceof Error);
      assert.equal(Reflect.get(e, 'code'), '42501');
      return true;
    });
    await raw.query('ROLLBACK');
    await assert.rejects(
      read(wrapped(a, 'pg_read_all_data'), {
        ...input,
        limits: { lockMs: 40 },
      }),
      unavailable,
    );
  } finally {
    await raw.query('ROLLBACK');
    await assertBrowserDatabaseScope(prisma, url, schema);
    await raw.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
  }
  await assert.rejects(
    read(wrapped(a, 'pg_signal_backend'), input),
    unavailable,
  );
});
test('concurrent staging and explicit replays retain one original unknown row without selecting a policy', async () => {
  const [first, second] = await Promise.all([stage(a, input), stage(b, input)]);
  assert.deepEqual(first, second);
  assert.equal(first.state, 'unassessed');
  if (first.state === 'unassessed') {
    assert.equal(first.generation, '0');
    assert.equal(first.historyLatched, null);
    assert.equal(first.selectedPolicyRevision, null);
    assert.equal(first.baseCode, null);
  }
  assert.equal(await prisma.currencyControl.count(), 1);
  assert.deepEqual(await stage(a, input), first);
  assert.deepEqual(await read(b, input), first);
});
test('both stage and read wait on the actual key and load fresh facts only after release', async () => {
  const pid = (
    await b.$queryRawUnsafe<{ pid: number }[]>('SELECT pg_backend_pid() AS pid')
  )[0]!.pid;
  for (const operation of [read, stage]) {
    const ready = deferred(),
      release = deferred();
    const holder = withCurrencyCoordination(a, input, async () => {
      ready.resolve();
      await release.promise;
    });
    await ready.promise;
    const pending = operation(b, input);
    void pending.catch(() => {});
    try {
      await waiting(pid);
    } finally {
      release.resolve();
      await holder;
    }
    assert.deepEqual(await pending, await read(a, input));
  }
  // A later staged read sees a committed constant row; pre-wait model reads are forbidden.
});
test('timeouts and shorter budgets release pooled state/key and deny without a partial result or retry', async () => {
  const ready = deferred(),
    release = deferred();
  const holder = withCurrencyCoordination(a, input, async () => {
    ready.resolve();
    await release.promise;
  });
  await ready.promise;
  try {
    await assert.rejects(
      stage(b, { ...input, limits: { lockMs: 40 } }),
      unavailable,
    );
  } finally {
    release.resolve();
    await holder;
  }
  const result = await read(b, {
    ...input,
    limits: { lockMs: 80, statementMs: 600, transactionMs: 3000 },
  });
  assert.equal(result.state, 'unassessed');
  const state = await b.$queryRawUnsafe<
    { locked: boolean; role: string; lock: string }[]
  >(
    `SELECT current_user AS role,current_setting('lock_timeout') AS lock,EXISTS(SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory') AS locked`,
  );
  assert.equal(state[0]?.locked, false);
  assert.equal(state[0]?.lock, '0');
  assert.notEqual(state[0]?.role, 'pg_read_all_data');
});
test('a blocked reader sees the newly committed constant row in a subsequent snapshot', async () => {
  const fresh = await bootstrap(
    `command26_e2e_${randomUUID().replaceAll('-', '')}`,
  );
  const pool = new Pool({ connectionString: fresh.targetUrl, max: 1 });
  const reader = new PrismaClient({
    adapter: new PrismaPg(pool, { schema: fresh.target }),
  });
  const ready = deferred(),
    release = deferred();
  const chosen = { schema: fresh.target, staffMutex: 'not_required' };
  try {
    assert.deepEqual(await read(reader, chosen), { state: 'absent' });
    const pid = (
      await reader.$queryRawUnsafe<{ pid: number }[]>(
        'SELECT pg_backend_pid() AS pid',
      )
    )[0]!.pid;
    const holder = withCurrencyCoordination(
      fresh.models,
      chosen,
      async (tx) => {
        await tx.currencyControl.createMany({
          data: [{ id: 1, generation: 0n }],
        });
        ready.resolve();
        await release.promise;
      },
    );
    await ready.promise;
    const pending = read(reader, chosen);
    void pending.catch(() => {});
    try {
      await waiting(pid, fresh.target);
    } finally {
      release.resolve();
      await holder;
    }
    assert.equal((await pending).state, 'unassessed');
  } finally {
    release.resolve();
    await reader.$disconnect();
    await pool.end();
    await cleanup(fresh);
  }
});
test('control entry honors real acquisition, statement and transaction deadlines without leaking its pool or facts', async () => {
  const ready = deferred(),
    release = deferred();
  const occupied = b.$transaction(async () => {
    ready.resolve();
    await release.promise;
  });
  await ready.promise;
  try {
    await assert.rejects(
      read(b, { ...input, limits: { acquisitionMs: 30 } }),
      unavailable,
    );
  } finally {
    release.resolve();
    await occupied;
  }
  for (const limits of [
    { statementMs: 40, transactionMs: 3000 },
    { statementMs: 1000, transactionMs: 100 },
  ]) {
    let modelEntered = false;
    const slow = {
      $transaction: (
        body: (tx: Prisma.TransactionClient) => Promise<void>,
        options: unknown,
      ) =>
        b.$transaction(
          async (tx) => {
            const instrumented = new Proxy(tx, {
              get(target, property) {
                if (property !== 'currencyControl')
                  return Reflect.get(target, property);
                return new Proxy(target.currencyControl, {
                  get(model, key) {
                    if (key !== 'findMany') return Reflect.get(model, key);
                    return async (
                      ...args: Parameters<typeof model.findMany>
                    ) => {
                      modelEntered = true;
                      await tx.$queryRawUnsafe(
                        'SELECT pg_catalog.pg_sleep(0.2)',
                      );
                      return model.findMany(...args);
                    };
                  },
                });
              },
            });
            await body(instrumented);
          },
          options as {
            isolationLevel: 'ReadCommitted';
            maxWait: number;
            timeout: number;
          },
        ),
    } as unknown as CurrencyCoordinationClient;
    await assert.rejects(read(slow, { ...input, limits }), unavailable);
    assert.equal(modelEntered, true);
    assert.equal((await read(b, input)).state, 'unassessed');
  }
});
class CopyControl extends Query<Record<string, unknown>, []> {
  handleCopyInResponse(c: {
    sendCopyFromChunk(b: Buffer): void;
    endCopyFrom(): void;
  }) {
    c.sendCopyFromChunk(Buffer.from('1\n'));
    c.endCopyFrom();
  }
}
async function copy(pg: Client) {
  await new Promise<void>((done, reject) => {
    const q = new CopyControl(`COPY ${table}(id) FROM STDIN`);
    q.once('error', reject);
    q.once('end', () => done());
    pg.query(q);
  });
}
test('ordinary mutation guards cover conflict/merge/nested/no-op/truncate and non-owner cannot disable or replace them', async () => {
  const before = await prisma.currencyControl.findMany();
  for (const sql of [
    `UPDATE ${table} SET generation=0`,
    `UPDATE ${table} SET id=id WHERE false`,
    `DELETE FROM ${table} WHERE false`,
    `DELETE FROM ${table}`,
    `TRUNCATE ${table}`,
    `TRUNCATE ${table} CASCADE`,
    `INSERT INTO ${table}(id) VALUES(1) ON CONFLICT(id) DO UPDATE SET generation=EXCLUDED.generation`,
    `MERGE INTO ${table} t USING(SELECT 1::smallint AS id) s ON t.id=s.id WHEN MATCHED THEN UPDATE SET generation=0`,
    `WITH changed AS(UPDATE ${table} SET id=id RETURNING id) SELECT id FROM changed`,
    `WITH changed AS(DELETE FROM ${table} WHERE false RETURNING id) SELECT id FROM changed`,
  ])
    await assert.rejects(raw.query(sql));
  await raw.query(`INSERT INTO ${table}(id) VALUES(1) ON CONFLICT DO NOTHING`);
  await setup(raw, 'pg_write_all_data');
  await assert.rejects(copy(raw));
  await raw.query('ROLLBACK'); // Duplicate, not a write exemption.
  for (const sql of [
    `UPDATE ${table} SET generation=0`,
    `DELETE FROM ${table} WHERE false`,
    `ALTER TABLE ${table} DISABLE TRIGGER ALL`,
    `DROP TRIGGER currency_controls_no_update ON ${table}`,
    `CREATE OR REPLACE FUNCTION "${schema}".deny_currency_control_mutation() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NULL; END'`,
    `SET LOCAL session_replication_role=replica`,
  ]) {
    await setup(raw, 'pg_write_all_data');
    await assert.rejects(raw.query(sql));
    await raw.query('ROLLBACK');
  }
  assert.deepEqual(await prisma.currencyControl.findMany(), before);
});
test('raw savepoint and outer PLpgSQL recovery can retain earlier work but cannot mutate unassessed control facts', async () => {
  const before = await read(a, input);
  await setup(raw);
  await raw.query(
    `INSERT INTO "${schema}".settings(id,key,category,value,created_at,updated_at) VALUES($1,'command104.recovery','BILLING','0'::jsonb,now(),now())`,
    [randomUUID()],
  );
  await raw.query('SAVEPOINT recovery');
  await assert.rejects(raw.query(`UPDATE ${table} SET history_latched=false`));
  await raw.query('ROLLBACK TO SAVEPOINT recovery');
  await raw.query(
    `DO $recovery$ BEGIN BEGIN DELETE FROM ${table}; EXCEPTION WHEN check_violation THEN NULL; END; END $recovery$`,
  );
  assert.equal((await raw.query('COMMIT')).command, 'COMMIT');
  try {
    assert.equal(
      await prisma.setting.count({ where: { key: 'command104.recovery' } }),
      1,
    );
    assert.deepEqual(await read(a, input), before);
  } finally {
    await assertBrowserDatabaseScope(prisma, url, schema);
    await prisma.setting.delete({ where: { key: 'command104.recovery' } });
  }
});
test('missing/unsupported target contexts and qualified search-path decoys never become absent or allow staging', async () => {
  const other = await bootstrap(
    `command26_e2e_${randomUUID().replaceAll('-', '')}`,
  );
  try {
    await assert.rejects(
      read(a, { ...input, schema: other.target }),
      unavailable,
    );
    assert.equal(await other.models.currencyControl.count(), 0);
    for (const kind of ['missing', 'view', 'partition', 'inheritance']) {
      const unsupported = await bootstrap(
        `command26_e2e_${randomUUID().replaceAll('-', '')}`,
      );
      const t = `"${unsupported.target}"."currency_controls"`;
      try {
        if (kind === 'inheritance')
          await unsupported.pg.query(
            `CREATE TABLE "${unsupported.target}".__control_child() INHERITS (${t})`,
          );
        else {
          await unsupported.pg.query(
            `ALTER TABLE ${t} RENAME TO __control_old`,
          );
          if (kind === 'view')
            await unsupported.pg.query(
              `CREATE VIEW ${t} AS SELECT * FROM "${unsupported.target}".__control_old`,
            );
          if (kind === 'partition')
            await unsupported.pg.query(
              `CREATE TABLE ${t}(id smallint) PARTITION BY RANGE(id)`,
            );
        }
        // Committed DDL is visible to the other owned connection; no lock timeout masquerading as a kind check.
        await assert.rejects(
          read(unsupported.models, {
            schema: unsupported.target,
            staffMutex: 'not_required',
          }),
          unavailable,
        );
      } finally {
        await cleanup(unsupported);
      }
    }
    const pool = new Pool({ connectionString: other.targetUrl, max: 1 });
    const qualified = new PrismaClient({
      adapter: new PrismaPg(pool, { schema }),
    });
    try {
      assert.equal((await read(qualified, input)).state, 'unassessed');
      assert.equal(await other.models.currencyControl.count(), 0);
    } finally {
      await qualified.$disconnect();
      await pool.end();
    }
  } finally {
    await cleanup(other);
  }
});

test('the one additive migration preserves every prior-24 row, immutable policy/unit facts and legacy money', async () => {
  const old = await bootstrap(
    `command26_e2e_${randomUUID().replaceAll('-', '')}`,
    24,
  );
  try {
    const user = await old.models.user.create({
      data: {
        email: 'control-history@example.test',
        role: 'CUSTOMER',
        customer: {
          create: {
            customerNumber: 'FICTIONAL-104',
            firstName: 'Fictional',
            lastName: 'History',
            addressLine1: '1 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
    const customerId = user.customer!.id;
    const product = await old.models.product.create({
      data: {
        slug: 'fictional-104',
        name: 'Fictional hosting',
        provisioningAdapter: 'fake-panel',
      },
    });
    const price = await old.models.productPrice.create({
      data: {
        productId: product.id,
        billingPeriod: 'ANNUAL',
        currency: 'USD',
        amount: 100n,
      },
    });
    const order = await old.models.order.create({
      data: {
        orderNumber: 'FICTIONAL-ORDER-104',
        submissionKey: randomUUID(),
        customerId,
        currency: 'USD',
        subtotal: 100n,
        total: 100n,
        customerEmailSnapshot: user.email,
        items: {
          create: {
            productId: product.id,
            productPriceId: price.id,
            productNameSnapshot: product.name,
            billingPeriod: 'ANNUAL',
            currency: 'USD',
            unitAmount: 100n,
            lineTotal: 100n,
          },
        },
      },
    });
    const server = await old.models.server.create({
      data: {
        name: 'Fictional server 104',
        hostname: 'control104.example.test',
        adapterKey: 'fake-panel',
      },
    });
    await old.models.service.create({
      data: {
        customerId,
        productId: product.id,
        productPriceId: price.id,
        serverId: server.id,
        productNameSnapshot: product.name,
        billingPeriod: 'ANNUAL',
        recurringAmount: 100n,
        currency: 'USD',
        startedAt: new Date('2026-01-01Z'),
        nextDueAt: new Date('2027-01-01Z'),
      },
    });
    const invoice = await old.models.invoice.create({
      data: {
        invoiceNumber: 'FICTIONAL-INV-104',
        submissionKey: randomUUID(),
        customerId,
        orderId: order.id,
        currency: 'USD',
        subtotal: 100n,
        total: 100n,
        balanceDue: 100n,
        customerNameSnapshot: 'Fictional History',
        customerEmailSnapshot: user.email,
        customerAddressSnapshot: { city: 'Dhaka' },
        businessIdentitySnapshot: { name: 'Fictional business' },
        dueAt: new Date('2026-11-01Z'),
        items: {
          create: {
            linePosition: 1,
            descriptionSnapshot: 'Fictional hosting',
            currency: 'USD',
            unitAmount: 100n,
            lineTotal: 100n,
          },
        },
      },
    });
    await old.models.payment.create({
      data: {
        invoiceId: invoice.id,
        provider: 'fake',
        idempotencyKey: 'fictional-payment-104',
        amount: 100n,
        currency: 'USD',
      },
    });
    await old.models.setting.create({
      data: {
        key: 'business.localization',
        category: 'BUSINESS',
        value: { currency: 'BDT', timezone: 'Asia/Dhaka' },
      },
    });
    await old.models.activityLog.create({
      data: {
        action: 'fictional.control-history',
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: { fictional: true },
      },
    });
    await old.models.outboxEvent.create({
      data: {
        aggregateType: 'Invoice',
        aggregateId: invoice.id,
        eventType: 'fictional.control-history',
        idempotencyKey: 'fictional-control-history',
        payload: { fictional: true },
      },
    });
    await old.models.paymentEvent.create({
      data: {
        provider: 'fake',
        providerEventId: 'fictional-event-104',
        idempotencyKey: 'fictional-event-104',
        eventType: 'fictional',
        payloadHash: '0'.repeat(64),
        normalizedPayload: { fictional: true },
      },
    });
    const unit = {
      code: 'XAA',
      metadataVersion: 'control-history-v1',
      minorUnitExponent: 2,
      provenance: 'Authored fictional control history metadata',
      status: 'current',
    } as const;
    await appendCurrencyUnit(old.models, unit);
    const ref = { code: unit.code, metadataVersion: unit.metadataVersion };
    await appendCurrencyPolicyRevision(old.models, {
      revision: 'control-history-v1',
      base: ref,
      defaultBrowsing: ref,
      currencies: [
        {
          unit: ref,
          capabilities: { display: true, newSales: false, collection: false },
        },
      ],
    });
    const prior = await snapshot(old.models, old.targetUrl, old.target);
    assert.equal(migrations[24], '20261008090000_unselected_currency_control');
    await old.pg.query(
      readFileSync(resolve(dir, migrations[24]!, 'migration.sql'), 'utf8'),
    );
    assert.deepEqual(
      await snapshot(old.models, old.targetUrl, old.target, true),
      prior,
    );
    assert.equal(await old.models.currencyControl.count(), 0);
    const facts = await stage(old.models, {
      schema: old.target,
      staffMutex: 'not_required',
    });
    assert.equal(facts.state, 'unassessed');
    if (facts.state === 'unassessed') assert.equal(facts.historyLatched, null);
    assert.deepEqual(
      await snapshot(old.models, old.targetUrl, old.target, true),
      prior,
    );
  } finally {
    await cleanup(old);
  }
});

import assert from 'node:assert/strict';
import { before, after, afterEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, Pool, Query } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPrismaClient } from '../src/client';
import { withCurrencyCoordination } from '../src/currency-coordination';
import { renderCurrencyCoordinationGuardPrototype as render } from '../src/currency-coordination-guards';
import {
  assertBrowserDatabaseScope,
  browserDatabaseUrl,
  validateBrowserDatabaseUrl,
} from '../../../apps/web/e2e/database-scope';

// Installation targets are created by THIS process, never adopted from the caller.
const parentSchema = process.env.WEBHOST_BROWSER_E2E_SCHEMA ?? '';
const parentUrl = process.env.DATABASE_URL ?? '';
const schema = `command26_e2e_${randomUUID().replaceAll('-', '')}`;
const url = browserDatabaseUrl(parentUrl, schema);
const tables = [
  'product_prices',
  'orders',
  'order_items',
  'services',
  'invoices',
  'invoice_items',
  'payments',
  'settings',
  'payment_events',
];
const functionName = '__currency_coordination_guard';
const triggerNames = [
  '__currency_coordination_dml',
  '__currency_coordination_truncate',
];
const settings = `"${schema}".settings`;
const input = { schema, staffMutex: 'not_required' };
let parent: PrismaClient;
let prisma: PrismaClient;
let a: PrismaClient;
let b: PrismaClient;
let poolA: Pool;
let poolB: Pool;
let raw: Client;
let second: Client;
let observer: Client;
let baseline: Record<string, string[]>;
let parentBaseline: Record<string, string[]>;
let marked = false;
let installed = false;

function deferred() {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((r) => {
      resolve = r;
    }),
    resolve: () => resolve(),
  };
}
async function started(entry: Promise<void>, operation: Promise<void>) {
  await Promise.race([
    entry,
    operation.then(() =>
      assert.fail('Operation ended before its test barrier'),
    ),
  ]);
}
async function snapshot(
  client: PrismaClient,
  targetUrl: string,
  target: string,
) {
  await assertBrowserDatabaseScope(client, targetUrl, target);
  const names = await client.$queryRawUnsafe<{ name: string }[]>(
    `SELECT c.relname::text AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r' ORDER BY c.relname`,
    target,
  );
  const rows: Record<string, string[]> = {};
  for (const { name } of names) {
    assert.match(name, /^[a-z_][a-z0-9_]*$/);
    rows[name] = (
      await client.$queryRawUnsafe<{ row: string }[]>(
        `SELECT pg_catalog.to_jsonb(t)::text AS row FROM "${target}"."${name}" t ORDER BY pg_catalog.to_jsonb(t)::text`,
      )
    ).map((r) => r.row);
  }
  return rows;
}
async function bootstrap(target: string) {
  await assertBrowserDatabaseScope(parent, parentUrl, parentSchema);
  const targetUrl = browserDatabaseUrl(parentUrl, target);
  // CREATE (not IF NOT EXISTS) refuses collisions. Nonce creation is our ownership proof.
  await parent.$executeRawUnsafe(`CREATE SCHEMA "${target}"`);
  const pg = new Client({ connectionString: targetUrl });
  const models = createPrismaClient(targetUrl);
  let ownerMarked = false;
  try {
    await pg.connect();
    const migrations = readdirSync(resolve('prisma/migrations'))
      .filter((n) => /^\d{14}_/.test(n))
      .sort();
    assert.equal(migrations.length, 24);
    for (const name of migrations)
      await pg.query(
        readFileSync(
          resolve('prisma/migrations', name, 'migration.sql'),
          'utf8',
        ),
      );
    await assertBrowserDatabaseScope(models, targetUrl, target, false);
    await pg.query(
      `CREATE TABLE "${target}".__browser_e2e_scope(owner text NOT NULL)`,
    );
    await pg.query(
      `INSERT INTO "${target}".__browser_e2e_scope(owner) VALUES ($1)`,
      [target],
    );
    await assertBrowserDatabaseScope(models, targetUrl, target);
    ownerMarked = true;
    return { pg, models, targetUrl };
  } catch (error) {
    // Never destroy a partially initialized unmarked scope on a claim alone.
    if (ownerMarked) {
      await assertBrowserDatabaseScope(models, targetUrl, target);
      await models.$executeRawUnsafe(`DROP SCHEMA "${target}" CASCADE`);
    }
    await pg.end();
    await models.$disconnect();
    throw error;
  }
}
async function targets(pg: Client, target: string) {
  const result = await pg.query<{
    name: string;
    oid: string;
    ordinary: boolean;
  }>(
    `SELECT c.relname::text AS name,c.oid::text AS oid,
    c.relkind='r' AND NOT c.relispartition AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid) AS ordinary
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) ORDER BY c.relname`,
    [target, tables],
  );
  assert.deepEqual(
    result.rows.map((r) => r.name),
    [...tables].sort(),
  );
  assert.ok(result.rows.every((r) => r.ordinary));
  return result.rows;
}
async function preflight(
  pg: Client,
  target: string,
  expected: Awaited<ReturnType<typeof targets>>,
) {
  const scope = await pg.query<{ schema: string; owner: string }>(
    `SELECT pg_catalog.current_schema()::text AS schema, (SELECT owner FROM "${target}".__browser_e2e_scope) AS owner`,
  );
  assert.deepEqual(scope.rows, [{ schema: target, owner: target }]);
  assert.deepEqual(await targets(pg, target), expected);
  const collisions = await pg.query<{ count: string }>(
    `SELECT (
    (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=$2) +
    (SELECT count(*) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND t.tgname=ANY($3::text[])))::text AS count`,
    [target, functionName, triggerNames],
  );
  assert.equal(collisions.rows[0]?.count, '0');
}
async function install(
  pg: Client,
  models: PrismaClient,
  targetUrl: string,
  target: string,
) {
  await assertBrowserDatabaseScope(models, targetUrl, target);
  const expected = await targets(pg, target);
  await pg.query('BEGIN');
  try {
    await preflight(pg, target, expected);
    await pg.query(render({ schema: target }));
    await pg.query('COMMIT');
  } catch (error) {
    await pg.query('ROLLBACK');
    throw error;
  }
}
async function setup(
  pg: Client,
  isolation = 'READ COMMITTED',
  role = true,
  transactionMs = 10000,
) {
  await pg.query(`BEGIN ISOLATION LEVEL ${isolation} READ WRITE`);
  // Earlier commands: a trigger cannot retroactively bound an executing statement.
  await pg.query("SET LOCAL lock_timeout='500ms'");
  await pg.query("SET LOCAL statement_timeout='2000ms'");
  await pg.query(`SET LOCAL transaction_timeout='${transactionMs}ms'`);
  if (role) await pg.query('SET LOCAL ROLE pg_write_all_data');
}
async function defaults(pg: Client) {
  return (
    await pg.query<
      Record<string, unknown>
    >(`SELECT current_user AS actor,pg_catalog.current_setting('search_path') AS path,
    pg_catalog.current_setting('transaction_isolation') AS isolation,pg_catalog.current_setting('transaction_read_only') AS readonly,
    pg_catalog.current_setting('lock_timeout') AS lock,pg_catalog.current_setting('statement_timeout') AS statement,
    pg_catalog.current_setting('transaction_timeout') AS transaction,
    EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE pid=pg_catalog.pg_backend_pid() AND locktype='advisory') AS locked`)
  ).rows;
}
async function backend(pg: Client) {
  return (
    await pg.query<{ pid: number }>('SELECT pg_catalog.pg_backend_pid() AS pid')
  ).rows[0]!.pid;
}
async function lockEvidence(pg: Client, target = schema, granted = true) {
  const result = await pg.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM pg_catalog.pg_locks WHERE pid=pg_catalog.pg_backend_pid() AND locktype='advisory' AND granted=$2 AND mode='ExclusiveLock'
    AND database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database())
    AND classid=pg_catalog.hashtext('webhost-billing.currency-coordination.v1:' || pg_catalog.current_database())::oid AND objid=pg_catalog.hashtext($1::text)::oid AND objsubid=2`,
    [target, granted],
  );
  assert.equal(result.rows[0]?.count, '1');
}
async function waiting(pid: number, kind = 'advisory') {
  const deadline = Date.now() + 420;
  do {
    const result = await observer.query<{ waiting: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE pid=$1 AND NOT granted AND locktype=$2
      AND ($2 <> 'advisory' OR (classid=pg_catalog.hashtext('webhost-billing.currency-coordination.v1:' || pg_catalog.current_database())::oid AND objid=pg_catalog.hashtext($3::text)::oid AND objsubid=2))) AS waiting`,
      [pid, kind, schema],
    );
    if (result.rows[0]?.waiting) return;
    await new Promise<void>((r) => setTimeout(r, 3));
  } while (Date.now() < deadline);
  assert.fail('Expected actual lock wait was not observed');
}
function guardDenied(error: unknown) {
  assert.ok(error instanceof Error);
  assert.equal(error.message, 'Currency coordination guard failed.');
  assert.equal(Reflect.get(error, 'code'), 'P0001');
  return true;
}
async function noOp(pg: Client, table = 'settings') {
  await pg.query(`UPDATE "${schema}"."${table}" SET id=NULL WHERE false`);
}
async function probe(pg: Client, name: string, value = 0) {
  await pg.query(
    `INSERT INTO ${settings}(id,key,category,value,created_at,updated_at) VALUES($1,$2,'BILLING',$3::jsonb,pg_catalog.now(),pg_catalog.now())`,
    [randomUUID(), `command103.${name}`, JSON.stringify(value)],
  );
}
// Test-only COPY input using the installed pg Query extension protocol. No files,
// programs, server-side COPY source or new dependency/production adapter involved.
class CopyInput extends Query<Record<string, unknown>, []> {
  handleCopyInResponse(connection: {
    sendCopyFromChunk(chunk: Buffer): void;
    endCopyFrom(): void;
  }) {
    connection.sendCopyFromChunk(
      Buffer.from(
        `${randomUUID()}\tcommand103.copy\tBILLING\t0\t2026-10-07 00:00:00+00\t2026-10-07 00:00:00+00\n`,
      ),
    );
    connection.endCopyFrom();
  }
}
async function copy(pg: Client) {
  await new Promise<void>((resolveCopy, reject) => {
    const query = new CopyInput(
      `COPY ${settings}(id,key,category,value,created_at,updated_at) FROM STDIN`,
    );
    query.once('error', reject);
    query.once('end', () => resolveCopy());
    pg.query(query);
  });
}

before(async () => {
  validateBrowserDatabaseUrl(parentUrl, parentSchema);
  parent = createPrismaClient(parentUrl);
  await assertBrowserDatabaseScope(parent, parentUrl, parentSchema);
  parentBaseline = await snapshot(parent, parentUrl, parentSchema);
  const owned = await bootstrap(schema);
  prisma = owned.models;
  raw = owned.pg;
  marked = true;
  baseline = await snapshot(prisma, url, schema);
  second = new Client({ connectionString: url });
  observer = new Client({ connectionString: url });
  await second.connect();
  await observer.connect();
  poolA = new Pool({ connectionString: url, max: 1 });
  poolB = new Pool({ connectionString: url, max: 1 });
  a = new PrismaClient({ adapter: new PrismaPg(poolA, { schema }) });
  b = new PrismaClient({ adapter: new PrismaPg(poolB, { schema }) });
  await assertBrowserDatabaseScope(a, url, schema);
  await assertBrowserDatabaseScope(b, url, schema);
});
after(async () => {
  try {
    if (raw) await raw.query('ROLLBACK');
    if (second) await second.query('ROLLBACK');
    if (baseline)
      assert.deepEqual(await snapshot(prisma, url, schema), baseline);
    if (parentBaseline)
      assert.deepEqual(
        await snapshot(parent, parentUrl, parentSchema),
        parentBaseline,
      );
    if (installed) {
      await assertBrowserDatabaseScope(prisma, url, schema);
      await raw.query('BEGIN');
      for (const table of tables)
        for (const trigger of triggerNames)
          await raw.query(
            `DROP TRIGGER "${trigger}" ON "${schema}"."${table}"`,
          );
      await raw.query(`DROP FUNCTION "${schema}"."${functionName}"()`);
      await raw.query('COMMIT');
      await preflight(raw, schema, await targets(raw, schema));
    }
  } finally {
    if (marked) {
      await assertBrowserDatabaseScope(prisma, url, schema);
      await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    }
    if (a) await a.$disconnect();
    if (b) await b.$disconnect();
    if (poolA) await poolA.end();
    if (poolB) await poolB.end();
    if (raw) await raw.end();
    if (second) await second.end();
    if (observer) await observer.end();
    if (prisma) await prisma.$disconnect();
    if (parent) await parent.$disconnect();
  }
});

afterEach(async () => {
  await raw.query('ROLLBACK');
  await second.query('ROLLBACK');
});

test('test-only preflight rejects collisions, changed identities and unsupported view/partition/inheritance before atomic installation', async () => {
  const expected = await targets(raw, schema);
  for (const ddl of [
    `CREATE FUNCTION "${schema}"."${functionName}"() RETURNS integer LANGUAGE sql AS 'SELECT 1'`,
    `ALTER TABLE ${settings} RENAME TO settings_original; CREATE VIEW ${settings} AS SELECT * FROM "${schema}".settings_original`,
    `ALTER TABLE ${settings} RENAME TO settings_original; CREATE TABLE ${settings}(id uuid) PARTITION BY HASH(id)`,
    `ALTER TABLE ${settings} RENAME TO settings_original; CREATE TABLE ${settings}(id uuid)`,
    `CREATE TABLE "${schema}".__inherited_probe() INHERITS (${settings})`,
    `CREATE FUNCTION "${schema}".__decoy() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NULL; END'; CREATE TRIGGER "${triggerNames[0]}" BEFORE UPDATE ON ${settings} FOR EACH STATEMENT EXECUTE FUNCTION "${schema}".__decoy()`,
  ]) {
    await raw.query('BEGIN');
    try {
      await raw.query(ddl);
      await assert.rejects(preflight(raw, schema, expected));
    } finally {
      await raw.query('ROLLBACK');
    }
  }
  await raw.query('BEGIN');
  try {
    await preflight(raw, schema, expected);
    await raw.query(render({ schema }));
    await assert.rejects(raw.query(render({ schema }))); // No replacement; entire installer rolls back.
  } finally {
    await raw.query('ROLLBACK');
  }
  await preflight(raw, schema, expected);
  await install(raw, prisma, url, schema);
  installed = true;
  await assert.rejects(install(raw, prisma, url, schema));
});

test('catalog proves exact nine ordinary targets, 18 before-statement triggers and invoker/volatile/fixed path function', async () => {
  const result = await raw.query<{
    table: string;
    name: string;
    type: number;
    enabled: string;
    args: number;
    volatile: string;
    definer: boolean;
    config: string[];
    schema: string;
  }>(
    `SELECT c.relname AS table,t.tgname AS name,t.tgtype::int AS type,t.tgenabled AS enabled,t.tgnargs::int AS args,p.provolatile AS volatile,p.prosecdef AS definer,p.proconfig AS config,n.nspname AS schema
    FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
    WHERE n.nspname=$1 AND t.tgname=ANY($2::text[]) ORDER BY c.relname,t.tgname`,
    [schema, triggerNames],
  );
  assert.equal(result.rows.length, 18);
  for (const table of tables)
    for (const [i, name] of triggerNames.entries())
      assert.deepEqual(
        result.rows.find((r) => r.table === table && r.name === name),
        {
          table,
          name,
          type: i === 0 ? 30 : 34,
          enabled: 'O',
          args: 0,
          volatile: 'v',
          definer: false,
          config: ['search_path=pg_catalog'],
          schema,
        },
      );
  await targets(raw, schema);
});

test('actual non-owner no-row insert/update/delete on every target still obtains the fixed key', async () => {
  for (const table of tables)
    for (const operation of [
      `INSERT INTO "${schema}"."${table}"(id) SELECT NULL::uuid WHERE false`,
      `UPDATE "${schema}"."${table}" SET id=NULL WHERE false`,
      `DELETE FROM "${schema}"."${table}" WHERE false`,
    ]) {
      await setup(raw);
      try {
        const roles = await raw.query<{ actor: string; owner: string }>(
          `SELECT current_user AS actor,pg_catalog.pg_get_userbyid(c.relowner) AS owner FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2`,
          [schema, table],
        );
        assert.equal(roles.rows[0]?.actor, 'pg_write_all_data');
        assert.notEqual(roles.rows[0]?.actor, roles.rows[0]?.owner);
        await raw.query(operation);
        await lockEvidence(raw);
      } finally {
        await raw.query('ROLLBACK');
      }
    }
});

test('plain DML, COPY input, nested writes, ON CONFLICT and MERGE acquire statement coordination without persistent probes', async () => {
  await setup(raw);
  try {
    await copy(raw);
    await lockEvidence(raw);
    await raw.query(`UPDATE ${settings} SET value='2'::jsonb`);
    await raw.query(`DELETE FROM ${settings}`);
    await probe(raw, 'copy');
    // The built-in write role lacks SELECT. Read-dependent SQL uses our fictional
    // schema owner, not new grants, memberships or a privileged trigger function.
    await raw.query('RESET ROLE');
    await probe(raw, 'conflict');
    await raw.query('COMMIT');
    for (const sql of [
      `INSERT INTO ${settings} SELECT * FROM ${settings} WHERE key='command103.conflict' ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,
      `MERGE INTO ${settings} t USING (SELECT 'command103.conflict'::text AS key) s ON t.key=s.key WHEN MATCHED THEN UPDATE SET value=t.value WHEN NOT MATCHED BY SOURCE AND t.key='command103.copy' THEN DELETE`,
      `WITH nested AS (UPDATE ${settings} SET value='1'::jsonb WHERE key='command103.conflict' RETURNING id) DELETE FROM ${settings} WHERE id IN (SELECT id FROM nested)`,
    ]) {
      await setup(raw, 'READ COMMITTED', false);
      await raw.query(sql);
      await lockEvidence(raw);
      await raw.query('ROLLBACK');
    }
    await setup(raw, 'READ COMMITTED', false);
    await raw.query(
      `DELETE FROM ${settings} WHERE key IN ('command103.copy','command103.conflict')`,
    );
    await raw.query('COMMIT');
  } finally {
    await raw.query('ROLLBACK');
  }
});

test('all truncate variants deny including empty tables; non-owner cannot disable/replace guards', async () => {
  for (const table of tables) {
    await setup(raw, 'READ COMMITTED', false);
    try {
      await assert.rejects(
        raw.query(`TRUNCATE "${schema}"."${table}" CASCADE`),
        guardDenied,
      );
    } finally {
      await raw.query('ROLLBACK');
    }
  }
  for (const sql of [
    `ALTER TABLE ${settings} DISABLE TRIGGER "${triggerNames[0]}"`,
    `DROP TRIGGER "${triggerNames[0]}" ON ${settings}`,
    `CREATE OR REPLACE FUNCTION "${schema}"."${functionName}"() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NULL; END'`,
    `SET LOCAL session_replication_role=replica`,
  ]) {
    await setup(raw);
    try {
      await assert.rejects(raw.query(sql), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(Reflect.get(error, 'code'), '42501');
        return true;
      });
    } finally {
      await raw.query('ROLLBACK');
    }
  }
});

test('wrong isolation, read-only and missing/zero/oversized budgets fail rather than silently widening modes', async () => {
  for (const isolation of ['REPEATABLE READ', 'SERIALIZABLE']) {
    await setup(raw, isolation);
    try {
      await assert.rejects(noOp(raw), guardDenied);
    } finally {
      await raw.query('ROLLBACK');
    }
  }
  for (const sql of [
    'SET LOCAL lock_timeout=0',
    'SET LOCAL statement_timeout=0',
    'SET LOCAL transaction_timeout=0',
    "SET LOCAL lock_timeout='501ms'",
    "SET LOCAL statement_timeout='2001ms'",
    "SET LOCAL transaction_timeout='10001ms'",
  ]) {
    await setup(raw);
    await raw.query(sql);
    try {
      await assert.rejects(noOp(raw), guardDenied);
    } finally {
      await raw.query('ROLLBACK');
    }
  }
  await raw.query('BEGIN');
  try {
    await assert.rejects(noOp(raw), guardDenied);
  } finally {
    await raw.query('ROLLBACK');
  }
  await setup(raw);
  await raw.query('SET TRANSACTION READ ONLY');
  try {
    await assert.rejects(noOp(raw), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(Reflect.get(error, 'code'), '25006');
      return true;
    });
  } finally {
    await raw.query('ROLLBACK');
  }
});

test('helper-to-SQL waits on the actual key; commit and rollback both release it without setting/role leaks', async () => {
  const previous = await defaults(raw);
  for (const rollback of [false, true]) {
    const ready = deferred();
    const release = deferred();
    const holder = withCurrencyCoordination(a, input, async () => {
      ready.resolve();
      await release.promise;
      if (rollback) throw new Error('Fictional rollback.');
    });
    void holder.catch(() => {});
    await started(ready.promise, holder);
    await setup(raw);
    const pid = await backend(raw);
    const statement = noOp(raw);
    void statement.catch(() => {});
    try {
      await waiting(pid);
    } finally {
      release.resolve();
      if (rollback) await assert.rejects(holder);
      else await holder;
    }
    await statement;
    await lockEvidence(raw);
    await raw.query('ROLLBACK');
    assert.deepEqual(await defaults(raw), previous);
  }
});

test('SQL-to-helper waits through commit and rollback; reentrancy preserves shorter deadlines', async () => {
  for (const finish of ['COMMIT', 'ROLLBACK']) {
    await setup(raw);
    await noOp(raw);
    await lockEvidence(raw);
    const pid = (
      await b.$queryRawUnsafe<{ pid: number }[]>(
        'SELECT pg_catalog.pg_backend_pid() AS pid',
      )
    )[0]!.pid;
    let entered = false;
    const helper = withCurrencyCoordination(b, input, async () => {
      entered = true;
    });
    void helper.catch(() => {});
    try {
      await waiting(pid);
      assert.equal(entered, false);
    } finally {
      await raw.query(finish);
    }
    await helper;
    assert.equal(entered, true);
  }
  await withCurrencyCoordination(
    a,
    { ...input, limits: { lockMs: 80, statementMs: 600, transactionMs: 3000 } },
    async (tx) => {
      const before = await tx.$queryRawUnsafe<unknown[]>(
        `SELECT current_setting('lock_timeout') AS lock,current_setting('statement_timeout') AS statement,current_setting('transaction_timeout') AS transaction`,
      );
      await tx.$executeRawUnsafe(`UPDATE ${settings} SET id=id WHERE false`);
      assert.deepEqual(
        await tx.$queryRawUnsafe<unknown[]>(
          `SELECT current_setting('lock_timeout') AS lock,current_setting('statement_timeout') AS statement,current_setting('transaction_timeout') AS transaction`,
        ),
        before,
      );
    },
  );
});

test('lock failure is redacted and aborts the whole transaction even if caller catches it', async () => {
  await setup(raw);
  await noOp(raw);
  const previous = await defaults(second);
  await setup(second);
  await second.query("SET LOCAL lock_timeout='40ms'");
  // A different table write outside coverage is fictional and must roll back too.
  await second.query('RESET ROLE');
  await second.query(
    `INSERT INTO "${schema}".__browser_e2e_scope(owner) VALUES ('fictional-sensitive')`,
  );
  await second.query('SET LOCAL ROLE pg_write_all_data');
  try {
    await assert.rejects(noOp(second), guardDenied);
    await assert.rejects(second.query('SELECT 1'), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(Reflect.get(error, 'code'), '25P02');
      return true;
    });
    assert.equal((await second.query('COMMIT')).command, 'ROLLBACK');
  } finally {
    await second.query('ROLLBACK');
    await raw.query('ROLLBACK');
  }
  assert.deepEqual(await defaults(second), previous);
  await assertBrowserDatabaseScope(prisma, url, schema);
});

test('earlier statement/transaction deadlines terminate actual work and release locks', async () => {
  const previous = await defaults(raw);
  await setup(raw);
  await raw.query("SET LOCAL statement_timeout='30ms'");
  // Nonempty source evaluates slow work AFTER the statement guard acquired its key.
  try {
    await assert.rejects(
      raw.query(
        `INSERT INTO ${settings}(id,key,category,value,created_at,updated_at) SELECT $1,'command103.slow','BILLING','0'::jsonb,pg_catalog.now(),pg_catalog.now() FROM pg_catalog.pg_sleep(0.1)`,
        [randomUUID()],
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(Reflect.get(error, 'code'), '57014');
        return true;
      },
    );
  } finally {
    await raw.query('ROLLBACK');
  }
  assert.deepEqual(await defaults(raw), previous);
  const expiring = new Client({ connectionString: url });
  await expiring.connect();
  let fatal: Error | undefined;
  expiring.on('error', (error: Error) => {
    fatal = error;
  });
  try {
    await setup(expiring, 'READ COMMITTED', true, 100);
    await noOp(expiring);
    await assert.rejects(expiring.query('SELECT pg_catalog.pg_sleep(0.15)'));
  } finally {
    await expiring.end();
  }
  // PostgreSQL transaction_timeout can close the connection, not a trigger API error.
  if (fatal) assert.ok(fatal instanceof Error);
  await withCurrencyCoordination(a, input, async () => {});
});

test('settings do not certify internal timer state: lowering a positive transaction budget does not rearm it', async () => {
  await setup(raw, 'READ COMMITTED', true, 1000);
  await raw.query("SET LOCAL transaction_timeout='100ms'");
  await noOp(raw);
  await lockEvidence(raw);
  // Actual server behavior, not an assertion that a current_setting is a timer.
  // Caller must establish its FIRST active budget; trigger installs no new timer.
  await raw.query('SELECT pg_catalog.pg_sleep(0.2)');
  await raw.query('ROLLBACK');
});

test('direct calls and unrelated/row/argument/after attachments cannot form a generic lock API', async () => {
  await assert.rejects(raw.query(`SELECT "${schema}"."${functionName}"()`));
  for (const ddl of [
    `CREATE TABLE "${schema}".__attachment_probe(id integer); CREATE TRIGGER "${triggerNames[0]}" BEFORE UPDATE ON "${schema}".__attachment_probe FOR EACH STATEMENT EXECUTE FUNCTION "${schema}"."${functionName}"()`,
    `DROP TRIGGER "${triggerNames[0]}" ON ${settings}; CREATE TRIGGER "${triggerNames[0]}" BEFORE UPDATE ON ${settings} FOR EACH ROW EXECUTE FUNCTION "${schema}"."${functionName}"()`,
    `DROP TRIGGER "${triggerNames[0]}" ON ${settings}; CREATE TRIGGER "${triggerNames[0]}" AFTER UPDATE ON ${settings} FOR EACH STATEMENT EXECUTE FUNCTION "${schema}"."${functionName}"()`,
    `DROP TRIGGER "${triggerNames[0]}" ON ${settings}; CREATE TRIGGER "${triggerNames[0]}" BEFORE UPDATE ON ${settings} FOR EACH STATEMENT EXECUTE FUNCTION "${schema}"."${functionName}"('decoy')`,
  ]) {
    await setup(raw, 'READ COMMITTED', false);
    try {
      await probe(raw, 'attachment');
      await raw.query(ddl);
      const unrelated = ddl.includes('__attachment_probe');
      if (unrelated)
        await raw.query(`INSERT INTO "${schema}".__attachment_probe VALUES(1)`);
      await assert.rejects(
        raw.query(
          unrelated
            ? `UPDATE "${schema}".__attachment_probe SET id=id`
            : `UPDATE ${settings} SET id=id WHERE key='command103.attachment'`,
        ),
        guardDenied,
      );
    } finally {
      await raw.query('ROLLBACK');
    }
  }
});

test('initiating DML retains its pre-wait snapshot, but a later Read Committed read sees the commit', async () => {
  await setup(raw);
  await probe(raw, 'snapshot', 0);
  await raw.query('COMMIT');
  const ready = deferred();
  const release = deferred();
  const holder = withCurrencyCoordination(a, input, async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE ${settings} SET value='1'::jsonb WHERE key='command103.snapshot'`,
    );
    ready.resolve();
    await release.promise;
  });
  await started(ready.promise, holder);
  await setup(raw, 'READ COMMITTED', false);
  const pid = await backend(raw);
  const statement = raw.query(
    `INSERT INTO ${settings}(id,key,category,value,created_at,updated_at) SELECT $1,'command103.stale','BILLING',value,pg_catalog.now(),pg_catalog.now() FROM ${settings} WHERE key='command103.snapshot'`,
    [randomUUID()],
  );
  void statement.catch(() => {});
  try {
    await waiting(pid);
  } finally {
    release.resolve();
    await holder;
  }
  await statement;
  assert.deepEqual(
    (
      await raw.query<{ key: string; value: number }>(
        `SELECT key,value FROM ${settings} WHERE key IN ('command103.snapshot','command103.stale') ORDER BY key`,
      )
    ).rows,
    [
      { key: 'command103.snapshot', value: 1 },
      { key: 'command103.stale', value: 0 },
    ],
  );
  await raw.query('ROLLBACK');
  await setup(raw, 'READ COMMITTED', false);
  await raw.query(`DELETE FROM ${settings} WHERE key='command103.snapshot'`);
  await raw.query('COMMIT');
});

test('reversed row-first ordering safely fails and cannot partially commit a caught guard failure', async () => {
  await setup(raw);
  await probe(raw, 'reversed', 0);
  await raw.query('COMMIT');
  await setup(raw, 'READ COMMITTED', false);
  await raw.query(
    `SELECT id FROM ${settings} WHERE key='command103.reversed' FOR UPDATE`,
  );
  const pid = (
    await a.$queryRawUnsafe<{ pid: number }[]>(
      'SELECT pg_catalog.pg_backend_pid() AS pid',
    )
  )[0]!.pid;
  const ready = deferred();
  const release = deferred();
  const holder = withCurrencyCoordination(a, input, async (tx) => {
    ready.resolve();
    await release.promise;
    await tx.$executeRawUnsafe(
      `UPDATE ${settings} SET value='1'::jsonb WHERE key='command103.reversed'`,
    );
  });
  void holder.catch(() => {});
  await started(ready.promise, holder);
  // Capture backend identity before starting the busy max-one helper pool.
  release.resolve();
  await waiting(pid, 'transactionid');
  await raw.query("SET LOCAL lock_timeout='60ms'");
  await assert.rejects(noOp(raw), guardDenied);
  assert.equal((await raw.query('COMMIT')).command, 'ROLLBACK');
  await holder;
  assert.deepEqual(
    (
      await observer.query<{ value: number }>(
        `SELECT value FROM ${settings} WHERE key='command103.reversed'`,
      )
    ).rows,
    [{ value: 1 }],
  );
  await setup(raw, 'READ COMMITTED', false);
  await raw.query(`DELETE FROM ${settings} WHERE key='command103.reversed'`);
  await raw.query('COMMIT');
});

test('independent newly owned schema does not wait; qualified target ignores search-path decoy', async () => {
  const otherSchema = `command26_e2e_${randomUUID().replaceAll('-', '')}`;
  const other = await bootstrap(otherSchema);
  let otherInstalled = false;
  try {
    await install(other.pg, other.models, other.targetUrl, otherSchema);
    otherInstalled = true;
    await setup(raw);
    await noOp(raw);
    await setup(other.pg);
    await other.pg.query("SET LOCAL lock_timeout='40ms'");
    await other.pg.query(
      `UPDATE "${otherSchema}".settings SET id=NULL WHERE false`,
    );
    await lockEvidence(other.pg, otherSchema);
    await other.pg.query('ROLLBACK');
    await raw.query('ROLLBACK');
    await setup(other.pg);
    await other.pg.query(`SET LOCAL search_path="${otherSchema}",pg_catalog`);
    await other.pg.query(`UPDATE ${settings} SET id=NULL WHERE false`);
    await lockEvidence(other.pg, schema);
    const decoy = await other.pg.query<{ locked: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE pid=pg_catalog.pg_backend_pid() AND locktype='advisory' AND objid=pg_catalog.hashtext($1::text)::oid AND objsubid=2) AS locked`,
      [otherSchema],
    );
    assert.equal(decoy.rows[0]?.locked, false);
    await other.pg.query('ROLLBACK');
  } finally {
    await raw.query('ROLLBACK');
    await other.pg.query('ROLLBACK');
    await assertBrowserDatabaseScope(
      other.models,
      other.targetUrl,
      otherSchema,
    );
    if (otherInstalled) {
      await other.pg.query('BEGIN');
      for (const table of tables)
        for (const trigger of triggerNames)
          await other.pg.query(
            `DROP TRIGGER "${trigger}" ON "${otherSchema}"."${table}"`,
          );
      await other.pg.query(
        `DROP FUNCTION "${otherSchema}"."${functionName}"()`,
      );
      await other.pg.query('COMMIT');
    }
    await other.models.$executeRawUnsafe(
      `DROP SCHEMA "${otherSchema}" CASCADE`,
    );
    await other.pg.end();
    await other.models.$disconnect();
  }
});

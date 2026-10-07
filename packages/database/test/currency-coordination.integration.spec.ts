import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { createPrismaClient } from '../src/client';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client';
import {
  withCurrencyCoordination,
  CurrencyCoordinationError,
  type CurrencyCoordinationClient,
  type CurrencyCoordinationBody,
} from '../src/currency-coordination';
import {
  assertBrowserDatabaseScope,
  browserDatabaseUrl,
  validateBrowserDatabaseUrl,
} from '../../../apps/web/e2e/database-scope';

const schema = process.env.WEBHOST_BROWSER_E2E_SCHEMA ?? '';
const url = process.env.DATABASE_URL ?? '';
const input = { schema, staffMutex: 'not_required' };
const probe = `"${schema}".__currency_coordination_probe`;
// Deliberately repeat the documented SQL contract, not an exported caller key.
const key = `pg_catalog.hashtext('webhost-billing.currency-coordination.v1:' || pg_catalog.current_database()), pg_catalog.hashtext($1::text)`;
let prisma: PrismaClient;
let a: PrismaClient;
let b: PrismaClient;
let poolA: Pool;
let poolB: Pool;
let baseline: Record<string, string[]>;
let probeCreated = false;

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
function denied(error: unknown): boolean {
  assert.ok(error instanceof CurrencyCoordinationError);
  assert.equal(error.code, 'COORDINATION_FAILED');
  assert.equal(error.cause, undefined);
  assert.doesNotMatch(
    String(error),
    /fictional-sensitive|division by zero|constraint|SQL/,
  );
  return true;
}
async function snapshot() {
  await assertBrowserDatabaseScope(prisma, url, schema);
  const names = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT c.relname::text AS name FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname=$1 AND c.relkind='r' AND c.relname <> '__currency_coordination_probe'
     ORDER BY c.relname`,
    schema,
  );
  const result: Record<string, string[]> = {};
  for (const { name } of names) {
    assert.match(name, /^[a-z_][a-z0-9_]*$/);
    result[name] = (
      await prisma.$queryRawUnsafe<{ row: string }[]>(
        `SELECT pg_catalog.to_jsonb(t)::text AS row FROM "${schema}"."${name}" t
       ORDER BY pg_catalog.to_jsonb(t)::text`,
      )
    ).map((r) => r.row);
  }
  return result;
}
async function defaults(client: PrismaClient) {
  return client.$queryRawUnsafe<unknown[]>(`SELECT current_user AS actor,
    current_setting('transaction_isolation') AS isolation,
    current_setting('transaction_read_only') AS readonly,
    current_setting('row_security') AS rls, current_setting('search_path') AS path,
    current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock,
    current_setting('transaction_timeout') AS transaction,
    EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE pid=pg_catalog.pg_backend_pid()
      AND locktype='advisory') AS "hasAdvisoryLock"`);
}
async function noProbe(id: string) {
  const rows = await prisma.$queryRawUnsafe<{ count: string }[]>(
    `SELECT count(*)::text AS count FROM ${probe} WHERE id=$1`,
    id,
  );
  assert.equal(rows[0]?.count, '0');
}
async function insert(tx: Prisma.TransactionClient, id: string, ref?: string) {
  await tx.$executeRawUnsafe(
    `INSERT INTO ${probe} (id,value,ref) VALUES ($1,1,$2)`,
    id,
    ref ?? null,
  );
}
async function waiting(pid: string, staff = false) {
  const deadline = Date.now() + 400;
  do {
    const result = await prisma.$queryRawUnsafe<{ waiting: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_locks l WHERE l.pid=$2::int
       AND EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname=$1::text)
       AND l.locktype='advisory' AND NOT l.granted AND ${
         staff
           ? 'l.classid=0::oid AND l.objid=920006::oid AND l.objsubid=1'
           : `l.classid=(pg_catalog.hashtext('webhost-billing.currency-coordination.v1:' || pg_catalog.current_database()))::oid
            AND l.objid=(pg_catalog.hashtext($1::text))::oid AND l.objsubid=2`
       }) AS waiting`,
      schema,
      pid,
    );
    if (result[0]?.waiting) return;
    await new Promise<void>((r) => setTimeout(r, 5));
  } while (Date.now() < deadline);
  assert.fail('Expected actual advisory-lock wait was not observed');
}
async function pid(client: PrismaClient): Promise<string> {
  return (
    await client.$queryRawUnsafe<{ pid: string }[]>(
      'SELECT pg_catalog.pg_backend_pid()::text AS pid',
    )
  )[0]!.pid;
}

before(async () => {
  validateBrowserDatabaseUrl(url, schema);
  prisma = createPrismaClient(url);
  await assertBrowserDatabaseScope(prisma, url, schema);
  baseline = await snapshot();
  // Test-only probes, never application financial/settings/audit rows or migrations.
  await prisma.$executeRawUnsafe(`CREATE TABLE ${probe} (
    id text PRIMARY KEY, value integer NOT NULL,
    ref text REFERENCES ${probe}(id) DEFERRABLE INITIALLY DEFERRED)`);
  probeCreated = true;
  poolA = new Pool({ connectionString: url, max: 1 });
  poolB = new Pool({ connectionString: url, max: 1 });
  a = new PrismaClient({ adapter: new PrismaPg(poolA, { schema }) });
  b = new PrismaClient({ adapter: new PrismaPg(poolB, { schema }) });
  await assertBrowserDatabaseScope(a, url, schema);
  await assertBrowserDatabaseScope(b, url, schema);
});
after(async () => {
  try {
    if (baseline) assert.deepEqual(await snapshot(), baseline);
  } finally {
    try {
      if (probeCreated) {
        await assertBrowserDatabaseScope(prisma, url, schema);
        await prisma.$executeRawUnsafe(`DROP TABLE ${probe}`);
      }
    } finally {
      if (a) await a.$disconnect();
      if (b) await b.$disconnect();
      if (poolA) await poolA.end();
      if (poolB) await poolB.end();
      if (prisma) await prisma.$disconnect();
    }
  }
});

test('actual same-schema serialization and post-wait statements see the prior commit', async () => {
  await prisma.$executeRawUnsafe(
    `INSERT INTO ${probe} (id,value) VALUES ('serial',0)`,
  );
  const entered = deferred();
  const release = deferred();
  let secondEntered = false;
  const secondPid = await pid(b);
  const first = withCurrencyCoordination(a, input, async (tx) => {
    await tx.$executeRawUnsafe(`UPDATE ${probe} SET value=1 WHERE id='serial'`);
    entered.resolve();
    await release.promise;
  });
  await started(entered.promise, first);
  const second = withCurrencyCoordination(b, input, async (tx) => {
    secondEntered = true;
    const rows = await tx.$queryRawUnsafe<{ value: number }[]>(
      `SELECT value FROM ${probe} WHERE id='serial'`,
    );
    assert.equal(rows[0]?.value, 1);
  });
  void second.catch(() => {});
  try {
    await waiting(secondPid);
    assert.equal(secondEntered, false);
  } finally {
    release.resolve();
    await first;
  }
  await second;
  assert.equal(secondEntered, true);
  assert.deepEqual(await snapshot(), baseline);
});

test('rollback releases coordination and a waiting participant sees no failed write', async () => {
  const entered = deferred();
  const release = deferred();
  const secondPid = await pid(b);
  let attempts = 0;
  const first = withCurrencyCoordination(a, input, async (tx) => {
    attempts++;
    await insert(tx, 'rollback');
    entered.resolve();
    await release.promise;
    throw new Error('fictional-sensitive-body');
  });
  void first.catch(() => {});
  await started(entered.promise, first);
  const second = withCurrencyCoordination(b, input, async (tx) => {
    const rows = await tx.$queryRawUnsafe<{ count: string }[]>(
      `SELECT count(*)::text AS count FROM ${probe} WHERE id='rollback'`,
    );
    assert.equal(rows[0]?.count, '0');
  });
  void second.catch(() => {});
  try {
    await waiting(secondPid);
  } finally {
    release.resolve();
    await assert.rejects(first, denied);
  }
  await second;
  assert.equal(attempts, 1);
  await noProbe('rollback');
});

test('nonparticipating SQL still bypasses an advisory lock; no policy enforcement claim', async () => {
  const entered = deferred();
  const release = deferred();
  const first = withCurrencyCoordination(a, input, async () => {
    entered.resolve();
    await release.promise;
  });
  await started(entered.promise, first);
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '300ms'");
        await insert(tx, 'uncoordinated');
      },
      { isolationLevel: 'ReadCommitted', timeout: 2_000 },
    );
    const count = await prisma.$queryRawUnsafe<{ count: string }[]>(
      `SELECT count(*)::text AS count FROM ${probe} WHERE id='uncoordinated'`,
    );
    assert.equal(count[0]?.count, '1');
  } finally {
    release.resolve();
    await first;
  }
});

test('staff composition waits on the existing mutex before acquiring currency', async () => {
  const entered = deferred();
  const release = deferred();
  const helperPid = await pid(b);
  const holder = a.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT 1 FROM pg_catalog.pg_advisory_xact_lock(920006::bigint)',
      );
      entered.resolve();
      await release.promise;
    },
    { isolationLevel: 'ReadCommitted', timeout: 3_000 },
  );
  await started(entered.promise, holder);
  let bodyEntered = false;
  const helper = withCurrencyCoordination(
    b,
    { ...input, staffMutex: 'required' },
    async () => {
      bodyEntered = true;
    },
  );
  void helper.catch(() => {});
  try {
    await waiting(helperPid, true);
    assert.equal(bodyEntered, false);
    await prisma.$transaction(async (tx) => {
      const result = await tx.$queryRawUnsafe<{ acquired: boolean }[]>(
        `SELECT pg_catalog.pg_try_advisory_xact_lock(${key}) AS acquired`,
        schema,
      );
      assert.equal(result[0]?.acquired, true);
    });
  } finally {
    release.resolve();
    await holder;
  }
  await helper;
  assert.equal(bodyEntered, true);
});

test('busy pool and contended currency lock deny before body and release for reuse', async () => {
  let entered = 0;
  await a.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe('SELECT 1');
      await assert.rejects(
        withCurrencyCoordination(
          a,
          { ...input, limits: { acquisitionMs: 30 } },
          async () => {
            entered++;
          },
        ),
        denied,
      );
    },
    { timeout: 3_000 },
  );
  assert.equal(entered, 0);
  const ready = deferred();
  const release = deferred();
  const holder = withCurrencyCoordination(a, input, async () => {
    ready.resolve();
    await release.promise;
  });
  await started(ready.promise, holder);
  try {
    await assert.rejects(
      withCurrencyCoordination(
        b,
        { ...input, limits: { lockMs: 30 } },
        async () => {
          entered++;
        },
      ),
      denied,
    );
    assert.equal(entered, 0);
  } finally {
    release.resolve();
    await holder;
  }
  await withCurrencyCoordination(a, input, async () => {});
  await withCurrencyCoordination(b, input, async () => {});
});

test('statement and server transaction deadlines roll back probes, release locks and permit reuse', async () => {
  const previous = await defaults(a);
  let entered = 0;
  for (const [id, limits] of [
    ['statement', { statementMs: 30 }],
    ['transaction', { transactionMs: 100, statementMs: 1_000 }],
  ] as const) {
    await assert.rejects(
      withCurrencyCoordination(a, { ...input, limits }, async (tx) => {
        entered++;
        await insert(tx, id);
        await tx.$queryRawUnsafe('SELECT pg_catalog.pg_sleep(0.2)');
      }),
      denied,
    );
    await noProbe(id);
    await withCurrencyCoordination(b, input, async () => {});
    await assertBrowserDatabaseScope(a, url, schema);
    assert.deepEqual(await defaults(a), previous);
  }
  assert.equal(entered, 2);
});

test('caught aborted SQL and deferred commit failure cannot become successful results', async () => {
  let caught = false;
  await assert.rejects(
    withCurrencyCoordination(a, input, async (tx) => {
      await insert(tx, 'caught');
      try {
        await tx.$queryRawUnsafe('SELECT 1/0');
      } catch {
        caught = true;
      }
    }),
    denied,
  );
  assert.equal(caught, true);
  await noProbe('caught');
  let attempts = 0;
  await assert.rejects(
    withCurrencyCoordination(a, input, async (tx) => {
      attempts++;
      await insert(tx, 'commit-denied', 'missing-reference');
    }),
    denied,
  );
  assert.equal(attempts, 1);
  await noProbe('commit-denied');
  await withCurrencyCoordination(b, input, async () => {});
});

test('body mode/role changes and returned handles reject and roll back instead of escaping', async () => {
  const previous = await defaults(a);
  for (const [id, command] of [
    ['path', 'SET LOCAL search_path = public'],
    ['deadline', 'SET LOCAL statement_timeout = 0'],
    ['visibility', 'SET LOCAL row_security = on'],
    ['readonly', 'SET LOCAL transaction_read_only = on'],
    ['role', 'SET LOCAL ROLE pg_read_all_stats'],
  ]) {
    await assert.rejects(
      withCurrencyCoordination(a, input, async (tx) => {
        await insert(tx, id!);
        await tx.$executeRawUnsafe(command!);
      }),
      denied,
    );
    await noProbe(id!);
    assert.deepEqual(await defaults(a), previous);
  }
  await assert.rejects(
    withCurrencyCoordination(a, input, (async (
      tx: Prisma.TransactionClient,
    ) => {
      await insert(tx, 'handle');
      return tx;
    }) as unknown as CurrencyCoordinationBody),
    denied,
  );
  await noProbe('handle');
});

// Test-only injected-client wrappers, not production hooks or caller-owned transactions.
function tampered(
  isolation: 'ReadCommitted' | 'RepeatableRead' | 'Serializable',
  afterExecute?: (tx: Prisma.TransactionClient, sql: string) => Promise<void>,
  before?: (tx: Prisma.TransactionClient) => Promise<void>,
): CurrencyCoordinationClient {
  return {
    $transaction: async (
      body: (tx: Prisma.TransactionClient) => Promise<void>,
      options: {
        isolationLevel: 'ReadCommitted';
        maxWait: number;
        timeout: number;
      },
    ) =>
      a.$transaction(
        async (tx) => {
          if (before) await before(tx);
          const wrapped = {
            $queryRawUnsafe: tx.$queryRawUnsafe.bind(tx),
            $executeRawUnsafe: async (sql: string) => {
              const result = await tx.$executeRawUnsafe(sql);
              if (afterExecute) await afterExecute(tx, sql);
              return result;
            },
          } as unknown as Prisma.TransactionClient;
          await body(wrapped);
        },
        { ...options, isolationLevel: isolation },
      ),
  } as unknown as CurrencyCoordinationClient;
}
test('wrong isolation/read-only and unavailable schema permissions fail before body', async () => {
  let entered = 0;
  for (const isolation of ['RepeatableRead', 'Serializable'] as const) {
    await assert.rejects(
      withCurrencyCoordination(tampered(isolation), input, async () => {
        entered++;
      }),
      denied,
    );
  }
  await assert.rejects(
    withCurrencyCoordination(
      tampered('ReadCommitted', async (tx, sql) => {
        if (sql.startsWith('SET LOCAL row_security'))
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      }),
      input,
      async () => {
        entered++;
      },
    ),
    denied,
  );
  await assert.rejects(
    withCurrencyCoordination(
      tampered('ReadCommitted', undefined, async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE pg_read_all_stats');
      }),
      input,
      async () => {
        entered++;
      },
    ),
    denied,
  );
  await assert.rejects(
    withCurrencyCoordination(
      a,
      {
        ...input,
        schema: `missing102_${randomUUID().replaceAll('-', '')}`,
      },
      async () => {
        entered++;
      },
    ),
    denied,
  );
  assert.equal(entered, 0);
  await assertBrowserDatabaseScope(a, url, schema);
});

test('same pooled backend retains defaults/roles and no advisory locks after success and failure', async () => {
  const previous = await defaults(b);
  const previousPid = await pid(b);
  await withCurrencyCoordination(
    b,
    {
      ...input,
      staffMutex: 'required',
      limits: {
        lockMs: 100,
        statementMs: 500,
        transactionMs: 3_000,
      },
    },
    async () => {},
  );
  assert.deepEqual(await defaults(b), previous);
  assert.equal(await pid(b), previousPid);
  await assert.rejects(
    withCurrencyCoordination(
      b,
      { ...input, staffMutex: 'required' },
      async () => {
        throw new Error('fictional-sensitive-body');
      },
    ),
    denied,
  );
  assert.deepEqual(await defaults(b), previous);
  assert.equal(await pid(b), previousPid);
});

test('independent new owned schema does not wait; explicit target ignores search-path decoy', async () => {
  const owned = `command26_e2e_${randomUUID().replaceAll('-', '')}`;
  const ownedUrl = browserDatabaseUrl(url, owned);
  await assertBrowserDatabaseScope(prisma, url, schema);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "${owned}"`);
  const pg = new Client({ connectionString: ownedUrl });
  const other = createPrismaClient(ownedUrl);
  let marked = false;
  try {
    await pg.connect();
    assert.deepEqual(
      (
        await pg.query(
          "SELECT current_schema() AS schema,current_setting('search_path') AS path",
        )
      ).rows,
      [{ schema: owned, path: owned }],
    );
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
    await assertBrowserDatabaseScope(other, ownedUrl, owned, false);
    await other.$executeRawUnsafe(
      'CREATE TABLE __browser_e2e_scope (owner text NOT NULL)',
    );
    await other.$executeRawUnsafe(
      'INSERT INTO __browser_e2e_scope (owner) VALUES ($1)',
      owned,
    );
    await assertBrowserDatabaseScope(other, ownedUrl, owned);
    marked = true;
    const ready = deferred();
    const release = deferred();
    const holder = withCurrencyCoordination(a, input, async () => {
      ready.resolve();
      await release.promise;
    });
    await started(ready.promise, holder);
    try {
      await withCurrencyCoordination(
        other,
        { schema: owned, staffMutex: 'not_required', limits: { lockMs: 30 } },
        async (tx) => {
          const rows = await tx.$queryRawUnsafe<{ count: string }[]>(
            `SELECT count(*)::text AS count FROM "${owned}".orders`,
          );
          assert.equal(rows[0]?.count, '0');
        },
      );
    } finally {
      release.resolve();
      await holder;
    }
    // Its model/raw default schema is the decoy; only explicitly qualified body SQL
    // targets the requested main scope. The helper is not a financial/body SQL guard.
    await withCurrencyCoordination(other, input, async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ value: number }[]>(
        `SELECT value FROM ${probe} WHERE id='serial'`,
      );
      assert.equal(rows[0]?.value, 1);
    });
    await assertBrowserDatabaseScope(other, ownedUrl, owned);
  } finally {
    if (marked) {
      await assertBrowserDatabaseScope(other, ownedUrl, owned);
      await other.$executeRawUnsafe(`DROP SCHEMA "${owned}" CASCADE`);
    }
    await other.$disconnect();
    await pg.end();
  }
  assert.deepEqual(await snapshot(), baseline);
});

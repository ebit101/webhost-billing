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
  inspectCurrencyAdoption,
  CurrencyAdoptionPreflightError,
  type CurrencyAdoptionPreflightClient,
} from '../src/currency-adoption-preflight';
import {
  assertBrowserDatabaseScope,
  browserDatabaseUrl,
  validateBrowserDatabaseUrl,
} from '../../../apps/web/e2e/database-scope';

const schema = process.env.WEBHOST_BROWSER_E2E_SCHEMA ?? '';
const url = process.env.DATABASE_URL ?? '';
let prisma: PrismaClient;
let single: PrismaClient;
let pool: Pool;
let customerId: string;
let productId: string;
let priceId: string;
const at = new Date('2026-10-01T00:00:00.000Z');
const moneyTables = [
  'product_prices',
  'orders',
  'order_items',
  'services',
  'invoices',
  'invoice_items',
  'payments',
];

before(async () => {
  validateBrowserDatabaseUrl(url, schema);
  prisma = createPrismaClient(url);
  await assertBrowserDatabaseScope(prisma, url, schema);
  pool = new Pool({ connectionString: url, max: 1 });
  single = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
  await assertBrowserDatabaseScope(single, url, schema);
});
after(async () => {
  if (prisma) await prisma.$disconnect();
  if (single) await single.$disconnect();
  if (pool) await pool.end();
});

function unavailable(error: unknown): boolean {
  assert.ok(error instanceof CurrencyAdoptionPreflightError);
  assert.equal(error.code, 'OBSERVATION_FAILED');
  assert.equal(error.cause, undefined);
  return true;
}

function hasSqlState(error: unknown, state: string, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 5) return false;
  const value = error as Record<string, unknown>;
  if (value.code === state || value.originalCode === state) return true;
  return ['meta', 'cause', 'driverAdapterError'].some((key) =>
    hasSqlState(value[key], state, depth + 1),
  );
}

// Test-only interception of an injected client. No production hooks/callbacks.
function intercepted(
  beforeQuery?: (tx: Prisma.TransactionClient, sql: string) => Promise<void>,
  start?: (tx: Prisma.TransactionClient) => Promise<void>,
): CurrencyAdoptionPreflightClient {
  return {
    $transaction: async <T>(
      body: (tx: Prisma.TransactionClient) => Promise<T>,
      options: {
        isolationLevel: 'RepeatableRead';
        maxWait: number;
        timeout: number;
      },
    ) =>
      single.$transaction(async (tx) => {
        if (start) await start(tx);
        const wrapped = {
          $executeRawUnsafe: tx.$executeRawUnsafe.bind(tx),
          $queryRawUnsafe: async <R>(
            sql: string,
            ...values: unknown[]
          ): Promise<R> => {
            if (beforeQuery) await beforeQuery(tx, sql);
            return tx.$queryRawUnsafe<R>(sql, ...values);
          },
        } as unknown as Prisma.TransactionClient;
        return body(wrapped);
      }, options),
  } as unknown as CurrencyAdoptionPreflightClient;
}

async function snapshot(): Promise<Record<string, string[]>> {
  await assertBrowserDatabaseScope(prisma, url, schema);
  const names = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT c.relname::text AS name FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname=$1 AND c.relkind='r' ORDER BY c.relname`,
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
    ).map((row) => row.row);
  }
  return result;
}

async function invoice(
  code: string,
  status: 'DRAFT' | 'CANCELLED' | 'PAID' = 'DRAFT',
) {
  const suffix = randomUUID();
  return prisma.invoice.create({
    data: {
      invoiceNumber: `F101-${suffix.slice(0, 20)}`,
      submissionKey: `fictional-preflight:${suffix}`,
      customerId,
      currency: code,
      status,
      subtotal: 0n,
      total: 0n,
      balanceDue: 0n,
      customerNameSnapshot: 'Fictional preflight customer',
      customerEmailSnapshot: 'preflight101@example.test',
      customerAddressSnapshot: { city: 'Fictional city' },
      businessIdentitySnapshot: { name: 'Fictional preflight business' },
      dueAt: at,
      ...(status === 'PAID' ? { paidAt: at } : {}),
      ...(status === 'CANCELLED' ? { cancelledAt: at } : {}),
      items: {
        create: {
          linePosition: 1,
          descriptionSnapshot: 'Fictional zero hosting',
          currency: code,
          unitAmount: 0n,
          lineTotal: 0n,
        },
      },
    },
  });
}

test('empty observation is not eligibility even with stored unit/policy facts; no rows change', async () => {
  assert.ok((await prisma.currencyUnitDefinition.count()) > 0);
  assert.ok((await prisma.currencyPolicyRevision.count()) > 0);
  const previous = await snapshot();
  const result = await inspectCurrencyAdoption(single, { schema });
  assert.equal(result.financialHistoryObserved, false);
  assert.deepEqual(
    result.tables.map((t) => t.table),
    moneyTables,
  );
  assert.ok(
    result.tables.every((t) => t.rowCount === '0' && t.codeGroups.length === 0),
  );
  assert.ok(result.limitations.includes('selection_authority_not_implemented'));
  assert.ok(result.limitations.includes('writer_coverage_not_established'));
  assert.ok(result.limitations.includes('adoption_assessment_not_established'));
  assert.equal('eligible' in result, false);
  assert.match(result.observedAt, /^\d{4}-\d\d-\d\dT.*Z$/);
  assert.deepEqual(await snapshot(), previous);
});

test('retired/deleted price is configuration, not financial history', async () => {
  const user = await prisma.user.create({
    data: {
      email: 'preflight101@example.test',
      role: 'CUSTOMER',
      deletedAt: at,
      customer: {
        create: {
          customerNumber: 'FICTIONAL-PREFLIGHT-101',
          firstName: 'Fictional',
          lastName: 'Preflight',
          addressLine1: '1 Fictional Road',
          city: 'Fictional city',
          countryCode: 'BD',
          deletedAt: at,
        },
      },
    },
    include: { customer: true },
  });
  customerId = user.customer!.id;
  const product = await prisma.product.create({
    data: {
      slug: 'fictional-preflight-101',
      name: 'Fictional hosting',
      provisioningAdapter: 'fake-panel',
      deletedAt: at,
    },
  });
  productId = product.id;
  const price = await prisma.productPrice.create({
    data: {
      productId,
      billingPeriod: 'MONTHLY',
      currency: 'USD',
      amount: 0n,
      isActive: false,
      deletedAt: at,
    },
  });
  priceId = price.id;
  const previous = await snapshot();
  const result = await inspectCurrencyAdoption(single, { schema });
  assert.equal(result.financialHistoryObserved, false);
  assert.equal(result.tables[0]!.rowCount, '1');
  assert.deepEqual(result.tables[0]!.codeGroups, [
    { code: 'USD', rowCount: '1' },
  ]);
  assert.deepEqual(await snapshot(), previous);
});

test('mixed zero/cancelled/draft/paid/failed/terminated history and deleted customers remain counted', async () => {
  const admin = await prisma.user.create({
    data: { email: 'preflight-admin101@example.test', role: 'ADMIN' },
  });
  const server = await prisma.server.create({
    data: {
      name: 'Fictional preflight server',
      hostname: 'preflight101.example.test',
      adapterKey: 'fake-panel',
    },
  });
  for (const currency of ['BDT', 'USD']) {
    const order = await prisma.order.create({
      data: {
        orderNumber: `F101-${currency}`,
        submissionKey: `fictional-order-101:${currency}`,
        customerId,
        status: currency === 'BDT' ? 'CANCELLED' : 'FAILED',
        currency,
        subtotal: 0n,
        total: 0n,
        customerEmailSnapshot: 'preflight101@example.test',
        items: {
          create: {
            productId,
            productPriceId: priceId,
            productNameSnapshot: 'Fictional hosting',
            billingPeriod: 'MONTHLY',
            currency,
            unitAmount: 0n,
            lineTotal: 0n,
          },
        },
      },
      include: { items: true },
    });
    await prisma.service.create({
      data: {
        customerId,
        orderItemId: order.items[0]!.id,
        productId,
        productPriceId: priceId,
        serverId: server.id,
        productNameSnapshot: 'Fictional hosting',
        billingPeriod: 'MONTHLY',
        currency,
        recurringAmount: 0n,
        startedAt: at,
        nextDueAt: new Date('2026-11-01T00:00:00.000Z'),
        status: 'TERMINATED',
        terminatedAt: at,
        terminationReason: 'Fictional history fixture',
        terminatedByUserId: admin.id,
        controlPanelUsername: `fictional101${currency.toLowerCase()}`,
        externalAccountId: `fictional-terminated-101:${currency}`,
      },
    });
    const inv = await invoice(
      currency,
      currency === 'BDT' ? 'CANCELLED' : 'DRAFT',
    );
    const payment = await prisma.payment.create({
      data: {
        invoiceId: inv.id,
        provider: 'fake',
        idempotencyKey: `fictional-payment-101:${currency}`,
        amount: 1n,
        currency,
        status: 'FAILED',
      },
    });
    await prisma.paymentEvent.create({
      data: {
        paymentId: currency === 'BDT' ? payment.id : undefined,
        provider: 'fake',
        providerEventId: `fictional-event-101:${currency}`,
        idempotencyKey: `fictional-event-101:${currency}`,
        eventType: 'fictional',
        payloadHash: 'a'.repeat(64),
        ...(currency === 'BDT'
          ? {
              normalizedPayload: {
                fictional: true,
                privateNote: 'Do not export fictional payload',
              },
            }
          : {}),
      },
    });
  }
  await invoice('USD', 'PAID');
  await prisma.setting.create({
    data: {
      key: 'fictional.preflight101',
      category: 'BUSINESS',
      value: { currency: 'BDT' },
    },
  });
  await prisma.activityLog.create({
    data: { action: 'FICTIONAL_PREFLIGHT_SETUP', entityType: 'TEST' },
  });
  await prisma.outboxEvent.create({
    data: {
      aggregateType: 'TEST',
      aggregateId: randomUUID(),
      eventType: 'FICTIONAL_TEST',
      idempotencyKey: 'fictional-preflight101-outbox',
      payload: { fictional: true },
    },
  });
  const previous = await snapshot();
  const result = await inspectCurrencyAdoption(single, { schema });
  assert.equal(result.financialHistoryObserved, true);
  assert.deepEqual(
    result.tables.map((t) => t.rowCount),
    ['1', '2', '2', '2', '3', '3', '2'],
  );
  assert.deepEqual(result.tables[4]!.codeGroups, [
    { code: 'BDT', rowCount: '1' },
    { code: 'USD', rowCount: '2' },
  ]);
  assert.deepEqual(result.gatewayEvidence, {
    rowCount: '2',
    linkedRowCount: '1',
    unlinkedRowCount: '1',
    normalizedEvidenceRowCount: '1',
  });
  assert.ok(
    result.limitations.includes(
      'gateway_payload_and_obligation_consistency_not_assessed',
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /privateNote|Do not export|example\.test|subtotal|amount|balanceDue/,
  );
  assert.deepEqual(await snapshot(), previous);
});

test('32 displayed groups plus overflow retain all configuration counts and unknown codes', async () => {
  const codes = Array.from(
    { length: 33 },
    (_, i) =>
      `X${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
  );
  await prisma.productPrice.createMany({
    data: codes.map((currency) => ({
      productId,
      currency,
      billingPeriod: 'MONTHLY',
      amount: 0n,
      isActive: false,
      deletedAt: at,
    })),
  });
  const previous = await snapshot();
  const result = await inspectCurrencyAdoption(single, { schema });
  const prices = result.tables[0]!;
  assert.equal(prices.rowCount, '34');
  assert.equal(prices.codeGroups.length, 32);
  assert.equal(prices.codeGroupsTruncated, true);
  assert.equal(prices.omittedCodeRowCount, '2');
  assert.ok(prices.codeGroups.some((g) => g.code === 'XAA'));
  assert.equal(prices.legacyUnitAndPolicy, 'not_recorded_in_schema');
  assert.deepEqual(await snapshot(), previous);
});

test('one consistent snapshot excludes another connection commit across multiple tables', async () => {
  const baseline = await inspectCurrencyAdoption(single, { schema });
  let committed = false;
  const client = intercepted(async (_tx, sql) => {
    if (!committed && sql.includes('GROUP BY')) {
      committed = true;
      await invoice('XZZ');
      await prisma.order.create({
        data: {
          orderNumber: 'F101-INTERLEAVE',
          submissionKey: randomUUID(),
          customerId,
          currency: 'XZZ',
          subtotal: 0n,
          total: 0n,
          customerEmailSnapshot: 'preflight101@example.test',
        },
      });
    }
  });
  const during = await inspectCurrencyAdoption(client, { schema });
  assert.ok(committed);
  assert.deepEqual(during.tables, baseline.tables);
  assert.deepEqual(during.gatewayEvidence, baseline.gatewayEvidence);
  const afterCommit = await inspectCurrencyAdoption(single, { schema });
  assert.equal(
    BigInt(afterCommit.tables[1]!.rowCount),
    BigInt(baseline.tables[1]!.rowCount) + 1n,
  );
  assert.equal(
    BigInt(afterCommit.tables[4]!.rowCount),
    BigInt(baseline.tables[4]!.rowCount) + 1n,
  );
});

test('database read-only rejects attempted persistent write and no partial observation escapes', async () => {
  const previous = await snapshot();
  let denied = false;
  const client = intercepted(async (tx, sql) => {
    if (sql.includes('pg_class')) {
      try {
        await tx.$executeRawUnsafe(
          `INSERT INTO "${schema}".settings (id,key,category,value,updated_at) VALUES ($1::uuid,'fictional-forbidden101','BUSINESS','{}',now())`,
          randomUUID(),
        );
      } catch (error) {
        denied = hasSqlState(error, '25006');
        throw error;
      }
    }
  });
  await assert.rejects(
    inspectCurrencyAdoption(client, { schema }),
    unavailable,
  );
  assert.ok(denied);
  assert.deepEqual(await snapshot(), previous);
});

test('restrictive RLS and missing privileges fail, never imply empty history; no global role creation', async () => {
  await assertBrowserDatabaseScope(prisma, url, schema);
  const previous = await snapshot();
  await prisma.$executeRawUnsafe(
    `CREATE POLICY fictional_preflight101_deny ON "${schema}".orders USING (false)`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "${schema}".orders ENABLE ROW LEVEL SECURITY`,
  );
  try {
    const restricted = intercepted(undefined, async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE pg_read_all_data');
    });
    await assert.rejects(
      inspectCurrencyAdoption(restricted, { schema }),
      unavailable,
    );
    const denied = intercepted(undefined, async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE pg_read_all_stats');
    });
    await assert.rejects(
      inspectCurrencyAdoption(denied, { schema }),
      unavailable,
    );
  } finally {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${schema}".orders DISABLE ROW LEVEL SECURITY`,
    );
    await prisma.$executeRawUnsafe(
      `DROP POLICY fictional_preflight101_deny ON "${schema}".orders`,
    );
  }
  assert.deepEqual(await snapshot(), previous);
  await assertBrowserDatabaseScope(single, url, schema);
});

test('acquisition deadline rejects a busy single-connection pool without later leaking a transaction', async () => {
  const previous = await snapshot();
  await single.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe('SELECT 1');
      await assert.rejects(
        inspectCurrencyAdoption(single, {
          schema,
          limits: { acquisitionMs: 30 },
        }),
        unavailable,
      );
    },
    { timeout: 3_000 },
  );
  await assertBrowserDatabaseScope(single, url, schema);
  await inspectCurrencyAdoption(single, { schema });
  assert.deepEqual(await snapshot(), previous);
});

test('statement/lock/transaction deadlines abort safely and release the pooled connection', async () => {
  const previous = await snapshot();
  let attempts = 0;
  const slow = intercepted(async (tx, sql) => {
    if (sql.includes('pg_class')) {
      attempts++;
      await tx.$queryRawUnsafe('SELECT pg_catalog.pg_sleep(0.2)');
    }
  });
  await assert.rejects(
    inspectCurrencyAdoption(slow, { schema, limits: { statementMs: 30 } }),
    unavailable,
  );
  assert.equal(attempts, 1);
  await assertBrowserDatabaseScope(single, url, schema);
  // Separate guarded connection holds only a fictional table lock.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `LOCK TABLE "${schema}".orders IN ACCESS EXCLUSIVE MODE`,
    );
    await assert.rejects(
      inspectCurrencyAdoption(single, { schema, limits: { lockMs: 30 } }),
      unavailable,
    );
  });
  await assertBrowserDatabaseScope(single, url, schema);
  // Overall server deadline is shorter than the sleep and statement ceiling.
  await assert.rejects(
    inspectCurrencyAdoption(slow, {
      schema,
      limits: { transactionMs: 100, statementMs: 1_000 },
    }),
    unavailable,
  );
  await assertBrowserDatabaseScope(single, url, schema);
  assert.deepEqual(await snapshot(), previous);
});

test('transaction-local modes, deadlines, search path and role do not leak on one pooled connection', async () => {
  const settings = () =>
    single.$queryRawUnsafe<unknown[]>(`SELECT pg_backend_pid() AS pid,
    current_setting('transaction_isolation') AS isolation, current_setting('transaction_read_only') AS readonly,
    current_setting('row_security') AS rls, current_setting('search_path') AS path,
    current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock,
    current_setting('transaction_timeout') AS transaction, current_user AS actor`);
  const previous = await settings();
  await inspectCurrencyAdoption(single, {
    schema,
    limits: { lockMs: 100, statementMs: 500, transactionMs: 3_000 },
  });
  assert.deepEqual(await settings(), previous);
  await assertBrowserDatabaseScope(single, url, schema);
});

test('qualified source ignores a newly owned search-path decoy and missing tables fail closed', async () => {
  const owned = `command26_e2e_${randomUUID().replaceAll('-', '')}`;
  const ownedUrl = browserDatabaseUrl(url, owned);
  // Fresh scope only. No existing application schema adoption/reset/cleanup.
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "${owned}"`);
  const pg = new Client({ connectionString: ownedUrl });
  const decoy = createPrismaClient(ownedUrl);
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
    assert.equal(migrations.length, 26);
    for (const name of migrations)
      await pg.query(
        readFileSync(
          resolve('prisma/migrations', name, 'migration.sql'),
          'utf8',
        ),
      );
    await assertBrowserDatabaseScope(decoy, ownedUrl, owned, false);
    await decoy.$executeRawUnsafe(
      'CREATE TABLE __browser_e2e_scope (owner text NOT NULL)',
    );
    await decoy.$executeRawUnsafe(
      'INSERT INTO __browser_e2e_scope (owner) VALUES ($1)',
      owned,
    );
    await assertBrowserDatabaseScope(decoy, ownedUrl, owned);
    marked = true;
    const baseline = await inspectCurrencyAdoption(single, { schema });
    const client = intercepted(undefined, async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path = "${owned}"`);
    });
    assert.deepEqual(
      (await inspectCurrencyAdoption(client, { schema })).tables,
      baseline.tables,
    );
    await decoy.$executeRawUnsafe(
      'ALTER TABLE payment_events RENAME TO missing_events101',
    );
    await assert.rejects(
      inspectCurrencyAdoption(decoy, { schema: owned }),
      unavailable,
    );
    await decoy.$executeRawUnsafe(
      'ALTER TABLE missing_events101 RENAME TO payment_events',
    );
    await assertBrowserDatabaseScope(single, url, schema);
  } finally {
    if (marked) {
      await assertBrowserDatabaseScope(decoy, ownedUrl, owned);
      await decoy.$executeRawUnsafe(`DROP SCHEMA "${owned}" CASCADE`);
    }
    await decoy.$disconnect();
    await pg.end();
  }
});

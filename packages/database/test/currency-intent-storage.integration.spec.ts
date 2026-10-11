import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { Client, Query } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPrismaClient } from '../src/client';
import { appendCurrencyUnit } from '../src/currency-units';
import { appendCurrencyPolicyRevision } from '../src/currency-policies';
import {
  loadPinnedMigrations,
  productSnapshot,
} from './currency-privilege-harness.fixtures';
import type { TestConnection } from './currency-privilege-harness';
import { columns, intentTable } from './currency-intent-storage.fixtures';
import {
  assertBrowserDatabaseScope,
  browserDatabaseUrl,
  validateBrowserDatabaseUrl,
} from '../../../apps/web/e2e/database-scope';

const parentSchema = process.env.WEBHOST_BROWSER_E2E_SCHEMA ?? '';
const parentUrl = process.env.DATABASE_URL ?? '';
const migrations = loadPinnedMigrations();
let parent: PrismaClient;
let parentRaw: Client;
let baseline: Awaited<ReturnType<typeof productSnapshot>>;
function connection(c: Client): TestConnection {
  return {
    query: async (text, values) => {
      const r = await c.query<Record<string, unknown>>(text, values);
      return { rows: r.rows, rowCount: r.rowCount };
    },
    end: async () => undefined,
  };
}
function models(url: string, schema: string) {
  const queries: string[] = [];
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }, { schema }),
    log: [{ emit: 'event', level: 'query' }],
  });
  prisma.$on('query', (e) => queries.push(e.query)); // SQL shape only, never parameters.
  return { prisma, queries };
}
type Scope = Awaited<ReturnType<typeof bootstrap>>;
async function bootstrap(count = 27) {
  await assertBrowserDatabaseScope(parent, parentUrl, parentSchema);
  assert.equal(migrations.length, 27);
  const schema = `command26_e2e_${randomUUID().replaceAll('-', '')}`;
  const url = browserDatabaseUrl(parentUrl, schema);
  await parent.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const raw = new Client({ connectionString: url });
  await raw.connect();
  const traced = models(url, schema);
  assert.deepEqual(
    (await raw.query('SELECT current_schema() AS schema')).rows,
    [{ schema }],
  );
  for (const m of migrations.slice(0, count)) await raw.query(m.sql);
  await assertBrowserDatabaseScope(traced.prisma, url, schema, false);
  await raw.query(
    `CREATE TABLE "${schema}".__browser_e2e_scope(owner text NOT NULL)`,
  );
  await raw.query(`INSERT INTO "${schema}".__browser_e2e_scope VALUES($1)`, [
    schema,
  ]);
  await assertBrowserDatabaseScope(traced.prisma, url, schema);
  return { schema, url, raw, ...traced };
}
async function withScope(body: (s: Scope) => Promise<void>, count = 27) {
  const s = await bootstrap(count);
  try {
    await body(s);
  } finally {
    await s.raw.query('ROLLBACK');
    await assertBrowserDatabaseScope(s.prisma, s.url, s.schema);
    await s.prisma.$executeRawUnsafe(`DROP SCHEMA "${s.schema}" CASCADE`);
    await s.raw.end();
    await s.prisma.$disconnect();
  }
}
async function snapshot(s: Scope) {
  await assertBrowserDatabaseScope(s.prisma, s.url, s.schema);
  await s.raw.query(`SET search_path="${s.schema}",pg_catalog`);
  return productSnapshot(connection(s.raw), s.schema);
}
async function denied(s: Scope, body: () => Promise<unknown>, code = '23514') {
  const before = await snapshot(s);
  await assert.rejects(body(), (e) => {
    assert.ok(e instanceof Error);
    assert.equal(
      Reflect.get(e, 'code'),
      code,
      'Exact database adapter rejection code',
    );
    if (code === 'P2039') {
      const meta: unknown = Reflect.get(e, 'meta');
      assert.ok(meta !== null && typeof meta === 'object');
      const adapter: unknown = Reflect.get(meta, 'driverAdapterError');
      assert.ok(adapter !== null && typeof adapter === 'object');
      const cause: unknown = Reflect.get(adapter, 'cause');
      assert.ok(cause !== null && typeof cause === 'object');
      assert.equal(Reflect.get(cause, 'originalCode'), '23514');
    }
    return true;
  });
  assert.deepEqual(await snapshot(s), before);
}

// Private fixture qualification, not a new product read/repository/authority entry.
async function qualified(s: Scope, reader = s) {
  await assertBrowserDatabaseScope(reader.prisma, reader.url, s.schema);
  return reader.prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe('SET LOCAL row_security=off');
      const context = await tx.$queryRawUnsafe<{ schema: string }[]>(
        'SELECT current_schema() AS schema',
      );
      assert.deepEqual(context, [{ schema: s.schema }]);
      const catalog = await tx.$queryRawUnsafe<
        {
          kind: string;
          rls: boolean;
          forced: boolean;
          columns: number;
          defaults: number;
          nullable: number;
        }[]
      >(
        `SELECT c.relkind::text AS kind,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,
      (SELECT count(*)::int FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
      (SELECT count(*)::int FROM pg_catalog.pg_attrdef d WHERE d.adrelid=c.oid) AS defaults,
      (SELECT count(*)::int FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND NOT a.attnotnull) AS nullable
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2`,
        s.schema,
        intentTable,
      );
      assert.deepEqual(catalog, [
        {
          kind: 'r',
          rls: false,
          forced: false,
          columns: 12,
          defaults: 0,
          nullable: 1,
        },
      ]);
      const sql = await tx.$queryRawUnsafe<unknown[]>(
        `SELECT * FROM "${s.schema}".${intentTable}`,
      );
      const queryStart = reader.queries.length;
      const rows = await tx.currencySelectionIntent.findMany();
      const modelQueries = reader.queries.slice(queryStart);
      assert.equal(modelQueries.length, 1);
      assert.ok(
        modelQueries[0]?.includes(`FROM "${s.schema}"."${intentTable}"`),
        'Model namespace differs from attested raw catalog',
      );
      assert.deepEqual(sql, []);
      assert.deepEqual(rows, []);
      return rows;
    },
    { isolationLevel: 'RepeatableRead', maxWait: 1500, timeout: 2500 },
  );
}

before(async () => {
  validateBrowserDatabaseUrl(parentUrl, parentSchema);
  parent = createPrismaClient(parentUrl);
  parentRaw = new Client({ connectionString: parentUrl });
  await parentRaw.connect();
  await assertBrowserDatabaseScope(parent, parentUrl, parentSchema);
  baseline = await productSnapshot(connection(parentRaw), parentSchema);
});
after(async () => {
  try {
    await assertBrowserDatabaseScope(parent, parentUrl, parentSchema);
    assert.deepEqual(
      await productSnapshot(connection(parentRaw), parentSchema),
      baseline,
    );
  } finally {
    await parentRaw?.end();
    await parent?.$disconnect();
  }
});

test('all 27 migrations leave exact model/raw intent storage closed and empty', async () => {
  await withScope(async (s) => {
    assert.deepEqual(await qualified(s), []);
    assert.ok(
      s.queries.some((q) => q.includes(`"${s.schema}"."${intentTable}"`)),
    );
    assert.equal(await s.prisma.currencySelectionIntent.count(), 0);
    const actual = (
      await s.raw.query(
        'SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',
        [s.schema, intentTable],
      )
    ).rows;
    assert.deepEqual(
      actual.map((r) => r.column_name),
      columns,
    );
    assert.equal(await s.prisma.currencyInstallation.count(), 0);
    assert.equal(await s.prisma.currencyExecutionDomain.count(), 0);
    assert.equal(await s.prisma.currencyControl.count(), 0);
  });
});
test('owner statements, no-op conflict/MERGE/nested writes and transaction recovery cannot open the store', async () => {
  await withScope(async (s) => {
    const table = `"${s.schema}".${intentTable}`;
    for (const sql of [
      `INSERT INTO ${table} DEFAULT VALUES`,
      `INSERT INTO ${table} SELECT * FROM ${table} WHERE false`,
      `INSERT INTO ${table} SELECT * FROM ${table} WHERE false ON CONFLICT (installation_id,request_key_uuid) DO UPDATE SET action=EXCLUDED.action`,
      `UPDATE ${table} SET action=action WHERE false`,
      `DELETE FROM ${table} WHERE false`,
      `TRUNCATE ${table}`,
      `WITH attempted AS (INSERT INTO ${table} SELECT * FROM ${table} WHERE false RETURNING *) SELECT * FROM attempted`,
      `MERGE INTO ${table} AS d USING (SELECT * FROM ${table} WHERE false) AS s ON d.installation_id=s.installation_id WHEN MATCHED THEN DELETE`,
    ])
      await denied(s, () => s.raw.query(sql));
    const before = await snapshot(s);
    await s.raw.query('BEGIN; SAVEPOINT attempt');
    await assert.rejects(
      s.raw.query(`DELETE FROM ${table} WHERE false`),
      (e) => e instanceof Error && Reflect.get(e, 'code') === '23514',
    );
    await s.raw.query('ROLLBACK TO attempt; COMMIT');
    assert.deepEqual(await snapshot(s), before);
    await denied(
      s,
      () =>
        s.prisma.currencySelectionIntent.create({
          data: {
            installationId: '10000000-0000-4000-8000-000000000001',
            requestKeyUuid: '10000000-0000-4000-8000-000000000002',
            executionDomainId: '10000000-0000-4000-8000-000000000002',
            actorUserId: '20000000-0000-4000-8000-000000000001',
            sessionId: '20000000-0000-4000-8000-000000000003',
            requestKeyText: '10000000-0000-4000-8000-000000000002',
            action: 'initialize',
            expectedGeneration: 0n,
            proposedRevision: 'fictional-v1',
            canonicalText: 'Rejected fictional attempt',
            stableIntentDigest: 'a'.repeat(64),
          },
        }),
      'P2039',
    );
  });
});
class CopyFixture extends Query<Record<string, unknown>, []> {
  constructor(
    sql: string,
    private readonly data: string,
  ) {
    super(sql);
  }
  handleCopyInResponse(c: {
    sendCopyFromChunk(b: Buffer): void;
    endCopyFrom(): void;
  }) {
    c.sendCopyFromChunk(Buffer.from(this.data));
    c.endCopyFrom();
  }
}
function copy(s: Scope, data: string) {
  return new Promise<void>((resolve, reject) => {
    const q = new CopyFixture(
      `COPY "${s.schema}".${intentTable} FROM STDIN`,
      data,
    );
    q.once('error', reject);
    q.once('end', () => resolve());
    s.raw.query(q);
  });
}
test('real COPY including empty input follows the closed statement INSERT guard', async () => {
  await withScope(async (s) => {
    for (const data of ['', Array(12).fill('\\N').join('\t') + '\n'])
      await denied(s, () => copy(s, data));
    assert.deepEqual(await qualified(s), []);
  });
});
test('qualified fixture refuses other model/raw namespaces and RLS even when all counts are zero', async () => {
  await withScope(async (s) => {
    await withScope(async (other) => {
      const wrongModel = models(s.url, other.schema);
      const wrongRaw = models(other.url, s.schema);
      try {
        await assert.rejects(qualified(s, { ...s, ...wrongModel }));
        await assert.rejects(
          qualified(s, { ...s, ...wrongRaw, url: other.url }),
        );
      } finally {
        await wrongModel.prisma.$disconnect();
        await wrongRaw.prisma.$disconnect();
      }
    });
    await s.raw.query(
      `ALTER TABLE "${s.schema}".${intentTable} ENABLE ROW LEVEL SECURITY; ALTER TABLE "${s.schema}".${intentTable} FORCE ROW LEVEL SECURITY`,
    );
    await assert.rejects(qualified(s));
    await s.raw.query(
      `ALTER TABLE "${s.schema}".${intentTable} NO FORCE ROW LEVEL SECURITY; ALTER TABLE "${s.schema}".${intentTable} DISABLE ROW LEVEL SECURITY`,
    );
    assert.deepEqual(await qualified(s), []);
  });
});

async function priorFacts(s: Scope) {
  const m = s.prisma;
  const customer = await m.user.create({
    data: {
      email: 'intent-history@example.test',
      role: 'CUSTOMER',
      customer: {
        create: {
          customerNumber: 'FICTIONAL-115',
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
  const customerId = customer.customer!.id;
  const admin = await m.user.create({
    data: {
      email: 'intent-admin@example.test',
      role: 'ADMIN',
      adminProfile: { create: { displayName: 'Fictional operator' } },
    },
  });
  const session = await m.authSession.create({
    data: {
      userId: admin.id,
      tokenHash: '1'.repeat(64),
      expiresAt: new Date('2099-01-01Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      lastSeenAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });
  await m.adminTotpCredential.create({
    data: {
      userId: admin.id,
      secretCiphertext: 'Fictional opaque fixture, not a credential',
      keyVersion: 'fictional',
      recoveryCodes: { create: { codeHash: '2'.repeat(64) } },
    },
  });
  const product = await m.product.create({
    data: {
      slug: 'fictional-115',
      name: 'Fictional hosting',
      provisioningAdapter: 'fake-panel',
    },
  });
  const price = await m.productPrice.create({
    data: {
      productId: product.id,
      billingPeriod: 'ANNUAL',
      currency: 'USD',
      amount: 100n,
    },
  });
  const order = await m.order.create({
    data: {
      orderNumber: 'FICTIONAL-ORDER-115',
      submissionKey: randomUUID(),
      customerId,
      currency: 'USD',
      subtotal: 100n,
      total: 100n,
      customerEmailSnapshot: customer.email,
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
  const server = await m.server.create({
    data: {
      name: 'Fictional server',
      hostname: 'intent.example.test',
      adapterKey: 'fake-panel',
    },
  });
  await m.service.create({
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
  const invoice = await m.invoice.create({
    data: {
      invoiceNumber: 'FICTIONAL-INV-115',
      submissionKey: randomUUID(),
      customerId,
      orderId: order.id,
      currency: 'USD',
      subtotal: 100n,
      total: 100n,
      balanceDue: 100n,
      customerNameSnapshot: 'Fictional History',
      customerEmailSnapshot: customer.email,
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
  await m.payment.create({
    data: {
      invoiceId: invoice.id,
      provider: 'fake',
      idempotencyKey: 'fictional-payment-115',
      amount: 100n,
      currency: 'USD',
    },
  });
  await m.setting.create({
    data: {
      key: 'business.localization',
      category: 'BUSINESS',
      value: { currency: 'BDT', timezone: 'Asia/Dhaka' },
    },
  });
  await m.activityLog.create({
    data: {
      actorUserId: admin.id,
      action: 'fictional.intent-history',
      entityType: 'Invoice',
      entityId: invoice.id,
      metadata: { fictional: true },
    },
  });
  await m.outboxEvent.create({
    data: {
      aggregateType: 'Invoice',
      aggregateId: invoice.id,
      eventType: 'fictional.intent-history',
      idempotencyKey: 'fictional-intent-history',
      payload: { fictional: true },
    },
  });
  await m.paymentEvent.create({
    data: {
      provider: 'fake',
      providerEventId: 'fictional-event-115',
      idempotencyKey: 'fictional-event-115',
      eventType: 'fictional',
      payloadHash: '0'.repeat(64),
      normalizedPayload: { fictional: true },
    },
  });
  const unit = {
    code: 'XAA',
    metadataVersion: 'intent-history-v1',
    minorUnitExponent: 2,
    provenance: 'Authored fictional intent history metadata',
    status: 'current',
  } as const;
  await appendCurrencyUnit(m, unit);
  const ref = { code: unit.code, metadataVersion: unit.metadataVersion };
  await appendCurrencyPolicyRevision(m, {
    revision: 'intent-history-v1',
    base: ref,
    defaultBrowsing: ref,
    currencies: [
      {
        unit: ref,
        capabilities: { display: true, newSales: false, collection: false },
      },
    ],
  });
  await m.currencyControl.create({ data: { id: 1 } });
  const installationId = '10000000-0000-4000-8000-000000000001';
  await m.currencyInstallation.create({
    data: {
      id: 1,
      installationId,
      createdAt: new Date('2026-01-01T00:00:00.123Z'),
    },
  });
  await m.currencyExecutionDomain.create({
    data: {
      id: '10000000-0000-4000-8000-000000000002',
      installationId,
      databaseName: 'fictional_database',
      schemaName: 'fictional_schema',
      placementManifestDigest: 'a'.repeat(64),
      createdAt: new Date('2026-01-01T00:00:00.123Z'),
    },
  });
  return { admin, session };
}
test('atomic additive migration preserves every prior-26 row, old guard and auth/security behavior', async () => {
  await withScope(async (s) => {
    const { admin, session } = await priorFacts(s);
    const before = await snapshot(s);
    const populated = [
      'users',
      'admin_profiles',
      'auth_sessions',
      'admin_totp_credentials',
      'admin_recovery_codes',
      'customers',
      'products',
      'product_prices',
      'orders',
      'order_items',
      'servers',
      'services',
      'invoices',
      'invoice_items',
      'payments',
      'settings',
      'activity_logs',
      'outbox_events',
      'payment_events',
      'currency_unit_definitions',
      'currency_policy_revisions',
      'currency_controls',
      'currency_installations',
      'currency_execution_domains',
    ];
    for (const table of populated)
      assert.ok(
        Array.isArray(before.rows[table]) &&
          (before.rows[table] as unknown[]).length > 0,
        `Missing fictional preservation fact: ${table}`,
      );
    assert.equal(
      migrations[26]?.name,
      '20261011090000_closed_currency_selection_intents',
    );
    await s.raw.query(migrations[26]!.sql);
    const after = await snapshot(s);
    for (const [table, rows] of Object.entries(before.rows))
      assert.deepEqual(after.rows[table], rows);
    for (const [kind, key] of [
      ['objects', 'relname'],
      ['constraints', 'conname'],
      ['triggers', 'tgname'],
      ['functions', 'proname'],
    ] as const) {
      const names = new Set(before[kind].map((row) => row[key]));
      assert.deepEqual(
        after[kind].filter((row) => names.has(row[key])),
        before[kind],
      );
    }
    assert.deepEqual(await qualified(s), []);
    assert.deepEqual(
      (await s.prisma.currencyControl.findUnique({ where: { id: 1 } }))
        ?.generation,
      0n,
    );
    assert.equal(
      (await s.prisma.currencyControl.findUnique({ where: { id: 1 } }))
        ?.historyLatched,
      null,
    );
    const own = await s.prisma.authSession.findUnique({
      where: { id_userId: { id: session.id, userId: admin.id } },
    });
    assert.equal(own?.id, session.id);
    await s.prisma.authSession.update({
      where: { id: session.id },
      data: {
        revokedAt: new Date('2026-10-11T00:00:00.000Z'),
        revokedReason: 'Fictional review',
      },
    });
    await s.prisma.user.update({
      where: { id: admin.id },
      data: { status: 'DISABLED' },
    });
    assert.equal(await s.prisma.currencySelectionIntent.count(), 0);
    assert.deepEqual(
      loadPinnedMigrations().map((m) => m.rawHash),
      migrations.map((m) => m.rawHash),
    );
  }, 26);
});

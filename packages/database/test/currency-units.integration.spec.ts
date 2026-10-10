import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { createPrismaClient } from '../src/client';
import type { PrismaClient } from '../src/generated/prisma/client';
import {
  appendCurrencyUnit,
  readExactCurrencyUnits,
} from '../src/currency-units';
import type { CurrencyUnitDefinition } from '@webhost-billing/shared/currency-arithmetic';
import {
  appendCurrencyPolicyRevision,
  readExactCurrencyPolicyRevision,
} from '../src/currency-policies';
import {
  assertBrowserDatabaseScope,
  browserDatabaseUrl,
  validateBrowserDatabaseUrl,
} from '../../../apps/web/e2e/database-scope';

const schema = process.env.WEBHOST_BROWSER_E2E_SCHEMA ?? '';
const url = process.env.DATABASE_URL ?? '';
let prisma: PrismaClient;
const fictional: CurrencyUnitDefinition = {
  code: 'XAA',
  metadataVersion: 'authored-v1',
  minorUnitExponent: 3,
  provenance: 'Authored fictional regression metadata',
  status: 'historical',
};
const ref = (d: CurrencyUnitDefinition) => ({
  code: d.code,
  metadataVersion: d.metadataVersion,
});

before(async () => {
  validateBrowserDatabaseUrl(url, schema);
  prisma = createPrismaClient(url);
  await assertBrowserDatabaseScope(prisma, url, schema);
});
after(async () => {
  if (prisma) await prisma.$disconnect();
});

test('guard refuses non-loopback, unmarked, overridden and raw/model mismatched targets', async () => {
  assert.throws(() =>
    browserDatabaseUrl(
      'postgresql://invalid:invalid@production.example.test/db',
      schema,
    ),
  );
  assert.throws(() =>
    browserDatabaseUrl(
      'postgresql://invalid:invalid@127.0.0.1/db?host=production.example.test',
      schema,
    ),
  );
  assert.throws(() => browserDatabaseUrl(url, 'public'));
  const mismatch = new URL(url);
  mismatch.searchParams.set('options', '-csearch_path=public');
  assert.throws(() => validateBrowserDatabaseUrl(mismatch.toString(), schema));
  const unmarked = browserDatabaseUrl(
    url,
    `command26_e2e_${randomUUID().replaceAll('-', '')}`,
  );
  const client = createPrismaClient(unmarked);
  try {
    await assert.rejects(
      assertBrowserDatabaseScope(
        client,
        unmarked,
        new URL(unmarked).searchParams.get('schema')!,
      ),
    );
  } finally {
    await client.$disconnect();
  }
});

test('migration leaves an empty store with no installed registry', async () => {
  assert.equal(await prisma.currencyUnitDefinition.count(), 0);
  await assert.rejects(readExactCurrencyUnits(prisma, [ref(fictional)]));
  const columns = await prisma.$queryRaw<{ data_type: string }[]>`
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = ${schema} AND table_name = 'currency_unit_definitions' AND column_name = 'created_at'
  `;
  assert.equal(columns[0]?.data_type, 'timestamp with time zone');
});

test('identical replays preserve server timestamp and copied exact historical facts', async () => {
  assert.deepEqual(await appendCurrencyUnit(prisma, fictional), fictional);
  const first = await prisma.currencyUnitDefinition.findUniqueOrThrow({
    where: { code_metadataVersion: ref(fictional) },
  });
  assert.ok(first.createdAt instanceof Date);
  assert.deepEqual(await appendCurrencyUnit(prisma, fictional), fictional);
  assert.deepEqual(
    await prisma.currencyUnitDefinition.findUniqueOrThrow({
      where: { code_metadataVersion: ref(fictional) },
    }),
    first,
  );
  const newer: CurrencyUnitDefinition = {
    ...fictional,
    metadataVersion: 'authored-v2',
    minorUnitExponent: 2,
    status: 'current',
  };
  await appendCurrencyUnit(prisma, newer);
  const result = await readExactCurrencyUnits(prisma, [
    ref(newer),
    ref(fictional),
  ]);
  assert.deepEqual(result, [newer, fictional]);
  result[1]!.minorUnitExponent = 0;
  assert.deepEqual(await readExactCurrencyUnits(prisma, [ref(fictional)]), [
    fictional,
  ]);
  await assert.rejects(
    readExactCurrencyUnits(prisma, [
      ref(fictional),
      { code: 'XAB', metadataVersion: fictional.metadataVersion },
    ]),
  );
  await assert.rejects(
    readExactCurrencyUnits(prisma, [ref(fictional), ref(fictional)]),
  );
});

test('ordinary UPDATE, DELETE and TRUNCATE cannot rewrite even empty/no-op statements', async () => {
  const before = await prisma.currencyUnitDefinition.findMany({
    orderBy: [{ code: 'asc' }, { metadataVersion: 'asc' }],
  });
  for (const sql of [
    'UPDATE currency_unit_definitions SET minor_unit_exponent = 0',
    'UPDATE currency_unit_definitions SET provenance = provenance',
    "UPDATE currency_unit_definitions SET status = 'current' WHERE false",
    'DELETE FROM currency_unit_definitions',
    'DELETE FROM currency_unit_definitions WHERE false',
    'TRUNCATE currency_unit_definitions',
  ])
    await assert.rejects(prisma.$executeRawUnsafe(sql));
  await assert.rejects(
    prisma.currencyUnitDefinition.update({
      where: { code_metadataVersion: ref(fictional) },
      data: { metadataVersion: 'rewrite' },
    }),
  );
  assert.deepEqual(
    await prisma.currencyUnitDefinition.findMany({
      orderBy: [{ code: 'asc' }, { metadataVersion: 'asc' }],
    }),
    before,
  );
});

test('direct SQL enforces identifiers, exponent, provenance, status, nulls and uniqueness', async () => {
  const sql =
    'INSERT INTO currency_unit_definitions (code,metadata_version,minor_unit_exponent,provenance,status) VALUES ($1,$2,$3,$4,$5)';
  const valid = ['XAB', 'sql-v1', 2, 'Authored SQL fixture', 'current'];
  for (const [index, replacement] of [
    [0, 'xaa'],
    [0, 'AA'],
    [0, 'AAAA'],
    [0, 'XÅA'],
    [0, null],
    [1, ''],
    [1, '-v'],
    [1, 'v\n'],
    [1, 'v'.repeat(65)],
    [1, 'v/1'],
    [2, -1],
    [2, 5],
    [2, null],
    [2, '1.5'],
    [3, ''],
    [3, ' source'],
    [3, 'source '],
    [3, 'source\n'],
    [3, 'é'],
    [3, 'x'.repeat(257)],
    [4, 'CURRENT'],
    [4, 'retired'],
    [4, null],
  ] as const) {
    const values: unknown[] = [...valid];
    values[index] = replacement;
    await assert.rejects(prisma.$executeRawUnsafe(sql, ...values));
  }
  await prisma.$executeRawUnsafe(sql, ...valid);
  await assert.rejects(prisma.$executeRawUnsafe(sql, ...valid));
  const boundary = {
    ...fictional,
    code: 'XAC',
    metadataVersion: 'v'.repeat(64),
    provenance: 'x'.repeat(256),
    minorUnitExponent: 4,
    status: 'current',
  };
  await appendCurrencyUnit(prisma, boundary);
  assert.equal(
    await prisma.currencyUnitDefinition.count({ where: { code: 'XAB' } }),
    1,
  );
});

test('concurrent identical and conflicting appends retain one immutable winner', async () => {
  const value = { ...fictional, code: 'XAD', metadataVersion: 'concurrent' };
  const results = await Promise.all(
    Array.from({ length: 8 }, () => appendCurrencyUnit(prisma, value)),
  );
  results.forEach((r) => assert.deepEqual(r, value));
  assert.equal(
    await prisma.currencyUnitDefinition.count({ where: ref(value) }),
    1,
  );
  for (const [index, changes] of [
    { minorUnitExponent: 2 },
    { status: 'current' },
    { provenance: 'Different evidence' },
  ].entries()) {
    const one = {
      ...fictional,
      code: 'XAE',
      metadataVersion: `conflict-${index}`,
    };
    const two = { ...one, ...changes };
    const outcomes = await Promise.allSettled([
      appendCurrencyUnit(prisma, one),
      appendCurrencyUnit(prisma, two),
    ]);
    assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter((o) => o.status === 'rejected').length, 1);
    const winner = outcomes.find((o) => o.status === 'fulfilled');
    assert.ok(winner?.status === 'fulfilled');
    assert.deepEqual(await readExactCurrencyUnits(prisma, [ref(one)]), [
      winner.value,
    ]);
    assert.equal(
      await prisma.currencyUnitDefinition.count({ where: ref(one) }),
      1,
    );
  }
});

test('transaction replays remain usable, while rollback and conflicts leave no partial append', async () => {
  await prisma.$transaction(async (tx) => {
    await appendCurrencyUnit(tx, fictional);
    await appendCurrencyUnit(tx, fictional);
    assert.deepEqual(await readExactCurrencyUnits(tx, [ref(fictional)]), [
      fictional,
    ]);
  });
  const other = { ...fictional, code: 'XAF', metadataVersion: 'rollback' };
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await appendCurrencyUnit(tx, other);
      await appendCurrencyUnit(tx, { ...fictional, minorUnitExponent: 0 });
    }),
    /Conflicting/,
  );
  assert.equal(
    await prisma.currencyUnitDefinition.count({ where: ref(other) }),
    0,
  );
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await appendCurrencyUnit(tx, other);
      throw new Error('Authored rollback');
    }),
    /Authored rollback/,
  );
  assert.equal(
    await prisma.currencyUnitDefinition.count({ where: ref(other) }),
    0,
  );
});

for (const priorCount of [22, 23])
  test(`additive migration after ${priorCount} migrations preserves every pre-existing fictional row`, async () => {
    // New nonce scope only; apply the actual prior SQL chain before the new migration.
    const owned = `command26_e2e_${randomUUID().replaceAll('-', '')}`;
    const ownedUrl = browserDatabaseUrl(url, owned);
    const adminUrl = new URL(url);
    adminUrl.searchParams.set('schema', 'public');
    adminUrl.searchParams.delete('options');
    const admin = createPrismaClient(adminUrl.toString());
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${owned}"`);
    } finally {
      await admin.$disconnect();
    }
    const pg = new Client({ connectionString: ownedUrl });
    const client = createPrismaClient(ownedUrl);
    let marked = false;
    try {
      await pg.connect();
      const live = await pg.query(
        "SELECT current_schema() AS schema, current_setting('search_path') AS path",
      );
      assert.deepEqual(live.rows, [{ schema: owned, path: owned }]);
      const directory = resolve('prisma/migrations');
      const migrations = readdirSync(directory)
        .filter((n) => /^\d{14}_/.test(n))
        .sort();
      assert.equal(migrations[22], '20261007090000_currency_unit_definitions');
      assert.equal(migrations[23], '20261007100000_currency_policy_revisions');
      assert.equal(migrations.length, 26);
      for (const name of migrations.slice(0, priorCount))
        await pg.query(
          readFileSync(resolve(directory, name, 'migration.sql'), 'utf8'),
        );
      await assertBrowserDatabaseScope(client, ownedUrl, owned, false);
      await client.$executeRaw`CREATE TABLE __browser_e2e_scope (owner text NOT NULL)`;
      await client.$executeRaw`INSERT INTO __browser_e2e_scope (owner) VALUES (${owned})`;
      await assertBrowserDatabaseScope(client, ownedUrl, owned);
      marked = true;
      const user = await client.user.create({
        data: {
          email: 'currency-history@example.test',
          role: 'CUSTOMER',
          customer: {
            create: {
              customerNumber: 'FICTIONAL-98',
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
      const product = await client.product.create({
        data: {
          slug: 'fictional-98',
          name: 'Fictional hosting',
          provisioningAdapter: 'fake-panel',
        },
      });
      const price = await client.productPrice.create({
        data: {
          productId: product.id,
          billingPeriod: 'ANNUAL',
          currency: 'USD',
          amount: 100n,
        },
      });
      const server = await client.server.create({
        data: {
          name: 'Fictional server 98',
          hostname: 'currency98.example.test',
          adapterKey: 'fake-panel',
        },
      });
      await client.service.create({
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
      const invoice = await client.invoice.create({
        data: {
          invoiceNumber: 'FICTIONAL-INV-98',
          submissionKey: 'fictional-invoice-98',
          customerId,
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
      await client.payment.create({
        data: {
          invoiceId: invoice.id,
          provider: 'fake',
          idempotencyKey: 'fictional-payment-98',
          amount: 100n,
          currency: 'USD',
        },
      });
      await client.setting.create({
        data: {
          key: 'business.localization',
          category: 'BUSINESS',
          value: { currency: 'BDT', timezone: 'Asia/Dhaka' },
        },
      });
      const browsing = {
        ...fictional,
        code: 'XBA',
        status: 'current',
      } as const;
      if (priorCount === 23) {
        await appendCurrencyUnit(client, fictional);
        await appendCurrencyUnit(client, browsing);
      }
      const tables = (
        await pg.query<{ table_name: string }>(
          "SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name",
          [owned],
        )
      ).rows.map((r) => r.table_name);
      const snapshot = async () => {
        const result: Record<string, string[]> = {};
        for (const table of tables) {
          assert.match(table, /^[a-z_][a-z0-9_]*$/);
          result[table] = (
            await pg.query<{ row: string }>(
              `SELECT to_jsonb(t)::text AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`,
            )
          ).rows.map((r) => r.row);
        }
        return result;
      };
      const before = await snapshot();
      await pg.query(
        readFileSync(
          resolve(directory, migrations[priorCount]!, 'migration.sql'),
          'utf8',
        ),
      );
      if (priorCount === 22)
        assert.equal(await client.currencyUnitDefinition.count(), 0);
      else assert.equal(await client.currencyPolicyRevision.count(), 0);
      assert.deepEqual(await snapshot(), before);
      await appendCurrencyUnit(client, fictional);
      await appendCurrencyUnit(client, fictional);
      await readExactCurrencyUnits(client, [ref(fictional)]);
      await assert.rejects(
        appendCurrencyUnit(client, { ...fictional, provenance: 'Conflict' }),
      );
      if (priorCount === 23) {
        const policy = {
          revision: 'authored-history-revision',
          base: ref(fictional),
          defaultBrowsing: ref(browsing),
          currencies: [
            {
              unit: ref(fictional),
              capabilities: {
                display: false,
                newSales: false,
                collection: true,
              },
            },
            {
              unit: ref(browsing),
              capabilities: {
                display: true,
                newSales: false,
                collection: false,
              },
            },
          ],
        };
        await appendCurrencyPolicyRevision(client, policy);
        await appendCurrencyPolicyRevision(client, policy);
        await readExactCurrencyPolicyRevision(client, policy.revision);
        await assert.rejects(
          appendCurrencyPolicyRevision(client, {
            ...policy,
            base: ref(browsing),
          }),
        );
      }
      assert.deepEqual(await snapshot(), before);
    } finally {
      await pg.end();
      if (marked) {
        await assertBrowserDatabaseScope(client, ownedUrl, owned);
        await client.$executeRawUnsafe(`DROP SCHEMA "${owned}" CASCADE`);
      }
      await client.$disconnect();
    }
  });

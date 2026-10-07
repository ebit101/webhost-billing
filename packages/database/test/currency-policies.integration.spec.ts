import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createPrismaClient } from '../src/client';
import type { PrismaClient } from '../src/generated/prisma/client';
import { appendCurrencyUnit } from '../src/currency-units';
import {
  appendCurrencyPolicyRevision,
  readExactCurrencyPolicyRevision,
} from '../src/currency-policies';
import type { CurrencyPolicy } from '@webhost-billing/shared/currency-policy';
import type { CurrencyUnitDefinition } from '@webhost-billing/shared/currency-arithmetic';
import {
  assertBrowserDatabaseScope,
  validateBrowserDatabaseUrl,
} from '../../../apps/web/e2e/database-scope';

const schema = process.env.WEBHOST_BROWSER_E2E_SCHEMA ?? '';
const url = process.env.DATABASE_URL ?? '';
let prisma: PrismaClient;
const definitions: CurrencyUnitDefinition[] = ['XCA', 'XCB', 'XCC'].map(
  (code, i) => ({
    code,
    metadataVersion: 'authored-policy-v1',
    minorUnitExponent: i === 2 ? 4 : 2,
    provenance: 'Authored fictional database policy context',
    status: i === 2 ? 'historical' : 'current',
  }),
);
const ref = (d: CurrencyUnitDefinition) => ({
  code: d.code,
  metadataVersion: d.metadataVersion,
});
const fixture = (revision: string): CurrencyPolicy => ({
  revision,
  base: ref(definitions[2]!),
  defaultBrowsing: ref(definitions[0]!),
  preferredSecondary: ref(definitions[1]!),
  currencies: definitions.map((d) => ({
    unit: ref(d),
    capabilities: {
      display: d.status === 'current',
      newSales: false,
      collection: true,
    },
  })),
});
const insert = (revision: unknown, policy: unknown) =>
  prisma.$executeRawUnsafe(
    'INSERT INTO currency_policy_revisions (revision,policy) VALUES ($1,$2::jsonb)',
    revision,
    JSON.stringify(policy),
  );
before(async () => {
  validateBrowserDatabaseUrl(url, schema);
  prisma = createPrismaClient(url);
  await assertBrowserDatabaseScope(prisma, url, schema);
});
after(async () => {
  if (prisma) await prisma.$disconnect();
});

test('empty additive policy store has no selected policy or seeded defaults', async () => {
  assert.equal(await prisma.currencyPolicyRevision.count(), 0);
  await assert.rejects(
    readExactCurrencyPolicyRevision(prisma, 'missing'),
    /unavailable/,
  );
  for (const d of definitions) await appendCurrencyUnit(prisma, d);
});

test('complete copied snapshots replay with reordered entries and property keys', async () => {
  const policy = fixture('authored-complete');
  const initial = await appendCurrencyPolicyRevision(prisma, policy);
  assert.deepEqual(initial, { policy, definitions });
  const stored = await prisma.currencyPolicyRevision.findUniqueOrThrow({
    where: { revision: policy.revision },
  });
  assert.ok(stored.createdAt instanceof Date);
  const reordered = {
    ...policy,
    currencies: [...policy.currencies].reverse().map((e) => ({
      capabilities: {
        collection: e.capabilities.collection,
        newSales: e.capabilities.newSales,
        display: e.capabilities.display,
      },
      unit: { metadataVersion: e.unit.metadataVersion, code: e.unit.code },
    })),
  };
  assert.deepEqual(
    await appendCurrencyPolicyRevision(prisma, reordered),
    initial,
  );
  assert.deepEqual(
    await prisma.currencyPolicyRevision.findUniqueOrThrow({
      where: { revision: policy.revision },
    }),
    stored,
  );
  initial.policy.currencies[0]!.capabilities.newSales = true;
  initial.definitions[2]!.minorUnitExponent = 0;
  assert.deepEqual(
    await readExactCurrencyPolicyRevision(prisma, policy.revision),
    { policy, definitions },
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        await readExactCurrencyPolicyRevision(prisma, policy.revision),
      ),
    ),
    { policy, definitions },
  );
  // A different-base candidate is only another immutable snapshot, not activation.
  const candidate = {
    ...fixture('authored-other-base'),
    base: ref(definitions[1]!),
  };
  await appendCurrencyPolicyRevision(prisma, candidate);
  const newer = {
    ...definitions[2]!,
    metadataVersion: 'authored-policy-v2',
    minorUnitExponent: 2,
    status: 'current',
  } as const;
  await appendCurrencyUnit(prisma, newer);
  assert.deepEqual(
    await readExactCurrencyPolicyRevision(prisma, policy.revision),
    { policy, definitions },
  );
});

test('SQL canonicalizes entry order but never permits extending or mutating a snapshot', async () => {
  const policy = fixture('authored-sql-canonical');
  await insert(policy.revision, {
    ...policy,
    currencies: [...policy.currencies].reverse(),
  });
  assert.deepEqual(
    await readExactCurrencyPolicyRevision(prisma, policy.revision),
    { policy, definitions },
  );
  await assert.rejects(insert(policy.revision, policy));
  const before = await prisma.currencyPolicyRevision.findMany({
    orderBy: { revision: 'asc' },
  });
  for (const sql of [
    'UPDATE currency_policy_revisions SET policy=policy',
    "UPDATE currency_policy_revisions SET revision='changed' WHERE false",
    "UPDATE currency_policy_revisions SET policy=jsonb_set(policy,'{currencies}',policy->'currencies'||'[]'::jsonb)",
    'DELETE FROM currency_policy_revisions',
    'DELETE FROM currency_policy_revisions WHERE false',
    'TRUNCATE currency_policy_revisions',
  ])
    await assert.rejects(prisma.$executeRawUnsafe(sql));
  await assert.rejects(
    prisma.currencyPolicyRevision.update({
      where: { revision: policy.revision },
      data: { createdAt: new Date() },
    }),
  );
  assert.deepEqual(
    await prisma.currencyPolicyRevision.findMany({
      orderBy: { revision: 'asc' },
    }),
    before,
  );
});

test('direct SQL rejects malformed and incomplete snapshot shapes, identifiers and budgets', async () => {
  const policy = fixture('authored-sql-invalid');
  const invalid: unknown[] = [
    null,
    [],
    'policy',
    {},
    { ...policy, revision: null },
    { ...policy, revision: 'different' },
    { ...policy, definitions },
    { ...policy, active: true },
    { ...policy, financialHistoryExists: false },
    { ...policy, base: undefined },
    { ...policy, defaultBrowsing: undefined },
    { ...policy, preferredSecondary: null },
    { ...policy, preferredSecondary: policy.defaultBrowsing },
    { ...policy, currencies: null },
    { ...policy, currencies: {} },
    { ...policy, currencies: [] },
    {
      ...policy,
      currencies: Array.from({ length: 33 }, () => policy.currencies[0]),
    },
    { ...policy, currencies: [null] },
    { ...policy, currencies: [policy.currencies[0], policy.currencies[0]] },
    { ...policy, currencies: [{ ...policy.currencies[0], extra: true }] },
  ];
  for (const replacement of [
    null,
    {},
    { code: 'xca', metadataVersion: 'authored-policy-v1' },
    { code: 'XCA\n', metadataVersion: 'authored-policy-v1' },
    { code: 'XCA', metadataVersion: 'v\n' },
    { code: 'XCA', metadataVersion: 'x'.repeat(65) },
    { code: 'XCA', metadataVersion: 'authored-policy-v1', extra: true },
  ])
    for (const field of ['base', 'defaultBrowsing', 'preferredSecondary'])
      invalid.push({ ...policy, [field]: replacement });
  for (const capabilities of [
    null,
    {},
    { display: true, newSales: false },
    { display: true, newSales: false, collection: 1 },
    { display: 'true', newSales: false, collection: false },
    { display: true, newSales: false, collection: true, route: 'fake' },
  ])
    invalid.push({
      ...policy,
      currencies: policy.currencies.map((e, i) =>
        i ? e : { ...e, capabilities },
      ),
    });
  for (const unit of [
    null,
    {},
    { ...policy.base, metadataVersion: 'v\n' },
    { ...policy.base, extra: true },
  ])
    invalid.push({
      ...policy,
      currencies: policy.currencies.map((e, i) => (i ? e : { ...e, unit })),
    });
  for (const value of invalid)
    await assert.rejects(insert(policy.revision, value));
  for (const revision of [null, '', '-bad', 'v\n', 'é', 'x'.repeat(65)])
    await assert.rejects(insert(revision, { ...policy, revision }));
  assert.equal(
    await prisma.currencyPolicyRevision.count({
      where: { revision: policy.revision },
    }),
    0,
  );
});

test('SQL enforces exact database unit context, selected bindings and historical capability rules', async () => {
  const policy = fixture('authored-sql-context');
  const entry = policy.currencies[0]!;
  const changes = [
    { ...policy, base: { ...policy.base, metadataVersion: 'unknown' } },
    { ...policy, defaultBrowsing: policy.base },
    { ...policy, preferredSecondary: policy.base },
    { ...policy, currencies: policy.currencies.slice(0, 2) },
    {
      ...policy,
      currencies: policy.currencies.map((e, i) =>
        i ? e : { ...e, capabilities: { ...e.capabilities, display: false } },
      ),
    },
    {
      ...policy,
      currencies: [
        ...policy.currencies,
        { ...entry, unit: { ...entry.unit, metadataVersion: 'other' } },
      ],
    },
    {
      ...policy,
      currencies: policy.currencies.map((e, i) =>
        i !== 2
          ? e
          : { ...e, capabilities: { ...e.capabilities, display: true } },
      ),
    },
    {
      ...policy,
      currencies: policy.currencies.map((e, i) =>
        i !== 2
          ? e
          : { ...e, capabilities: { ...e.capabilities, newSales: true } },
      ),
    },
    {
      ...policy,
      currencies: [
        ...policy.currencies,
        { ...entry, unit: { ...entry.unit, code: 'XZZ' } },
      ],
    },
  ];
  for (const value of changes) {
    await assert.rejects(insert(policy.revision, value));
    await assert.rejects(appendCurrencyPolicyRevision(prisma, value));
  }
  assert.equal(
    await prisma.currencyPolicyRevision.count({
      where: { revision: policy.revision },
    }),
    0,
  );
});

test('32 unique units, boundary revision and independent flags work without a secondary', async () => {
  const units = Array.from({ length: 32 }, (_, i) => ({
    ...definitions[0]!,
    code: `Y${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
  }));
  for (const d of units) await appendCurrencyUnit(prisma, d);
  const policy = {
    revision: 'r'.repeat(64),
    base: ref(units[0]!),
    defaultBrowsing: ref(units[0]!),
    currencies: units.map((d, i) => ({
      unit: ref(d),
      capabilities: {
        display: true,
        newSales: i % 2 === 0,
        collection: i % 2 !== 0,
      },
    })),
  };
  await insert(policy.revision, policy);
  assert.deepEqual(await appendCurrencyPolicyRevision(prisma, policy), {
    policy,
    definitions: units,
  });
});

test('display, new-sales and collection flags remain independent for current non-selected units', async () => {
  const { preferredSecondary: _secondary, ...policy } = fixture(
    'authored-independent',
  );
  const independent = {
    ...policy,
    currencies: policy.currencies.map((e, i) =>
      i !== 1
        ? e
        : {
            ...e,
            capabilities: { display: false, newSales: true, collection: false },
          },
    ),
  };
  await insert(independent.revision, independent);
  assert.deepEqual(
    (await appendCurrencyPolicyRevision(prisma, independent)).policy,
    independent,
  );
});

test('concurrent equivalent and conflicting appends retain one complete winner', async () => {
  const policy = fixture('authored-concurrent');
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      appendCurrencyPolicyRevision(prisma, {
        ...policy,
        currencies:
          i % 2 ? [...policy.currencies].reverse() : policy.currencies,
      }),
    ),
  );
  results.forEach((r) => assert.deepEqual(r, { policy, definitions }));
  assert.equal(
    await prisma.currencyPolicyRevision.count({
      where: { revision: policy.revision },
    }),
    1,
  );
  for (const [index, change] of [
    { base: ref(definitions[0]!) },
    { preferredSecondary: undefined },
    {
      defaultBrowsing: policy.preferredSecondary!,
      preferredSecondary: policy.defaultBrowsing,
    },
    {
      currencies: policy.currencies.map((e) => ({
        ...e,
        capabilities: { ...e.capabilities, collection: false },
      })),
    },
  ].entries()) {
    const one = fixture(`authored-conflict-${index}`);
    const two = { ...one, ...change };
    const outcomes = await Promise.allSettled([
      appendCurrencyPolicyRevision(prisma, one),
      appendCurrencyPolicyRevision(prisma, two),
    ]);
    assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter((r) => r.status === 'rejected').length, 1);
    const winner = outcomes.find((r) => r.status === 'fulfilled');
    assert.ok(winner?.status === 'fulfilled');
    assert.deepEqual(
      await readExactCurrencyPolicyRevision(prisma, one.revision),
      winner.value,
    );
    assert.equal(
      await prisma.currencyPolicyRevision.count({
        where: { revision: one.revision },
      }),
      1,
    );
  }
});

test('transaction replay, conflicting append, aborted SQL and multirow insert roll back atomically', async () => {
  const known = fixture('authored-complete');
  await prisma.$transaction(async (tx) => {
    await appendCurrencyPolicyRevision(tx, known);
    await appendCurrencyPolicyRevision(tx, known);
    await readExactCurrencyPolicyRevision(tx, known.revision);
  });
  for (const mode of ['conflict', 'throw', 'sql']) {
    const other = fixture(`authored-rollback-${mode}`);
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await appendCurrencyPolicyRevision(tx, other);
        if (mode === 'conflict')
          await appendCurrencyPolicyRevision(tx, {
            ...known,
            base: known.defaultBrowsing,
          });
        else if (mode === 'sql')
          await tx.$executeRawUnsafe(
            'INSERT INTO currency_policy_revisions (revision,policy) VALUES ($1,$2::jsonb)',
            'incomplete',
            '{}',
          );
        else throw new Error('Authored transaction rollback');
      }),
    );
    assert.equal(
      await prisma.currencyPolicyRevision.count({
        where: { revision: other.revision },
      }),
      0,
    );
  }
  const one = fixture('authored-multirow');
  await assert.rejects(
    prisma.$executeRawUnsafe(
      'INSERT INTO currency_policy_revisions (revision,policy) VALUES ($1,$2::jsonb),($3,$4::jsonb)',
      one.revision,
      JSON.stringify(one),
      'incomplete',
      '{}',
    ),
  );
  assert.equal(
    await prisma.currencyPolicyRevision.count({
      where: { revision: one.revision },
    }),
    0,
  );
});

test('qualified snapshot insert uses its own schema even when caller search path differs', async () => {
  const policy = fixture('authored-qualified');
  await prisma.$transaction(async (tx) => {
    // Only the validated marked target is written; no public table is queried.
    await tx.$executeRawUnsafe('SET LOCAL search_path = pg_catalog');
    await tx.$executeRawUnsafe(
      `INSERT INTO "${schema}".currency_policy_revisions (revision,policy) VALUES ($1,$2::jsonb)`,
      policy.revision,
      JSON.stringify(policy),
    );
  });
  assert.deepEqual(
    await readExactCurrencyPolicyRevision(prisma, policy.revision),
    { policy, definitions },
  );
});

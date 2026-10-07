import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  appendCurrencyPolicyRevision,
  readExactCurrencyPolicyRevision,
  type CurrencyPolicyStoreClient,
} from '../src/currency-policies';
import type { CurrencyPolicy } from '@webhost-billing/shared/currency-policy';
import type { CurrencyUnitDefinition } from '@webhost-billing/shared/currency-arithmetic';

const units: CurrencyUnitDefinition[] = ['XAA', 'XAB'].map((code) => ({
  code,
  metadataVersion: 'authored-v1',
  minorUnitExponent: 3,
  provenance: 'Authored fictional policy test',
  status: 'current',
}));
const ref = (d: CurrencyUnitDefinition) => ({
  code: d.code,
  metadataVersion: d.metadataVersion,
});
const policy: CurrencyPolicy = {
  revision: 'authored-revision',
  base: ref(units[0]!),
  defaultBrowsing: ref(units[0]!),
  preferredSecondary: ref(units[1]!),
  currencies: units.map((d) => ({
    unit: ref(d),
    capabilities: { display: true, newSales: false, collection: false },
  })),
};
function fake(
  stored: unknown = policy,
  definitions: unknown[] = units,
  failInsert = false,
) {
  const calls: unknown[] = [];
  const client = {
    currencyUnitDefinition: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return definitions;
      },
    },
    currencyPolicyRevision: {
      createMany: async (args: unknown) => {
        calls.push(args);
        if (failInsert) throw new Error('Authored SQL failure');
        return { count: 0 };
      },
      findUnique: async (args: unknown) => {
        calls.push(args);
        return stored === null
          ? null
          : { revision: policy.revision, policy: stored };
      },
    },
  } as unknown as CurrencyPolicyStoreClient;
  return { client, calls };
}

test('unused policy entry has no root/client/environment/network consumer', () => {
  const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  assert.equal(
    manifest.exports['./currency-policies'].default,
    './dist/currency-policies.js',
  );
  assert.doesNotMatch(
    readFileSync(resolve('src/index.ts'), 'utf8'),
    /currency-policies/,
  );
  assert.doesNotMatch(
    readFileSync(resolve('src/currency-policies.ts'), 'utf8'),
    /process\.env|createPrismaClient|fetch\(/,
  );
});

test('strict shape and identifiers reject before database work', async () => {
  const oversized = Array.from({ length: 33 }, () => policy.currencies[0]!);
  Object.defineProperty(oversized, 0, {
    get() {
      throw new Error('Oversized member traversed');
    },
  });
  for (const value of [
    null,
    {},
    { ...policy, revision: '' },
    { ...policy, revision: '-bad' },
    { ...policy, revision: 'v\n' },
    { ...policy, revision: 'v'.repeat(65) },
    { ...policy, revision: 'é' },
    { ...policy, definitions: units },
    { ...policy, financialHistoryExists: false },
    { ...policy, createdAt: new Date() },
    { ...policy, currencies: [] },
    { ...policy, currencies: oversized },
    { ...policy, currencies: new Array(1) },
    { ...policy, currencies: [policy.currencies[0], policy.currencies[0]] },
    { ...policy, base: { ...policy.base, metadataVersion: 'v\n' } },
    { ...policy, defaultBrowsing: { ...policy.base, code: 'XA\n' } },
    { ...policy, preferredSecondary: policy.defaultBrowsing },
    {
      ...policy,
      currencies: [
        { unit: policy.base, capabilities: { display: true, newSales: false } },
      ],
    },
    {
      ...policy,
      currencies: [
        {
          unit: policy.base,
          capabilities: { display: 1, newSales: false, collection: true },
        },
      ],
    },
  ]) {
    const { client, calls } = fake();
    await assert.rejects(appendCurrencyPolicyRevision(client, value));
    assert.equal(calls.length, 0);
  }
});

test('missing selected context, unknown versions and historical capabilities fail before insert', async () => {
  for (const value of [
    { ...policy, base: { ...policy.base, metadataVersion: 'unknown' } },
    { ...policy, currencies: policy.currencies.slice(0, 1) },
    { ...policy, defaultBrowsing: ref({ ...units[0]!, code: 'XZZ' }) },
  ]) {
    const f = fake();
    await assert.rejects(appendCurrencyPolicyRevision(f.client, value));
    assert.equal(f.calls.length, 1);
  }
  for (const definitions of [
    [],
    [units[0]!],
    units.map((u) => ({ ...u, status: 'historical' })),
  ]) {
    const f = fake(policy, definitions);
    await assert.rejects(appendCurrencyPolicyRevision(f.client, policy));
    assert.equal(f.calls.length, 1);
  }
});

test('reordered entry and object facts replay identically without input mutation', async () => {
  const input = {
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
  const original = structuredClone(input);
  const f = fake();
  const result = await appendCurrencyPolicyRevision(f.client, input);
  assert.deepEqual(result, { policy, definitions: units });
  assert.deepEqual(input, original);
  assert.deepEqual(f.calls[1], {
    data: [{ revision: policy.revision, policy }],
    skipDuplicates: true,
  });
  result.policy.currencies[0]!.capabilities.display = false;
  result.definitions[0]!.minorUnitExponent = 0;
  assert.deepEqual(
    await readExactCurrencyPolicyRevision(f.client, policy.revision),
    { policy, definitions: units },
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        await readExactCurrencyPolicyRevision(f.client, policy.revision),
      ),
    ),
    { policy, definitions: units },
  );
});

test('different immutable facts conflict rather than overwrite', async () => {
  for (const value of [
    { ...policy, base: policy.preferredSecondary! },
    {
      ...policy,
      defaultBrowsing: policy.preferredSecondary!,
      preferredSecondary: policy.defaultBrowsing,
    },
    { ...policy, preferredSecondary: undefined },
    {
      ...policy,
      currencies: policy.currencies.map((e) => ({
        ...e,
        capabilities: { ...e.capabilities, collection: true },
      })),
    },
  ])
    await assert.rejects(
      appendCurrencyPolicyRevision(fake().client, value),
      /Conflicting/,
    );
});

test('exact read validates revision before lookup and fails closed on corrupt or missing facts', async () => {
  for (const revision of [
    null,
    {},
    '',
    'v\n',
    'x'.repeat(65),
    'latest/current',
  ]) {
    const f = fake();
    await assert.rejects(readExactCurrencyPolicyRevision(f.client, revision));
    assert.equal(f.calls.length, 0);
  }
  await assert.rejects(
    readExactCurrencyPolicyRevision(fake(null).client, policy.revision),
    /unavailable/,
  );
  await assert.rejects(
    appendCurrencyPolicyRevision(fake(null).client, policy),
    /whole transaction/,
  );
  for (const stored of [
    {},
    { ...policy, revision: 'other' },
    { ...policy, revision: 'v\n' },
    { ...policy, extra: true },
  ]) {
    await assert.rejects(
      readExactCurrencyPolicyRevision(fake(stored).client, policy.revision),
    );
    await assert.rejects(
      appendCurrencyPolicyRevision(fake(stored).client, policy),
    );
  }
});

test('32 unique entries, optional secondary and independent capability flags are supported', async () => {
  const definitions = Array.from({ length: 32 }, (_, i) => ({
    ...units[0]!,
    code: `X${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
  }));
  const input = {
    revision: policy.revision,
    base: ref(definitions[0]!),
    defaultBrowsing: ref(definitions[0]!),
    currencies: definitions.map((d) => ({
      unit: ref(d),
      capabilities: { display: true, newSales: false, collection: true },
    })),
  };
  assert.deepEqual(
    await appendCurrencyPolicyRevision(fake(input, definitions).client, input),
    { policy: input, definitions },
  );
});

test('SQL failures propagate to the owning transaction without statement retry', async () => {
  const f = fake(policy, units, true);
  await assert.rejects(
    appendCurrencyPolicyRevision(f.client, policy),
    /Authored SQL failure/,
  );
  assert.equal(f.calls.length, 2); // One context read, one insertion; no retry/read.
});

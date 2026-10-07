import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  appendCurrencyUnit,
  readExactCurrencyUnits,
  type CurrencyUnitStoreClient,
} from '../src/currency-units';
import type { CurrencyUnitDefinition } from '@webhost-billing/shared/currency-arithmetic';

const unit: CurrencyUnitDefinition = {
  code: 'XAA',
  metadataVersion: 'fictional-v1',
  minorUnitExponent: 3,
  provenance: 'Authored fictional test definition',
  status: 'historical',
};
const reference = { code: unit.code, metadataVersion: unit.metadataVersion };
function fake(rows: unknown[] = [unit]) {
  const calls: unknown[] = [];
  const client = {
    currencyUnitDefinition: {
      createMany: async (args: unknown) => {
        calls.push(args);
        return { count: 0 };
      },
      findUnique: async (args: unknown) => {
        calls.push(args);
        return rows[0] ?? null;
      },
      findMany: async (args: unknown) => {
        calls.push(args);
        return rows;
      },
    },
  } as unknown as CurrencyUnitStoreClient;
  return { client, calls };
}

test('separate entry, unchanged root and no runtime client import', () => {
  const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  assert.equal(
    manifest.exports['./currency-units'].default,
    './dist/currency-units.js',
  );
  assert.doesNotMatch(
    readFileSync(resolve('src/index.ts'), 'utf8'),
    /currency-units/,
  );
  assert.doesNotMatch(
    readFileSync(resolve('src/currency-units.ts'), 'utf8'),
    /process\.env|createPrismaClient|fetch\(/,
  );
});

test('append validates before database work and admits no authority fields', async () => {
  for (const value of [
    null,
    {},
    { ...unit, code: 'xaa' },
    { ...unit, metadataVersion: 'v1\n' },
    { ...unit, minorUnitExponent: 5 },
    { ...unit, minorUnitExponent: 1.5 },
    { ...unit, provenance: 'source\n' },
    { ...unit, provenance: ' source' },
    { ...unit, enabled: true },
    { ...unit, createdAt: new Date() },
  ]) {
    const { client, calls } = fake();
    await assert.rejects(appendCurrencyUnit(client, value));
    assert.equal(calls.length, 0);
  }
});

test('identical append uses skipDuplicates and returns copied JSON facts', async () => {
  const { client, calls } = fake();
  const result = await appendCurrencyUnit(client, unit);
  assert.deepEqual(result, unit);
  assert.notEqual(result, unit);
  assert.deepEqual(calls[0], { data: [unit], skipDuplicates: true });
  result.provenance = 'Changed copy';
  assert.equal(unit.provenance, 'Authored fictional test definition');
});

test('conflicting exponent, provenance and status reject without rewrite', async () => {
  for (const replacement of [
    { minorUnitExponent: 2 },
    { provenance: 'Other facts' },
    { status: 'current' },
  ]) {
    const { client, calls } = fake();
    await assert.rejects(
      appendCurrencyUnit(client, { ...unit, ...replacement }),
      /Conflicting/,
    );
    assert.equal(calls.length, 2);
  }
});

test('unavailable snapshot or malformed stored facts fail closed', async () => {
  await assert.rejects(
    appendCurrencyUnit(fake([]).client, unit),
    /whole transaction/,
  );
  await assert.rejects(
    appendCurrencyUnit(fake([{ ...unit, status: 'invalid' }]).client, unit),
  );
  await assert.rejects(
    readExactCurrencyUnits(fake([{ ...unit, provenance: '\n' }]).client, [
      reference,
    ]),
  );
});

test('reference budget precedes member access and database work', async () => {
  const oversized = Array.from({ length: 33 }, () => reference);
  Object.defineProperty(oversized, 0, {
    get() {
      throw new Error('Member was traversed');
    },
  });
  for (const value of [
    oversized,
    new Array(1),
    [],
    null,
    {},
    [reference, reference],
    [{ ...reference, enabled: true }],
    [{ ...reference, metadataVersion: 'v1\n' }],
  ]) {
    const { client, calls } = fake();
    await assert.rejects(readExactCurrencyUnits(client, value));
    assert.equal(calls.length, 0);
  }
});

test('exact reads preserve requested order, history and copied facts', async () => {
  const newer: CurrencyUnitDefinition = {
    ...unit,
    metadataVersion: 'fictional-v2',
    status: 'current',
    minorUnitExponent: 2,
  };
  const { client, calls } = fake([newer, unit]);
  const result = await readExactCurrencyUnits(client, [
    reference,
    { code: newer.code, metadataVersion: newer.metadataVersion },
  ]);
  assert.deepEqual(result, [unit, newer]);
  assert.deepEqual(calls[0], {
    where: {
      OR: [
        reference,
        { code: newer.code, metadataVersion: newer.metadataVersion },
      ],
    },
    select: {
      code: true,
      metadataVersion: true,
      minorUnitExponent: true,
      provenance: true,
      status: true,
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.notEqual(result[0], unit);
});

test('missing, duplicate and unrequested database contexts have no partial success', async () => {
  for (const rows of [
    [],
    [unit, unit],
    [{ ...unit, metadataVersion: 'newer' }],
  ]) {
    await assert.rejects(
      readExactCurrencyUnits(fake(rows).client, [reference]),
      /unavailable/,
    );
  }
});

test('maximum 32 references are supported without a global list', async () => {
  const units = Array.from({ length: 32 }, (_, i) => ({
    ...unit,
    metadataVersion: `fictional-${i}`,
  }));
  const references = units.map(({ code, metadataVersion }) => ({
    code,
    metadataVersion,
  }));
  assert.deepEqual(
    await readExactCurrencyUnits(fake(units).client, references),
    units,
  );
});

test('bounded indexed traversal does not consume a caller iterator', async () => {
  const references = [reference];
  Object.defineProperty(references, Symbol.iterator, {
    value() {
      throw new Error('Caller iterator was consumed');
    },
  });
  assert.deepEqual(await readExactCurrencyUnits(fake().client, references), [
    unit,
  ]);
});

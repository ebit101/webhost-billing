import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  currencyCapabilitiesSchema,
  currencyPolicyContextSchema,
  currencyPolicyEntrySchema,
  currencyPolicySchema,
  currencyPolicyTransitionInputSchema,
  currencyPolicyUnitReferenceSchema,
  CURRENCY_POLICY_LIMITS,
  readCurrencyPolicyCapabilities,
  resolveHistoricalCurrencyUnit,
  validateCurrencyPolicyTransition,
  type CurrencyCapabilities,
  type CurrencyPolicy,
  type CurrencyPolicyContext,
} from '../src/currency-policy';
import { type CurrencyUnitDefinition } from '../src/currency-arithmetic';
import { moneySchema } from '../src/contracts/money';

// Fictional caller-supplied policy, never a registry, live default or payment route.
const unit = (code: string, metadataVersion = 'fictional-v1') => ({
  code,
  metadataVersion,
});
const flags = (
  display = false,
  newSales = false,
  collection = false,
): CurrencyCapabilities => ({ display, newSales, collection });
const definitions: CurrencyUnitDefinition[] = [
  { code: 'BDT', minorUnitExponent: 2 },
  { code: 'USD', minorUnitExponent: 2 },
].map((value) => ({
  ...value,
  metadataVersion: 'fictional-v1',
  provenance: 'fictional-command97-context',
  status: 'current',
}));
const targetPolicy: CurrencyPolicy = {
  revision: 'fictional-policy-v1',
  base: unit('BDT'),
  defaultBrowsing: unit('BDT'),
  preferredSecondary: unit('USD'),
  currencies: [
    { unit: unit('BDT'), capabilities: flags(true, true, false) },
    { unit: unit('USD'), capabilities: flags(true, false, false) },
  ],
};
function fixture(): CurrencyPolicyContext {
  return structuredClone({ policy: targetPolicy, definitions });
}
function transition() {
  return structuredClone({
    current: targetPolicy,
    proposed: {
      ...structuredClone(targetPolicy),
      revision: 'fictional-policy-v2',
    },
    definitions,
    expectedRevision: targetPolicy.revision,
    financialHistoryExists: true,
  });
}
function syntheticUnit(
  metadataVersion: string,
  minorUnitExponent: number,
  status: 'current' | 'historical',
): CurrencyUnitDefinition {
  return {
    code: 'XAA',
    metadataVersion,
    minorUnitExponent,
    status,
    provenance: 'fictional-unit-history-not-real-currency-metadata',
  };
}

describe('explicit currency policy contracts', () => {
  it('represents the fictional BDT/USD target without inferring sales or collection', () => {
    const value = fixture();
    const parsed = currencyPolicyContextSchema.parse(value);
    assert.deepEqual(parsed, value);
    assert.deepEqual(
      readCurrencyPolicyCapabilities(value, 'BDT'),
      flags(true, true),
    );
    assert.deepEqual(readCurrencyPolicyCapabilities(value, 'USD'), flags(true));
    assert.deepEqual(JSON.parse(JSON.stringify(parsed)), value);
    assert.equal('rate' in parsed.policy, false);
  });

  it('separates one base from browsing choices and supports other installations', () => {
    const value = fixture();
    value.policy.base = unit('USD');
    assert.equal(
      currencyPolicyContextSchema.parse(value).policy.base.code,
      'USD',
    );
    assert.equal(value.policy.defaultBrowsing.code, 'BDT');
    delete value.policy.preferredSecondary;
    const parsed = currencyPolicyContextSchema.parse(value);
    assert.equal(parsed.policy.preferredSecondary, undefined);
    assert.equal('preferredSecondary' in parsed.policy, false);
  });

  it('requires every flag explicitly and never coerces false-like input', () => {
    for (const key of ['display', 'newSales', 'collection'] as const) {
      const missing: Record<string, unknown> = { ...flags() };
      delete missing[key];
      assert.equal(
        currencyCapabilitiesSchema.safeParse(missing).success,
        false,
      );
      for (const bad of [undefined, null, 0, 1, 'false', 'true']) {
        assert.equal(
          currencyCapabilitiesSchema.safeParse({ ...flags(), [key]: bad })
            .success,
          false,
        );
      }
    }
    for (const key of ['revision', 'base', 'defaultBrowsing', 'currencies']) {
      const missing: Record<string, unknown> = { ...targetPolicy };
      delete missing[key];
      assert.equal(currencyPolicySchema.safeParse(missing).success, false);
    }
  });

  it('keeps current display, new sales and collection independently configurable', () => {
    for (const display of [false, true]) {
      for (const newSales of [false, true]) {
        for (const collection of [false, true]) {
          const value = fixture();
          delete value.policy.preferredSecondary;
          value.policy.currencies[1]!.capabilities = flags(
            display,
            newSales,
            collection,
          );
          assert.deepEqual(
            readCurrencyPolicyCapabilities(value, 'USD'),
            flags(display, newSales, collection),
          );
        }
      }
    }
  });

  it('rejects extra fields at each boundary, including rate/provider authority', () => {
    assert.equal(
      currencyCapabilitiesSchema.safeParse({ ...flags(), paymentRoute: 'fake' })
        .success,
      false,
    );
    assert.equal(
      currencyPolicyUnitReferenceSchema.safeParse({
        ...unit('BDT'),
        exponent: 2,
      }).success,
      false,
    );
    assert.equal(
      currencyPolicyEntrySchema.safeParse({
        ...targetPolicy.currencies[0],
        enabled: true,
      }).success,
      false,
    );
    for (const extra of [
      { rate: { numerator: '1', denominator: '125' } },
      { providerCoverage: ['USD'] },
      { preference: 'USD' },
      { approved: true },
    ]) {
      assert.equal(
        currencyPolicySchema.safeParse({ ...targetPolicy, ...extra }).success,
        false,
      );
    }
    assert.equal(
      currencyPolicyContextSchema.safeParse({
        ...fixture(),
        registry: 'implicit',
      }).success,
      false,
    );
  });

  it('bounds revisions and unit identifiers without implicit defaults', () => {
    for (const revision of [
      '',
      'with space',
      'v1\n',
      'x'.repeat(65),
      1,
      null,
    ]) {
      assert.equal(
        currencyPolicySchema.safeParse({ ...targetPolicy, revision }).success,
        false,
      );
    }
    assert.equal(
      currencyPolicySchema.parse({ ...targetPolicy, revision: 'x'.repeat(64) })
        .revision.length,
      64,
    );
    for (const reference of [
      {},
      { code: 'BDT' },
      { metadataVersion: 'v1' },
      unit('bdt'),
      unit('US'),
      unit('USDD'),
      unit('BDT', ''),
      unit('BDT', 'x'.repeat(65)),
      unit('BDT', 'version with space'),
    ]) {
      assert.equal(
        currencyPolicyUnitReferenceSchema.safeParse(reference).success,
        false,
      );
    }
  });

  it('rejects unknown definitions and exact-reference mismatches', () => {
    for (const field of [
      'base',
      'defaultBrowsing',
      'preferredSecondary',
    ] as const) {
      const value = fixture();
      value.policy[field] = unit('ZZZ');
      assert.equal(currencyPolicyContextSchema.safeParse(value).success, false);
    }
    const missing = fixture();
    missing.policy.currencies.push({
      unit: unit('ZZZ'),
      capabilities: flags(),
    });
    assert.equal(currencyPolicyContextSchema.safeParse(missing).success, false);
    const mismatched = fixture();
    mismatched.definitions.push({
      ...definitions[0]!,
      metadataVersion: 'fictional-v2',
    });
    mismatched.policy.defaultBrowsing = unit('BDT', 'fictional-v2');
    assert.equal(
      currencyPolicyContextSchema.safeParse(mismatched).success,
      false,
    );
    const noBaseEntry = fixture();
    noBaseEntry.policy.base = unit('XAA', 'synthetic-v1');
    noBaseEntry.definitions.push(
      syntheticUnit('synthetic-v1', 3, 'historical'),
    );
    assert.equal(
      currencyPolicyContextSchema.safeParse(noBaseEntry).success,
      false,
    );
  });

  it('rejects duplicate per-code entries even when unit versions differ', () => {
    for (const metadataVersion of ['fictional-v1', 'fictional-v2']) {
      const value = fixture();
      value.policy.currencies.push({
        unit: unit('BDT', metadataVersion),
        capabilities: flags(),
      });
      assert.equal(currencyPolicySchema.safeParse(value.policy).success, false);
    }
  });

  it('checks list budgets before traversing oversized policy or definition members', () => {
    const oversized = new Array(CURRENCY_POLICY_LIMITS.entries + 1);
    Object.defineProperty(oversized, '0', {
      get() {
        throw new Error('Must not traverse');
      },
    });
    assert.equal(
      currencyPolicySchema.safeParse({ ...targetPolicy, currencies: oversized })
        .success,
      false,
    );
    assert.equal(
      currencyPolicyContextSchema.safeParse({
        policy: targetPolicy,
        definitions: oversized,
      }).success,
      false,
    );
    for (const currencies of [[], null, {}, 'USD']) {
      assert.equal(
        currencyPolicySchema.safeParse({ ...targetPolicy, currencies }).success,
        false,
      );
    }
  });

  it('accepts the documented bounded maximum without a maintained dataset', () => {
    const value = fixture();
    for (let index = 0; index < 30; index++) {
      // Authored synthetic codes, not ISO metadata or supported-currency assertions.
      const code = `X${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`;
      value.definitions.push({ ...definitions[0]!, code });
      value.policy.currencies.push({ unit: unit(code), capabilities: flags() });
    }
    assert.equal(
      currencyPolicyContextSchema.parse(value).policy.currencies.length,
      32,
    );
  });

  it('requires current display-enabled default/secondary and distinct browsing codes', () => {
    for (const code of ['BDT', 'USD']) {
      const value = fixture();
      value.policy.currencies.find(
        (entry) => entry.unit.code === code,
      )!.capabilities.display = false;
      assert.equal(currencyPolicyContextSchema.safeParse(value).success, false);
    }
    const repeated = fixture();
    repeated.policy.preferredSecondary = unit('BDT');
    assert.equal(
      currencyPolicyContextSchema.safeParse(repeated).success,
      false,
    );
    repeated.policy.preferredSecondary = unit('BDT', 'other-v2');
    assert.equal(
      currencyPolicySchema.safeParse(repeated.policy).success,
      false,
    );
  });

  it('rejects historical browsing/sales but allows independent historical collection flags', () => {
    const value = fixture();
    delete value.policy.preferredSecondary;
    value.definitions[1]!.status = 'historical';
    value.policy.base = unit('USD');
    value.policy.currencies[1]!.capabilities = flags(false, false, true);
    assert.deepEqual(
      readCurrencyPolicyCapabilities(value, 'USD'),
      flags(false, false, true),
    );
    for (const capabilities of [flags(true), flags(false, true)]) {
      value.policy.currencies[1]!.capabilities = capabilities;
      assert.equal(currencyPolicyContextSchema.safeParse(value).success, false);
    }
    value.policy.currencies[1]!.capabilities = flags();
    value.policy.defaultBrowsing = unit('USD');
    assert.equal(currencyPolicyContextSchema.safeParse(value).success, false);
  });

  it('denies omitted/unknown capabilities even when definitions and preferences exist', () => {
    const value = fixture();
    delete value.policy.preferredSecondary;
    value.policy.currencies = [value.policy.currencies[0]!];
    assert.deepEqual(readCurrencyPolicyCapabilities(value, 'USD'), flags());
    assert.deepEqual(readCurrencyPolicyCapabilities(value, 'ZZZ'), flags());
    assert.deepEqual(
      readCurrencyPolicyCapabilities(fixture(), 'USD'),
      flags(true),
    );
    for (const bad of ['usd', '', 'USD\n', 1, { code: 'USD' }]) {
      assert.throws(() => readCurrencyPolicyCapabilities(value, bad));
    }
  });

  it('returns copied JSON-safe facts and flags without retaining caller-owned objects', () => {
    const value = fixture();
    const before = JSON.stringify(value);
    const parsed = currencyPolicyContextSchema.parse(value);
    const capabilities = readCurrencyPolicyCapabilities(value, 'USD');
    assert.equal(JSON.stringify(value), before);
    value.policy.currencies[1]!.capabilities.collection = true;
    value.definitions[1]!.minorUnitExponent = 3;
    assert.deepEqual(capabilities, flags(true));
    assert.equal(parsed.definitions[1]!.minorUnitExponent, 2);
    capabilities.display = false;
    assert.equal(parsed.policy.currencies[1]!.capabilities.display, true);
  });
});

describe('historical units independent of currency policy', () => {
  it('resolves original units when all flags are disabled or the policy entry is omitted', () => {
    const value = fixture();
    delete value.policy.preferredSecondary;
    value.policy.currencies[1]!.capabilities = flags();
    assert.deepEqual(readCurrencyPolicyCapabilities(value, 'USD'), flags());
    assert.deepEqual(
      resolveHistoricalCurrencyUnit(unit('USD'), value.definitions),
      definitions[1],
    );
    value.policy.currencies.pop();
    assert.deepEqual(
      resolveHistoricalCurrencyUnit(unit('USD'), value.definitions),
      definitions[1],
    );
  });

  it('keeps historical precision even when the policy selects a newer version', () => {
    const value = fixture();
    const historical = syntheticUnit('synthetic-old-v1', 3, 'historical');
    const current = syntheticUnit('synthetic-new-v2', 2, 'current');
    value.definitions.push(historical, current);
    value.policy.currencies.push({
      unit: unit('XAA', current.metadataVersion),
      capabilities: flags(true),
    });
    currencyPolicyContextSchema.parse(value);
    const money = moneySchema.parse({ amount: '1000', currency: 'XAA' });
    const before = JSON.stringify(money);
    const original = resolveHistoricalCurrencyUnit(
      unit('XAA', historical.metadataVersion),
      value.definitions,
    );
    assert.deepEqual(original, historical);
    assert.equal(original.minorUnitExponent, 3);
    assert.equal(JSON.stringify(money), before);
    original.minorUnitExponent = 4;
    assert.equal(historical.minorUnitExponent, 3);
  });

  it('never falls back to current precision for unknown code/version or missing reference', () => {
    for (const reference of [
      unit('ZZZ'),
      unit('USD', 'absent-v2'),
      { code: 'USD' },
      undefined,
    ]) {
      assert.throws(() =>
        resolveHistoricalCurrencyUnit(reference, definitions),
      );
    }
  });

  it('rejects duplicated/conflicting definitions for both policy and historical lookup', () => {
    for (const extra of [
      definitions[0],
      { ...definitions[0], minorUnitExponent: 3 },
    ]) {
      const conflicting = [...definitions, extra];
      assert.throws(() =>
        resolveHistoricalCurrencyUnit(unit('BDT'), conflicting),
      );
      assert.equal(
        currencyPolicyContextSchema.safeParse({
          policy: targetPolicy,
          definitions: conflicting,
        }).success,
        false,
      );
    }
  });
});

describe('pure currency policy transition validation', () => {
  it('permits browsing/capability changes without modifying base or original money', () => {
    const input = transition();
    input.proposed.defaultBrowsing = unit('USD');
    input.proposed.preferredSecondary = unit('BDT');
    input.proposed.currencies[1]!.capabilities.newSales = true;
    const records = [
      { invoice: { amount: '125000', currency: 'BDT' }, unit: unit('BDT') },
      {
        renewal: { amount: '9007199254740993', currency: 'USD' },
        unit: unit('USD'),
      },
      { refund: { amount: '1', currency: 'USD' }, unit: unit('USD') },
    ];
    const before = JSON.stringify({ input, records });
    const result = validateCurrencyPolicyTransition(input);
    assert.equal(result.policy.base.code, 'BDT');
    assert.equal(result.policy.defaultBrowsing.code, 'USD');
    assert.deepEqual(
      readCurrencyPolicyCapabilities(result, 'USD'),
      flags(true, true),
    );
    assert.equal(JSON.stringify({ input, records }), before);
    result.policy.base.code = 'ZZZ';
    result.definitions[0]!.minorUnitExponent = 0;
    assert.equal(input.proposed.base.code, 'BDT');
    assert.equal(input.definitions[0]!.minorUnitExponent, 2);
    assert.doesNotThrow(() => JSON.stringify(result));
  });

  it('locks the base code only when an explicit history fact is true', () => {
    const input = transition();
    input.proposed.base = unit('USD');
    assert.throws(
      () => validateCurrencyPolicyTransition(input),
      /locked after financial history/,
    );
    input.financialHistoryExists = false;
    assert.equal(
      validateCurrencyPolicyTransition(input).policy.base.code,
      'USD',
    );
  });

  it('requires explicit typed history/revision facts, never a default or browser override', () => {
    for (const financialHistoryExists of [
      undefined,
      null,
      0,
      1,
      'false',
      'true',
    ]) {
      assert.equal(
        currencyPolicyTransitionInputSchema.safeParse({
          ...transition(),
          financialHistoryExists,
        }).success,
        false,
      );
    }
    const missing: Record<string, unknown> = { ...transition() };
    delete missing.financialHistoryExists;
    assert.throws(() => validateCurrencyPolicyTransition(missing));
    delete missing.expectedRevision;
    assert.equal(
      currencyPolicyTransitionInputSchema.safeParse(missing).success,
      false,
    );
    for (const extra of [
      { force: true },
      { actor: 'admin' },
      { records: [] },
    ]) {
      assert.throws(() =>
        validateCurrencyPolicyTransition({ ...transition(), ...extra }),
      );
    }
  });

  it('rejects stale expected revisions and equal replacement revisions', () => {
    const stale = transition();
    stale.expectedRevision = 'fictional-policy-v0';
    assert.throws(
      () => validateCurrencyPolicyTransition(stale),
      /revision is stale/,
    );
    const reused = transition();
    reused.proposed.revision = reused.current.revision;
    assert.throws(
      () => validateCurrencyPolicyTransition(reused),
      /must differ/,
    );
  });

  it('does not claim global revision uniqueness or numeric ordering without storage', () => {
    const input = transition();
    input.proposed.revision = 'fictional-policy-v0';
    assert.equal(
      validateCurrencyPolicyTransition(input).policy.revision,
      'fictional-policy-v0',
    );
  });

  it('validates both current/proposed policies and the complete bounded context', () => {
    for (const field of ['current', 'proposed'] as const) {
      const input = transition();
      input[field].preferredSecondary = unit('ZZZ');
      assert.throws(() => validateCurrencyPolicyTransition(input));
    }
    const missingDefinitions = transition();
    missingDefinitions.definitions = [definitions[0]!];
    assert.throws(() => validateCurrencyPolicyTransition(missingDefinitions));
    for (const revision of ['', 'x'.repeat(65), 'has spaces', 1]) {
      assert.throws(() =>
        validateCurrencyPolicyTransition({
          ...transition(),
          expectedRevision: revision,
        }),
      );
    }
  });

  it('can pin a new same-code unit version without reinterpreting historical precision', () => {
    const input = transition();
    const oldUnit = syntheticUnit('synthetic-v1', 3, 'historical');
    const newUnit = syntheticUnit('synthetic-v2', 2, 'current');
    input.definitions.push(oldUnit, newUnit);
    input.current.base = unit('XAA', oldUnit.metadataVersion);
    input.current.currencies.push({
      unit: unit('XAA', oldUnit.metadataVersion),
      capabilities: flags(),
    });
    input.proposed.base = unit('XAA', newUnit.metadataVersion);
    input.proposed.currencies.push({
      unit: unit('XAA', newUnit.metadataVersion),
      capabilities: flags(),
    });
    const result = validateCurrencyPolicyTransition(input);
    assert.equal(result.policy.base.code, 'XAA');
    assert.equal(result.policy.base.metadataVersion, newUnit.metadataVersion);
    assert.equal(
      resolveHistoricalCurrencyUnit(input.current.base, result.definitions)
        .minorUnitExponent,
      3,
    );
  });
});

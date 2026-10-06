import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  convertCurrencyMinorUnits,
  currencyConversionInputSchema,
  currencyUnitContextSchema,
  currencyUnitDefinitionSchema,
  CURRENCY_ARITHMETIC_LIMITS,
  CURRENCY_ARITHMETIC_POLICY,
  exactRatioSchema,
  normalizeExactRatio,
  parseExactDecimalRate,
  type CurrencyUnitDefinition,
  type ExactRatio,
} from '../src/currency-arithmetic';
import {
  moneySchema,
  parseMoney,
  POSTGRES_BIGINT_MAX,
  serializeMoney,
} from '../src/contracts/money';

// Fictional arithmetic contexts, not a maintained registry or sale/collection policy.
// Exponents reverified from SIX list-one.xml (published 2026-09-17); no rates fetched.
const definitions: CurrencyUnitDefinition[] = [
  ['BDT', 2],
  ['USD', 2],
  ['JPY', 0],
  ['KWD', 3],
].map(([code, minorUnitExponent]) =>
  currencyUnitDefinitionSchema.parse({
    code,
    minorUnitExponent,
    metadataVersion: 'fictional-v1',
    provenance: 'fictional-command96-fixture',
    status: 'current',
  }),
);
const ratio = (numerator: string, denominator = '1'): ExactRatio => ({
  numerator,
  denominator,
});
function input(
  amount: unknown,
  source = 'BDT',
  target = 'USD',
  rate = ratio('1'),
) {
  return {
    amount,
    source: { code: source, metadataVersion: 'fictional-v1' },
    target: { code: target, metadataVersion: 'fictional-v1' },
    rate: { ...rate, sourceCurrency: source, targetCurrency: target },
  };
}
function convert(
  amount: unknown,
  source = 'BDT',
  target = 'USD',
  rate = ratio('1'),
) {
  return convertCurrencyMinorUnits(
    input(amount, source, target, rate),
    definitions,
  );
}

describe('explicit currency unit context', () => {
  it('requires code, integer exponent, version, provenance and current/historical status', () => {
    assert.equal(currencyUnitContextSchema.parse(definitions).length, 4);
    const definition = definitions[0]!;
    for (const key of Object.keys(definition)) {
      const missing: Record<string, unknown> = { ...definition };
      delete missing[key];
      assert.equal(
        currencyUnitDefinitionSchema.safeParse(missing).success,
        false,
        key,
      );
    }
    for (const extra of [
      { enabled: true },
      { collection: true },
      { amount: '100' },
    ]) {
      assert.equal(
        currencyUnitDefinitionSchema.safeParse({ ...definition, ...extra })
          .success,
        false,
      );
    }
  });

  it('rejects invalid metadata before powers or arithmetic', () => {
    for (const exponent of [-1, 1.5, 5, Infinity, NaN, '2', 1000000000]) {
      assert.equal(
        currencyUnitDefinitionSchema.safeParse({
          ...definitions[0],
          minorUnitExponent: exponent,
        }).success,
        false,
      );
    }
    for (const version of ['', 'v 1', 'v1\n', 'x'.repeat(65), 1]) {
      assert.equal(
        currencyUnitDefinitionSchema.safeParse({
          ...definitions[0],
          metadataVersion: version,
        }).success,
        false,
      );
    }
    for (const provenance of [
      '',
      ' padded',
      'padded ',
      'line\nbreak',
      'x'.repeat(257),
      null,
    ]) {
      assert.equal(
        currencyUnitDefinitionSchema.safeParse({
          ...definitions[0],
          provenance,
        }).success,
        false,
      );
    }
    for (const code of ['bdt', 'US', 'USDD', 'USD\n', 1]) {
      assert.equal(
        currencyUnitDefinitionSchema.safeParse({ ...definitions[0], code })
          .success,
        false,
      );
    }
  });

  it('rejects duplicates and conflicting facts for a code/version', () => {
    for (const conflict of [
      definitions[0],
      { ...definitions[0], minorUnitExponent: 3 },
      { ...definitions[0], provenance: 'other' },
    ]) {
      assert.throws(() =>
        currencyUnitContextSchema.parse([...definitions, conflict]),
      );
    }
  });

  it('bounds the context before touching oversized array members', () => {
    const oversized = new Array(CURRENCY_ARITHMETIC_LIMITS.definitions + 1);
    Object.defineProperty(oversized, '0', {
      get() {
        throw new Error('Must not traverse');
      },
    });
    assert.equal(currencyUnitContextSchema.safeParse(oversized).success, false);
    for (const context of [[], null, {}, 'USD']) {
      assert.throws(() => convertCurrencyMinorUnits(input('1'), context));
    }
  });

  it('does not infer an unknown code or fall back to the latest version', () => {
    assert.throws(() => convert('1', 'ZZZ'), /explicit context/);
    const request = input('1');
    request.source.metadataVersion = 'absent-v2';
    assert.throws(
      () => convertCurrencyMinorUnits(request, definitions),
      /explicit context/,
    );
    assert.equal(
      moneySchema.safeParse({ amount: '1', currency: 'ZZZ' }).success,
      true,
    );
  });

  it('preserves explicit historical units, without looking up current precision', () => {
    const historical = currencyUnitDefinitionSchema.parse({
      code: 'XAA',
      minorUnitExponent: 3,
      metadataVersion: 'historical-v1',
      provenance: 'fictional-unit-change',
      status: 'historical',
    });
    const current = {
      ...historical,
      minorUnitExponent: 2,
      metadataVersion: 'current-v2',
      status: 'current',
    };
    const request = input('1000', 'XAA', 'JPY');
    request.source.metadataVersion = 'historical-v1';
    const result = convertCurrencyMinorUnits(request, [
      ...definitions,
      historical,
      current,
    ]);
    assert.equal(result.target.money.amount, '1');
    assert.deepEqual(result.source.definition, historical);
  });
});

describe('lossless bounded rate parsing', () => {
  it('reduces positive rational integers without changing their value', () => {
    assert.deepEqual(
      normalizeExactRatio(ratio('300', '1000')),
      ratio('3', '10'),
    );
    assert.deepEqual(
      normalizeExactRatio(ratio('9007199254740993', '3')),
      ratio('3002399751580331'),
    );
    const largest = '9'.repeat(96);
    assert.deepEqual(normalizeExactRatio(ratio(largest, largest)), ratio('1'));
  });

  it('parses whole and decimal strings exactly, including trailing zeroes', () => {
    for (const [token, expected] of [
      ['1', ratio('1')],
      ['150', ratio('150')],
      ['0.008', ratio('1', '125')],
      ['0.3000', ratio('3', '10')],
      ['1.2500', ratio('5', '4')],
      ['9007199254740993.01', ratio('900719925474099301', '100')],
    ] as const)
      assert.deepEqual(parseExactDecimalRate(token), expected);
  });

  it('accepts the documented decimal boundaries without precision loss', () => {
    const smallest = `0.${'0'.repeat(31)}1`;
    assert.deepEqual(
      parseExactDecimalRate(smallest),
      ratio('1', `1${'0'.repeat(32)}`),
    );
    const largest = `${'9'.repeat(64)}.${'9'.repeat(32)}`;
    assert.deepEqual(
      parseExactDecimalRate(largest),
      ratio('9'.repeat(96), `1${'0'.repeat(32)}`),
    );
  });

  it('rejects zero, signs, exponents, numeric JSON and ambiguous decimal forms', () => {
    for (const token of [
      '0',
      '0.000',
      '-1',
      '+1',
      '01',
      '.5',
      '1.',
      '1e2',
      '1E-2',
      ' 1',
      '1 ',
      '1\n',
      '1,2',
      'NaN',
      'Infinity',
      0.3,
      1,
      1n,
      null,
      {},
      true,
    ]) {
      assert.throws(() => parseExactDecimalRate(token), String(token));
    }
  });

  it('rejects oversized whole/fraction tokens and canonical-ratio violations', () => {
    for (const token of [
      '1'.repeat(65),
      `0.${'1'.repeat(33)}`,
      '9'.repeat(100000),
    ]) {
      assert.throws(() => parseExactDecimalRate(token));
    }
    for (const bad of [
      '0',
      '-1',
      '+1',
      '01',
      '1.5',
      '1e2',
      '1\n',
      '9'.repeat(97),
      1,
      1n,
      null,
    ]) {
      assert.equal(
        exactRatioSchema.safeParse({ numerator: bad, denominator: '1' })
          .success,
        false,
      );
      assert.equal(
        exactRatioSchema.safeParse({ numerator: '1', denominator: bad })
          .success,
        false,
      );
    }
    assert.throws(() => normalizeExactRatio({ ...ratio('1'), extra: true }));
  });
});

describe('exact directed conversion and evidence', () => {
  it('matches the independent fictional BDT/USD, USD/JPY and USD/KWD examples', () => {
    assert.equal(
      convert('125000', 'BDT', 'USD', ratio('1', '125')).target.money.amount,
      '1000',
    );
    assert.equal(
      convert('1000', 'USD', 'JPY', ratio('150')).target.money.amount,
      '1500',
    );
    assert.equal(
      convert('1000', 'USD', 'KWD', ratio('3', '10')).target.money.amount,
      '3000',
    );
  });

  it('records reduced rates, unit snapshots and exact rounding evidence as JSON-safe strings', () => {
    const result = convert('125000', 'BDT', 'USD', ratio('2', '250'));
    assert.deepEqual(result, {
      policyVersion: CURRENCY_ARITHMETIC_POLICY,
      method: 'conversion',
      source: {
        money: { amount: '125000', currency: 'BDT' },
        definition: definitions[0],
      },
      target: {
        money: { amount: '1000', currency: 'USD' },
        definition: definitions[1],
      },
      rate: {
        ...ratio('1', '125'),
        sourceCurrency: 'BDT',
        targetCurrency: 'USD',
      },
      rounding: {
        quotient: '1000',
        remainder: '0',
        divisor: '12500',
        incremented: false,
      },
    });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  });

  it('does not mutate input or retain input-owned definition objects', () => {
    const context = structuredClone(definitions);
    const request = input('100');
    const before = JSON.stringify({ context, request });
    const result = convertCurrencyMinorUnits(request, context);
    assert.equal(JSON.stringify({ context, request }), before);
    context[0]!.minorUnitExponent = 0;
    request.amount = '999';
    assert.equal(result.source.definition.minorUnitExponent, 2);
    assert.equal(result.source.money.amount, '100');
  });

  it('requires exact rate direction and does not silently invert or convert missing data', () => {
    const request = input('1');
    for (const rate of [
      undefined,
      { ...request.rate, sourceCurrency: 'USD', targetCurrency: 'BDT' },
      { ...request.rate, targetCurrency: 'JPY' },
    ]) {
      assert.throws(
        () => convertCurrencyMinorUnits({ ...request, rate }, definitions),
        /matching directed rate/,
      );
    }
    assert.equal(
      convert('100', 'BDT', 'USD', ratio('2')).target.money.amount,
      '200',
    );
    assert.equal(
      convert('100', 'USD', 'BDT', ratio('1', '2')).target.money.amount,
      '50',
    );
  });

  it('supports validated zero and maximum same-currency identity without an external rate', () => {
    for (const amount of ['0', POSTGRES_BIGINT_MAX.toString()]) {
      const request = { ...input(amount, 'BDT', 'BDT'), rate: undefined };
      const result = convertCurrencyMinorUnits(request, definitions);
      assert.equal(result.method, 'identity');
      assert.equal(result.target.money.amount, amount);
      assert.equal(result.rate, null);
      assert.equal(result.rounding.incremented, false);
      assert.doesNotThrow(() => JSON.stringify(result));
    }
    assert.throws(() => convert('1', 'BDT', 'BDT'), /no external rate/);
  });

  it('rejects identity across different metadata versions, even if exponents match', () => {
    for (const exponent of [2, 3]) {
      const other = {
        ...definitions[0],
        metadataVersion: 'fictional-v2',
        minorUnitExponent: exponent,
      };
      const request = { ...input('100', 'BDT', 'BDT'), rate: undefined };
      request.target.metadataVersion = 'fictional-v2';
      assert.throws(
        () => convertCurrencyMinorUnits(request, [...definitions, other]),
        /matching metadata/,
      );
    }
  });

  it('rounds even/odd half ties once, including ties below and above one', () => {
    for (const [amount, expected, incremented] of [
      ['1', '0', false],
      ['3', '2', true],
      ['5', '2', false],
      ['7', '4', true],
    ] as const) {
      const result = convert(amount, 'BDT', 'USD', ratio('1', '2'));
      assert.equal(result.target.money.amount, expected);
      assert.equal(result.rounding.incremented, incremented);
    }
  });

  it('distinguishes below/above ties and exact division without rate rounding', () => {
    for (const [amount, expected] of [
      ['4', '1'],
      ['5', '2'],
      ['6', '2'],
      ['8', '3'],
      ['9', '3'],
    ] as const) {
      assert.equal(
        convert(amount, 'BDT', 'USD', ratio('1', '3')).target.money.amount,
        expected,
      );
    }
    assert.equal(
      convert('9007199254740993', 'BDT', 'USD', ratio('1')).target.money.amount,
      '9007199254740993',
    );
    assert.equal(
      convert('0', 'USD', 'KWD', ratio('9'.repeat(96))).target.money.amount,
      '0',
    );
  });

  it('keeps differences around a half tie beyond JavaScript number precision', () => {
    assert.equal(
      convert(
        '1',
        'BDT',
        'USD',
        ratio('250000000000000000001', '100000000000000000000'),
      ).target.money.amount,
      '3',
    );
    assert.equal(
      convert(
        '1',
        'BDT',
        'USD',
        ratio('249999999999999999999', '100000000000000000000'),
      ).target.money.amount,
      '2',
    );
  });

  it('matches an independent nearest-integer distance oracle over bounded cases', () => {
    // No division/rounding helper reuse: compare distances from candidate integers.
    for (let amount = 0n; amount <= 32n; amount++) {
      for (const numerator of [1n, 3n, 5n]) {
        for (const denominator of [2n, 3n, 7n]) {
          const exactNumerator = amount * numerator;
          let expected = 0n;
          let distance = exactNumerator;
          for (
            let candidate = 1n;
            candidate <= exactNumerator + 1n;
            candidate++
          ) {
            const delta = candidate * denominator - exactNumerator;
            const candidateDistance = delta < 0n ? -delta : delta;
            if (
              candidateDistance < distance ||
              (candidateDistance === distance && candidate % 2n === 0n)
            ) {
              expected = candidate;
              distance = candidateDistance;
            }
          }
          assert.equal(
            convert(
              amount.toString(),
              'BDT',
              'USD',
              ratio(numerator.toString(), denominator.toString()),
            ).target.money.amount,
            expected.toString(),
          );
        }
      }
    }
  });

  it('handles exponent boundaries explicitly rather than assuming two decimals', () => {
    assert.equal(
      convert('1', 'JPY', 'USD', ratio('1')).target.money.amount,
      '100',
    );
    assert.equal(
      convert('1500', 'JPY', 'USD', ratio('1', '150')).target.money.amount,
      '1000',
    );
    assert.equal(
      convert('3000', 'KWD', 'USD', ratio('10', '3')).target.money.amount,
      '1000',
    );
    const synthetic = { ...definitions[0], code: 'XAB', minorUnitExponent: 4 };
    const result = convertCurrencyMinorUnits(input('100', 'USD', 'XAB'), [
      ...definitions,
      synthetic,
    ]);
    assert.equal(result.target.money.amount, '10000');
  });

  it('rejects source and rounded-result overflow without clipping', () => {
    assert.throws(() => convert('9223372036854775808'));
    assert.throws(
      () => convert(POSTGRES_BIGINT_MAX.toString(), 'BDT', 'USD', ratio('2')),
      /BIGINT range/,
    );
    assert.equal(
      convert(POSTGRES_BIGINT_MAX.toString()).target.money.amount,
      POSTGRES_BIGINT_MAX.toString(),
    );
    // MAX + 1/2 rounds upward because MAX is odd, even though the floor fits.
    assert.throws(
      () => convert('1', 'BDT', 'USD', ratio('18446744073709551615', '2')),
      /BIGINT range/,
    );
    assert.throws(
      () => convert('1', 'USD', 'KWD', ratio('9'.repeat(96))),
      /BIGINT range/,
    );
  });

  it('rejects numeric, negative, noncanonical, oversized and extra request data', () => {
    for (const amount of [
      -1,
      1,
      1n,
      '-1',
      '+1',
      '01',
      '1.0',
      '1e2',
      '1\n',
      '9'.repeat(100000),
    ]) {
      assert.equal(
        currencyConversionInputSchema.safeParse(input(amount)).success,
        false,
      );
    }
    assert.throws(() =>
      convertCurrencyMinorUnits(
        { ...input('1'), quoteId: 'not-a-quote' },
        definitions,
      ),
    );
    assert.throws(() =>
      convertCurrencyMinorUnits(
        { ...input('1'), rate: { ...input('1').rate, markup: '1' } },
        definitions,
      ),
    );
  });

  it('multiplies stored rounded unit amounts and sums lines, not converted headers', () => {
    const unit = convert('5', 'BDT', 'USD', ratio('1', '2')).target.money;
    const lineA = BigInt(unit.amount) * 3n;
    const lineB =
      BigInt(convert('7', 'BDT', 'USD', ratio('1', '2')).target.money.amount) *
      1n;
    assert.equal(lineA.toString(), '6');
    assert.equal(lineB.toString(), '4');
    assert.equal((lineA + lineB).toString(), '10');
    assert.equal(
      convert('22', 'BDT', 'USD', ratio('1', '2')).target.money.amount,
      '11',
    );
    assert.equal(
      convert('15', 'BDT', 'USD', ratio('1', '2')).target.money.amount,
      '8',
    );
    assert.notEqual(lineA.toString(), '8');
  });

  it('does not promise reversibility or use a fresh inverse rate for refunds', () => {
    const forward = convert('1', 'BDT', 'USD', ratio('1', '2'));
    assert.equal(forward.target.money.amount, '0');
    assert.equal(
      convert('0', 'USD', 'BDT', ratio('2')).target.money.amount,
      '0',
    );
    assert.equal(forward.source.money.amount, '1');
  });

  it('preserves existing money parsing and serialization behavior', () => {
    const serialized = serializeMoney(9007199254740993n, 'BDT');
    assert.deepEqual(serialized, {
      amount: '9007199254740993',
      currency: 'BDT',
    });
    assert.deepEqual(parseMoney(serialized), {
      amount: 9007199254740993n,
      currency: 'BDT',
    });
    assert.equal(
      moneySchema.safeParse({ ...serialized, metadataVersion: 'extra' })
        .success,
      false,
    );
    for (const amount of ['01', '-1', '1.5', '9223372036854775808', 1]) {
      assert.equal(
        moneySchema.safeParse({ amount, currency: 'BDT' }).success,
        false,
      );
    }
  });
});

import { z } from 'zod';
import {
  currencyCodeSchema,
  minorUnitAmountSchema,
  POSTGRES_BIGINT_MAX,
  type SerializedMoney,
} from './contracts/money';

// Technical limits/policy for this unused foundation, not approved live billing rules.
export const CURRENCY_ARITHMETIC_POLICY = 'currency-half-even-v1' as const;
export const CURRENCY_ARITHMETIC_LIMITS = Object.freeze({
  definitions: 32,
  minorUnitExponent: 4,
  ratioDigits: 96,
  decimalWholeDigits: 64,
  decimalFractionDigits: 32,
  decimalTokenLength: 97,
});

const metadataVersionSchema = z
  .string()
  .max(64)
  .pipe(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/));
const boundedCurrencyCodeSchema = z.string().length(3).pipe(currencyCodeSchema);
const boundedAmountSchema = z.string().max(19).pipe(minorUnitAmountSchema);
const positiveRatioIntegerSchema = z
  .string()
  .max(CURRENCY_ARITHMETIC_LIMITS.ratioDigits)
  .pipe(z.string().regex(/^[1-9]\d*$/));
const decimalRateTokenSchema = z
  .string()
  .max(CURRENCY_ARITHMETIC_LIMITS.decimalTokenLength)
  .pipe(z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/));

export const currencyUnitDefinitionSchema = z
  .object({
    code: boundedCurrencyCodeSchema,
    minorUnitExponent: z
      .number()
      .int()
      .min(0)
      .max(CURRENCY_ARITHMETIC_LIMITS.minorUnitExponent),
    metadataVersion: metadataVersionSchema,
    provenance: z
      .string()
      .min(1)
      .max(256)
      .pipe(z.string().regex(/^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/)),
    status: z.enum(['current', 'historical']),
  })
  .strict();

export type CurrencyUnitDefinition = z.infer<
  typeof currencyUnitDefinitionSchema
>;

// Check the array budget before Zod traverses its members. No default/global registry.
export const currencyUnitContextSchema = z
  .custom<unknown[]>(
    (value) =>
      Array.isArray(value) &&
      value.length > 0 &&
      value.length <= CURRENCY_ARITHMETIC_LIMITS.definitions,
    'Expected a bounded explicit currency context',
  )
  .pipe(z.array(currencyUnitDefinitionSchema))
  .superRefine((definitions, context) => {
    const identities = new Set<string>();
    definitions.forEach((definition, index) => {
      const identity = `${definition.code}:${definition.metadataVersion}`;
      if (identities.has(identity)) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: 'Duplicate or conflicting currency definition',
        });
      }
      identities.add(identity);
    });
  });

export const exactRatioSchema = z
  .object({
    numerator: positiveRatioIntegerSchema,
    denominator: positiveRatioIntegerSchema,
  })
  .strict();
export type ExactRatio = z.infer<typeof exactRatioSchema>;

export const directedCurrencyRateSchema = exactRatioSchema
  .extend({
    sourceCurrency: boundedCurrencyCodeSchema,
    targetCurrency: boundedCurrencyCodeSchema,
  })
  .strict();
export type DirectedCurrencyRate = z.infer<typeof directedCurrencyRateSchema>;

const unitReferenceSchema = z
  .object({
    code: boundedCurrencyCodeSchema,
    metadataVersion: metadataVersionSchema,
  })
  .strict();

export const currencyConversionInputSchema = z
  .object({
    amount: boundedAmountSchema,
    source: unitReferenceSchema,
    target: unitReferenceSchema,
    rate: directedCurrencyRateSchema.optional(),
  })
  .strict();

export interface CurrencyConversionResult {
  policyVersion: typeof CURRENCY_ARITHMETIC_POLICY;
  method: 'identity' | 'conversion';
  source: { money: SerializedMoney; definition: CurrencyUnitDefinition };
  target: { money: SerializedMoney; definition: CurrencyUnitDefinition };
  rate: DirectedCurrencyRate | null;
  rounding: {
    quotient: string;
    remainder: string;
    divisor: string;
    incremented: boolean;
  };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

function reducedRatio(numerator: bigint, denominator: bigint): ExactRatio {
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: (numerator / divisor).toString(),
    denominator: (denominator / divisor).toString(),
  };
}

export function normalizeExactRatio(value: unknown): ExactRatio {
  const ratio = exactRatioSchema.parse(value);
  return reducedRatio(BigInt(ratio.numerator), BigInt(ratio.denominator));
}

// Plain positive decimals only: no exponent notation, signs, whitespace or numeric JSON.
export function parseExactDecimalRate(value: unknown): ExactRatio {
  const token = decimalRateTokenSchema.parse(value);
  const decimalPoint = token.indexOf('.');
  const whole = decimalPoint === -1 ? token : token.slice(0, decimalPoint);
  const fraction = decimalPoint === -1 ? '' : token.slice(decimalPoint + 1);
  if (
    whole.length > CURRENCY_ARITHMETIC_LIMITS.decimalWholeDigits ||
    fraction.length > CURRENCY_ARITHMETIC_LIMITS.decimalFractionDigits
  ) {
    throw new RangeError('Rate exceeds exact decimal limits');
  }
  const numerator = BigInt(whole + fraction);
  if (numerator === 0n) throw new RangeError('Rate must be positive');
  return reducedRatio(numerator, 10n ** BigInt(fraction.length));
}

function resolveDefinition(
  definitions: CurrencyUnitDefinition[],
  reference: z.infer<typeof unitReferenceSchema>,
): CurrencyUnitDefinition {
  const definition = definitions.find(
    (candidate) =>
      candidate.code === reference.code &&
      candidate.metadataVersion === reference.metadataVersion,
  );
  if (!definition)
    throw new RangeError('Currency metadata is not in the explicit context');
  return definition;
}

export function convertCurrencyMinorUnits(
  value: unknown,
  explicitDefinitions: unknown,
): CurrencyConversionResult {
  const input = currencyConversionInputSchema.parse(value);
  const definitions = currencyUnitContextSchema.parse(explicitDefinitions);
  const source = resolveDefinition(definitions, input.source);
  const target = resolveDefinition(definitions, input.target);
  const amount = BigInt(input.amount);
  const sourceMoney = { amount: input.amount, currency: source.code };

  if (source.code === target.code) {
    // Different historical versions cannot be silently treated as today's same unit.
    if (
      source.metadataVersion !== target.metadataVersion ||
      input.rate !== undefined
    ) {
      throw new RangeError(
        'Identity requires matching metadata and no external rate',
      );
    }
    return {
      policyVersion: CURRENCY_ARITHMETIC_POLICY,
      method: 'identity',
      source: { money: sourceMoney, definition: source },
      target: { money: { ...sourceMoney }, definition: target },
      rate: null,
      rounding: {
        quotient: input.amount,
        remainder: '0',
        divisor: '1',
        incremented: false,
      },
    };
  }

  if (
    !input.rate ||
    input.rate.sourceCurrency !== source.code ||
    input.rate.targetCurrency !== target.code
  ) {
    throw new RangeError('Conversion requires a matching directed rate');
  }
  const ratio = normalizeExactRatio({
    numerator: input.rate.numerator,
    denominator: input.rate.denominator,
  });
  // At most 19 + 96 + 4 decimal digits above, 96 + 4 below; no unbounded powers.
  const numerator =
    amount * BigInt(ratio.numerator) * 10n ** BigInt(target.minorUnitExponent);
  const divisor =
    BigInt(ratio.denominator) * 10n ** BigInt(source.minorUnitExponent);
  const quotient = numerator / divisor;
  const remainder = numerator % divisor;
  const doubledRemainder = remainder * 2n;
  const incremented =
    doubledRemainder > divisor ||
    (doubledRemainder === divisor && quotient % 2n === 1n);
  const rounded = quotient + (incremented ? 1n : 0n);
  if (rounded > POSTGRES_BIGINT_MAX) {
    throw new RangeError(
      'Converted amount exceeds the PostgreSQL BIGINT range',
    );
  }
  return {
    policyVersion: CURRENCY_ARITHMETIC_POLICY,
    method: 'conversion',
    source: { money: sourceMoney, definition: source },
    target: {
      money: { amount: rounded.toString(), currency: target.code },
      definition: target,
    },
    rate: {
      ...ratio,
      sourceCurrency: source.code,
      targetCurrency: target.code,
    },
    rounding: {
      quotient: quotient.toString(),
      remainder: remainder.toString(),
      divisor: divisor.toString(),
      incremented,
    },
  };
}

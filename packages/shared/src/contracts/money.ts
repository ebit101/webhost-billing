import { z } from 'zod';

export const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const POSTGRES_BIGINT_MAX_STRING = POSTGRES_BIGINT_MAX.toString();

function fitsPostgresBigint(value: string): boolean {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    return false;
  }

  return (
    value.length < POSTGRES_BIGINT_MAX_STRING.length ||
    (value.length === POSTGRES_BIGINT_MAX_STRING.length &&
      value <= POSTGRES_BIGINT_MAX_STRING)
  );
}

export const currencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Expected a three-letter uppercase currency code');

export const minorUnitAmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, 'Expected a canonical non-negative integer string')
  .refine(fitsPostgresBigint, 'Amount exceeds the PostgreSQL BIGINT range');

export const moneySchema = z
  .object({
    amount: minorUnitAmountSchema,
    currency: currencyCodeSchema,
  })
  .strict();

export type CurrencyCode = z.infer<typeof currencyCodeSchema>;
export type SerializedMoney = z.infer<typeof moneySchema>;

export interface MoneyValue {
  amount: bigint;
  currency: CurrencyCode;
}

export function serializeMoney(
  amount: bigint,
  currency: string,
): SerializedMoney {
  return moneySchema.parse({ amount: amount.toString(), currency });
}

export function parseMoney(value: unknown): MoneyValue {
  const serialized = moneySchema.parse(value);

  return {
    amount: BigInt(serialized.amount),
    currency: serialized.currency,
  };
}

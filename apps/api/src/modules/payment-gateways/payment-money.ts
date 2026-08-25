import { PaymentProviderError } from './payment-provider.error';

const MAJOR_AMOUNT_PATTERN = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export function minorToMajor(amount: bigint): string {
  if (amount < 0n) throw invalidMoney();
  const whole = amount / 100n;
  const fraction = (amount % 100n).toString().padStart(2, '0');
  return `${whole.toString()}.${fraction}`;
}

export function majorToMinor(value: string): bigint {
  const match = MAJOR_AMOUNT_PATTERN.exec(value);
  if (!match) throw invalidMoney();
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return BigInt(match[1] ?? '0') * 100n + BigInt(fraction || '0');
}

function invalidMoney(): PaymentProviderError {
  return new PaymentProviderError(
    'The payment provider returned an invalid amount.',
    'FAILED',
  );
}

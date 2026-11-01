import { minorUnitAmountSchema } from '@webhost-billing/shared';

// Match the existing money renderer without converting monetary values to Number.
function fractionDigits(currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Enter a three-letter currency code, such as BDT.');
  }
  return (
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

export function moneyForInput(amount: string, currency: string) {
  const digits = fractionDigits(currency);
  const value = BigInt(amount);
  const divisor = 10n ** BigInt(digits);
  const whole = (value / divisor).toString();
  return digits
    ? `${whole}.${(value % divisor).toString().padStart(digits, '0')}`
    : whole;
}

export function moneyToMinor(value: string, currency: string, label: string) {
  const digits = fractionDigits(currency);
  const text = value.trim();
  const pattern = new RegExp(
    digits ? `^\\d+(?:\\.\\d{1,${digits}})?$` : '^\\d+$',
  );
  if (text.length > 40 || !pattern.test(text)) {
    throw new Error(
      `${label} must be a non-negative amount with ${digits ? `at most ${digits} decimal places` : 'no decimal places'} in ${currency}.`,
    );
  }
  const [whole, fraction = ''] = text.split('.');
  const amount = (
    BigInt(whole!) * 10n ** BigInt(digits) +
    BigInt(fraction.padEnd(digits, '0') || '0')
  ).toString();
  if (!minorUnitAmountSchema.safeParse(amount).success) {
    throw new Error(`${label} exceeds the supported amount.`);
  }
  return amount;
}

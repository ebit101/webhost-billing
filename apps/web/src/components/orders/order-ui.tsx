import type { OrderStatus, PublicProduct } from '@webhost-billing/shared';

export function formatHostingSubtotal(
  price: PublicProduct['prices'][number],
): string | undefined {
  if (price.amount.currency !== price.setupFee.currency) return undefined;
  return formatMinor(
    (BigInt(price.amount.amount) + BigInt(price.setupFee.amount)).toString(),
    price.amount.currency,
  );
}

export function formatMinor(amount: string, currency: string) {
  const fractionDigits =
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const value = BigInt(amount);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = 10n ** BigInt(fractionDigits);
  const whole = absolute / divisor;
  if (fractionDigits === 0) {
    return `${negative ? '-' : ''}${currency} ${whole.toLocaleString('en-US')}`;
  }
  const fraction = (absolute % divisor)
    .toString()
    .padStart(fractionDigits, '0');
  return `${negative ? '-' : ''}${currency} ${whole.toLocaleString('en-US')}.${fraction}`;
}

export function orderTone(status: OrderStatus) {
  if (status === 'COMPLETED') return 'success' as const;
  if (status === 'PAID' || status === 'PROCESSING') return 'info' as const;
  if (status === 'AWAITING_PAYMENT' || status === 'PENDING')
    return 'warning' as const;
  return 'danger' as const;
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'The request could not be completed.';
}

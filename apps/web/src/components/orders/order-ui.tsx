import type {
  Order,
  OrderStatus,
  PublicHostingAddOn,
  PublicProduct,
} from '@webhost-billing/shared';

export function addOnPeriodLabel(period: PublicHostingAddOn['billingPeriod']) {
  return period === 'ONE_TIME' ? 'one time' : period.toLowerCase();
}

export function matchesHostingAddOn(
  offer: PublicHostingAddOn,
  price: PublicProduct['prices'][number] | undefined,
) {
  return (
    price?.amount.currency === offer.amount.currency &&
    (offer.billingPeriod === 'ONE_TIME' ||
      offer.billingPeriod === price.billingPeriod)
  );
}

export function formatHostingSubtotal(
  price: PublicProduct['prices'][number],
  addOns: PublicHostingAddOn[] = [],
): string | undefined {
  if (price.amount.currency !== price.setupFee.currency) return undefined;
  return formatMinor(
    addOns
      .reduce(
        (total, item) => total + BigInt(item.amount.amount),
        BigInt(price.amount.amount) + BigInt(price.setupFee.amount),
      )
      .toString(),
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

export function addOnStatus(order: Order, item: Order['items'][number]) {
  if (item.fulfilledAt) return 'Fulfilled';
  if (order.status === 'CANCELLED' || order.status === 'REJECTED')
    return 'Cancelled';
  return order.invoice.status === 'PAID'
    ? 'Awaiting fulfillment'
    : 'Awaiting payment';
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'The request could not be completed.';
}

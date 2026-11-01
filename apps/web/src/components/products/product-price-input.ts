import { productPriceInputSchema } from '@webhost-billing/shared';
import { moneyToMinor } from '../../lib/money-input';

export function productPriceFromForm(raw: Record<string, unknown>) {
  const currency = String(raw.currency ?? '')
    .trim()
    .toUpperCase();
  const amount = moneyToMinor(String(raw.amount ?? ''), currency, 'Price');
  if (amount === '0') throw new Error('Price must be greater than zero.');
  return productPriceInputSchema.parse({
    billingPeriod: raw.billingPeriod,
    currency,
    amount,
    setupFee: moneyToMinor(String(raw.setupFee || '0'), currency, 'Setup fee'),
  });
}

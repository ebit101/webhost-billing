import { createCustomerOrderRequestSchema } from '@webhost-billing/shared';

const selectionSchema = createCustomerOrderRequestSchema.pick({
  productId: true,
  priceId: true,
});

export type CheckoutIntent = { productId: string; priceId: string };
export type SelectionQuery = Record<string, string | string[] | undefined>;
export const CHECKOUT_INTENT_HEADER = 'x-webhost-checkout-intent';

// Extract only identifiers. URLs, amounts and account data are never authority.
export function readCheckoutIntent(
  query: URLSearchParams | SelectionQuery,
): CheckoutIntent | undefined {
  const candidate =
    query instanceof URLSearchParams
      ? {
          productId: single(query.getAll('productId')),
          priceId: single(query.getAll('priceId')),
        }
      : { productId: query.productId, priceId: query.priceId };
  const parsed = selectionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

function single(values: string[]): string | undefined {
  return values.length === 1 ? values[0] : undefined;
}

export function checkoutIntentQuery(intent: CheckoutIntent): string {
  const validated = readCheckoutIntent(intent);
  return validated ? new URLSearchParams(validated).toString() : '';
}

export function checkoutEntryHref(
  entry: '/login' | '/register',
  intent?: CheckoutIntent,
): string {
  const query = intent ? checkoutIntentQuery(intent) : '';
  return query ? `${entry}?${query}` : entry;
}

export function customerLandingHref(intent?: CheckoutIntent): string {
  const query = intent ? checkoutIntentQuery(intent) : '';
  return query ? `/portal/checkout?${query}` : '/portal';
}

import type { Metadata } from 'next';
import { CustomerCheckout } from '../../../components/orders/customer-checkout';
import { CheckoutPreview } from '../../../components/orders/checkout-preview';
import {
  readCheckoutIntent,
  type SelectionQuery,
} from '../../../lib/checkout-intent';
import { getAuthenticatedIdentity } from '../../../lib/server-auth';

export const metadata: Metadata = { title: 'Checkout' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SelectionQuery>;
}) {
  const selection = readCheckoutIntent(await searchParams);
  const identity = await getAuthenticatedIdentity();
  if (identity?.role === 'CUSTOMER') {
    return (
      <main
        id="main-content"
        className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6"
      >
        <CustomerCheckout
          key={
            selection
              ? `${selection.productId}:${selection.priceId}`
              : 'no-intent'
          }
          initialProductId={selection?.productId}
          initialPriceId={selection?.priceId}
        />
      </main>
    );
  }
  return (
    <CheckoutPreview
      selection={selection}
      audience={identity?.role === 'ADMIN' ? 'admin' : 'guest'}
    />
  );
}

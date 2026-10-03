import type { Metadata } from 'next';
import { CustomerCheckout } from '../../../../components/orders/customer-checkout';
import {
  readCheckoutIntent,
  type SelectionQuery,
} from '../../../../lib/checkout-intent';
import { requireWorkspaceRole } from '../../../../lib/server-auth';

export const metadata: Metadata = { title: 'Checkout' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SelectionQuery>;
}) {
  await requireWorkspaceRole('CUSTOMER');
  const selection = readCheckoutIntent(await searchParams);
  return (
    <CustomerCheckout
      key={
        selection ? `${selection.productId}:${selection.priceId}` : 'no-intent'
      }
      initialProductId={selection?.productId}
      initialPriceId={selection?.priceId}
    />
  );
}

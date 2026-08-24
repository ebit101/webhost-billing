import type { Metadata } from 'next';
import { CustomerCheckout } from '../../../../components/orders/customer-checkout';

export const metadata: Metadata = { title: 'Checkout' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; priceId?: string }>;
}) {
  const selection = await searchParams;
  return (
    <CustomerCheckout
      initialProductId={selection.productId}
      initialPriceId={selection.priceId}
    />
  );
}

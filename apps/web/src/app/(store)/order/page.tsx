import type { Metadata } from 'next';
import { PublicOrderBuilder } from '../../../components/orders/public-order-builder';
import {
  readCheckoutIntent,
  type SelectionQuery,
} from '../../../lib/checkout-intent';

export const metadata: Metadata = { title: 'Choose a domain' };

export default async function OrderPage({
  searchParams,
}: {
  searchParams: Promise<SelectionQuery>;
}) {
  const selection = readCheckoutIntent(await searchParams);
  return <PublicOrderBuilder selection={selection} />;
}

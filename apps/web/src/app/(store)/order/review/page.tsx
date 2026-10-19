import type { Metadata } from 'next';
import { OrderReview } from '../../../../components/orders/order-review';
import {
  readCheckoutIntent,
  type SelectionQuery,
} from '../../../../lib/checkout-intent';

export const metadata: Metadata = { title: 'Review cart' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SelectionQuery>;
}) {
  return <OrderReview selection={readCheckoutIntent(await searchParams)} />;
}

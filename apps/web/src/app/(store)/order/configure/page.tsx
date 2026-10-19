import type { Metadata } from 'next';
import { OrderConfigure } from '../../../../components/orders/order-configure';
import {
  readCheckoutIntent,
  type SelectionQuery,
} from '../../../../lib/checkout-intent';

export const metadata: Metadata = { title: 'Configure hosting' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SelectionQuery>;
}) {
  return <OrderConfigure selection={readCheckoutIntent(await searchParams)} />;
}

import type { Metadata } from 'next';
import { CustomerOrderList } from '../../../../components/orders/customer-order-list';

export const metadata: Metadata = { title: 'My orders' };

export default function Page() {
  return <CustomerOrderList />;
}

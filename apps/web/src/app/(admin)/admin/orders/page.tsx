import type { Metadata } from 'next';
import { AdminOrderManager } from '../../../../components/orders/admin-order-manager';
export const metadata: Metadata = { title: 'Orders' };
export default function Page() {
  return <AdminOrderManager />;
}

import type { Metadata } from 'next';
import { AdminCustomerManager } from '../../../../components/customers/admin-customer-manager';
export const metadata: Metadata = { title: 'Customers' };
export default function Page() {
  return <AdminCustomerManager />;
}

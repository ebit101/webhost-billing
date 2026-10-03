import type { Metadata } from 'next';
import { AdminPaymentManager } from '../../../../components/payments/admin-payment-manager';
import { parseAdminCustomerFilter } from '../../../../lib/admin-customer-filter';
export const metadata: Metadata = { title: 'Payments' };
export default async function Page({
  searchParams,
}: PageProps<'/admin/payments'>) {
  const { customerId } = await searchParams;
  return (
    <AdminPaymentManager
      customerFilter={parseAdminCustomerFilter(customerId)}
    />
  );
}

import type { Metadata } from 'next';
import { AdminCustomerDetail } from '../../../../../components/customers/admin-customer-detail';

export const metadata: Metadata = { title: 'Customer details' };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <AdminCustomerDetail customerId={customerId} />;
}

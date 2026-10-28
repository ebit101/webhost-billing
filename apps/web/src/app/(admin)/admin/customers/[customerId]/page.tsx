import type { Metadata } from 'next';
import { AdminCustomerDetail } from '../../../../../components/customers/admin-customer-detail';
import { BillingCustomerContext } from '../../../../../components/staff/billing-customer-context';
import { authorizeAdminPage } from '../../../../../lib/server-admin-access';

export const metadata: Metadata = { title: 'Customer details' };

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { customerId } = await params;
  const identity = await authorizeAdminPage('/admin/customers');
  if (!identity) return null;
  if (identity.staffRole !== 'FULL_ADMINISTRATOR')
    return <BillingCustomerContext customerId={customerId} />;
  return (
    <AdminCustomerDetail
      customerId={customerId}
      section={(await searchParams)?.tab === 'profile' ? 'profile' : 'summary'}
    />
  );
}

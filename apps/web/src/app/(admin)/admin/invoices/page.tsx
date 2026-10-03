import type { Metadata } from 'next';
import { AdminInvoiceManager } from '../../../../components/invoices/admin-invoice-manager';
import { parseAdminCustomerFilter } from '../../../../lib/admin-customer-filter';
export const metadata: Metadata = { title: 'Invoices' };
export default async function Page({
  searchParams,
}: PageProps<'/admin/invoices'>) {
  const { customerId } = await searchParams;
  return (
    <AdminInvoiceManager
      customerFilter={parseAdminCustomerFilter(customerId)}
    />
  );
}

import type { Metadata } from 'next';
import { AdminInvoiceManager } from '../../../../components/invoices/admin-invoice-manager';
import { readAdminInvoiceQuery } from '../../../../lib/admin-invoice-ledger-query';
export const metadata: Metadata = { title: 'Invoices' };
export default async function Page({
  searchParams,
}: PageProps<'/admin/invoices'>) {
  const selection = readAdminInvoiceQuery(await searchParams);
  return <AdminInvoiceManager selection={selection} />;
}

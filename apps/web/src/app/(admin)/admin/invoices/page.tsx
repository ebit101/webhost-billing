import type { Metadata } from 'next';
import { AdminInvoiceManager } from '../../../../components/invoices/admin-invoice-manager';
import { readAdminInvoiceQuery } from '../../../../lib/admin-invoice-ledger-query';
import { authorizeAdminPage } from '../../../../lib/server-admin-access';
export const metadata: Metadata = { title: 'Invoices' };
export default async function Page({
  searchParams,
}: PageProps<'/admin/invoices'>) {
  const selection = readAdminInvoiceQuery(await searchParams);
  const identity = await authorizeAdminPage('/admin/invoices');
  if (!identity) return null;
  return (
    <AdminInvoiceManager
      selection={selection}
      canManageIdentity={identity.staffRole === 'FULL_ADMINISTRATOR'}
    />
  );
}

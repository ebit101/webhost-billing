import type { Metadata } from 'next';
import { AdminInvoiceManager } from '../../../../components/invoices/admin-invoice-manager';
export const metadata: Metadata = { title: 'Invoices' };
export default function Page() {
  return <AdminInvoiceManager />;
}

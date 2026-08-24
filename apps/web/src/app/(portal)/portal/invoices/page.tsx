import type { Metadata } from 'next';
import { CustomerInvoiceList } from '../../../../components/invoices/customer-invoice-list';
export const metadata: Metadata = { title: 'Invoices' };
export default function InvoicesPage() {
  return <CustomerInvoiceList />;
}

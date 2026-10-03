import type { Metadata } from 'next';
import { CustomerInvoiceList } from '../../../../components/invoices/customer-invoice-list';
import { readInvoiceLedgerQuery } from '../../../../lib/invoice-ledger-query';
export const metadata: Metadata = { title: 'Invoices' };
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <CustomerInvoiceList
      selection={readInvoiceLedgerQuery(await searchParams)}
    />
  );
}

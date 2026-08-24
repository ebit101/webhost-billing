import type { Metadata } from 'next';
import { InvoiceDetail } from '../../../../components/invoices/invoice-detail';

export const metadata: Metadata = { title: 'Printable invoice' };

export default async function Page({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  return <InvoiceDetail invoiceId={invoiceId} mode="print" />;
}

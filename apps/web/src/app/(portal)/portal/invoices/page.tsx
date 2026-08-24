import type { Metadata } from 'next';
import { SectionPreview } from '../../../../components/dashboard/section-preview';
export const metadata: Metadata = { title: 'Invoices' };
export default function InvoicesPage() {
  return (
    <SectionPreview
      area="Customer portal"
      title="Invoices"
      description="Find balances, due dates, and historical billing documents."
    />
  );
}

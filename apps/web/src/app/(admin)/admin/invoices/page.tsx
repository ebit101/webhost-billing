import type { Metadata } from 'next';
import { SectionPreview } from '../../../../components/dashboard/section-preview';
export const metadata: Metadata = { title: 'Invoices' };
export default function Page() {
  return (
    <SectionPreview
      area="Administrator"
      title="Invoices"
      description="Review immutable issued documents, balances, and due dates."
    />
  );
}

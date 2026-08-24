import type { Metadata } from 'next';
import { SectionPreview } from '../../../../components/dashboard/section-preview';
export const metadata: Metadata = { title: 'Customers' };
export default function Page() {
  return (
    <SectionPreview
      area="Administrator"
      title="Customers"
      description="Search and manage customer identity, billing, and access status."
    />
  );
}

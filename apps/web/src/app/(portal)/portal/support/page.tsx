import type { Metadata } from 'next';
import { SectionPreview } from '../../../../components/dashboard/section-preview';
export const metadata: Metadata = { title: 'Support' };
export default function SupportPage() {
  return (
    <SectionPreview
      area="Customer portal"
      title="Support"
      description="Open a ticket and follow conversations with the hosting team."
    />
  );
}

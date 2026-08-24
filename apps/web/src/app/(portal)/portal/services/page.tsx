import type { Metadata } from 'next';
import { SectionPreview } from '../../../../components/dashboard/section-preview';
export const metadata: Metadata = { title: 'My services' };
export default function ServicesPage() {
  return (
    <SectionPreview
      area="Customer portal"
      title="My services"
      description="Review hosting status, renewal dates, and account details."
    />
  );
}

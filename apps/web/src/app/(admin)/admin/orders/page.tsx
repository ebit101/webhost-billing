import type { Metadata } from 'next';
import { SectionPreview } from '../../../../components/dashboard/section-preview';
export const metadata: Metadata = { title: 'Orders' };
export default function Page() {
  return (
    <SectionPreview
      area="Administrator"
      title="Orders"
      description="Review incoming hosting orders and their independent states."
    />
  );
}

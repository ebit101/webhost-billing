import type { Metadata } from 'next';
import { SectionPreview } from '../../../../components/dashboard/section-preview';
export const metadata: Metadata = { title: 'Automation' };
export default function Page() {
  return (
    <SectionPreview
      area="Administrator"
      title="Automation"
      description="Inspect scheduled work, retries, results, and audit context."
    />
  );
}

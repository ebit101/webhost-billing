import type { Metadata } from 'next';
import { SectionPreview } from '../../../../components/dashboard/section-preview';
export const metadata: Metadata = { title: 'Support' };
export default function Page() {
  return (
    <SectionPreview
      area="Administrator"
      title="Support"
      description="Keep customer support conversations organized and visible."
    />
  );
}

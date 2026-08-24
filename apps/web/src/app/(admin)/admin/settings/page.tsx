import type { Metadata } from 'next';
import { SectionPreview } from '../../../../components/dashboard/section-preview';
export const metadata: Metadata = { title: 'Settings' };
export default function Page() {
  return (
    <SectionPreview
      area="Administrator"
      title="Settings"
      description="Configure business identity and future provider integrations."
    />
  );
}

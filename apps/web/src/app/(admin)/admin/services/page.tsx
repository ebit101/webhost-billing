import type { Metadata } from 'next';
import { SectionPreview } from '../../../../components/dashboard/section-preview';
export const metadata: Metadata = { title: 'Services' };
export default function Page() {
  return (
    <SectionPreview
      area="Administrator"
      title="Services"
      description="Monitor hosting services without conflating payment or provisioning state."
    />
  );
}

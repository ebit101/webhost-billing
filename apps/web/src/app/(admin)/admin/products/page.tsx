import type { Metadata } from 'next';
import { SectionPreview } from '../../../../components/dashboard/section-preview';
export const metadata: Metadata = { title: 'Products' };
export default function Page() {
  return (
    <SectionPreview
      area="Administrator"
      title="Products"
      description="Define the small, focused hosting catalogue and its prices."
    />
  );
}

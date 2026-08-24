import type { Metadata } from 'next';
import { SectionPreview } from '../../../../components/dashboard/section-preview';
export const metadata: Metadata = { title: 'Payments' };
export default function Page() {
  return (
    <SectionPreview
      area="Administrator"
      title="Payments"
      description="Record and reconcile append-only financial transactions."
    />
  );
}

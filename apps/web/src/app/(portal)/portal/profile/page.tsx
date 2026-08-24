import type { Metadata } from 'next';
import { SectionPreview } from '../../../../components/dashboard/section-preview';
export const metadata: Metadata = { title: 'Profile and security' };
export default function ProfilePage() {
  return (
    <SectionPreview
      area="Customer portal"
      title="Profile & security"
      description="Manage contact information, billing identity, password, and active sessions."
    />
  );
}

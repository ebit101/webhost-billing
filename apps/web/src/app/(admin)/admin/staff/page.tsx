import { StaffManager } from '../../../../components/staff/staff-manager';
import { authorizeAdminPage } from '../../../../lib/server-admin-access';

export const metadata = { title: 'Administrators' };

export default async function Page() {
  const identity = await authorizeAdminPage('/admin/staff');
  if (!identity) return null;
  return (
    <StaffManager
      currentUserId={identity.userId}
      twoFactorEnabled={identity.twoFactorEnabled}
    />
  );
}

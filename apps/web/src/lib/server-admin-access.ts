import { redirect } from 'next/navigation';
import { canAccessAdminPath, staffHome } from './admin-access';
import { getAuthenticatedIdentity } from './server-auth';

export async function authorizeAdminPage(path: string) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return null; // The parent layout renders administrator sign-in.
  if (identity.role !== 'ADMIN') redirect('/portal');
  if (identity.staffRole !== 'FULL_ADMINISTRATOR' && !identity.twoFactorEnabled)
    redirect('/account');
  if (!canAccessAdminPath(identity.staffRole, path))
    redirect(staffHome(identity.staffRole));
  return identity;
}

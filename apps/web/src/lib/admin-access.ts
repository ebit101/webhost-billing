import {
  hasStaffPermission,
  staffHome,
  type StaffRole,
} from '@webhost-billing/shared';

export function canAccessAdminPath(role: StaffRole, path: string): boolean {
  if (role === 'FULL_ADMINISTRATOR') return true;
  const area = path.split('/')[2];
  if (area === 'customers') return hasStaffPermission(role, 'customers.read');
  if (area === 'invoices') return hasStaffPermission(role, 'invoices.read');
  if (area === 'payments') return hasStaffPermission(role, 'payments.read');
  if (area === 'support') return hasStaffPermission(role, 'tickets.manage');
  return false;
}

export { staffHome };

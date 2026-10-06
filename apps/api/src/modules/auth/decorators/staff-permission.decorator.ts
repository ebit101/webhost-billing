import { SetMetadata } from '@nestjs/common';
import type { StaffPermission } from '@webhost-billing/shared';

export const STAFF_PERMISSION_KEY = 'staffPermission';
// Applies to administrator identities only; customer ownership checks remain intact.
export const StaffPermissionRequired = (permission: StaffPermission) =>
  SetMetadata(STAFF_PERMISSION_KEY, permission);

import { SetMetadata } from '@nestjs/common';
import type { Role } from '@webhost-billing/shared';

export const REQUIRED_ROLES_KEY = 'auth:required-roles';
export const Roles = (...roles: readonly Role[]) =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);

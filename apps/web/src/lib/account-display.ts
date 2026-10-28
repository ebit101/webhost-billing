import type { AuthenticatedIdentity } from '@webhost-billing/shared';

export function accountDisplayName(identity: AuthenticatedIdentity): string {
  return identity.role === 'ADMIN'
    ? identity.displayName?.trim() || 'Administrator'
    : identity.email;
}

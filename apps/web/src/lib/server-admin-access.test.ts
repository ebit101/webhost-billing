import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeAdminPage } from './server-admin-access';

const auth = vi.hoisted(() => ({ identity: vi.fn() }));
vi.mock('./server-auth', () => ({ getAuthenticatedIdentity: auth.identity }));
vi.mock('next/navigation', () => ({
  redirect: (path: string): never => {
    throw new Error(`redirect:${path}`);
  },
}));
const identity = {
  userId: '92000000-0000-4000-8000-000000000001',
  email: 'billing@example.test',
  role: 'ADMIN',
  adminProfileId: '92000000-0000-4000-8000-000000000002',
  staffRole: 'BILLING_OPERATOR',
  twoFactorEnabled: true,
};
beforeEach(() => {
  auth.identity.mockReset();
});

describe('server administrator page access', () => {
  it('leaves anonymous sign-in to the parent and sends customers to their portal', async () => {
    auth.identity.mockResolvedValue(null);
    await expect(authorizeAdminPage('/admin/staff')).resolves.toBeNull();
    auth.identity.mockResolvedValue({ role: 'CUSTOMER' });
    await expect(authorizeAdminPage('/admin/staff')).rejects.toThrow(
      'redirect:/portal',
    );
  });
  it('blocks direct staff/settings routes for billing and ticket routes for other roles', async () => {
    auth.identity.mockResolvedValue(identity);
    await expect(authorizeAdminPage('/admin/staff')).rejects.toThrow(
      'redirect:/admin/invoices',
    );
    await expect(authorizeAdminPage('/admin/settings')).rejects.toThrow(
      'redirect:/admin/invoices',
    );
    await expect(authorizeAdminPage('/admin/support')).rejects.toThrow(
      'redirect:/admin/invoices',
    );
    await expect(authorizeAdminPage('/admin/invoices')).resolves.toEqual(
      identity,
    );
    auth.identity.mockResolvedValue({
      ...identity,
      staffRole: 'SUPPORT_OPERATOR',
    });
    await expect(authorizeAdminPage('/admin/invoices')).rejects.toThrow(
      'redirect:/admin/support',
    );
  });
  it('routes unenrolled staff to the account page and preserves enrolled full access', async () => {
    auth.identity.mockResolvedValue({ ...identity, twoFactorEnabled: false });
    await expect(authorizeAdminPage('/admin/invoices')).rejects.toThrow(
      'redirect:/account',
    );
    auth.identity.mockResolvedValue({
      ...identity,
      staffRole: 'FULL_ADMINISTRATOR',
    });
    await expect(authorizeAdminPage('/admin/staff')).resolves.toMatchObject({
      staffRole: 'FULL_ADMINISTRATOR',
    });
  });
});

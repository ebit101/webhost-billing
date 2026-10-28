import type { AdministratorIdentity } from '@webhost-billing/shared';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminLayout from './layout';

const auth = vi.hoisted(() => ({ identity: vi.fn() }));
vi.mock('../../../lib/server-auth', () => ({
  getAuthenticatedIdentity: auth.identity,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  redirect: vi.fn(),
}));
vi.mock('../../../lib/auth-api', () => ({
  authenticatedGet: vi.fn().mockResolvedValue({}),
}));
const identity: AdministratorIdentity = {
  userId: '10000000-0000-4000-8000-000000000001',
  adminProfileId: '10000000-0000-4000-8000-000000000002',
  role: 'ADMIN',
  staffRole: 'FULL_ADMINISTRATOR',
  twoFactorEnabled: true,
  email: 'admin@example.test',
  displayName: 'Fictional Administrator',
};
afterEach(() => vi.clearAllMocks());

describe('administrator sidebar identity', () => {
  it.each(['Fictional Administrator', undefined])(
    'uses saved name or a neutral fallback rather than the email',
    async (displayName) => {
      auth.identity.mockResolvedValue({ ...identity, displayName });
      render(await AdminLayout({ children: <p>Dashboard content</p> }));
      const name = displayName ?? 'Administrator';
      expect(
        screen
          .getByRole('link', { name: new RegExp(`${name} Full administrator`) })
          .getAttribute('href'),
      ).toBe('/account');
      expect(screen.queryByText(identity.email)).toBeNull();
    },
  );
});

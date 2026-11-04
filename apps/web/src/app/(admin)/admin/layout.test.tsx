import type { AdministratorIdentity } from '@webhost-billing/shared';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminLayout from './layout';
import { DomainWorkspaceTabs } from '../../../components/domains/domain-workspace-tabs';

const auth = vi.hoisted(() => ({ identity: vi.fn(), pathname: '/admin' }));
vi.mock('../../../lib/server-auth', () => ({
  getAuthenticatedIdentity: auth.identity,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => auth.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
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
afterEach(() => {
  vi.clearAllMocks();
  auth.pathname = '/admin';
});

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

it('highlights Reports below Payments in the full administrator sidebar', async () => {
  auth.pathname = '/admin/reports';
  auth.identity.mockResolvedValue(identity);
  render(await AdminLayout({ children: <p>Reports content</p> }));
  const sidebar = within(
    screen.getByRole('navigation', { name: 'Administrator navigation' }),
  );
  const reports = sidebar.getByRole('link', {
    name: 'Reports',
    current: 'page',
  });
  expect(reports.getAttribute('href')).toBe('/admin/reports');
  const links = sidebar.getAllByRole('link');
  expect(links[links.indexOf(reports) - 1]).toBe(
    sidebar.getByRole('link', { name: 'Payments' }),
  );
});

it.each([
  '/admin/domains',
  '/admin/domain-pricing',
  '/admin/settings/registrars',
] as const)(
  'keeps one Domains menu and highlights it for %s',
  async (pathname) => {
    auth.pathname = pathname;
    auth.identity.mockResolvedValue(identity);
    render(
      await AdminLayout({
        children: <DomainWorkspaceTabs active={pathname} />,
      }),
    );
    const sidebar = within(
      screen.getByRole('navigation', { name: 'Administrator navigation' }),
    );
    expect(
      sidebar
        .getByRole('link', { name: 'Domains' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      sidebar
        .getByRole('link', { name: 'Settings' })
        .getAttribute('aria-current'),
    ).toBeNull();
    expect(
      sidebar.queryByRole('link', { name: 'Domain registrars' }),
    ).toBeNull();
    expect(
      sidebar.queryByRole('link', { name: 'Domain pricing and TLDs' }),
    ).toBeNull();
    const workspace = within(
      screen.getByRole('navigation', { name: 'Domain workspace' }),
    );
    expect(
      workspace.getAllByRole('link').map((link) => link.getAttribute('href')),
    ).toEqual([
      '/admin/domains',
      '/admin/domain-pricing',
      '/admin/settings/registrars',
    ]);
    expect(
      workspace.getByRole('link', { current: 'page' }).getAttribute('href'),
    ).toBe(pathname);
  },
);

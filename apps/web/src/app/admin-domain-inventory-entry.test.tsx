import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Page from './(admin)/admin/domains/page';
const { access } = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock('../lib/server-admin-access', () => ({ authorizeAdminPage: access }));
vi.mock('../components/domains/domain-manager', () => ({
  DomainManager: (props: unknown) => (
    <div data-testid="selection">{JSON.stringify(props)}</div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('authorizes the domain area and passes validated async URL filters', async () => {
  access.mockResolvedValue({ role: 'ADMIN' });
  render(
    await Page({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({
        page: '6',
        search: 'older160.com',
        origin: 'EXISTING',
      }),
    }),
  );
  expect(access).toHaveBeenCalledWith('/admin/domains');
  expect(JSON.parse(screen.getByTestId('selection').textContent!)).toEqual({
    administrator: true,
    inventorySelection: {
      invalid: false,
      query: {
        page: 6,
        pageSize: 20,
        search: 'older160.com',
        origin: 'EXISTING',
      },
    },
  });
});
it('does not render the workspace after denied administrator access', async () => {
  access.mockResolvedValue(null);
  expect(
    await Page({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    }),
  ).toBeNull();
});

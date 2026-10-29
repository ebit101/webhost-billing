import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Orders from './(admin)/admin/customers/[customerId]/orders/page';
import Invoices from './(admin)/admin/customers/[customerId]/invoices/page';
import Payments from './(admin)/admin/customers/[customerId]/payments/page';
import Support from './(admin)/admin/customers/[customerId]/support/page';
import Email from './(admin)/admin/customers/[customerId]/email-history/page';
import { authorizeAdminPage } from '../lib/server-admin-access';
import { redirect } from 'next/navigation';
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('../lib/server-admin-access', () => ({ authorizeAdminPage: vi.fn() }));
vi.mock('../components/customers/admin-customer-detail', () => ({
  AdminCustomerDetail: ({ children, ...props }: { children: ReactNode }) => (
    <div data-testid="client">
      {JSON.stringify(props)}
      {children}
    </div>
  ),
}));
vi.mock('../components/customers/client-activity-records', () => ({
  ClientActivityRecords: (props: unknown) => (
    <div data-testid="records">{JSON.stringify(props)}</div>
  ),
}));
beforeEach(() => vi.mocked(authorizeAdminPage).mockReset());
afterEach(cleanup);
describe('client record server entries', () => {
  for (const [kind, path, Page] of [
    ['orders', '/admin/orders', Orders],
    ['invoices', '/admin/invoices', Invoices],
    ['payments', '/admin/payments', Payments],
    ['support', '/admin/support', Support],
    ['email-history', '/admin/email', Email],
  ] as const) {
    it(`checks ${kind} permission independently before mounting client records`, async () => {
      vi.mocked(authorizeAdminPage).mockResolvedValue(null);
      expect(
        await Page({ params: Promise.resolve({ customerId: 'fictional' }) }),
      ).toBeNull();
      expect(authorizeAdminPage).toHaveBeenCalledWith(path);
      vi.mocked(authorizeAdminPage).mockResolvedValue({
        role: 'ADMIN',
        staffRole: 'FULL_ADMINISTRATOR',
      } as Awaited<ReturnType<typeof authorizeAdminPage>>);
      render(
        await Page({ params: Promise.resolve({ customerId: 'fictional' }) }),
      );
      expect(JSON.parse(screen.getByTestId('records').textContent!)).toEqual({
        customerId: 'fictional',
        kind,
      });
      expect(screen.getByTestId('client').textContent).toContain(
        `"section":"${kind}"`,
      );
    });
    it(`keeps restricted staff in the existing client context for ${kind}`, async () => {
      vi.mocked(authorizeAdminPage).mockResolvedValue({
        role: 'ADMIN',
        staffRole: 'BILLING_OPERATOR',
      } as Awaited<ReturnType<typeof authorizeAdminPage>>);
      await expect(
        Page({ params: Promise.resolve({ customerId: 'fictional' }) }),
      ).rejects.toThrow('redirected');
      expect(redirect).toHaveBeenCalledWith('/admin/customers/fictional');
    });
  }
});

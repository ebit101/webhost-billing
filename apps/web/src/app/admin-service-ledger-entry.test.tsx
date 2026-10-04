import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Page from './(admin)/admin/services/page';
vi.mock('../components/services/admin-services-workspace', () => ({
  AdminServicesWorkspace: (props: unknown) => (
    <div data-testid="selection">{JSON.stringify(props)}</div>
  ),
}));
describe('administrator service server entry', () => {
  it('narrows async URL filters with valid customer context', async () => {
    const customerId = '85000000-0000-4000-8000-000000000001';
    render(
      await Page({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({
          customerId,
          search: 'hosting',
          status: 'PROVISION_FAILED',
          page: '6',
          pageSize: '20',
          next: '/portal',
        }),
      }),
    );
    expect(JSON.parse(screen.getByTestId('selection').textContent!)).toEqual({
      selection: {
        query: {
          customerId,
          search: 'hosting',
          status: 'PROVISION_FAILED',
          page: 6,
          pageSize: 20,
        },
        invalid: false,
        customerFilter: { customerId, invalid: false },
      },
    });
  });
  it('passes independent invalid ledger/customer states without inferring context', async () => {
    render(
      await Page({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({
          customerId: ['bad', 'bad'],
          page: ['1', '2'],
        }),
      }),
    );
    expect(JSON.parse(screen.getByTestId('selection').textContent!)).toEqual({
      selection: {
        query: { page: 1, pageSize: 20 },
        invalid: true,
        customerFilter: { invalid: true },
      },
    });
  });
});

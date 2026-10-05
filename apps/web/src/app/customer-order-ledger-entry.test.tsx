import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Page from './(portal)/portal/orders/page';
vi.mock('../components/orders/customer-order-list', () => ({
  CustomerOrderList: (props: unknown) => (
    <div data-testid="selection">{JSON.stringify(props)}</div>
  ),
}));
describe('customer order server entry', () => {
  it('narrows async filters without identity or navigation input', async () => {
    render(
      await Page({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({
          search: 'old',
          status: 'CANCELLED',
          page: '6',
          pageSize: '20',
          customerId: 'other',
          next: 'https://example.test',
        }),
      }),
    );
    expect(JSON.parse(screen.getByTestId('selection').textContent!)).toEqual({
      selection: {
        query: { search: 'old', status: 'CANCELLED', page: 6, pageSize: 20 },
        invalid: false,
      },
    });
  });
  it('passes invalid state with safe defaults for duplicate URL filters', async () => {
    render(
      await Page({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({ page: ['1', '2'] }),
      }),
    );
    expect(JSON.parse(screen.getByTestId('selection').textContent!)).toEqual({
      selection: { query: { page: 1, pageSize: 20 }, invalid: true },
    });
  });
});

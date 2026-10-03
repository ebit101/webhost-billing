import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Page from './(portal)/portal/invoices/page';
vi.mock('../components/invoices/customer-invoice-list', () => ({
  CustomerInvoiceList: (props: unknown) => (
    <div data-testid="selection">{JSON.stringify(props)}</div>
  ),
}));
describe('invoice ledger server entry', () => {
  it('narrows async URL parameters to the four owned-ledger fields', async () => {
    render(
      await Page({
        searchParams: Promise.resolve({
          page: '6',
          pageSize: '20',
          search: 'hosting',
          status: 'UNPAID',
          customerId: 'foreign',
          next: '/admin',
        }),
      }),
    );
    expect(JSON.parse(screen.getByTestId('selection').textContent!)).toEqual({
      selection: {
        query: { page: 6, pageSize: 20, search: 'hosting', status: 'UNPAID' },
        invalid: false,
      },
    });
  });
  it('passes safe defaults and a recovery notice for duplicate server values', async () => {
    render(await Page({ searchParams: Promise.resolve({ page: ['1', '6'] }) }));
    expect(JSON.parse(screen.getByTestId('selection').textContent!)).toEqual({
      selection: { query: { page: 1, pageSize: 20 }, invalid: true },
    });
  });
});

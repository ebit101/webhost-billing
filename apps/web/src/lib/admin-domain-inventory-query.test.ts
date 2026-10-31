import { describe, expect, it } from 'vitest';
import {
  adminDomainHref,
  adminDomainQueryString,
  parseAdminDomainPage,
  readAdminDomainQuery,
} from './admin-domain-inventory-query';
import {
  inventoryCustomerId,
  inventoryPage,
  inventoryRow,
} from '../test/domain-inventory-fixtures';

describe('administrator domain inventory boundaries', () => {
  it('round-trips page, literal search, state, origin and client scope on a fixed local route', () => {
    const input = new URLSearchParams({
      page: '6',
      pageSize: '20',
      search: ' <script> & %_ ',
      state: 'REGISTERED',
      origin: 'EXISTING',
      customerId: inventoryCustomerId,
    });
    const selected = readAdminDomainQuery(input);
    expect(selected.invalid).toBe(false);
    const href = adminDomainHref(selected.query);
    expect(href.startsWith('/admin/domains?')).toBe(true);
    expect(
      readAdminDomainQuery(new URLSearchParams(href.split('?')[1])),
    ).toEqual(selected);
    expect(selected.query.search).toBe('<script> & %_');
  });
  it.each([
    'page=0',
    'page=01',
    'page=1e2',
    'page=1.2',
    'page=-1',
    'page=2147483648',
    'page=2147483647&pageSize=100',
    'pageSize=101',
    'state=EXPIRED',
    'origin=TRANSFER',
    'search=' + 'a'.repeat(201),
    'page=1&page=1',
    'search=a&search=b',
    'origin=EXISTING&origin=EXISTING',
    'returnTo=https://example.test',
  ])(
    'blocks malformed filters %s and retains only validated client scope',
    (input) => {
      const selection = readAdminDomainQuery(
        new URLSearchParams(input + '&customerId=' + inventoryCustomerId),
      );
      expect(selection).toEqual({
        invalid: true,
        query: { page: 1, pageSize: 20, customerId: inventoryCustomerId },
      });
    },
  );
  it('never silently broadens an invalid or duplicated client scope into a global read', () => {
    for (const input of [
      { customerId: 'bad' },
      { customerId: [inventoryCustomerId] },
      new URLSearchParams(
        `customerId=${inventoryCustomerId}&customerId=${inventoryCustomerId}`,
      ),
    ])
      expect(readAdminDomainQuery(input).invalid).toBe(true);
    expect(readAdminDomainQuery({ page: ['1'] }).invalid).toBe(true);
    expect(readAdminDomainQuery({ search: '', state: '', origin: '' })).toEqual(
      { invalid: false, query: { page: 1, pageSize: 20 } },
    );
  });
  it('accepts a complete older page and an honest empty out-of-range page', () => {
    const query = { page: 6, pageSize: 20 };
    expect(
      parseAdminDomainPage(inventoryPage([inventoryRow], query, 101), query)
        .pagination.totalItems,
    ).toBe(101);
    expect(
      parseAdminDomainPage(inventoryPage([], { page: 7, pageSize: 20 }, 101), {
        page: 7,
        pageSize: 20,
      }).data,
    ).toEqual([]);
  });
  it('rejects inconsistent metadata, duplicate IDs, out-of-scope rows, status totals and oversized payloads', () => {
    const query = { page: 1, pageSize: 20, customerId: inventoryCustomerId };
    const page = inventoryPage();
    const invalid = [
      { ...page, pagination: { ...page.pagination, totalPages: 2 } },
      { ...page, pagination: { ...page.pagination, page: 2 } },
      { ...page, summary: { ...page.summary, REGISTERED: 2 } },
      { ...page, data: [{ ...inventoryRow, customerId: inventoryRow.id }] },
      {
        ...inventoryPage([inventoryRow, inventoryRow]),
        data: [inventoryRow, inventoryRow],
      },
      {
        ...page,
        data: [
          { ...inventoryRow, contact: { secret: 'must not be accepted' } },
        ],
      },
      { ...page, data: [{ ...inventoryRow, invoiceStatus: 'PAID' }] },
      { ...page, data: Array(101).fill(inventoryRow) },
    ];
    for (const response of invalid)
      expect(() => parseAdminDomainPage(response, query)).toThrow();
    expect(() =>
      parseAdminDomainPage(page, { ...query, state: 'FAILED' }),
    ).toThrow();
    expect(() =>
      parseAdminDomainPage(page, { ...query, origin: 'REGISTRATION' }),
    ).toThrow();
    expect(() =>
      adminDomainQueryString({ page: 2147483647, pageSize: 100 }),
    ).toThrow();
  });
  it('checks deterministic date and UUID ordering across equal timestamps', () => {
    const earlier = { ...inventoryRow, id: inventoryCustomerId };
    const query = { page: 1, pageSize: 20 };
    expect(
      parseAdminDomainPage(inventoryPage([inventoryRow, earlier]), query).data,
    ).toHaveLength(2);
    expect(
      parseAdminDomainPage(
        inventoryPage([
          inventoryRow,
          { ...earlier, requestedAt: '2026-01-01T00:00:00Z' },
        ]),
        query,
      ).data,
    ).toHaveLength(2);
    expect(() =>
      parseAdminDomainPage(inventoryPage([earlier, inventoryRow]), query),
    ).toThrow();
    expect(() =>
      parseAdminDomainPage(
        inventoryPage([
          inventoryRow,
          { ...earlier, requestedAt: '2026-02-01T00:00:00.000Z' },
        ]),
        query,
      ),
    ).toThrow();
  });
});

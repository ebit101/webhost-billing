import type {
  DomainInventoryRow,
  DomainInventoryQuery,
} from '@webhost-billing/shared';
export const inventoryCustomerId = '16000000-0000-4000-8000-000000000001';
export const inventoryRow: DomainInventoryRow = {
  id: '16000000-0000-4000-8000-000000000002',
  domainName: 'fictional-inventory160.com',
  customerId: inventoryCustomerId,
  customerName: 'Fictional inventory client',
  customerNumber: 'CUS-FICTIONAL-160',
  customerEmail: 'inventory160@example.test',
  companyName: 'Fictional studio',
  state: 'REGISTERED',
  origin: 'EXISTING',
  registrar: 'Fictional disabled account',
  simulated: false,
  requestedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
  invoiceId: null,
  invoiceStatus: null,
  balanceDue: null,
  currency: 'BDT',
};
export function inventoryPage(
  rows: DomainInventoryRow[] = [inventoryRow],
  query: Pick<DomainInventoryQuery, 'page' | 'pageSize'> = {
    page: 1,
    pageSize: 20,
  },
  total = rows.length,
) {
  return {
    success: true,
    data: rows,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / query.pageSize),
    },
    summary: {
      AWAITING_PAYMENT: rows.filter((row) => row.state === 'AWAITING_PAYMENT')
        .length,
      AWAITING_APPROVAL: rows.filter((row) => row.state === 'AWAITING_APPROVAL')
        .length,
      PENDING: rows.filter((row) => row.state === 'PENDING').length,
      NEEDS_RECONCILIATION: rows.filter(
        (row) => row.state === 'NEEDS_RECONCILIATION',
      ).length,
      FAILED: rows.filter((row) => row.state === 'FAILED').length,
      REGISTERED:
        rows.filter((row) => row.state === 'REGISTERED').length +
        total -
        rows.length,
    },
  };
}

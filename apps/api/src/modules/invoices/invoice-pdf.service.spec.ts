import type { Invoice } from '@webhost-billing/shared';
import { InvoicePdfService, renderInvoicePdf } from './invoice-pdf.service';

const invoice: Invoice = {
  id: '10000000-0000-4000-8000-000000000001',
  invoiceNumber: 'INV-001024',
  customerId: '10000000-0000-4000-8000-000000000002',
  orderId: '10000000-0000-4000-8000-000000000003',
  orderNumber: 'ORD-2026-0023',
  status: 'PARTIALLY_REFUNDED',
  currency: 'BDT',
  subtotal: { amount: '150000', currency: 'BDT' },
  discountTotal: { amount: '10000', currency: 'BDT' },
  taxTotal: { amount: '7000', currency: 'BDT' },
  total: { amount: '147000', currency: 'BDT' },
  creditTotal: { amount: '2000', currency: 'BDT' },
  amountPaid: { amount: '100000', currency: 'BDT' },
  balanceDue: { amount: '45000', currency: 'BDT' },
  customerName: 'রহিম Ahmed Hosting',
  customerEmail: 'rahim@example.test',
  customerAddress: {
    line1: '২৩ Fictional Road',
    line2: 'Development Floor',
    city: 'ঢাকা Dhaka',
    region: null,
    postalCode: '1205',
    countryCode: 'BD',
  },
  businessIdentity: {
    name: 'Webhost Billing',
    addressLine1: '1 Fictional Business Avenue',
    city: 'Dhaka',
    countryCode: 'BD',
    email: 'billing@example.test',
    phone: '+880 1000 000000',
    taxIdentifier: 'FICTIONAL-TAX-23',
  },
  taxIdentity: { taxIdentifier: 'FICTIONAL-CUSTOMER-TAX-23' },
  issuedAt: '2026-08-25T10:00:00.000Z',
  dueAt: '2026-09-08T00:00:00.000Z',
  paidAt: null,
  cancelledAt: null,
  createdAt: '2026-08-25T09:00:00.000Z',
  updatedAt: '2026-08-25T11:00:00.000Z',
  items: [
    {
      id: '10000000-0000-4000-8000-000000000004',
      description:
        'বার্ষিক Annual hosting plan — fictional development service',
      quantity: 1,
      unitAmount: { amount: '150000', currency: 'BDT' },
      discountAmount: { amount: '10000', currency: 'BDT' },
      taxAmount: { amount: '7000', currency: 'BDT' },
      lineTotal: { amount: '147000', currency: 'BDT' },
      servicePeriodStart: '2026-09-01T00:00:00.000Z',
      servicePeriodEnd: '2027-09-01T00:00:00.000Z',
    },
  ],
};

describe('InvoicePdfService', () => {
  it('generates byte-identical printable BDT invoices without internal identifiers', async () => {
    const first = await renderInvoicePdf(invoice);
    const second = await renderInvoicePdf(invoice);

    expect(first.subarray(0, 8).toString('ascii')).toBe('%PDF-1.7');
    expect(first.length).toBeGreaterThan(10_000);
    expect(first.equals(second)).toBe(true);
    expect(first.includes(Buffer.from(invoice.id))).toBe(false);
    expect(first.includes(Buffer.from(invoice.customerId))).toBe(false);
    expect(first.includes(Buffer.from(invoice.items[0].id))).toBe(false);
  });

  it('paginates many snapshot items and blocks editable drafts', async () => {
    const manyItems: Invoice = {
      ...invoice,
      items: Array.from({ length: 70 }, (_, index) => ({
        ...invoice.items[0],
        id: `10000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
        description: `Hosting line ${index + 1} with enough description to verify deterministic page wrapping`,
      })),
    };
    const pdf = await renderInvoicePdf(manyItems);
    const pageObjects = pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? [];
    expect(pageObjects.length).toBeGreaterThan(1);

    const service = new InvoicePdfService();
    await expect(
      service.render({ ...invoice, status: 'DRAFT' }),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
    });
  });
});

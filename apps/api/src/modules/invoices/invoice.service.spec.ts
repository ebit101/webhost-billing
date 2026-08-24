import { InvoiceStatus } from '@webhost-billing/database';
import { POSTGRES_BIGINT_MAX } from '@webhost-billing/shared';
import {
  InvoiceCalculationError,
  InvoiceStateTransitionError,
  calculateInvoiceTotals,
  nextInvoiceStatus,
} from './invoice.service';

describe('invoice calculations', () => {
  it('calculates subtotal, discounts, tax, credit, paid, and balance', () => {
    expect(
      calculateInvoiceTotals(
        [
          {
            quantity: 2,
            unitAmount: 10_000n,
            discountAmount: 1_000n,
            taxAmount: 2_850n,
          },
          {
            quantity: 1,
            unitAmount: 5_000n,
            discountAmount: 0n,
            taxAmount: 750n,
          },
        ],
        2_000n,
        10_000n,
      ),
    ).toEqual({
      subtotal: 25_000n,
      discountTotal: 1_000n,
      taxTotal: 3_600n,
      total: 27_600n,
      creditTotal: 2_000n,
      amountPaid: 10_000n,
      balanceDue: 15_600n,
      lineTotals: [21_850n, 5_750n],
    });
  });

  it('supports an all-zero invoice without floating-point arithmetic', () => {
    expect(
      calculateInvoiceTotals(
        [
          {
            quantity: 1,
            unitAmount: 0n,
            discountAmount: 0n,
            taxAmount: 0n,
          },
        ],
        0n,
      ),
    ).toMatchObject({ total: 0n, balanceDue: 0n, lineTotals: [0n] });
  });

  it('accepts the exact PostgreSQL bigint maximum', () => {
    expect(
      calculateInvoiceTotals(
        [
          {
            quantity: 1,
            unitAmount: POSTGRES_BIGINT_MAX,
            discountAmount: 0n,
            taxAmount: 0n,
          },
        ],
        0n,
      ).total,
    ).toBe(POSTGRES_BIGINT_MAX);
  });

  it.each([
    {
      label: 'multiplication overflow',
      items: [
        {
          quantity: 2,
          unitAmount: POSTGRES_BIGINT_MAX,
          discountAmount: 0n,
          taxAmount: 0n,
        },
      ],
      credit: 0n,
    },
    {
      label: 'discount beyond subtotal',
      items: [
        {
          quantity: 1,
          unitAmount: 100n,
          discountAmount: 101n,
          taxAmount: 0n,
        },
      ],
      credit: 0n,
    },
    {
      label: 'credit beyond total',
      items: [
        {
          quantity: 1,
          unitAmount: 100n,
          discountAmount: 0n,
          taxAmount: 0n,
        },
      ],
      credit: 101n,
    },
  ])('rejects $label', ({ items, credit }) => {
    expect(() => calculateInvoiceTotals(items, credit)).toThrow(
      InvoiceCalculationError,
    );
  });
});

describe('invoice state transitions', () => {
  const now = new Date('2026-08-25T12:00:00.000Z');
  const future = new Date('2026-08-26T12:00:00.000Z');
  const past = new Date('2026-08-24T12:00:00.000Z');

  it('issues positive-balance drafts as unpaid', () => {
    expect(
      nextInvoiceStatus({
        action: 'ISSUE',
        status: InvoiceStatus.DRAFT,
        dueAt: future,
        balanceDue: 100n,
        amountPaid: 0n,
        now,
      }),
    ).toBe(InvoiceStatus.UNPAID);
  });

  it('settles zero-balance drafts when issued', () => {
    expect(
      nextInvoiceStatus({
        action: 'ISSUE',
        status: InvoiceStatus.DRAFT,
        dueAt: future,
        balanceDue: 0n,
        amountPaid: 0n,
        now,
      }),
    ).toBe(InvoiceStatus.PAID);
  });

  it('marks only a past-due unpaid balance overdue', () => {
    expect(
      nextInvoiceStatus({
        action: 'MARK_OVERDUE',
        status: InvoiceStatus.UNPAID,
        dueAt: past,
        balanceDue: 100n,
        amountPaid: 0n,
        now,
      }),
    ).toBe(InvoiceStatus.OVERDUE);
    expect(() =>
      nextInvoiceStatus({
        action: 'MARK_OVERDUE',
        status: InvoiceStatus.UNPAID,
        dueAt: future,
        balanceDue: 100n,
        amountPaid: 0n,
        now,
      }),
    ).toThrow(InvoiceStateTransitionError);
  });

  it('cancels drafts and unpaid invoices but never paid history', () => {
    expect(
      nextInvoiceStatus({
        action: 'CANCEL',
        status: InvoiceStatus.UNPAID,
        dueAt: future,
        balanceDue: 100n,
        amountPaid: 0n,
        now,
      }),
    ).toBe(InvoiceStatus.CANCELLED);
    expect(() =>
      nextInvoiceStatus({
        action: 'CANCEL',
        status: InvoiceStatus.PAID,
        dueAt: past,
        balanceDue: 0n,
        amountPaid: 100n,
        now,
      }),
    ).toThrow(InvoiceStateTransitionError);
  });
});

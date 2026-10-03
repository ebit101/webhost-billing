import {
  InvoiceStatus,
  ServiceStatus,
  TicketStatus,
  UserStatus,
} from '@webhost-billing/database';
import {
  accountStatusAfterActivation,
  CustomerService,
} from './customer.service';

describe('customer management business rules', () => {
  it('does not treat access activation as proof of email verification', () => {
    expect(accountStatusAfterActivation(null)).toBe(
      UserStatus.PENDING_VERIFICATION,
    );
  });

  it('restores an already verified account to active access', () => {
    expect(accountStatusAfterActivation(new Date())).toBe(UserStatus.ACTIVE);
  });
});

describe('customer portal summary', () => {
  const customerId = '70000000-0000-4000-8000-000000000001';
  const now = new Date('2026-10-03T00:00:00.000Z');
  const ticket = {
    id: '73000000-0000-4000-8000-000000000001',
    ticketNumber: 'TKT-001005',
    subject: 'DNS setup question',
    status: TicketStatus.WAITING_FOR_CUSTOMER,
    priority: 'NORMAL' as const,
    updatedAt: now,
  };
  const customer = {
    id: customerId,
    customerNumber: 'CUS-70000000',
    status: 'ACTIVE' as const,
    firstName: 'Samira',
    _count: { services: 12, invoices: 18, tickets: 3 },
    services: [
      {
        id: '71000000-0000-4000-8000-000000000001',
        status: ServiceStatus.SUSPENDED,
        productNameSnapshot: 'Starter Hosting',
        domain: 'samira.example.test',
        recurringAmount: 120000n,
        currency: 'BDT',
        nextDueAt: now,
      },
    ],
    invoices: [
      {
        id: '72000000-0000-4000-8000-000000000002',
        invoiceNumber: 'INV-PAID-NEWEST',
        status: InvoiceStatus.PAID,
        balanceDue: 0n,
        currency: 'BDT',
        dueAt: now,
      },
    ],
    tickets: [ticket],
  };

  function makePrisma(input?: {
    customer?: typeof customer | null;
    outstanding?: Array<{
      currency: string;
      _sum: { balanceDue: bigint | null };
      _count: { _all: number };
    }>;
  }) {
    const nextInvoice = {
      id: '72000000-0000-4000-8000-000000000001',
      invoiceNumber: 'INV-OVERDUE',
      status: InvoiceStatus.OVERDUE,
      balanceDue: 120000n,
      currency: 'BDT',
      dueAt: now,
    };
    const invoiceCount = jest.fn().mockResolvedValue(2);
    const ticketCount = jest
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const ticketFindFirst = jest
      .fn()
      .mockResolvedValueOnce(ticket)
      .mockResolvedValueOnce({
        ...ticket,
        id: '73000000-0000-4000-8000-000000000002',
        status: TicketStatus.WAITING_FOR_STAFF,
      });
    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue(input?.customer ?? customer),
      },
      invoice: {
        groupBy: jest.fn().mockResolvedValue(
          input?.outstanding ?? [
            {
              currency: 'BDT',
              _sum: { balanceDue: 9_007_199_254_740_993n },
              _count: { _all: 12 },
            },
          ],
        ),
        count: invoiceCount,
        findFirst: jest.fn().mockResolvedValue(nextInvoice),
      },
      service: {
        findFirst: jest.fn().mockResolvedValue(customer.services[0]),
      },
      ticket: { count: ticketCount, findFirst: ticketFindFirst },
      setting: {
        findUnique: jest.fn().mockResolvedValue({
          value: { currency: 'BDT', timeZone: 'Asia/Dhaka' },
        }),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    return prisma;
  }

  it('derives lossless full-account facts independently of recent paid history', async () => {
    const prisma = makePrisma();
    const service = new CustomerService(
      prisma as never,
      {} as never,
      {} as never,
    );

    const result = await service.getPortalSummary(customerId);

    expect(result.billing.outstandingBalance.amount).toBe('9007199254740993');
    expect(result.billing.outstandingInvoiceCount).toBe(12);
    expect(result.billing.overdueInvoiceCount).toBe(2);
    expect(result.billing.nextInvoice?.invoiceNumber).toBe('INV-OVERDUE');
    expect(result.service.nextDue?.status).toBe('SUSPENDED');
    expect(result.support.waitingForCustomerCount).toBe(1);
    expect(result.support.waitingForStaffCount).toBe(2);
    expect(result.recent.invoices[0]?.status).toBe('PAID');
    expect(prisma.invoice.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          customerId,
          status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE] },
          balanceDue: { gt: 0n },
        },
      }),
    );
  });

  it('returns a stable empty summary in the configured currency', async () => {
    const prisma = makePrisma({
      customer: {
        ...customer,
        _count: { services: 0, invoices: 0, tickets: 0 },
        services: [],
        invoices: [],
        tickets: [],
      },
      outstanding: [],
    });
    prisma.invoice.count.mockResolvedValue(0);
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.service.findFirst.mockResolvedValue(null);
    prisma.ticket.count.mockReset().mockResolvedValue(0);
    prisma.ticket.findFirst.mockReset().mockResolvedValue(null);
    const service = new CustomerService(
      prisma as never,
      {} as never,
      {} as never,
    );

    const result = await service.getPortalSummary(customerId);

    expect(result.counts).toEqual({ services: 0, invoices: 0, tickets: 0 });
    expect(result.billing.outstandingBalance).toEqual({
      amount: '0',
      currency: 'BDT',
    });
    expect(result.billing.nextInvoice).toBeNull();
    expect(result.service.nextDue).toBeNull();
    expect(result.support.nextWaitingForCustomer).toBeNull();
  });

  it('fails closed instead of combining outstanding currencies', async () => {
    const prisma = makePrisma({
      outstanding: [
        { currency: 'BDT', _sum: { balanceDue: 100n }, _count: { _all: 1 } },
        { currency: 'USD', _sum: { balanceDue: 100n }, _count: { _all: 1 } },
      ],
    });
    const service = new CustomerService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(service.getPortalSummary(customerId)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});

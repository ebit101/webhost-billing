import { PaymentKind, type PrismaClient } from '@webhost-billing/database';
import type { SettingsService } from '../settings/settings.service';
import { DashboardReportService } from './dashboard-report.service';

describe('DashboardReportService', () => {
  it('calculates net collected revenue without rewriting successful charges', async () => {
    const paymentFindMany = jest.fn().mockResolvedValue([
      {
        kind: PaymentKind.CHARGE,
        amount: 10_000n,
        verifiedAt: new Date('2026-08-01T04:00:00Z'),
      },
      {
        kind: PaymentKind.REFUND,
        amount: 2_000n,
        verifiedAt: new Date('2026-08-01T05:00:00Z'),
      },
      {
        kind: PaymentKind.REVERSAL,
        amount: 1_000n,
        verifiedAt: new Date('2026-08-02T05:00:00Z'),
      },
    ]);
    const prisma = {
      payment: { findMany: paymentFindMany },
      invoice: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { balanceDue: 5_000n } })
          .mockResolvedValueOnce({ _sum: { balanceDue: 1_500n } }),
      },
      service: {
        count: jest.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(2),
      },
      order: { count: jest.fn().mockResolvedValue(3) },
      ticket: { count: jest.fn().mockResolvedValue(4) },
      automationRun: { count: jest.fn().mockResolvedValue(1) },
      activityLog: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    const settings = {
      overview: jest
        .fn()
        .mockResolvedValue({ currency: 'BDT', timeZone: 'Asia/Dhaka' }),
    } as unknown as SettingsService;
    const service = new DashboardReportService(prisma, settings);

    const result = await service.dashboard({
      from: '2026-08-01',
      to: '2026-08-02',
    });

    expect(result.metrics.collectedRevenue.amount).toBe('7000');
    expect(result.metrics.outstandingBalance.amount).toBe('5000');
    expect(result.metrics.overdueBalance.amount).toBe('1500');
    expect(result.revenueSeries).toEqual([
      { date: '2026-08-01', amount: '8000' },
      { date: '2026-08-02', amount: '-1000' },
    ]);
    expect(paymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'SUCCEEDED',
          currency: 'BDT',
        }),
      }),
    );
  });
});

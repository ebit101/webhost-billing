import { ObservabilityService } from './observability.service';

describe('ObservabilityService', () => {
  it('reports dependency readiness without exposing connection details', async () => {
    const service = serviceWith({
      queryRaw: Promise.resolve([{ '?column?': 1 }]),
      ping: Promise.resolve('PONG'),
    });

    await expect(service.readiness()).resolves.toMatchObject({
      status: 'READY',
      components: { postgresql: 'UP', redis: 'UP' },
    });
  });

  it('returns NOT_READY when either dependency fails', async () => {
    const service = serviceWith({
      queryRaw: Promise.reject(new Error('database host is private')),
      ping: Promise.resolve('PONG'),
    });

    await expect(service.readiness()).resolves.toMatchObject({
      status: 'NOT_READY',
      components: { postgresql: 'DOWN', redis: 'UP' },
    });
  });

  it('aggregates queue, automation, and provider failures', async () => {
    const prisma = prismaMock(Promise.resolve([]));
    prisma.outboxEvent.count.mockResolvedValue(2);
    prisma.automationRun.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3);
    prisma.automationRun.findMany.mockResolvedValue([]);
    prisma.payment.groupBy.mockResolvedValue([
      {
        provider: 'bkash',
        _count: { _all: 2 },
        _max: { updatedAt: new Date('2026-08-26T01:00:00.000Z') },
      },
    ]);
    prisma.hostingPanelOperation.groupBy.mockResolvedValue([
      {
        adapterKey: 'cpanel',
        status: 'INCONSISTENT',
        _count: { _all: 1 },
        _max: { createdAt: new Date('2026-08-26T02:00:00.000Z') },
      },
    ]);
    prisma.emailAttempt.groupBy.mockResolvedValue([]);
    const queues = {
      metrics: jest.fn().mockResolvedValue([
        {
          queueName: 'hosting-provisioning',
          waiting: 2,
          active: 1,
          delayed: 3,
          failed: 4,
        },
      ]),
    };
    const service = new ObservabilityService(
      prisma as never,
      { ping: jest.fn() } as never,
      queues as never,
    );

    const overview = await service.overview();

    expect(overview.queueTotals).toEqual({
      waiting: 2,
      active: 1,
      delayed: 3,
      failed: 4,
    });
    expect(overview.failedOutboxEvents).toBe(2);
    expect(overview.automation).toMatchObject({
      running: 1,
      failedLast24Hours: 3,
    });
    expect(overview.providerFailures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerType: 'PAYMENT_GATEWAY',
          provider: 'bkash',
          failedLast24Hours: 2,
        }),
        expect.objectContaining({
          providerType: 'HOSTING_PANEL',
          provider: 'cpanel',
          inconsistentLast24Hours: 1,
        }),
      ]),
    );
  });
});

function serviceWith(input: {
  queryRaw: Promise<unknown>;
  ping: Promise<unknown>;
}): ObservabilityService {
  return new ObservabilityService(
    prismaMock(input.queryRaw) as never,
    { ping: jest.fn(() => input.ping) } as never,
    { metrics: jest.fn() } as never,
  );
}

function prismaMock(queryRaw: Promise<unknown>) {
  return {
    $queryRaw: jest.fn(() => queryRaw),
    outboxEvent: { count: jest.fn() },
    automationRun: { count: jest.fn(), findMany: jest.fn() },
    payment: { groupBy: jest.fn() },
    hostingPanelOperation: { groupBy: jest.fn() },
    emailAttempt: { groupBy: jest.fn() },
  };
}

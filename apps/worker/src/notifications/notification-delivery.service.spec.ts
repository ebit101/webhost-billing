import { parseWorkerEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import type {
  BackgroundJobData,
  NotificationKey,
} from '@webhost-billing/shared';
import { NotificationDeliveryService } from './notification-delivery.service';
import { notificationDestinationFingerprint } from './notification-projection.service';
import {
  WhatsAppProviderError,
  type WhatsAppNotificationMessage,
  type WhatsAppSendResult,
} from './whatsapp-message';

const id = '10000000-0000-4000-8000-000000000168';
const invoiceId = '20000000-0000-4000-8000-000000000168';
const job: BackgroundJobData = {
  schemaVersion: 1,
  outboxEventId: id,
  aggregateType: 'NOTIFICATION',
  aggregateId: id,
  eventType: 'NOTIFICATION_DELIVERY_REQUESTED',
  correlationId: id,
};
function harness(
  mode: 'disabled' | 'preview' | 'live' = 'live',
  enabled = true,
) {
  const env = parseWorkerEnvironment({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/test',
    REDIS_URL: 'redis://127.0.0.1:6379',
    CREDENTIAL_ENCRYPTION_KEY: 'f'.repeat(40),
    EMAIL_PUBLIC_WEB_URL: 'https://billing.example.test',
    NOTIFICATION_DELIVERY_MODE: mode,
    WHATSAPP_LIVE_ENABLED: String(enabled),
  });
  const current = {
    id,
    role: 'CUSTOMER',
    status: 'ACTIVE',
    email: 'fictional@example.test',
    emailVerifiedAt: new Date(),
    deletedAt: null,
    customer: {
      id,
      phone: '+8801700000168',
      countryCode: 'BD',
      status: 'ACTIVE',
      deletedAt: null,
    },
    adminProfile: { staffRole: 'FULL_ADMINISTRATOR' },
    notificationPreference: { whatsAppEnabled: true },
  };
  const entry = {
    id,
    userId: id,
    user: current,
    channel: 'WHATSAPP',
    key: 'client-invoice-issued' as NotificationKey,
    status: 'QUEUED',
    attemptCount: 0,
    metadata: {
      invoiceId,
      destinationFingerprint: notificationDestinationFingerprint(
        current.customer.phone,
        env.CREDENTIAL_ENCRYPTION_KEY,
      ),
    },
  };
  const invoice = {
    id: invoiceId,
    customerId: id,
    issuedAt: new Date(),
    status: 'UNPAID',
    balanceDue: 390000n,
    currency: 'BDT',
    invoiceNumber: 'INV-TEST-168',
    dueAt: new Date('2026-11-02T00:00:00Z'),
    items: [],
  };
  let committed = false;
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    outboxEvent: {
      findUnique: jest.fn().mockResolvedValue({
        ...job,
        id,
        status: 'PUBLISHED',
        payload: { schemaVersion: 1, notificationId: id },
      }),
    },
    notificationEntry: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(entry)),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        Object.assign(entry, data);
        return Promise.resolve(entry);
      }),
    },
    user: { findUniqueOrThrow: jest.fn().mockResolvedValue(current) },
    invoice: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(invoice)),
    },
    setting: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const updateMany = jest.fn(
    ({
      where,
      data,
    }: {
      where: { status: string };
      data: Record<string, unknown>;
    }) => {
      if (entry.status !== where.status) return Promise.resolve({ count: 0 });
      Object.assign(entry, data);
      return Promise.resolve({ count: 1 });
    },
  );
  const prisma = {
    $transaction: async (fn: (value: typeof tx) => Promise<void>) => {
      committed = false;
      await fn(tx);
      committed = true;
    },
    notificationEntry: { updateMany },
  } as unknown as PrismaClient;
  const send = jest
    .fn<Promise<WhatsAppSendResult>, [WhatsAppNotificationMessage]>()
    .mockImplementation(() => {
      expect(committed).toBe(mode === 'live');
      if (mode === 'live') expect(entry.status).toBe('SUBMITTING');
      return Promise.resolve(
        mode === 'live'
          ? { status: 'ACCEPTED', providerMessageId: 'wamid.fixture' }
          : { status: 'PREVIEWED' },
      );
    });
  const service = new NotificationDeliveryService(prisma, env, {
    key: mode === 'live' ? 'meta' : 'preview',
    send,
  });
  return { service, current, invoice, entry, send, updateMany, tx };
}

describe('important WhatsApp delivery boundaries', () => {
  it('claims before submission, uses exact money/calendar values and never resends accepted events', async () => {
    const h = harness();
    await h.service.deliver(job);
    expect(h.entry).toMatchObject({
      status: 'ACCEPTED',
      attemptCount: 1,
      metadata: { provider: 'meta', providerMessageId: 'wamid.fixture' },
    });
    expect(h.send.mock.calls[0][0]).toMatchObject({
      reference: 'INV-TEST-168',
      detail: 'Balance due: BDT 3900.00; due 02/11/2026',
    });
    await h.service.deliver(job);
    expect(h.send).toHaveBeenCalledTimes(1);
  });
  it.each(['disabled', 'live'] as const)(
    'never sends in %s mode when the independent gate is off',
    async (mode) => {
      const h = harness(mode, false);
      await h.service.deliver(job);
      expect(h.entry.status).toBe('DISABLED');
      expect(h.send).not.toHaveBeenCalled();
    },
  );
  it('writes previews without claiming external delivery', async () => {
    const h = harness('preview');
    await h.service.deliver(job);
    expect(h.entry.status).toBe('PREVIEWED');
    expect(h.send).toHaveBeenCalledTimes(1);
  });
  it.each(['UNKNOWN', 'REJECTED', 'CONFIGURATION'] as const)(
    'does not retry %s submissions even on worker redelivery',
    async (kind) => {
      const h = harness();
      h.send.mockRejectedValue(new WhatsAppProviderError(kind));
      await h.service.deliver(job);
      expect(h.entry.status).toBe(kind === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED');
      await h.service.deliver({
        ...job,
        failureKind: 'TEMPORARY',
        manualRetryAllowed: true,
      });
      expect(h.send).toHaveBeenCalledTimes(1);
    },
  );
  it('leaves a durable review marker if the acceptance write and recovery write both fail', async () => {
    const h = harness();
    h.updateMany.mockRejectedValue(new Error('fictional database unavailable'));
    await expect(h.service.deliver(job)).rejects.toThrow();
    expect(h.entry.status).toBe('SUBMITTING');
    await h.service.deliver(job);
    expect(h.send).toHaveBeenCalledTimes(1);
  });
  it.each([
    'client-invoice-issued',
    'client-overdue-notice',
    'admin-invoice-issued',
    'admin-overdue-notice',
  ] as const)(
    'targets %s through its current account and suppresses invalid invoices',
    async (key) => {
      const h = harness();
      h.entry.key = key;
      if (key.startsWith('admin')) {
        h.current.role = 'ADMIN';
        h.invoice.customerId = 'other-client';
      }
      await h.service.deliver(job);
      expect(h.entry.status).toBe('ACCEPTED');
      const cancelled = harness();
      cancelled.entry.key = key;
      cancelled.invoice.status = 'CANCELLED';
      if (key.startsWith('admin')) cancelled.current.role = 'ADMIN';
      await cancelled.service.deliver(job);
      expect(cancelled.send).not.toHaveBeenCalled();
    },
  );
  it('suppresses paid overdue invoices, customer mismatch, changed phone, muted accounts and restricted staff', async () => {
    const cases = [
      (h: ReturnType<typeof harness>) => {
        h.entry.key = 'client-overdue-notice';
        h.invoice.balanceDue = 0n;
        h.invoice.status = 'PAID';
      },
      (h: ReturnType<typeof harness>) => {
        h.invoice.customerId = 'other-client';
      },
      (h: ReturnType<typeof harness>) => {
        h.current.customer.phone = '+8801700000999';
      },
      (h: ReturnType<typeof harness>) => {
        h.current.notificationPreference.whatsAppEnabled = false;
      },
      (h: ReturnType<typeof harness>) => {
        h.current.role = 'ADMIN';
        h.entry.key = 'admin-invoice-issued';
        h.current.adminProfile.staffRole = 'SUPPORT';
      },
      (h: ReturnType<typeof harness>) => {
        h.entry.key = 'client-password-reset';
      },
    ];
    for (const change of cases) {
      const h = harness();
      change(h);
      await h.service.deliver(job);
      expect(h.entry.status).toBe('SUPPRESSED');
      expect(h.send).not.toHaveBeenCalled();
    }
  });
  it('keeps new email alerts disabled in WhatsApp live mode', async () => {
    const h = harness();
    h.entry.channel = 'EMAIL';
    h.entry.key = 'admin-new-order';
    h.current.role = 'ADMIN';
    h.entry.metadata.destinationFingerprint =
      notificationDestinationFingerprint(h.current.email, 'f'.repeat(40));
    await h.service.deliver(job);
    expect(h.entry.status).toBe('DISABLED');
    expect(h.send).not.toHaveBeenCalled();
  });
});

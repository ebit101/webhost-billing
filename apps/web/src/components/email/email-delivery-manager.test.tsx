import type { EmailLogSummary } from '@webhost-billing/shared';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailDeliveryManager } from './email-delivery-manager';

const logs: EmailLogSummary[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    templateKey: 'payment-received',
    recipientEmail: 'customer@example.test',
    subject: 'Payment received for invoice INV-1001',
    status: 'SENT',
    provider: 'preview',
    attemptCount: 2,
    queuedAt: '2026-08-25T10:00:00.000Z',
    sentAt: '2026-08-25T10:02:00.000Z',
    failedAt: null,
    attempts: [
      {
        id: '10000000-0000-4000-8000-000000000002',
        attemptNumber: 2,
        status: 'SENT',
        provider: 'preview',
        failureKind: null,
        failureCode: null,
        startedAt: '2026-08-25T10:02:00.000Z',
        completedAt: '2026-08-25T10:02:00.000Z',
      },
      {
        id: '10000000-0000-4000-8000-000000000003',
        attemptNumber: 1,
        status: 'FAILED',
        provider: 'preview',
        failureKind: 'TEMPORARY',
        failureCode: 'SMTP_CONNECTION_UNAVAILABLE',
        startedAt: '2026-08-25T10:00:00.000Z',
        completedAt: '2026-08-25T10:00:01.000Z',
      },
    ],
  },
];

describe('EmailDeliveryManager', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows safe delivery metadata without message bodies or secrets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(success(logs))),
    );

    render(<EmailDeliveryManager />);

    expect(
      await screen.findByRole('heading', { name: 'Email delivery' }),
    ).toBeTruthy();
    expect(
      screen.getByText('Payment received for invoice INV-1001'),
    ).toBeTruthy();
    expect(screen.getByText('customer@example.test')).toBeTruthy();
    expect(screen.getByText('SENT')).toBeTruthy();
    expect(screen.queryByText(/token=/)).toBeNull();
  });
});

function success(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

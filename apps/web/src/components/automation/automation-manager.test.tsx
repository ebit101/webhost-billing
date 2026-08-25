import type { BackgroundFailureList } from '@webhost-billing/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutomationManager } from './automation-manager';

const failures: BackgroundFailureList = {
  queueJobs: [
    {
      source: 'QUEUE',
      queueName: 'hosting-provisioning',
      jobId: 'outbox-10000000000040008000000000000001',
      jobName: 'provision-hosting',
      state: 'failed',
      correlationId: '10000000-0000-4000-8000-000000000001',
      outboxEventId: '10000000-0000-4000-8000-000000000001',
      attemptsMade: 1,
      maxAttempts: 1,
      failureKind: 'INCONSISTENT',
      failureCode: 'HOSTING_RESULT_UNKNOWN',
      manualRetryAllowed: false,
      failedAt: '2026-08-26T01:00:00.000Z',
    },
  ],
  outboxEvents: [
    {
      source: 'OUTBOX',
      outboxEventId: '10000000-0000-4000-8000-000000000002',
      eventType: 'AUTH_EMAIL_VERIFICATION_REQUESTED',
      aggregateType: 'USER',
      aggregateId: '10000000-0000-4000-8000-000000000003',
      attemptCount: 5,
      manualRetryAllowed: true,
      failedAt: '2026-08-26T01:05:00.000Z',
    },
  ],
};

describe('automation manager', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows retained failures and retries only explicitly safe work', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      (request: RequestInfo | URL, init?: RequestInit) => {
        const url = String(request);
        if (url.includes('/auth/csrf')) {
          return Promise.resolve(success({ csrfToken: 'x'.repeat(32) }));
        }
        if (init?.method === 'POST') {
          return Promise.resolve(success({ queued: true }));
        }
        return Promise.resolve(success(failures));
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<AutomationManager />);

    expect(
      await screen.findByRole('heading', {
        name: 'Automation and queue failures',
      }),
    ).toBeTruthy();
    expect(screen.getByText(/HOSTING_RESULT_UNKNOWN/)).toBeTruthy();
    expect(screen.getByText('Reconciliation required')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Retry temporary job' }),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Retry publication' }));

    expect(
      await screen.findByText(
        'The failed outbox publication was queued for dispatch.',
      ),
    ).toBeTruthy();
    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(String(post?.[0])).toContain(
      '/background-jobs/outbox/10000000-0000-4000-8000-000000000002/retry',
    );
    expect((post?.[1] as RequestInit).body).toBe(
      JSON.stringify({ confirmation: 'RETRY_OUTBOX' }),
    );
  });
});

function success(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

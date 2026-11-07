import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServiceUsage } from '@webhost-billing/shared';
import { HostingUsage, formatUsageBytes } from './hosting-usage';

const id = '22200000-0000-4000-8000-000000000001';
const customerId = '22200000-0000-4000-8000-000000000002';
const sample: ServiceUsage = {
  serviceId: id,
  status: 'AVAILABLE',
  sampledAt: '2026-11-07T00:00:00Z',
  freshUntil: '2026-11-07T00:05:00Z',
  retryAfterSeconds: 300,
  simulated: true,
  bandwidthPeriod: '2026-11',
  disk: {
    usedBytes: '268435456',
    limitBytes: '1073741824',
    limitKind: 'LIMITED',
  },
  bandwidth: {
    usedBytes: '1610612736',
    limitBytes: null,
    limitKind: 'UNLIMITED',
  },
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), { status });
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('hosting usage card', () => {
  it('shows owned disk/bandwidth, finite/unlimited limits, retrieval time and fictional label', async () => {
    const fetch = vi.fn().mockResolvedValue(json(sample));
    vi.stubGlobal('fetch', fetch);
    render(<HostingUsage serviceId={id} customerId={customerId} />);
    expect(await screen.findByText('256 MiB')).toBeTruthy();
    expect(screen.getByText('1 GiB')).toBeTruthy();
    expect(screen.getByText('1.5 GiB')).toBeTruthy();
    expect(screen.getByText('Unlimited')).toBeTruthy();
    expect(screen.getByText('Fictional usage sample')).toBeTruthy();
    expect(screen.getByText(/Bandwidth month: 2026-11/)).toBeTruthy();
    expect(
      screen
        .getByRole('progressbar', { name: 'Disk usage' })
        .getAttribute('value'),
    ).toBe('25');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/services/${id}/usage?customerId=${customerId}`),
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    );
  });
  it('shows stale saved data explicitly', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          json({ ...sample, status: 'STALE', simulated: false }),
        ),
    );
    render(<HostingUsage serviceId={id} />);
    expect(await screen.findByText(/Saved sample is stale/)).toBeTruthy();
    expect(screen.getByText('256 MiB')).toBeTruthy();
    expect(screen.queryByText('Fictional usage sample')).not.toBeTruthy();
  });
  it('keeps missing counters unavailable and zero limits finite, showing overuse without actions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json({
          ...sample,
          disk: { usedBytes: '1', limitBytes: '0', limitKind: 'LIMITED' },
          bandwidth: null,
        }),
      ),
    );
    render(<HostingUsage serviceId={id} />);
    expect(await screen.findByText('0 B')).toBeTruthy();
    expect(screen.getByText('Over the reported limit')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('100');
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    expect(screen.queryByText('Unlimited')).not.toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
  it.each(['UNAVAILABLE', 'UNSUPPORTED', 'NOT_READY'] as const)(
    'displays %s without invented zero readings',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          json({
            ...sample,
            status,
            disk: null,
            bandwidth: null,
            sampledAt: null,
            freshUntil: null,
          }),
        ),
      );
      render(<HostingUsage serviceId={id} />);
      await settle();
      expect(screen.queryByText('0 B')).not.toBeTruthy();
      expect(screen.queryByRole('progressbar')).not.toBeTruthy();
      expect(screen.getByRole('status').textContent).toMatch(
        /unavailable|not supported/,
      );
    },
  );
  it('does not poll automatically and enforces cooldown before a deliberate refresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T00:00:00Z'));
    const fetch = vi.fn().mockImplementation(async () => json(sample));
    vi.stubGlobal('fetch', fetch);
    render(<HostingUsage serviceId={id} />);
    await settle();
    expect(
      screen
        .getByRole('button', { name: 'Refresh usage' })
        .hasAttribute('disabled'),
    ).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(300000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Saved sample is stale/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh usage' }));
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      screen
        .getByRole('button', { name: 'Refresh usage' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
  it.each([
    json({ ...sample, serviceId: customerId }),
    json({ ...sample, disk: { usedBytes: '-2' } }),
    json({}, 403),
  ])(
    'rejects another service, malformed metrics and denied access',
    async (response) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      render(<HostingUsage serviceId={id} />);
      await settle();
      expect(screen.getByRole('status').textContent).toContain(
        'temporarily unavailable',
      );
      expect(screen.queryByText('256 MiB')).not.toBeTruthy();
    },
  );
  it('clears old data when the selected service changes and aborts stale requests', async () => {
    let release!: (response: Response) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(sample))
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetch);
    const view = render(<HostingUsage serviceId={id} />);
    await screen.findByText('256 MiB');
    view.rerender(<HostingUsage serviceId={customerId} />);
    expect(screen.queryByText('256 MiB')).not.toBeTruthy();
    await act(async () => {
      release(json(sample));
    });
    expect(screen.queryByText('256 MiB')).not.toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Hosting usage' })).getByRole(
        'status',
      ).textContent,
    ).toContain('temporarily unavailable');
  });
  it('does not fetch before a hosting account is ready', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(<HostingUsage serviceId={id} ready={false} />);
    expect(screen.getByText(/after the hosting account is ready/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('formats large integers without floating-point loss or currency conversion', () => {
    expect(formatUsageBytes('0')).toBe('0 B');
    expect(formatUsageBytes('1024')).toBe('1 KiB');
    expect(formatUsageBytes('1572864')).toBe('1.5 MiB');
    expect(formatUsageBytes('9007199254740993')).toBe('8 PiB');
  });
});

import { CpanelWhmHostingPanel } from './cpanel-whm.hosting-panel';
import type { CpanelWhmHttpClient } from './cpanel-whm-http.client';
import { usageBytes, usageMetric } from './cpanel-usage';
import { FakeHostingPanel } from './fake-hosting-panel';

const connection = {
  serverId: '22200000-0000-4000-8000-000000000001',
  hostname: 'panel.example.test',
  port: 2087,
  useTls: true,
  apiUsername: 'fictional',
  credential: 'fictional-token-only',
};
const reference = {
  externalAccountId: 'fictional',
  username: 'fictional',
  domain: 'fictional.example.test',
  packageIdentifier: 'starter',
};
const summary = {
  acct: [
    {
      user: 'fictional',
      domain: reference.domain,
      diskused: '1.5M',
      disklimit: '100M',
    },
  ],
};
const bandwidth = {
  year: 2026,
  month: 11,
  acct: [
    {
      user: 'fictional',
      maindomain: reference.domain,
      totalbytes: '9007199254740993',
      limit: 'unlimited',
      deleted: 0,
    },
  ],
};
function fixture(disk: unknown = summary, traffic: unknown = bandwidth) {
  const call = jest
    .fn()
    .mockResolvedValueOnce({ metadata: { result: 1 }, data: disk })
    .mockResolvedValueOnce({ metadata: { result: '1' }, data: traffic });
  return {
    call,
    panel: new CpanelWhmHostingPanel({
      call,
    } as unknown as CpanelWhmHttpClient),
  };
}
describe('read-only hosting usage adapters', () => {
  it('converts cPanel MiB exactly and keeps large bandwidth integers lossless', async () => {
    const { panel, call } = fixture();
    await expect(
      panel.getUsage(connection, reference, '2026-11'),
    ).resolves.toEqual({
      disk: {
        usedBytes: '1572864',
        limitBytes: '104857600',
        limitKind: 'LIMITED',
      },
      bandwidth: {
        usedBytes: '9007199254740993',
        limitBytes: null,
        limitKind: 'UNLIMITED',
      },
      bandwidthPeriod: '2026-11',
    });
    expect(call.mock.calls).toEqual([
      [connection, 'accountsummary', { user: 'fictional' }, false],
      [
        connection,
        'showbw',
        {
          searchtype: 'user',
          search: '^fictional$',
          year: '2026',
          month: '11',
        },
        false,
      ],
    ]);
  });
  it('keeps zero quotas finite and separates unknown limits from unlimited', () => {
    expect(usageMetric('0M', '0M', 'MIB')).toEqual({
      usedBytes: '0',
      limitBytes: '0',
      limitKind: 'LIMITED',
    });
    expect(usageMetric('12M', undefined, 'MIB')).toMatchObject({
      limitKind: 'UNKNOWN',
      limitBytes: null,
    });
    expect(usageMetric(undefined, undefined, 'MIB')).toBeNull();
    expect(usageBytes('0.000001M', 'MIB')).toBe('1');
  });
  it.each([
    Number.MAX_SAFE_INTEGER + 1,
    -1,
    NaN,
    Infinity,
    '12 garbage',
    '1e5',
    {},
    null,
  ])('does not invent usage for malformed or unsafe values: %p', (value) => {
    expect(usageBytes(value, 'BYTES')).toBeNull();
  });
  it('returns explicit missing metrics rather than zero', async () => {
    const { panel } = fixture(
      { acct: [{ user: 'fictional', domain: reference.domain }] },
      { year: 2026, month: 11, acct: [] },
    );
    await expect(
      panel.getUsage(connection, reference, '2026-11'),
    ).resolves.toEqual({
      disk: null,
      bandwidth: null,
      bandwidthPeriod: '2026-11',
    });
  });
  it('checks account ownership before requesting bandwidth', async () => {
    const { panel, call } = fixture({
      acct: [{ ...summary.acct[0], domain: 'other.example.test' }],
    });
    await expect(
      panel.getUsage(connection, reference, '2026-11'),
    ).rejects.toMatchObject({ code: 'PANEL_USAGE_UNAVAILABLE' });
    expect(call).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...bandwidth, month: 10 },
    { ...bandwidth, acct: [{ ...bandwidth.acct[0], user: 'other' }] },
    {
      ...bandwidth,
      acct: [{ ...bandwidth.acct[0], maindomain: 'other.example.test' }],
    },
    { ...bandwidth, acct: [{ ...bandwidth.acct[0], deleted: 1 }] },
    { ...bandwidth, acct: [bandwidth.acct[0], bandwidth.acct[0]] },
  ])(
    'rejects stale periods, unrelated/ambiguous accounts and deleted accounts',
    async (traffic) => {
      const { panel } = fixture(summary, traffic);
      await expect(
        panel.getUsage(connection, reference, '2026-11'),
      ).rejects.toMatchObject({ code: 'PANEL_USAGE_UNAVAILABLE' });
    },
  );
  it('does not allow an unbound username or regex injection', async () => {
    const { panel, call } = fixture();
    await expect(
      panel.getUsage(connection, { ...reference, username: '.*' }, '2026-11'),
    ).rejects.toThrow();
    await expect(
      panel.getUsage(
        connection,
        { ...reference, externalAccountId: 'other' },
        '2026-11',
      ),
    ).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
  it('rejects provider errors without copying their reason into the error', async () => {
    const { panel, call } = fixture();
    call.mockReset().mockResolvedValue({
      metadata: { result: 0, reason: 'fictional-secret-provider-detail' },
    });
    await expect(
      panel.getUsage(connection, reference, '2026-11'),
    ).rejects.toThrow('Hosting usage could not be verified.');
  });
  it('supplies deterministic fictional samples without changing account state', async () => {
    const panel = new FakeHostingPanel();
    const created = await panel.createAccount(connection, {
      serviceReference: 'fictional222',
      domain: reference.domain,
      packageIdentifier: 'starter',
      contactEmail: 'fictional@example.test',
      idempotencyKey: 'fictional222',
    });
    const ref = {
      ...reference,
      externalAccountId: created.account.externalAccountId,
      username: created.account.username,
    };
    const sample = await panel.getUsage(connection, ref, '2026-11');
    expect(sample.disk?.usedBytes).toBe('268435456');
    expect(sample.bandwidth?.limitKind).toBe('UNLIMITED');
    expect(await panel.getAccount(connection, ref)).toEqual(created.account);
    panel.failNext('TEMPORARY');
    await expect(panel.getUsage(connection, ref, '2026-11')).rejects.toThrow();
  });
});

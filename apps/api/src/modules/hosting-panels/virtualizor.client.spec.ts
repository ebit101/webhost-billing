import { parseApiEnvironment } from '@webhost-billing/config';
import {
  VirtualizorClient,
  type VirtualizorRequest,
} from './virtualizor.client';
import type { HostingPanelConnection } from './hosting-panel.interface';

const environment = parseApiEnvironment({
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
  REDIS_URL: 'redis://:test@127.0.0.1:6379/0',
  SESSION_SECRET: 's'.repeat(32),
  CREDENTIAL_ENCRYPTION_KEY: 'e'.repeat(32),
  VIRTUALIZOR_API_ENABLED: 'true',
});
const connection: HostingPanelConnection = {
  serverId: 'fictional',
  hostname: 'node.example.test',
  port: 4085,
  useTls: true,
  apiUsername: null,
  credential: JSON.stringify({
    apiKey: 'fictional-key',
    apiPassword: 'fictional-password',
  }),
};
const lookup = jest
  .fn()
  .mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
function requester() {
  return jest.fn<
    ReturnType<VirtualizorRequest>,
    Parameters<VirtualizorRequest>
  >();
}

describe('Virtualizor Admin API connection adapter', () => {
  it('makes no DNS or HTTP request when networking is disabled', async () => {
    const request = requester();
    const dns = jest.fn();
    await expect(
      new VirtualizorClient(
        { ...environment, VIRTUALIZOR_API_ENABLED: false },
        request,
        dns,
      ).testConnection(connection),
    ).rejects.toMatchObject({ code: 'VIRTUALIZOR_DISABLED' });
    expect(request).not.toHaveBeenCalled();
    expect(dns).not.toHaveBeenCalled();
  });
  it('uses the documented admin credentials, approved HTTPS port and fixed read action', async () => {
    const request = requester().mockResolvedValue(
      new Response(JSON.stringify({ servers: [{ serid: 0 }] })),
    );
    await expect(
      new VirtualizorClient(environment, request, lookup).testConnection(
        connection,
      ),
    ).resolves.toEqual({
      providerVersion: 'Virtualizor Admin API',
      capabilities: ['connection-test'],
    });
    const [url, signal, address] = request.mock.calls[0];
    expect(url.origin).toBe('https://node.example.test:4085');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      act: 'servers',
      api: 'json',
      adminapikey: 'fictional-key',
      adminapipass: 'fictional-password',
    });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(address).toEqual({ address: '93.184.216.34', family: 4 });
  });
  it.each(['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', 'fd00::1'])(
    'blocks private or local resolution %s before HTTP',
    async (address) => {
      const request = requester();
      await expect(
        new VirtualizorClient(environment, request, () =>
          Promise.resolve([{ address, family: 4 }]),
        ).testConnection(connection),
      ).rejects.toMatchObject({ code: 'VIRTUALIZOR_CONFIGURATION_INVALID' });
      expect(request).not.toHaveBeenCalled();
    },
  );
  it.each([
    { servers: [{ serid: 0 }], error: ['credential rejected'] },
    { servers: [{}] },
    {},
    { act: 'login', servers: [] },
  ])('rejects invalid or contradictory provider proof', async (body) => {
    const request = requester().mockResolvedValue(
      new Response(JSON.stringify(body)),
    );
    await expect(
      new VirtualizorClient(environment, request, lookup).testConnection(
        connection,
      ),
    ).rejects.toThrow();
  });
  it('redacts transport URLs, credentials and raw provider errors', async () => {
    const request = requester().mockRejectedValue(
      new Error(`https://node.example.test?adminapipass=fictional-password`),
    );
    try {
      await new VirtualizorClient(environment, request, lookup).testConnection(
        connection,
      );
      throw new Error('Expected failure');
    } catch (error) {
      expect(String(error)).not.toContain('fictional-password');
      expect(String(error)).not.toContain('https://');
    }
  });
  it('does not open a connection if DNS completes after the timeout', async () => {
    jest.useFakeTimers();
    try {
      const request = requester();
      let completeLookup:
        | ((addresses: { address: string; family: number }[]) => void)
        | undefined;
      const dns = new Promise<{ address: string; family: number }[]>(
        (resolve) => {
          completeLookup = resolve;
        },
      );
      const result = new VirtualizorClient(
        environment,
        request,
        () => dns,
      ).testConnection(connection);
      await jest.advanceTimersByTimeAsync(
        environment.HOSTING_PANEL_TIMEOUT_MS + 1,
      );
      completeLookup?.([{ address: '93.184.216.34', family: 4 }]);
      await expect(result).rejects.toMatchObject({
        code: 'VIRTUALIZOR_CONNECTION_UNVERIFIED',
      });
      expect(request).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
  it('rejects redirects and oversized responses', async () => {
    for (const response of [
      new Response('', { status: 302 }),
      new Response('x'.repeat(1_048_577)),
    ]) {
      await expect(
        new VirtualizorClient(
          environment,
          requester().mockResolvedValue(response),
          lookup,
        ).testConnection(connection),
      ).rejects.toThrow();
    }
  });
});

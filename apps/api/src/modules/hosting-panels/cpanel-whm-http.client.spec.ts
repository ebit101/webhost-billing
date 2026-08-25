import { parseApiEnvironment } from '@webhost-billing/config';
import {
  CpanelWhmHttpClient,
  type CpanelWhmFetch,
} from './cpanel-whm-http.client';
import type { HostingPanelConnection } from './hosting-panel.interface';

const environment = parseApiEnvironment({
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
  REDIS_URL: 'redis://:test@127.0.0.1:6379/0',
  SESSION_SECRET: 's'.repeat(32),
  CREDENTIAL_ENCRYPTION_KEY: 'e'.repeat(32),
  HOSTING_PANEL_TIMEOUT_MS: '1000',
});

const connection: HostingPanelConnection = {
  serverId: '10000000-0000-4000-8000-000000000001',
  hostname: 'whm.example.test',
  port: 2087,
  useTls: true,
  apiUsername: 'reseller',
  credential: 'T'.repeat(40),
};

describe('CpanelWhmHttpClient', () => {
  it('uses the official HTTPS WHM API 1 URL and token header', async () => {
    const fetchMock = mockFetch().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { users: 3 },
          metadata: {
            command: 'get_current_users_count',
            result: 1,
            version: 1,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = new CpanelWhmHttpClient(environment, fetchMock);

    await client.call(
      connection,
      'get_current_users_count',
      { sample: 'value with spaces' },
      false,
    );

    const [requestUrl, request] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl).toBeInstanceOf(URL);
    const url = requestUrl as URL;
    expect(url.origin).toBe('https://whm.example.test:2087');
    expect(url.pathname).toBe('/json-api/get_current_users_count');
    expect(url.searchParams.get('api.version')).toBe('1');
    expect(url.searchParams.get('sample')).toBe('value with spaces');
    expect(request?.headers).toMatchObject({
      authorization: `whm reseller:${'T'.repeat(40)}`,
    });
    expect(request?.redirect).toBe('error');
  });

  it('normalizes authentication and uncertain mutation failures', async () => {
    const fetchMock = mockFetch().mockResolvedValueOnce(
      new Response('', { status: 403 }),
    );
    const client = new CpanelWhmHttpClient(environment, fetchMock);
    await expect(
      client.call(connection, 'listaccts', {}, false),
    ).rejects.toMatchObject({
      kind: 'PERMANENT',
      code: 'CPANEL_AUTHENTICATION_FAILED',
    });

    fetchMock.mockRejectedValueOnce(new Error('token leak'));
    const failure: unknown = await client
      .call(connection, 'createacct', { password: 'secret' }, true)
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({
      kind: 'INCONSISTENT',
      code: 'CPANEL_RESULT_UNKNOWN',
    });
    expect(failure).toBeInstanceOf(Error);
    if (failure instanceof Error) {
      expect(failure.message).not.toContain('token leak');
    }
  });

  it('rejects insecure or malformed connection configuration before fetch', async () => {
    const fetchMock = mockFetch();
    await expect(
      new CpanelWhmHttpClient(environment, fetchMock).call(
        { ...connection, useTls: false, port: 2086 },
        'listaccts',
        {},
        false,
      ),
    ).rejects.toMatchObject({ code: 'CPANEL_CONFIGURATION_INVALID' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function mockFetch(): jest.MockedFunction<CpanelWhmFetch> {
  return jest.fn<ReturnType<CpanelWhmFetch>, Parameters<CpanelWhmFetch>>();
}

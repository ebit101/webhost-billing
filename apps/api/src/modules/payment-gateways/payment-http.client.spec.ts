import { FetchPaymentHttpClient } from './payment-http.client';
describe('bounded sandbox payment HTTP transport', () => {
  const client = new FetchPaymentHttpClient();
  const input = {
    url: 'https://sandbox.sslcommerz.com/validator/api/example.php',
    method: 'GET' as const,
    timeoutMs: 1000,
    retries: 0 as const,
  };
  afterEach(() => jest.restoreAllMocks());
  it('reads a small response without exposing request credentials', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"status":"DONE"}', { status: 200 }));
    await expect(client.request(input)).resolves.toEqual({
      status: 200,
      body: { status: 'DONE' },
    });
    expect(fetch).toHaveBeenCalledWith(
      input.url,
      expect.objectContaining({ redirect: 'error' }),
    );
  });
  it('caps response bytes and does not retry an oversized read', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('x'.repeat(262145), { status: 200 }));
    await expect(
      client.request({ ...input, retries: 2 }),
    ).rejects.toMatchObject({
      outcome: 'UNKNOWN',
      safeMessage:
        'The payment response exceeds its limit. Reconciliation is required.',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    'https://securepay.sslcommerz.com/test',
    'https://user:secret@sandbox.sslcommerz.com/test',
    'http://sandbox.sslcommerz.com/test',
    'https://attacker.example/test',
  ])(
    'refuses non-sandbox or credential-bearing URL %s before fetching',
    async (url) => {
      const fetch = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('Should not be reached'));
      await expect(client.request({ ...input, url })).rejects.toMatchObject({
        safeMessage: 'The payment endpoint is not allowed.',
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('uses a generic unknown-outcome error for connection failures without leaking the request URL', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('fictional secret-bearing network error'));
    await expect(
      client.request({
        ...input,
        url: input.url + '?store_passwd=fictional-password',
      }),
    ).rejects.toMatchObject({
      outcome: 'UNKNOWN',
      safeMessage:
        'The payment provider could not be reached. Reconciliation is required before retrying.',
    });
  });
});

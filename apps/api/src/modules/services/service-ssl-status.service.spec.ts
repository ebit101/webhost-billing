import { probeWebsiteSsl } from './service-ssl-status.service';

describe('website SSL probe', () => {
  it('verifies the domain against the validated public IP without a second DNS lookup', async () => {
    const resolve = jest.fn(() => Promise.resolve(['93.184.216.34']));
    const verify = jest.fn(() => Promise.resolve('ACTIVE' as const));
    await expect(
      probeWebsiteSsl('hosting.example.com', resolve, verify),
    ).resolves.toBe('ACTIVE');
    expect(resolve).toHaveBeenCalledWith('hosting.example.com');
    expect(verify).toHaveBeenCalledWith('93.184.216.34', 'hosting.example.com');
  });

  it.each([
    { addresses: ['127.0.0.1'] },
    { addresses: ['169.254.169.254'] },
    { addresses: ['93.184.216.34', '10.0.0.1'] },
    { addresses: [] },
  ])(
    'leaves unverifiable or unsafe DNS results unknown: $addresses',
    async ({ addresses }) => {
      const verify = jest.fn(() => Promise.resolve('ACTIVE' as const));
      await expect(
        probeWebsiteSsl(
          'hosting.example.com',
          () => Promise.resolve(addresses),
          verify,
        ),
      ).resolves.toBe('UNKNOWN');
      expect(verify).not.toHaveBeenCalled();
    },
  );

  it('distinguishes failed certificate verification from an unavailable check', async () => {
    const resolve = () => Promise.resolve(['93.184.216.34']);
    await expect(
      probeWebsiteSsl('hosting.example.com', resolve, () =>
        Promise.resolve('INACTIVE'),
      ),
    ).resolves.toBe('INACTIVE');
    await expect(
      probeWebsiteSsl('hosting.example.com', resolve, () =>
        Promise.reject(new Error('offline')),
      ),
    ).resolves.toBe('UNKNOWN');
  });
});

import {
  parseApiEnvironment,
  parseWorkerEnvironment,
  parseWebEnvironment,
} from '@webhost-billing/config';

const infrastructureEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL:
    'postgresql://webhost_billing:test-password@127.0.0.1:5432/webhost_billing',
  REDIS_URL: 'redis://:test-password@127.0.0.1:6379/0',
  CREDENTIAL_ENCRYPTION_KEY: 'e'.repeat(32),
};

describe('environment validation', () => {
  it('parses API infrastructure and secret settings', () => {
    const environment = parseApiEnvironment({
      ...infrastructureEnvironment,
      PORT: '3001',
      SESSION_SECRET: 's'.repeat(32),
    });

    expect(environment.PORT).toBe(3001);
    expect(environment.NODE_ENV).toBe('test');
    expect(environment.TRUST_PROXY_HOPS).toBe(0);
  });

  it('accepts only a bounded explicit reverse-proxy hop count', () => {
    const environment = parseApiEnvironment({
      ...infrastructureEnvironment,
      PORT: '3001',
      SESSION_SECRET: 's'.repeat(32),
      TRUST_PROXY_HOPS: '1',
    });

    expect(environment.TRUST_PROXY_HOPS).toBe(1);
    expect(() =>
      parseApiEnvironment({
        ...infrastructureEnvironment,
        PORT: '3001',
        SESSION_SECRET: 's'.repeat(32),
        TRUST_PROXY_HOPS: '3',
      }),
    ).toThrow();
  });

  it('rejects a non-PostgreSQL database URL', () => {
    expect(() =>
      parseApiEnvironment({
        ...infrastructureEnvironment,
        DATABASE_URL: 'mysql://127.0.0.1/webhost_billing',
        PORT: '3001',
        SESSION_SECRET: 's'.repeat(32),
      }),
    ).toThrow('Expected a PostgreSQL connection URL');
  });

  it('requires complete sandbox credentials when a provider is enabled', () => {
    expect(() =>
      parseApiEnvironment({
        ...infrastructureEnvironment,
        PORT: '3001',
        SESSION_SECRET: 's'.repeat(32),
        BKASH_ENABLED: 'true',
      }),
    ).toThrow('BKASH_APP_KEY is required');

    const environment = parseApiEnvironment({
      ...infrastructureEnvironment,
      PORT: '3001',
      SESSION_SECRET: 's'.repeat(32),
      API_PUBLIC_ORIGIN: 'https://api.example.test',
      SSLCOMMERZ_ENABLED: 'true',
      SSLCOMMERZ_STORE_ID: 'sandbox-store',
      SSLCOMMERZ_STORE_PASSWORD: 'sandbox-password',
    });
    expect(environment.SSLCOMMERZ_ENABLED).toBe(true);
  });

  it('requires an HTTPS callback origin for enabled providers', () => {
    expect(() =>
      parseApiEnvironment({
        ...infrastructureEnvironment,
        PORT: '3001',
        SESSION_SECRET: 's'.repeat(32),
        API_PUBLIC_ORIGIN: 'http://localhost:3001',
        SSLCOMMERZ_ENABLED: 'true',
        SSLCOMMERZ_STORE_ID: 'sandbox-store',
        SSLCOMMERZ_STORE_PASSWORD: 'sandbox-password',
      }),
    ).toThrow('API_PUBLIC_ORIGIN must be a credential-free HTTPS origin');
  });

  it('rejects non-origin URLs and weak production transport or secrets', () => {
    expect(() =>
      parseApiEnvironment({
        ...infrastructureEnvironment,
        PORT: '3001',
        SESSION_SECRET: 's'.repeat(32),
        WEB_ORIGIN: 'https://user:password@example.test/private',
      }),
    ).toThrow('Expected a credential-free HTTP(S) origin without a path');

    expect(() =>
      parseApiEnvironment({
        ...infrastructureEnvironment,
        NODE_ENV: 'production',
        PORT: '3001',
        SESSION_SECRET: 's'.repeat(64),
        CREDENTIAL_ENCRYPTION_KEY: 'e'.repeat(64),
        WEB_ORIGIN: 'http://billing.example.test',
        API_PUBLIC_ORIGIN: 'https://api.example.test',
      }),
    ).toThrow('WEB_ORIGIN must use HTTPS in production');

    expect(() =>
      parseApiEnvironment({
        ...infrastructureEnvironment,
        NODE_ENV: 'production',
        PORT: '3001',
        SESSION_SECRET: 'replace-with-an-insecure-placeholder-value-000000',
        CREDENTIAL_ENCRYPTION_KEY:
          'replace-with-an-insecure-placeholder-value-000001',
        WEB_ORIGIN: 'https://billing.example.test',
        API_PUBLIC_ORIGIN: 'https://api.example.test',
      }),
    ).toThrow('Production session and encryption secrets');
  });

  it('parses worker infrastructure settings', () => {
    const environment = parseWorkerEnvironment(infrastructureEnvironment);

    expect(environment.REDIS_URL).toContain('redis://');
  });

  it('uses safe local defaults for public web settings', () => {
    const environment = parseWebEnvironment({ NODE_ENV: 'test' });

    expect(environment.WEB_PORT).toBe(3000);
    expect(environment.NEXT_PUBLIC_API_URL).toBe('http://localhost:3001');
  });
});

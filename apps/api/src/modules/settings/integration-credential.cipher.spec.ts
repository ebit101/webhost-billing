import { parseApiEnvironment } from '@webhost-billing/config';
import { IntegrationCredentialCipher } from './integration-credential.cipher';

const environment = parseApiEnvironment({
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
  REDIS_URL: 'redis://:test@127.0.0.1:6379/0',
  SESSION_SECRET: 's'.repeat(32),
  CREDENTIAL_ENCRYPTION_KEY: 'e'.repeat(32),
});

describe('IntegrationCredentialCipher', () => {
  it('uses provider-bound authenticated encryption for JSON credentials', () => {
    const cipher = new IntegrationCredentialCipher(environment);
    const credentials = {
      appKey: 'fictional-app-key',
      appSecret: 'fictional-secret-value',
    };
    const encrypted = cipher.encrypt('bkash', credentials);

    expect(encrypted).not.toContain(credentials.appKey);
    expect(encrypted).not.toContain(credentials.appSecret);
    expect(cipher.decrypt('bkash', cipher.keyVersion, encrypted)).toStrictEqual(
      credentials,
    );
    expect(() =>
      cipher.decrypt('sslcommerz', cipher.keyVersion, encrypted),
    ).toThrow('Reconfigure the provider');
  });

  it('rejects unknown key versions and tampered ciphertext', () => {
    const cipher = new IntegrationCredentialCipher(environment);
    const encrypted = cipher.encrypt('sslcommerz', {
      storePassword: 'fictional-password',
    });

    expect(() =>
      cipher.decrypt('sslcommerz', 'future-version', encrypted),
    ).toThrow('Reconfigure the provider');
    expect(() =>
      cipher.decrypt('sslcommerz', cipher.keyVersion, `${encrypted}tampered`),
    ).toThrow('Reconfigure the provider');
  });
});

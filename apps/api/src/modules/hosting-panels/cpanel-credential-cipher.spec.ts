import { parseApiEnvironment } from '@webhost-billing/config';
import { CpanelCredentialCipher } from './cpanel-credential-cipher';

const environment = parseApiEnvironment({
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
  REDIS_URL: 'redis://:test@127.0.0.1:6379/0',
  SESSION_SECRET: 's'.repeat(32),
  CREDENTIAL_ENCRYPTION_KEY: 'e'.repeat(32),
});

describe('CpanelCredentialCipher', () => {
  it('encrypts tokens with server-bound authenticated encryption', () => {
    const cipher = new CpanelCredentialCipher(environment);
    const token = 'A'.repeat(40);
    const encrypted = cipher.encrypt(
      '10000000-0000-4000-8000-000000000001',
      token,
    );

    expect(encrypted).not.toContain(token);
    expect(
      cipher.decrypt(
        '10000000-0000-4000-8000-000000000001',
        cipher.keyVersion,
        encrypted,
      ),
    ).toBe(token);
    expect(() =>
      cipher.decrypt(
        '20000000-0000-4000-8000-000000000002',
        cipher.keyVersion,
        encrypted,
      ),
    ).toThrow('Reconfigure the server token');
  });

  it('rejects unknown key versions and tampered ciphertext', () => {
    const cipher = new CpanelCredentialCipher(environment);
    const serverId = '10000000-0000-4000-8000-000000000001';
    const encrypted = cipher.encrypt(serverId, 'B'.repeat(40));

    expect(() => cipher.decrypt(serverId, 'future-key', encrypted)).toThrow(
      'Reconfigure the server token',
    );
    expect(() =>
      cipher.decrypt(serverId, cipher.keyVersion, `${encrypted}tampered`),
    ).toThrow('Reconfigure the server token');
  });
});

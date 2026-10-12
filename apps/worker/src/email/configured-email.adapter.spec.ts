import { parseWorkerEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import {
  SmtpConfigurationCipher,
  SMTP_KEY_VERSION,
} from '@webhost-billing/database/smtp-settings';
import type { SmtpConfiguration } from '@webhost-billing/shared';
import nodemailer from 'nodemailer';
import { ConfiguredEmailAdapter } from './configured-email.adapter';
import { SmtpEmailAdapter } from './nodemailer-email.adapter';
import { resolvePublicSmtpHost } from './public-smtp-host';
import type { EmailSendRequest } from './email.types';
const environment = parseWorkerEnvironment({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/test',
  REDIS_URL: 'redis://127.0.0.1:6379/0',
  CREDENTIAL_ENCRYPTION_KEY: 'e'.repeat(32),
});
const config: SmtpConfiguration = {
  host: 'smtp.provider.com',
  connection: { security: 'STARTTLS', port: 587 },
  username: 'fictional-user',
  password: 'fake'.repeat(8),
  enabled: true,
};
const cipher = new SmtpConfigurationCipher(
  environment.CREDENTIAL_ENCRYPTION_KEY,
);
const message: EmailSendRequest = {
  templateKey: 'email-verification',
  recipientEmail: 'fictional@example.test',
  subject: 'Test',
  text: 'Test',
  html: '<p>Test</p>',
  fromAddress: 'billing@example.test',
  fromName: 'Test',
  messageId: '<fixture@example.test>',
};
const fake = () => ({
  key: 'fake',
  send: jest.fn().mockResolvedValue({
    provider: 'fake',
    providerMessageId: message.messageId,
  }),
  close: jest.fn().mockResolvedValue(undefined),
});
describe('configured SMTP delivery', () => {
  afterEach(() => jest.restoreAllMocks());
  it('encrypts with randomized authenticated bytes, rejects corruption and hides plaintext', () => {
    const encrypted = cipher.encrypt(config);
    expect(encrypted).not.toContain(config.password);
    expect(encrypted).not.toContain(config.username);
    expect(cipher.encrypt(config)).not.toBe(encrypted);
    expect(cipher.decrypt(SMTP_KEY_VERSION, encrypted)).toEqual(config);
    for (const [version, value] of [
      ['wrong', encrypted],
      [SMTP_KEY_VERSION, encrypted + 'x'],
      [SMTP_KEY_VERSION, 'garbage'],
    ])
      expect(() => cipher.decrypt(version, value)).toThrow(
        'Protected SMTP configuration is unavailable.',
      );
    expect(() =>
      new SmtpConfigurationCipher('other'.repeat(10)).decrypt(
        SMTP_KEY_VERSION,
        encrypted,
      ),
    ).toThrow();
  });
  it('reloads each attempt, falls back only when absent/inactive and closes custom transports', async () => {
    let stored: { ciphertext: string; keyVersion: string } | null = null;
    const prisma = {
      integrationCredential: {
        findUnique: jest.fn(() => Promise.resolve(stored)),
      },
    } as unknown as Pick<PrismaClient, 'integrationCredential'>;
    const fallback = fake(),
      custom = fake();
    const resolve = jest.fn().mockResolvedValue('8.8.8.8');
    const create = jest.fn(() => custom);
    const adapter = new ConfiguredEmailAdapter(
      environment,
      prisma,
      resolve,
      create,
      fallback,
    );
    await adapter.send(message);
    stored = {
      ciphertext: cipher.encrypt({ ...config, enabled: false }),
      keyVersion: SMTP_KEY_VERSION,
    };
    await adapter.send(message);
    expect(fallback.send).toHaveBeenCalledTimes(2);
    expect(resolve).not.toHaveBeenCalled();
    stored = {
      ciphertext: cipher.encrypt(config),
      keyVersion: SMTP_KEY_VERSION,
    };
    await adapter.send(message);
    expect(create).toHaveBeenCalledWith(config, '8.8.8.8');
    expect(custom.send).toHaveBeenCalledWith(message);
    expect(custom.close).toHaveBeenCalledTimes(1);
    stored = { ciphertext: 'damaged', keyVersion: SMTP_KEY_VERSION };
    await expect(adapter.send(message)).rejects.toMatchObject({
      code: 'SMTP_CONFIGURATION_UNAVAILABLE',
    });
    expect(fallback.send).toHaveBeenCalledTimes(2);
    await adapter.close();
    await expect(adapter.send(message)).rejects.toMatchObject({
      code: 'EMAIL_DELIVERY_ABORTED',
    });
  });
  it('fails closed on database/DNS failure, never passes secrets to logs or fallback', async () => {
    const read = jest
      .fn()
      .mockRejectedValue(new Error('sensitive database diagnostic'));
    const prisma = {
      integrationCredential: { findUnique: read },
    } as unknown as Pick<PrismaClient, 'integrationCredential'>;
    const fallback = fake(),
      create = jest.fn(() => fake());
    const resolve = jest
      .fn()
      .mockRejectedValue(new Error('sensitive DNS diagnostic'));
    const adapter = new ConfiguredEmailAdapter(
      environment,
      prisma,
      resolve,
      create,
      fallback,
    );
    await expect(adapter.send(message)).rejects.toMatchObject({
      code: 'SMTP_CONFIGURATION_READ_UNAVAILABLE',
      message: 'Email delivery failed.',
    });
    read.mockResolvedValue({
      ciphertext: cipher.encrypt(config),
      keyVersion: SMTP_KEY_VERSION,
    });
    await expect(adapter.send(message)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
    expect(fallback.send).not.toHaveBeenCalled();
    await adapter.close();
  });
  it('pins a public IPv4 destination and refuses mixed/private/reserved DNS answers', async () => {
    await expect(
      resolvePublicSmtpHost(config.host, () => Promise.resolve(['8.8.8.8'])),
    ).resolves.toBe('8.8.8.8');
    for (const ip of [
      '127.0.0.1',
      '10.1.1.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.1.1',
      '100.64.0.1',
      '198.18.0.1',
      '203.0.113.1',
      '224.0.0.1',
      '0.0.0.0',
      '::1',
      '::ffff:127.0.0.1',
    ])
      await expect(
        resolvePublicSmtpHost(config.host, () =>
          Promise.resolve(['8.8.8.8', ip]),
        ),
      ).rejects.toMatchObject({ code: 'SMTP_DESTINATION_NOT_PUBLIC' });
    await expect(
      resolvePublicSmtpHost(config.host, () => Promise.resolve([])),
    ).rejects.toMatchObject({ code: 'SMTP_DESTINATION_NOT_PUBLIC' });
    const lookup = jest.fn(() => Promise.resolve(['8.8.8.8']));
    await expect(
      resolvePublicSmtpHost('localhost', lookup),
    ).rejects.toMatchObject({ code: 'SMTP_DESTINATION_NOT_PUBLIC' });
    expect(lookup).not.toHaveBeenCalled();
    await expect(
      resolvePublicSmtpHost(config.host, () =>
        Promise.reject(new Error('secret')),
      ),
    ).rejects.toMatchObject({
      code: 'SMTP_DNS_UNAVAILABLE',
      message: 'Email delivery failed.',
    });
  });
  it('uses verified TLS with original hostname when connecting to a pinned IP', async () => {
    const spy = jest.spyOn(nodemailer, 'createTransport');
    const adapter = new SmtpEmailAdapter(
      {
        ...environment,
        SMTP_HOST: '8.8.8.8',
        SMTP_PORT: 587,
        SMTP_REQUIRE_TLS: true,
      },
      config.host,
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '8.8.8.8',
        requireTLS: true,
        secure: false,
        logger: false,
        debug: false,
        tls: {
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2',
          servername: config.host,
        },
      }),
    );
    await adapter.close();
  });
});

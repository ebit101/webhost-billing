import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseWorkerEnvironment } from '@webhost-billing/config';
import { classifySmtpError } from './email-provider.error';
import { PreviewEmailAdapter } from './nodemailer-email.adapter';

describe('email provider adapters', () => {
  it('requires SMTP, HTTPS links, and transport encryption in production', () => {
    const base = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      CREDENTIAL_ENCRYPTION_KEY: 'e'.repeat(32),
    };

    expect(() => parseWorkerEnvironment(base)).toThrow();
    expect(() =>
      parseWorkerEnvironment({
        ...base,
        EMAIL_TRANSPORT: 'smtp',
        EMAIL_PUBLIC_WEB_URL: 'https://billing.example.test',
        SMTP_HOST: 'smtp.example.test',
        SMTP_REQUIRE_TLS: 'false',
      }),
    ).toThrow();
    expect(
      parseWorkerEnvironment({
        ...base,
        EMAIL_TRANSPORT: 'smtp',
        EMAIL_PUBLIC_WEB_URL: 'https://billing.example.test',
        SMTP_HOST: 'smtp.example.test',
        SMTP_REQUIRE_TLS: 'true',
      }).EMAIL_TRANSPORT,
    ).toBe('smtp');
  });

  it('classifies SMTP failures without exposing provider messages', () => {
    expect(
      classifySmtpError({ code: 'EAUTH', message: 'secret' }),
    ).toMatchObject({
      kind: 'PERMANENT',
      code: 'SMTP_REQUEST_REJECTED',
      message: 'Email delivery failed.',
    });
    expect(
      classifySmtpError({ code: 'ETIMEDOUT', command: 'CONN' }),
    ).toMatchObject({
      kind: 'TEMPORARY',
      code: 'SMTP_CONNECTION_UNAVAILABLE',
    });
    expect(
      classifySmtpError({ code: 'ETIMEDOUT', command: 'DATA' }),
    ).toMatchObject({
      kind: 'INCONSISTENT',
      code: 'SMTP_DELIVERY_OUTCOME_UNKNOWN',
    });
  });

  it('writes a private RFC email preview without external delivery', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'webhost-email-preview-'));
    const environment = parseWorkerEnvironment({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      CREDENTIAL_ENCRYPTION_KEY: 'e'.repeat(32),
      EMAIL_PREVIEW_DIRECTORY: directory,
    });
    const adapter = new PreviewEmailAdapter(environment);
    try {
      const result = await adapter.send({
        templateKey: 'email-verification',
        recipientEmail: 'customer@example.test',
        subject: 'Verify your email',
        text: 'Plain text fallback',
        html: '<p>Safe HTML</p>',
        messageId: '<outbox.test@example.test>',
      });
      const files = await readdir(directory);
      expect(result.provider).toBe('preview');
      expect(files).toHaveLength(1);
      const source = await readFile(join(directory, files[0]), 'utf8');
      expect(source).toContain('Plain text fallback');
      expect(source).toContain('Safe HTML');
    } finally {
      await adapter.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

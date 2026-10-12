import type { WorkerEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import {
  SMTP_PROVIDER_KEY,
  SmtpConfigurationCipher,
} from '@webhost-billing/database/smtp-settings';
import type { SmtpConfiguration } from '@webhost-billing/shared';
import {
  PreviewEmailAdapter,
  SmtpEmailAdapter,
} from './nodemailer-email.adapter';
import { EmailProviderError } from './email-provider.error';
import { resolvePublicSmtpHost } from './public-smtp-host';
import type { EmailAdapter, EmailSendRequest } from './email.types';

export class ConfiguredEmailAdapter implements EmailAdapter {
  readonly key = 'configured-email';
  private readonly cipher: SmtpConfigurationCipher;
  private readonly fallback: EmailAdapter;
  private readonly active = new Set<EmailAdapter>();
  private closed = false;
  constructor(
    private readonly environment: WorkerEnvironment,
    private readonly prisma: Pick<PrismaClient, 'integrationCredential'>,
    private readonly resolveHost = resolvePublicSmtpHost,
    private readonly create: (
      config: SmtpConfiguration,
      address: string,
    ) => EmailAdapter = (config, address) =>
      new SmtpEmailAdapter(
        {
          ...environment,
          SMTP_HOST: address,
          SMTP_PORT: config.connection.port,
          SMTP_SECURE: config.connection.security === 'TLS',
          SMTP_REQUIRE_TLS: true,
          SMTP_USERNAME: config.username,
          SMTP_PASSWORD: config.password,
        },
        config.host,
      ),
    fallback?: EmailAdapter,
  ) {
    this.cipher = new SmtpConfigurationCipher(
      environment.CREDENTIAL_ENCRYPTION_KEY,
    );
    this.fallback =
      fallback ??
      (environment.EMAIL_TRANSPORT === 'smtp'
        ? new SmtpEmailAdapter(environment)
        : new PreviewEmailAdapter(environment));
  }
  async send(message: EmailSendRequest) {
    if (this.closed)
      throw new EmailProviderError('TEMPORARY', 'EMAIL_DELIVERY_ABORTED');
    let stored: { ciphertext: string; keyVersion: string } | null;
    try {
      stored = await this.prisma.integrationCredential.findUnique({
        where: { providerKey: SMTP_PROVIDER_KEY },
        select: { ciphertext: true, keyVersion: true },
      });
    } catch {
      throw new EmailProviderError(
        'TEMPORARY',
        'SMTP_CONFIGURATION_READ_UNAVAILABLE',
      );
    }
    if (!stored) return this.fallback.send(message);
    let config: SmtpConfiguration;
    try {
      config = this.cipher.decrypt(stored.keyVersion, stored.ciphertext);
    } catch {
      throw new EmailProviderError(
        'PERMANENT',
        'SMTP_CONFIGURATION_UNAVAILABLE',
      );
    }
    if (!config.enabled) return this.fallback.send(message);
    const address = await this.resolveHost(config.host);
    if (this.closed)
      throw new EmailProviderError('TEMPORARY', 'EMAIL_DELIVERY_ABORTED');
    const adapter = this.create(config, address);
    this.active.add(adapter);
    try {
      return await adapter.send(message);
    } finally {
      this.active.delete(adapter);
      await adapter.close();
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    await Promise.all([
      this.fallback.close(),
      ...[...this.active].map((adapter) => adapter.close()),
    ]);
  }
}

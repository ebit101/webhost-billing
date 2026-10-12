import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import {
  SMTP_PROVIDER_KEY,
  SMTP_KEY_VERSION,
  SmtpConfigurationCipher,
} from '@webhost-billing/database/smtp-settings';
import {
  saveSmtpSettingsSchema,
  smtpActivationSchema,
  type SaveSmtpSettings,
  type SmtpActivation,
  type SmtpSettingsStatus,
  type SmtpConfiguration,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';

@Injectable()
export class SmtpSettingsService {
  private readonly cipher: SmtpConfigurationCipher;
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.cipher = new SmtpConfigurationCipher(
      environment.CREDENTIAL_ENCRYPTION_KEY,
    );
  }
  async status(actor: AuthRequestContext): Promise<SmtpSettingsStatus> {
    this.authorize(actor);
    const stored = await this.prisma.integrationCredential.findUnique({
      where: { providerKey: SMTP_PROVIDER_KEY },
    });
    if (!stored)
      return {
        configured: false,
        enabled: false,
        host: null,
        connection: null,
        maskedUsername: null,
        passwordConfigured: false,
        updatedAt: null,
        revision: null,
      };
    let config: SmtpConfiguration;
    try {
      config = this.cipher.decrypt(stored.keyVersion, stored.ciphertext);
    } catch {
      throw this.invalid(
        'Protected SMTP configuration is unavailable. Save it again.',
      );
    }
    return {
      configured: true,
      enabled: config.enabled,
      host: config.host,
      connection: config.connection,
      maskedUsername: '••••••••',
      passwordConfigured: true,
      updatedAt: stored.updatedAt.toISOString(),
      revision: revision(stored.ciphertext),
    };
  }
  async save(
    input: SaveSmtpSettings,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    this.authorize(actor);
    const { confirmation, ...config } = saveSmtpSettingsSchema.parse(input);
    void confirmation;
    await this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.integrationCredential.upsert({
        where: { providerKey: SMTP_PROVIDER_KEY },
        create: {
          providerKey: SMTP_PROVIDER_KEY,
          ciphertext: this.cipher.encrypt({ ...config, enabled: false }),
          keyVersion: SMTP_KEY_VERSION,
          maskedIdentifier: 'SMTP account configured',
          updatedByUserId: actor.identity.userId,
        },
        update: {
          ciphertext: this.cipher.encrypt({ ...config, enabled: false }),
          keyVersion: SMTP_KEY_VERSION,
          maskedIdentifier: 'SMTP account configured',
          updatedByUserId: actor.identity.userId,
        },
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'SMTP_CONFIGURATION_SAVED_BY_ADMIN',
          entityType: 'INTEGRATION_CREDENTIAL',
          entityId: saved.id,
          ipAddressHash: context.ipAddressHash,
          metadata: { enabled: false, keyVersion: SMTP_KEY_VERSION },
        },
      });
    });
    return this.status(actor);
  }
  async activate(
    input: SmtpActivation,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    this.authorize(actor);
    const change = smtpActivationSchema.parse(input);
    await this.prisma.$transaction(async (transaction) => {
      // Serialize save/activation so activation cannot accidentally enable a concurrently replaced bundle.
      await transaction.$queryRaw`SELECT id FROM integration_credentials WHERE provider_key = ${SMTP_PROVIDER_KEY} FOR UPDATE`;
      const stored = await transaction.integrationCredential.findUnique({
        where: { providerKey: SMTP_PROVIDER_KEY },
      });
      if (!stored)
        throw this.invalid(
          'Save SMTP configuration before changing its activation.',
        );
      if (revision(stored.ciphertext) !== change.revision)
        throw this.invalid(
          'SMTP configuration changed. Reload and review it before activation.',
        );
      let config: SmtpConfiguration;
      try {
        config = this.cipher.decrypt(stored.keyVersion, stored.ciphertext);
      } catch {
        throw this.invalid(
          'Protected SMTP configuration is unavailable. Save it again.',
        );
      }
      await transaction.integrationCredential.update({
        where: { id: stored.id },
        data: {
          ciphertext: this.cipher.encrypt({
            ...config,
            enabled: change.enabled,
          }),
          updatedByUserId: actor.identity.userId,
        },
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: change.enabled
            ? 'SMTP_CONFIGURATION_ENABLED_BY_ADMIN'
            : 'SMTP_DEPLOYMENT_TRANSPORT_RESTORED_BY_ADMIN',
          entityType: 'INTEGRATION_CREDENTIAL',
          entityId: stored.id,
          ipAddressHash: context.ipAddressHash,
          metadata: { enabled: change.enabled },
        },
      });
    });
    return this.status(actor);
  }
  private authorize(actor: AuthRequestContext) {
    if (
      actor.identity.role !== 'ADMIN' ||
      actor.identity.staffRole !== 'FULL_ADMINISTRATOR' ||
      !actor.identity.twoFactorEnabled
    )
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message:
          'A full administrator with two-factor authentication is required for SMTP settings.',
      });
  }
  private invalid(message: string) {
    return new ApplicationException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'UNPROCESSABLE_ENTITY',
      message,
    });
  }
}
function revision(ciphertext: string) {
  return createHash('sha256').update(ciphertext).digest('hex');
}

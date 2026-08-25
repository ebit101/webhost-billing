import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import {
  type BkashCredentials,
  type IntegrationCredentialUpdate,
  type SslCommerzCredentials,
  integrationCredentialUpdateSchema,
} from '@webhost-billing/shared';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { SecurityRequestContext } from '../../common/http/request-context';
import type { AuthRequestContext } from '../auth/auth.types';
import { IntegrationCredentialCipher } from './integration-credential.cipher';

export interface ResolvedCredentials<T> {
  value: T;
  revision: string;
}

@Injectable()
export class IntegrationCredentialService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    private readonly cipher: IntegrationCredentialCipher,
  ) {}

  async replace(
    input: IntegrationCredentialUpdate,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ) {
    const update = integrationCredentialUpdateSchema.parse(input);
    const existing = await this.prisma.integrationCredential.findUnique({
      where: { providerKey: update.provider },
      select: { id: true },
    });
    const maskedIdentifier =
      update.provider === 'bkash'
        ? `User ${mask(update.credentials.username)} · App ${mask(update.credentials.appKey)}`
        : `Store ${mask(update.credentials.storeId)}`;
    const ciphertext = this.cipher.encrypt(update.provider, update.credentials);
    const credential = await this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.integrationCredential.upsert({
        where: { providerKey: update.provider },
        update: {
          ciphertext,
          keyVersion: this.cipher.keyVersion,
          maskedIdentifier,
          updatedByUserId: actor.identity.userId,
        },
        create: {
          providerKey: update.provider,
          ciphertext,
          keyVersion: this.cipher.keyVersion,
          maskedIdentifier,
          updatedByUserId: actor.identity.userId,
        },
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: existing
            ? 'INTEGRATION_CREDENTIAL_ROTATED_BY_ADMIN'
            : 'INTEGRATION_CREDENTIAL_CONFIGURED_BY_ADMIN',
          entityType: 'INTEGRATION_CREDENTIAL',
          entityId: saved.id,
          ipAddressHash: context.ipAddressHash,
          metadata: {
            provider: update.provider,
            keyVersion: this.cipher.keyVersion,
          },
        },
      });
      return saved;
    });
    return {
      provider: update.provider,
      configured: true,
      maskedIdentifier: credential.maskedIdentifier,
      updatedAt: credential.updatedAt.toISOString(),
      keyVersion: credential.keyVersion,
      managedAt: 'SETTINGS' as const,
    };
  }

  async bkash(): Promise<ResolvedCredentials<BkashCredentials> | null> {
    const stored = await this.stored('bkash');
    if (stored) {
      const parsed =
        integrationCredentialUpdateSchema.options[0].shape.credentials.parse(
          this.cipher.decrypt('bkash', stored.keyVersion, stored.ciphertext),
        );
      return { value: parsed, revision: stored.updatedAt.toISOString() };
    }
    const { BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME, BKASH_PASSWORD } =
      this.environment;
    if (
      !BKASH_APP_KEY ||
      !BKASH_APP_SECRET ||
      !BKASH_USERNAME ||
      !BKASH_PASSWORD
    ) {
      return null;
    }
    return {
      value: {
        appKey: BKASH_APP_KEY,
        appSecret: BKASH_APP_SECRET,
        username: BKASH_USERNAME,
        password: BKASH_PASSWORD,
      },
      revision: 'deployment-environment',
    };
  }

  async sslCommerz(): Promise<ResolvedCredentials<SslCommerzCredentials> | null> {
    const stored = await this.stored('sslcommerz');
    if (stored) {
      const parsed =
        integrationCredentialUpdateSchema.options[1].shape.credentials.parse(
          this.cipher.decrypt(
            'sslcommerz',
            stored.keyVersion,
            stored.ciphertext,
          ),
        );
      return { value: parsed, revision: stored.updatedAt.toISOString() };
    }
    const { SSLCOMMERZ_STORE_ID, SSLCOMMERZ_STORE_PASSWORD } = this.environment;
    if (!SSLCOMMERZ_STORE_ID || !SSLCOMMERZ_STORE_PASSWORD) return null;
    return {
      value: {
        storeId: SSLCOMMERZ_STORE_ID,
        storePassword: SSLCOMMERZ_STORE_PASSWORD,
      },
      revision: 'deployment-environment',
    };
  }

  async isConfigured(provider: 'bkash' | 'sslcommerz'): Promise<boolean> {
    return provider === 'bkash'
      ? Boolean(await this.bkash())
      : Boolean(await this.sslCommerz());
  }

  private stored(providerKey: string) {
    return this.prisma.integrationCredential.findUnique({
      where: { providerKey },
    });
  }
}

function mask(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return `${trimmed.slice(0, 1)}***`;
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}

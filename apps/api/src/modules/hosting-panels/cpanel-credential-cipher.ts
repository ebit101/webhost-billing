import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { HostingPanelProviderError } from './hosting-panel.error';

const KEY_VERSION = 'cpanel-token-v1';
const CIPHERTEXT_VERSION = 'v1';

@Injectable()
export class CpanelCredentialCipher {
  readonly keyVersion = KEY_VERSION;
  private readonly key: Buffer;

  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    this.key = createHash('sha256')
      .update('webhost-billing:cpanel-credential:v1\0', 'utf8')
      .update(environment.CREDENTIAL_ENCRYPTION_KEY, 'utf8')
      .digest();
  }

  encrypt(serverId: string, apiToken: string): string {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.key,
      initializationVector,
    );
    cipher.setAAD(this.additionalData(serverId));
    const ciphertext = Buffer.concat([
      cipher.update(apiToken, 'utf8'),
      cipher.final(),
    ]);
    return [
      CIPHERTEXT_VERSION,
      initializationVector.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(serverId: string, keyVersion: string, encrypted: string): string {
    if (keyVersion !== KEY_VERSION) {
      throw this.unavailable();
    }
    const parts = encrypted.split('.');
    const [version, encodedIv, encodedTag, encodedCiphertext] = parts;
    if (
      parts.length !== 4 ||
      version !== CIPHERTEXT_VERSION ||
      !encodedIv ||
      !encodedTag ||
      !encodedCiphertext
    ) {
      throw this.unavailable();
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(encodedIv, 'base64url'),
      );
      decipher.setAAD(this.additionalData(serverId));
      decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw this.unavailable();
    }
  }

  private additionalData(serverId: string): Buffer {
    return Buffer.from(`${KEY_VERSION}:${serverId}`, 'utf8');
  }

  private unavailable(): HostingPanelProviderError {
    return new HostingPanelProviderError(
      'PERMANENT',
      'PANEL_CREDENTIAL_UNAVAILABLE',
      'The cPanel credential cannot be decrypted. Reconfigure the server token.',
    );
  }
}

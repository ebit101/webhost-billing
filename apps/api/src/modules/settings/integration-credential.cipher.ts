import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';

const KEY_VERSION = 'integration-credential-v1';
const CIPHERTEXT_VERSION = 'v1';

@Injectable()
export class IntegrationCredentialCipher {
  readonly keyVersion = KEY_VERSION;
  private readonly key: Buffer;

  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    this.key = createHash('sha256')
      .update('webhost-billing:integration-credential:v1\0', 'utf8')
      .update(environment.CREDENTIAL_ENCRYPTION_KEY, 'utf8')
      .digest();
  }

  encrypt(provider: string, value: unknown): string {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.key,
      initializationVector,
    );
    cipher.setAAD(this.additionalData(provider));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return [
      CIPHERTEXT_VERSION,
      initializationVector.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(provider: string, keyVersion: string, encrypted: string): unknown {
    if (keyVersion !== KEY_VERSION) throw this.unavailable();
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
      decipher.setAAD(this.additionalData(provider));
      decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
      return JSON.parse(plaintext) as unknown;
    } catch {
      throw this.unavailable();
    }
  }

  private additionalData(provider: string): Buffer {
    return Buffer.from(`${KEY_VERSION}:${provider}`, 'utf8');
  }

  private unavailable(): Error {
    return new Error(
      'Integration credentials are unavailable. Reconfigure the provider.',
    );
  }
}

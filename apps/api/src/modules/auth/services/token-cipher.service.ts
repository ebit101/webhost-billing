import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { API_ENVIRONMENT } from '../../../infrastructure/environment/environment.module';

@Injectable()
export class TokenCipherService {
  private readonly key: Buffer;

  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    this.key = createHash('sha256')
      .update(environment.CREDENTIAL_ENCRYPTION_KEY, 'utf8')
      .digest();
  }

  encrypt(token: string): string {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.key,
      initializationVector,
    );
    const ciphertext = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final(),
    ]);

    return [
      'v1',
      initializationVector.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(encryptedToken: string): string {
    const parts = encryptedToken.split('.');
    const [version, encodedIv, encodedTag, encodedCiphertext] = parts;

    if (
      parts.length !== 4 ||
      version !== 'v1' ||
      !encodedIv ||
      !encodedTag ||
      !encodedCiphertext
    ) {
      throw new Error('Unsupported encrypted token format');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(encodedIv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

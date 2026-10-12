// Server-only; never import this entry into the browser.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import {
  smtpConfigurationSchema,
  type SmtpConfiguration,
} from '@webhost-billing/shared';

export const SMTP_PROVIDER_KEY = 'smtp';
export const SMTP_KEY_VERSION = 'smtp-configuration-v1';
export class SmtpConfigurationCipher {
  private readonly key: Buffer;
  constructor(secret: string) {
    this.key = createHash('sha256')
      .update('webhost-billing:smtp-configuration:v1\0')
      .update(secret)
      .digest();
  }
  encrypt(value: SmtpConfiguration): string {
    const parsed = smtpConfigurationSchema.parse(value);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(SMTP_KEY_VERSION));
    const body = Buffer.concat([
      cipher.update(JSON.stringify(parsed)),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), body]
      .map((part) => part.toString('base64url'))
      .join('.');
  }
  decrypt(keyVersion: string, ciphertext: string): SmtpConfiguration {
    try {
      if (keyVersion !== SMTP_KEY_VERSION || ciphertext.length > 16_384)
        throw new Error();
      const parts = ciphertext.split('.');
      if (
        parts.length !== 3 ||
        parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
      )
        throw new Error();
      const [iv, tag, body] = parts.map((part) =>
        Buffer.from(part, 'base64url'),
      );
      if (
        parts.some(
          (part) =>
            Buffer.from(part, 'base64url').toString('base64url') !== part,
        )
      )
        throw new Error();
      if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !body)
        throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(Buffer.from(SMTP_KEY_VERSION));
      decipher.setAuthTag(tag);
      const decoded: unknown = JSON.parse(
        Buffer.concat([decipher.update(body), decipher.final()]).toString(),
      );
      return smtpConfigurationSchema.parse(decoded);
    } catch {
      throw new Error(
        'Protected SMTP configuration is unavailable. Save it again.',
      );
    }
  }
}

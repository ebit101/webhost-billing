import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import {
  metaWhatsAppConfigurationSchema,
  type MetaWhatsAppConfiguration,
} from '@webhost-billing/shared';

export const META_WHATSAPP_KEY_VERSION = 'meta-whatsapp-configuration-v1';

/** Separate key/AAD context from SMTP, account phones and authentication tokens. */
export class MetaWhatsAppConfigurationCipher {
  private readonly key: Buffer;
  constructor(secret: string) {
    this.key = createHash('sha256')
      .update('webhost-billing:meta-whatsapp-configuration:v1\0')
      .update(secret)
      .digest();
  }
  encrypt(value: MetaWhatsAppConfiguration): string {
    const parsed = metaWhatsAppConfigurationSchema.parse(value);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(META_WHATSAPP_KEY_VERSION));
    const data = Buffer.concat([
      cipher.update(JSON.stringify(parsed)),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), data]
      .map((part) => part.toString('base64url'))
      .join('.');
  }
  decrypt(version: string, ciphertext: string): MetaWhatsAppConfiguration {
    try {
      if (version !== META_WHATSAPP_KEY_VERSION || ciphertext.length > 32768)
        throw new Error();
      const parts = ciphertext.split('.');
      if (
        parts.length !== 3 ||
        parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
      )
        throw new Error();
      const bytes = parts.map((part) => Buffer.from(part, 'base64url'));
      if (
        bytes.some((part, index) => part.toString('base64url') !== parts[index])
      )
        throw new Error();
      const [iv, tag, body] = bytes;
      if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !body)
        throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(Buffer.from(META_WHATSAPP_KEY_VERSION));
      decipher.setAuthTag(tag);
      return metaWhatsAppConfigurationSchema.parse(
        JSON.parse(
          Buffer.concat([decipher.update(body), decipher.final()]).toString(
            'utf8',
          ),
        ),
      );
    } catch {
      throw new Error('Protected WhatsApp configuration is unavailable.');
    }
  }
}

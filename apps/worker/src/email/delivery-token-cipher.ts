import { createDecipheriv, createHash } from 'node:crypto';

export class DeliveryTokenCipher {
  private readonly key: Buffer;

  constructor(encryptionKey: string) {
    this.key = createHash('sha256').update(encryptionKey, 'utf8').digest();
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

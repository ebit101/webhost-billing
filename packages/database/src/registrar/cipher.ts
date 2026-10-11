import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

// Server-only. Account, mode, purpose and immutable version are authenticated.
export class RegistrarCipher {
  private readonly key: Buffer;
  constructor(secret: string) {
    this.key = createHash('sha256')
      .update('registrar-v1\0')
      .update(secret)
      .digest();
  }
  encrypt(binding: string, value: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(binding));
    const body = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), body]
      .map((part) => part.toString('base64url'))
      .join('.');
  }
  decrypt(binding: string, ciphertext: string): unknown {
    try {
      const parts = ciphertext.split('.');
      if (parts.length !== 3) throw new Error();
      const [iv, tag, body] = parts.map((part) =>
        Buffer.from(part, 'base64url'),
      );
      if (!iv || !tag || !body) throw new Error();
      const cipher = createDecipheriv('aes-256-gcm', this.key, iv);
      cipher.setAAD(Buffer.from(binding));
      cipher.setAuthTag(tag);
      return JSON.parse(
        Buffer.concat([cipher.update(body), cipher.final()]).toString(),
      ) as unknown;
    } catch {
      throw new Error('Registrar protected configuration is unavailable.');
    }
  }
}
export const credentialBinding = (accountId: string, version: number) =>
  `stargate:${accountId}:FAKE:credential:${version}`;
export const contactBinding = (accountId: string, customerId: string) =>
  `stargate:${accountId}:FAKE:contact:${customerId}`;

import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { API_ENVIRONMENT } from '../../../infrastructure/environment/environment.module';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD_SECONDS = 30;

function encodeBase32(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of input.replaceAll('=', '').toUpperCase()) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function hotp(secret: string, timeStep: bigint): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(timeStep);
  const digest = createHmac('sha1', decodeBase32(secret))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const number =
    (((digest[offset] & 0x7f) << 24) |
      (digest[offset + 1] << 16) |
      (digest[offset + 2] << 8) |
      digest[offset + 3]) %
    1_000_000;
  return String(number).padStart(6, '0');
}

@Injectable()
export class TotpService {
  readonly keyVersion = 'mfa-v1';
  private readonly encryptionKey: Buffer;
  private readonly recoveryKey: Buffer;

  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    this.encryptionKey = createHash('sha256')
      .update('webhost-billing:mfa-encryption:v1:')
      .update(environment.CREDENTIAL_ENCRYPTION_KEY)
      .digest();
    this.recoveryKey = createHash('sha256')
      .update('webhost-billing:mfa-recovery:v1:')
      .update(environment.SESSION_SECRET)
      .digest();
  }

  generateSecret(): string {
    return encodeBase32(randomBytes(20));
  }

  encryptSecret(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    cipher.setAAD(Buffer.from(this.keyVersion));
    const ciphertext = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    return [
      this.keyVersion,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decryptSecret(value: string): string {
    const [version, encodedIv, encodedTag, encodedCiphertext, extra] =
      value.split('.');
    if (
      version !== this.keyVersion ||
      !encodedIv ||
      !encodedTag ||
      !encodedCiphertext ||
      extra !== undefined
    ) {
      throw new Error('Unsupported MFA secret format');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(encodedIv, 'base64url'),
    );
    decipher.setAAD(Buffer.from(this.keyVersion));
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  verify(secret: string, code: string, at = new Date()): bigint | null {
    if (!/^\d{6}$/.test(code)) return null;
    const current = BigInt(Math.floor(at.getTime() / 1_000 / PERIOD_SECONDS));
    for (const offset of [0n, -1n, 1n]) {
      const step = current + offset;
      const expected = Buffer.from(hotp(secret, step));
      const supplied = Buffer.from(code);
      if (timingSafeEqual(expected, supplied)) return step;
    }
    return null;
  }

  codeAt(secret: string, at = new Date()): string {
    const timeStep = BigInt(Math.floor(at.getTime() / 1_000 / PERIOD_SECONDS));
    return hotp(secret, timeStep);
  }

  createRecoveryCodes(count = 10): string[] {
    return Array.from({ length: count }, () => {
      const encoded = encodeBase32(randomBytes(10));
      return encoded.match(/.{4}/g)!.join('-');
    });
  }

  hashRecoveryCode(code: string): string {
    return createHmac('sha256', this.recoveryKey)
      .update(code.replaceAll('-', '').toUpperCase())
      .digest('hex');
  }

  buildUri(email: string, secret: string): string {
    const issuer = 'Webhost Billing';
    const label = `${issuer}:${email}`;
    const query = new URLSearchParams({
      secret,
      issuer,
      algorithm: 'SHA1',
      digits: '6',
      period: String(PERIOD_SECONDS),
    });
    return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
  }
}

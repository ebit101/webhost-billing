import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthTokenFactory } from '../auth.types';

@Injectable()
export class CryptoAuthTokenFactory implements AuthTokenFactory {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

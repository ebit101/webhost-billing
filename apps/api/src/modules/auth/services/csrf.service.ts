import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { API_ENVIRONMENT } from '../../../infrastructure/environment/environment.module';

@Injectable()
export class CsrfService {
  private readonly secret: string;

  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    this.secret = environment.SESSION_SECRET;
  }

  generate(): string {
    const nonce = randomBytes(32).toString('base64url');
    return `${nonce}.${this.sign(nonce)}`;
  }

  validate(token: string): boolean {
    const [nonce, suppliedSignature, extra] = token.split('.');

    if (
      !nonce ||
      !suppliedSignature ||
      extra !== undefined ||
      !/^[A-Za-z0-9_-]{43}$/.test(nonce) ||
      !/^[0-9a-f]{64}$/.test(suppliedSignature)
    ) {
      return false;
    }

    const expectedSignature = this.sign(nonce);
    return timingSafeEqual(
      Buffer.from(suppliedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex'),
    );
  }

  private sign(nonce: string): string {
    return createHmac('sha256', this.secret)
      .update(`webhost-billing-csrf:v1:${nonce}`)
      .digest('hex');
  }
}

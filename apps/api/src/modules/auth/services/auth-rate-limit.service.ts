import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import { createHmac } from 'node:crypto';
import { ApplicationException } from '../../../common/errors/application.exception';
import { API_ENVIRONMENT } from '../../../infrastructure/environment/environment.module';
import {
  REDIS_CLIENT,
  type RedisClient,
} from '../../../infrastructure/redis/redis.module';
import { AUTH_RATE_LIMIT_KEY_PREFIX } from '../auth.constants';

const CONSUME_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
`;

@Injectable()
export class AuthRateLimitService {
  private readonly secret: string;
  private readonly namespace: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.secret = environment.SESSION_SECRET;
    this.namespace = environment.AUTH_RATE_LIMIT_NAMESPACE;
  }

  async consume(input: {
    scope: string;
    fingerprint: string;
    limit: number;
    windowMs: number;
  }): Promise<void> {
    const digest = createHmac('sha256', this.secret)
      .update(`${input.scope}:${input.fingerprint}`)
      .digest('hex');
    const key = `${AUTH_RATE_LIMIT_KEY_PREFIX}:${this.namespace}:${input.scope}:${digest}`;

    let count: unknown;
    try {
      count = await this.redis.eval(CONSUME_SCRIPT, {
        keys: [key],
        arguments: [String(input.windowMs)],
      });
    } catch {
      throw new ApplicationException({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service is temporarily unavailable.',
      });
    }

    if (typeof count !== 'number') {
      throw new ApplicationException({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service is temporarily unavailable.',
      });
    }

    if (count > input.limit) {
      throw new ApplicationException({
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      });
    }
  }
}

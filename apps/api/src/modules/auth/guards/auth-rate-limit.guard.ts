import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  AUTH_RATE_LIMIT_KEY,
  type AuthRateLimitDefinition,
} from '../decorators/rate-limit.decorator';
import { AuthRateLimitService } from '../services/auth-rate-limit.service';

function emailFromBody(body: unknown): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'email' in body &&
    typeof body.email === 'string'
  ) {
    return body.email.trim().toLowerCase().slice(0, 320);
  }

  return 'no-email';
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimits: AuthRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const definition = this.reflector.getAllAndOverride<
      AuthRateLimitDefinition | undefined
    >(AUTH_RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);

    if (!definition) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const address = request.ip || request.socket.remoteAddress || 'unavailable';
    const email = definition.includeEmail
      ? `:${emailFromBody(request.body)}`
      : '';

    await this.rateLimits.consume({
      scope: definition.scope,
      fingerprint: `${address}${email}`,
      limit: definition.limit,
      windowMs: definition.windowMs,
    });

    return true;
  }
}

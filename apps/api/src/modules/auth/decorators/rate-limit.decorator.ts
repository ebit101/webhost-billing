import { SetMetadata } from '@nestjs/common';

export interface AuthRateLimitDefinition {
  scope: 'login' | 'password-reset-request' | 'password-reset-confirmation';
  limit: number;
  windowMs: number;
  includeEmail: boolean;
}

export const AUTH_RATE_LIMIT_KEY = 'auth:rate-limit';
export const AuthRateLimit = (definition: AuthRateLimitDefinition) =>
  SetMetadata(AUTH_RATE_LIMIT_KEY, definition);

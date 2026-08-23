import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthRequestContext, AuthenticatedRequest } from '../auth.types';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthRequestContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.auth) {
      throw new Error('Authenticated request context is unavailable');
    }

    return request.auth;
  },
);

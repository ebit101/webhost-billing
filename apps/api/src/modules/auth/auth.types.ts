import type { AuthenticatedIdentity } from '@webhost-billing/shared';
import type { Request } from 'express';

export interface AuthRequestContext {
  identity: AuthenticatedIdentity;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthRequestContext;
}

export interface AuthTokenFactory {
  generate(): string;
}

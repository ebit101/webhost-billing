import { createHmac } from 'node:crypto';
import type { Request } from 'express';

export interface SecurityRequestContext {
  ipAddressHash: string;
  userAgent?: string;
}

export function createSecurityRequestContext(
  request: Request,
  secret: string,
): SecurityRequestContext {
  const ipAddress = request.ip || request.socket.remoteAddress || 'unavailable';
  const userAgent = request.get('user-agent')?.slice(0, 512);

  return {
    ipAddressHash: createHmac('sha256', secret).update(ipAddress).digest('hex'),
    ...(userAgent ? { userAgent } : {}),
  };
}

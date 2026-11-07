import { SetMetadata } from '@nestjs/common';

export interface AuthRateLimitDefinition {
  scope:
    | 'login'
    | 'registration'
    | 'email-verification'
    | 'customer-verification-resend'
    | 'two-factor-login'
    | 'customer-email-login'
    | 'customer-security-preferences'
    | 'password-reset-request'
    | 'password-reset-confirmation'
    | 'payment-webhook'
    | 'ssl-refund-request'
    | 'ssl-refund-reconcile'
    | 'bkash-callback'
    | 'sslcommerz-return'
    | 'support-email-ingress'
    | 'ticket-file-download'
    | 'ticket-file-intent'
    | 'ticket-file-content'
    | 'ticket-create'
    | 'ticket-reply'
    | 'service-ssl-status'
    | 'staff-invite';
  limit: number;
  windowMs: number;
  includeEmail: boolean;
}

export const AUTH_RATE_LIMIT_KEY = 'auth:rate-limit';
export const AuthRateLimit = (definition: AuthRateLimitDefinition) =>
  SetMetadata(AUTH_RATE_LIMIT_KEY, definition);

import type { BackgroundFailureKind } from '@webhost-billing/shared';

export class EmailProviderError extends Error {
  constructor(
    readonly kind: BackgroundFailureKind,
    readonly code: string,
  ) {
    super('Email delivery failed.');
    this.name = 'EmailProviderError';
  }
}

export function classifySmtpError(error: unknown): EmailProviderError {
  const record = isRecord(error) ? error : {};
  const code = typeof record.code === 'string' ? record.code : '';
  const command = typeof record.command === 'string' ? record.command : '';
  const responseCode =
    typeof record.responseCode === 'number' ? record.responseCode : 0;

  if (
    responseCode >= 500 ||
    ['EAUTH', 'EENVELOPE', 'EMESSAGE'].includes(code)
  ) {
    return new EmailProviderError('PERMANENT', 'SMTP_REQUEST_REJECTED');
  }
  if (responseCode >= 400 && responseCode < 500) {
    return new EmailProviderError('TEMPORARY', 'SMTP_TEMPORARILY_REJECTED');
  }
  if (
    command === 'DATA' &&
    ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION'].includes(code)
  ) {
    return new EmailProviderError(
      'INCONSISTENT',
      'SMTP_DELIVERY_OUTCOME_UNKNOWN',
    );
  }
  if (['EDNS', 'ETIMEDOUT', 'ESOCKET', 'ECONNECTION'].includes(code)) {
    return new EmailProviderError('TEMPORARY', 'SMTP_CONNECTION_UNAVAILABLE');
  }
  return new EmailProviderError(
    'INCONSISTENT',
    'SMTP_DELIVERY_OUTCOME_UNKNOWN',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

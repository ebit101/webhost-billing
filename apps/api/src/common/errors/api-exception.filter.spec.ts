import {
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { apiErrorResponseSchema } from '@webhost-billing/shared';
import { formatApiException } from './api-exception.filter';
import { ApplicationException } from './application.exception';

describe('formatApiException', () => {
  it('formats an expected validation failure with a stable code', () => {
    const formatted = formatApiException(
      new ApplicationException({
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        issues: [{ field: 'email', message: 'Invalid email address.' }],
      }),
    );

    expect(formatted).toEqual({
      status: 400,
      body: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          issues: [{ field: 'email', message: 'Invalid email address.' }],
        },
      },
    });
    expect(apiErrorResponseSchema.safeParse(formatted.body).success).toBe(true);
  });

  it('discards details embedded in framework HTTP exceptions', () => {
    const formatted = formatApiException(
      new NotFoundException('Customer query and database details'),
    );

    expect(formatted).toEqual({
      status: 404,
      body: {
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Resource was not found.',
        },
      },
    });
    expect(JSON.stringify(formatted.body)).not.toContain('database');
  });

  it('does not expose provider responses from server-side HTTP failures', () => {
    const formatted = formatApiException(
      new ServiceUnavailableException({
        provider: 'cpanel',
        response: 'Authentication failed for secret-token',
      }),
    );

    expect(formatted).toEqual({
      status: 503,
      body: {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service is temporarily unavailable.',
        },
      },
    });
    expect(JSON.stringify(formatted.body)).not.toContain('secret-token');
  });

  it('does not expose messages or stack traces from unknown errors', () => {
    const error = new Error(
      'postgresql://billing_user:database-secret@database.internal/billing',
    );
    const formatted = formatApiException(error);
    const serialized = JSON.stringify(formatted.body);

    expect(formatted).toEqual({
      status: 500,
      body: {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
        },
      },
    });
    expect(serialized).not.toContain('database-secret');
    expect(serialized).not.toContain('stack');
  });
});

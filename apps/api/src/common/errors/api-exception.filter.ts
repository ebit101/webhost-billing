import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  createApiErrorResponse,
  type ApiErrorCode,
  type ApiErrorResponse,
} from '@webhost-billing/shared';
import type { Response } from 'express';
import { ApplicationException } from './application.exception';

export interface FormattedApiException {
  status: number;
  body: ApiErrorResponse;
}

interface PublicErrorDefinition {
  code: ApiErrorCode;
  message: string;
}

const INTERNAL_ERROR: PublicErrorDefinition = {
  code: 'INTERNAL_ERROR',
  message: 'An unexpected error occurred.',
};

const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

function publicErrorForStatus(status: number): PublicErrorDefinition {
  switch (status) {
    case HTTP_STATUS.BAD_REQUEST:
      return {
        code: 'BAD_REQUEST',
        message: 'Request could not be processed.',
      };
    case HTTP_STATUS.UNAUTHORIZED:
      return {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required.',
      };
    case HTTP_STATUS.FORBIDDEN:
      return {
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      };
    case HTTP_STATUS.NOT_FOUND:
      return { code: 'RESOURCE_NOT_FOUND', message: 'Resource was not found.' };
    case HTTP_STATUS.CONFLICT:
      return {
        code: 'CONFLICT',
        message: 'Request conflicts with the current resource state.',
      };
    case HTTP_STATUS.UNPROCESSABLE_ENTITY:
      return {
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Request could not be processed.',
      };
    case HTTP_STATUS.TOO_MANY_REQUESTS:
      return { code: 'RATE_LIMITED', message: 'Too many requests.' };
    case HTTP_STATUS.SERVICE_UNAVAILABLE:
      return {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service is temporarily unavailable.',
      };
    default:
      return status >= 400 && status < 500
        ? { code: 'BAD_REQUEST', message: 'Request could not be processed.' }
        : INTERNAL_ERROR;
  }
}

export function formatApiException(exception: unknown): FormattedApiException {
  if (exception instanceof ApplicationException) {
    const status = exception.getStatus();

    if (status >= 400 && status < 500) {
      return {
        status,
        body: createApiErrorResponse({
          code: exception.code,
          message: exception.message,
          ...(exception.issues ? { issues: exception.issues } : {}),
        }),
      };
    }
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const publicError = publicErrorForStatus(status);

    return {
      status,
      body: createApiErrorResponse(publicError),
    };
  }

  return {
    status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    body: createApiErrorResponse(INTERNAL_ERROR),
  };
}

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const formatted = formatApiException(exception);

    if (formatted.status >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
      this.logger.error('Unhandled exception converted to a safe API error.');
    }

    const response = host.switchToHttp().getResponse<Response>();
    response.status(formatted.status).json(formatted.body);
  }
}

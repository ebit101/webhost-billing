import { HttpException, type HttpStatus } from '@nestjs/common';
import type { ApiErrorCode, ApiErrorIssue } from '@webhost-billing/shared';

export interface ApplicationExceptionOptions {
  status: HttpStatus;
  code: ApiErrorCode;
  message: string;
  issues?: readonly ApiErrorIssue[];
}

/**
 * An expected client-facing failure with a stable machine-readable code.
 * Server-side failures are always replaced by a generic response in the filter.
 */
export class ApplicationException extends HttpException {
  readonly code: ApiErrorCode;
  readonly issues?: readonly ApiErrorIssue[];

  constructor(options: ApplicationExceptionOptions) {
    super(options.message, options.status);
    this.code = options.code;
    this.issues = options.issues;
  }
}

import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ApplicationException } from '../errors/application.exception';

export class ZodValidationPipe<TOutput> implements PipeTransform<
  unknown,
  TOutput
> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new ApplicationException({
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        issues: result.error.issues.map((issue) => ({
          ...(issue.path.length > 0
            ? { field: issue.path.map(String).join('.') }
            : {}),
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}

import { z } from 'zod';

export const apiErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'AUTHENTICATION_REQUIRED',
  'INVALID_CREDENTIALS',
  'EMAIL_VERIFICATION_REQUIRED',
  'INVALID_OR_EXPIRED_TOKEN',
  'CSRF_VALIDATION_FAILED',
  'FORBIDDEN',
  'RESOURCE_NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'UNPROCESSABLE_ENTITY',
  'PAYMENT_WEBHOOK_REJECTED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
]);

export const apiErrorIssueSchema = z
  .object({
    field: z.string().min(1).max(160).optional(),
    message: z.string().min(1).max(500),
  })
  .strict();

export const apiErrorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z
      .object({
        code: apiErrorCodeSchema,
        message: z.string().min(1).max(500),
        issues: z.array(apiErrorIssueSchema).max(100).optional(),
      })
      .strict(),
  })
  .strict();

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorIssue = z.infer<typeof apiErrorIssueSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export function createApiErrorResponse(input: {
  code: ApiErrorCode;
  message: string;
  issues?: readonly ApiErrorIssue[];
}): ApiErrorResponse {
  return apiErrorResponseSchema.parse({
    success: false,
    error: {
      code: input.code,
      message: input.message,
      ...(input.issues ? { issues: input.issues } : {}),
    },
  });
}

import { z } from 'zod';
import { paginationMetaSchema, type PaginationMeta } from './pagination';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface PaginatedApiSuccessResponse<T> extends ApiSuccessResponse<
  readonly T[]
> {
  pagination: PaginationMeta;
}

export function apiSuccessResponseSchema<TSchema extends z.ZodType>(
  dataSchema: TSchema,
) {
  return z
    .object({
      success: z.literal(true),
      data: dataSchema,
    })
    .strict();
}

export function paginatedApiSuccessResponseSchema<TSchema extends z.ZodType>(
  itemSchema: TSchema,
) {
  return z
    .object({
      success: z.literal(true),
      data: z.array(itemSchema),
      pagination: paginationMetaSchema,
    })
    .strict();
}

export function createApiSuccessResponse<T>(data: T): ApiSuccessResponse<T> {
  return { success: true, data };
}

export function createPaginatedApiSuccessResponse<T>(
  data: readonly T[],
  pagination: PaginationMeta,
): PaginatedApiSuccessResponse<T> {
  return { success: true, data, pagination };
}

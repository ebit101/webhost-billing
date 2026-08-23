import { z } from 'zod';

const safeNonNegativeIntegerSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const paginationMetaSchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    totalItems: safeNonNegativeIntegerSchema,
    totalPages: safeNonNegativeIntegerSchema,
  })
  .strict();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export function createPaginationMeta(
  page: number,
  pageSize: number,
  totalItems: number,
): PaginationMeta {
  return paginationMetaSchema.parse({
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  });
}

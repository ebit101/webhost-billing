import { z } from 'zod';
import { domainNameSchema, domainStates } from './domains';
import { invoiceStatusSchema } from './states';
import { paginationQuerySchema } from './pagination';
import { paginatedApiSuccessResponseSchema } from './responses';

const maxOffset = 2_147_483_647;
const canonicalInteger = (value: unknown) =>
  value === undefined || typeof value === 'number'
    ? value
    : typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value)
      ? value
      : NaN;
export const domainInventoryQuerySchema = paginationQuerySchema
  .extend({
    page: z.preprocess(canonicalInteger, paginationQuerySchema.shape.page),
    pageSize: z.preprocess(
      canonicalInteger,
      paginationQuerySchema.shape.pageSize,
    ),
    search: z.string().trim().max(200).optional(),
    state: z.enum(domainStates).optional(),
    origin: z.enum(['REGISTRATION', 'EXISTING']).optional(),
    customerId: z.uuid().optional(),
  })
  .refine(
    (query) =>
      query.page <= maxOffset && (query.page - 1) * query.pageSize <= maxOffset,
    'The requested page is outside the supported range',
  );
export type DomainInventoryQuery = z.infer<typeof domainInventoryQuerySchema>;

export const domainInventoryRowSchema = z
  .object({
    id: z.uuid(),
    domainName: domainNameSchema,
    customerId: z.uuid(),
    customerName: z.string().min(1).max(201),
    customerNumber: z.string().min(1).max(32),
    customerEmail: z.email().max(320),
    companyName: z.string().max(200).nullable(),
    state: z.enum(domainStates),
    origin: z.enum(['REGISTRATION', 'EXISTING']),
    registrar: z.string().min(1).max(100),
    simulated: z.boolean(),
    requestedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().nullable(),
    invoiceId: z.uuid().nullable(),
    invoiceStatus: invoiceStatusSchema.nullable(),
    balanceDue: z
      .string()
      .regex(/^(0|[1-9][0-9]{0,18})$/)
      .nullable(),
    currency: z.literal('BDT'),
  })
  .strict()
  .superRefine((row, context) => {
    const billing = [row.invoiceId, row.invoiceStatus, row.balanceDue];
    if (
      billing.some((value) => value === null) &&
      !billing.every((value) => value === null)
    )
      context.addIssue({
        code: 'custom',
        message: 'Invoice summary fields must agree',
      });
  });
export type DomainInventoryRow = z.infer<typeof domainInventoryRowSchema>;

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const domainInventorySummarySchema = z
  .object({
    AWAITING_PAYMENT: count,
    AWAITING_APPROVAL: count,
    PENDING: count,
    NEEDS_RECONCILIATION: count,
    FAILED: count,
    REGISTERED: count,
  })
  .strict();
export const domainInventoryResponseSchema = paginatedApiSuccessResponseSchema(
  domainInventoryRowSchema,
).extend({
  data: z.array(domainInventoryRowSchema).max(100),
  summary: domainInventorySummarySchema,
});
export type DomainInventoryResponse = z.infer<
  typeof domainInventoryResponseSchema
>;

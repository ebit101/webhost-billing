import { z } from 'zod';
import { minorUnitAmountSchema, moneySchema } from './money';

const reason = z
  .string()
  .trim()
  .min(12)
  .max(500)
  .refine((value) => !/[<>]/.test(value));
export const sslRefundRequestSchema = z
  .object({
    submissionKey: z.uuid(),
    amount: minorUnitAmountSchema.refine((value) => BigInt(value) > 0n),
    reason,
    confirmation: z.literal('APPROVE_SANDBOX_REFUND'),
  })
  .strict();
export const sslRefundReconcileSchema = z
  .object({
    providerReference: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,191}$/)
      .optional(),
    reason: reason.optional(),
    confirmation: z.literal('LINK_REFUND_REFERENCE').optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.providerReference ||
      (!!value.reason && value.confirmation === 'LINK_REFUND_REFERENCE'),
  );
export const sslCheckoutSchema = z
  .object({
    paymentId: z.uuid(),
    invoiceId: z.uuid(),
    invoiceNumber: z.string(),
    state: z.enum(['CREATING', 'OPEN', 'UNKNOWN', 'FAILED', 'CAPTURED']),
    merchantReference: z.string(),
    bankReference: z.string().nullable(),
    appliedToInvoice: z.boolean(),
    amount: moneySchema,
    reviewReason: z.string().nullable(),
    refunds: z.array(
      z
        .object({
          id: z.uuid(),
          state: z.enum([
            'SUBMITTING',
            'PENDING',
            'UNKNOWN',
            'SUCCEEDED',
            'FAILED',
          ]),
          amount: moneySchema,
          providerReference: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type SslCheckoutDetail = z.infer<typeof sslCheckoutSchema>;
export type SslRefundRequest = z.infer<typeof sslRefundRequestSchema>;
export type SslRefundReconcile = z.infer<typeof sslRefundReconcileSchema>;

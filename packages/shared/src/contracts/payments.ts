import { z } from 'zod';
import { minorUnitAmountSchema, moneySchema } from './money';
import { paginationQuerySchema } from './pagination';

export const manualPaymentMethodSchema = z.enum([
  'BANK_TRANSFER',
  'MOBILE_FINANCIAL_SERVICE',
  'CASH',
  'OTHER',
]);

export const manualPaymentStateSchema = z.enum([
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'REFUNDED',
  'REVERSED',
]);

export const manualPaymentProofSchema = z
  .object({
    method: manualPaymentMethodSchema,
    reference: z.string().trim().min(2).max(140),
    payerName: z.string().trim().min(1).max(200).optional(),
    note: z.string().trim().min(1).max(500).optional(),
    paidAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

const manualPaymentSubmissionFields = {
  invoiceId: z.uuid(),
  amount: minorUnitAmountSchema.refine((value) => value !== '0', {
    message: 'Payment amount must be greater than zero',
  }),
  submissionKey: z.uuid(),
  proof: manualPaymentProofSchema,
} as const;

export const submitManualPaymentRequestSchema = z
  .object(manualPaymentSubmissionFields)
  .strict();

export const recordManualPaymentRequestSchema = z
  .object(manualPaymentSubmissionFields)
  .strict();

export const reviewManualPaymentRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('VERIFY') }).strict(),
  z
    .object({
      action: z.literal('REJECT'),
      reason: z.string().trim().min(2).max(500),
    })
    .strict(),
]);

export const createPaymentAdjustmentRequestSchema = z
  .object({
    kind: z.enum(['REFUND', 'REVERSAL']),
    amount: minorUnitAmountSchema.refine((value) => value !== '0', {
      message: 'Adjustment amount must be greater than zero',
    }),
    submissionKey: z.uuid(),
    reference: z.string().trim().min(2).max(140),
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const paymentSettingsSchema = z
  .object({ partialPaymentsEnabled: z.boolean() })
  .strict();

export const paymentListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  state: manualPaymentStateSchema.optional(),
  customerId: z.uuid().optional(),
  invoiceId: z.uuid().optional(),
});

export const manualPaymentSchema = z
  .object({
    id: z.uuid(),
    invoiceId: z.uuid(),
    invoiceNumber: z.string().min(1).max(32),
    customerId: z.uuid(),
    customerName: z.string().min(1).max(200),
    originalPaymentId: z.uuid().nullable(),
    kind: z.enum(['CHARGE', 'REFUND', 'REVERSAL']),
    state: manualPaymentStateSchema,
    method: manualPaymentMethodSchema,
    reference: z.string().min(1).max(191),
    proof: z
      .object({
        payerName: z.string().min(1).max(200).nullable(),
        note: z.string().min(1).max(500).nullable(),
      })
      .strict(),
    amount: moneySchema,
    adjustedAmount: moneySchema,
    refundableAmount: moneySchema,
    submittedByRole: z.enum(['ADMIN', 'CUSTOMER']).nullable(),
    failureReason: z.string().max(500).nullable(),
    receivedAt: z.iso.datetime({ offset: true }).nullable(),
    reviewedAt: z.iso.datetime({ offset: true }).nullable(),
    verifiedAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const manualPaymentCreationResultSchema = z
  .object({ payment: manualPaymentSchema, duplicate: z.boolean() })
  .strict();

export type ManualPaymentMethod = z.infer<typeof manualPaymentMethodSchema>;
export type ManualPaymentState = z.infer<typeof manualPaymentStateSchema>;
export type ManualPaymentProof = z.infer<typeof manualPaymentProofSchema>;
export type SubmitManualPaymentRequest = z.infer<
  typeof submitManualPaymentRequestSchema
>;
export type RecordManualPaymentRequest = z.infer<
  typeof recordManualPaymentRequestSchema
>;
export type ReviewManualPaymentRequest = z.infer<
  typeof reviewManualPaymentRequestSchema
>;
export type CreatePaymentAdjustmentRequest = z.infer<
  typeof createPaymentAdjustmentRequestSchema
>;
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>;
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
export type ManualPayment = z.infer<typeof manualPaymentSchema>;
export type ManualPaymentCreationResult = z.infer<
  typeof manualPaymentCreationResultSchema
>;

import { z } from 'zod';
import {
  currencyCodeSchema,
  minorUnitAmountSchema,
  moneySchema,
} from './money';
import { paginationQuerySchema } from './pagination';
import { invoiceStatusSchema } from './states';

export const businessIdentitySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    addressLine1: z.string().trim().min(1).max(200).optional(),
    addressLine2: z.string().trim().min(1).max(200).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    region: z.string().trim().min(1).max(100).optional(),
    postalCode: z.string().trim().min(1).max(32).optional(),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .pipe(z.string().regex(/^[A-Z]{2}$/))
      .optional(),
    email: z.string().trim().toLowerCase().pipe(z.email().max(320)).optional(),
    phone: z.string().trim().min(1).max(32).optional(),
    taxIdentifier: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export const invoiceAddressSchema = z
  .object({
    line1: z.string().min(1).max(200),
    line2: z.string().max(200).nullable(),
    city: z.string().min(1).max(100),
    region: z.string().max(100).nullable(),
    postalCode: z.string().max(32).nullable(),
    countryCode: z.string().length(2),
  })
  .strict();

export const invoiceItemInputSchema = z
  .object({
    description: z.string().trim().min(1).max(2_000),
    quantity: z.number().int().min(1).max(1_000_000).default(1),
    unitAmount: minorUnitAmountSchema,
    discountAmount: minorUnitAmountSchema.default('0'),
    taxAmount: minorUnitAmountSchema.default('0'),
    servicePeriodStart: z.iso.datetime({ offset: true }).optional(),
    servicePeriodEnd: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.servicePeriodStart &&
      value.servicePeriodEnd &&
      new Date(value.servicePeriodEnd) <= new Date(value.servicePeriodStart)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['servicePeriodEnd'],
        message: 'Service period end must be after its start',
      });
    }
  });

const draftInvoiceFieldsSchema = z
  .object({
    currency: currencyCodeSchema,
    dueAt: z.iso.datetime({ offset: true }),
    creditTotal: minorUnitAmountSchema.default('0'),
    items: z.array(invoiceItemInputSchema).min(1).max(100),
  })
  .strict();

export const createInvoiceRequestSchema = draftInvoiceFieldsSchema
  .extend({
    customerId: z.uuid(),
    submissionKey: z.uuid(),
  })
  .strict();

export const updateDraftInvoiceRequestSchema = draftInvoiceFieldsSchema;

export const invoiceActionRequestSchema = z
  .object({ action: z.enum(['ISSUE', 'MARK_OVERDUE', 'CANCEL']) })
  .strict();

export const invoiceListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  status: invoiceStatusSchema.optional(),
  customerId: z.uuid().optional(),
});

export const invoiceItemSchema = z
  .object({
    id: z.uuid(),
    description: z.string().min(1).max(2_000),
    quantity: z.number().int().positive(),
    unitAmount: moneySchema,
    discountAmount: moneySchema,
    taxAmount: moneySchema,
    lineTotal: moneySchema,
    servicePeriodStart: z.iso.datetime({ offset: true }).nullable(),
    servicePeriodEnd: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export const invoiceSchema = z
  .object({
    id: z.uuid(),
    invoiceNumber: z.string().min(1).max(32),
    customerId: z.uuid(),
    orderId: z.uuid().nullable(),
    orderNumber: z.string().min(1).max(32).nullable(),
    status: invoiceStatusSchema,
    currency: currencyCodeSchema,
    subtotal: moneySchema,
    discountTotal: moneySchema,
    taxTotal: moneySchema,
    total: moneySchema,
    creditTotal: moneySchema,
    amountPaid: moneySchema,
    balanceDue: moneySchema,
    customerName: z.string().min(1).max(200),
    customerEmail: z.email().max(320),
    customerAddress: invoiceAddressSchema,
    businessIdentity: businessIdentitySchema,
    taxIdentity: z
      .object({ taxIdentifier: z.string().min(1).max(64) })
      .strict()
      .nullable(),
    issuedAt: z.iso.datetime({ offset: true }).nullable(),
    dueAt: z.iso.datetime({ offset: true }),
    paidAt: z.iso.datetime({ offset: true }).nullable(),
    cancelledAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    items: z.array(invoiceItemSchema).min(1),
  })
  .strict();

export const invoiceCreationResultSchema = z
  .object({ invoice: invoiceSchema, duplicate: z.boolean() })
  .strict();

export type BusinessIdentity = z.infer<typeof businessIdentitySchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;
export type CreateInvoiceRequest = z.infer<typeof createInvoiceRequestSchema>;
export type UpdateDraftInvoiceRequest = z.infer<
  typeof updateDraftInvoiceRequestSchema
>;
export type InvoiceActionRequest = z.infer<typeof invoiceActionRequestSchema>;
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceCreationResult = z.infer<typeof invoiceCreationResultSchema>;

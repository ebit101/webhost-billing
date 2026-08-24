import { z } from 'zod';
import { moneySchema } from './money';
import { paginationQuerySchema } from './pagination';
import {
  hostingBillingPeriodSchema,
  invoiceStatusSchema,
  orderStatusSchema,
} from './states';

export const requestedDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .refine((value) => {
    if (!value.includes('.') || value.endsWith('.')) return false;
    return value
      .split('.')
      .every(
        (label) =>
          label.length >= 1 &&
          label.length <= 63 &&
          /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      );
  }, 'Enter a valid domain without a protocol, path, or trailing dot');

const orderSelectionSchema = z
  .object({
    productId: z.uuid(),
    priceId: z.uuid(),
    requestedDomain: requestedDomainSchema,
    submissionKey: z.uuid(),
  })
  .strict();

export const createCustomerOrderRequestSchema = orderSelectionSchema;

export const createAdminOrderRequestSchema = orderSelectionSchema
  .extend({
    customerId: z.uuid(),
    notes: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

export const updateOrderStatusRequestSchema = z
  .object({ status: orderStatusSchema })
  .strict();

export const orderListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  status: orderStatusSchema.optional(),
  customerId: z.uuid().optional(),
});

export const orderItemSchema = z
  .object({
    id: z.uuid(),
    productId: z.uuid(),
    productPriceId: z.uuid(),
    productName: z.string().min(1).max(160),
    description: z.string().max(2_000).nullable(),
    billingPeriod: hostingBillingPeriodSchema,
    unitAmount: moneySchema,
    setupFee: moneySchema,
    lineTotal: moneySchema,
    quantity: z.number().int().positive(),
    requestedDomain: requestedDomainSchema,
  })
  .strict();

export const orderInvoiceSchema = z
  .object({
    id: z.uuid(),
    invoiceNumber: z.string().min(1).max(32),
    status: invoiceStatusSchema,
    total: moneySchema,
    balanceDue: moneySchema,
    dueAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const orderSchema = z
  .object({
    id: z.uuid(),
    orderNumber: z.string().min(1).max(32),
    customerId: z.uuid(),
    customerName: z.string().min(1).max(200),
    customerEmail: z.email().max(320),
    status: orderStatusSchema,
    subtotal: moneySchema,
    setupTotal: moneySchema,
    total: moneySchema,
    notes: z.string().max(2_000).nullable(),
    placedAt: z.iso.datetime({ offset: true }),
    completedAt: z.iso.datetime({ offset: true }).nullable(),
    cancelledAt: z.iso.datetime({ offset: true }).nullable(),
    items: z.array(orderItemSchema).min(1),
    invoice: orderInvoiceSchema,
  })
  .strict();

export const orderCreationResultSchema = z
  .object({
    order: orderSchema,
    duplicate: z.boolean(),
  })
  .strict();

export type CreateCustomerOrderRequest = z.infer<
  typeof createCustomerOrderRequestSchema
>;
export type CreateAdminOrderRequest = z.infer<
  typeof createAdminOrderRequestSchema
>;
export type UpdateOrderStatusRequest = z.infer<
  typeof updateOrderStatusRequestSchema
>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type Order = z.infer<typeof orderSchema>;
export type OrderCreationResult = z.infer<typeof orderCreationResultSchema>;

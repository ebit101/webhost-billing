import { checkoutTermsAcceptanceSchema } from './checkout-terms';
import { z } from 'zod';
import { hostingConfigurationChoiceSchema } from './hosting-options';
import { registrationRequestSchema } from './authentication';
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

export const hostingProvisioningModeSchema = z.enum([
  'STANDARD',
  'PRESERVE_EXISTING',
]);
export type HostingProvisioningMode = z.infer<
  typeof hostingProvisioningModeSchema
>;
export const adminDomainOrderSnapshotSchema = z.discriminatedUnion(
  'adminDomainAction',
  [
    z
      .object({
        adminDomainAction: z.literal('EXISTING'),
        domainRecordId: z.uuid(),
        sendToRegistrar: z.literal(false),
      })
      .strict(),
    z
      .object({
        adminDomainAction: z.literal('REGISTRATION'),
        domainRecordId: z.uuid(),
        sendToRegistrar: z.literal(true),
      })
      .strict(),
  ],
);
export function readHostingProvisioningMode(
  snapshot: unknown,
): HostingProvisioningMode {
  const parsed = z
    .object({
      hostingProvisioningMode: hostingProvisioningModeSchema.optional(),
    })
    .passthrough()
    .parse(snapshot ?? {});
  return parsed.hostingProvisioningMode ?? 'STANDARD';
}

const orderSelectionSchema = z
  .object({
    productId: z.uuid(),
    priceId: z.uuid(),
    requestedDomain: requestedDomainSchema,
    submissionKey: z.uuid(),
  })
  .strict();

export const MAX_CHECKOUT_ADD_ONS = 10;
const addOnPriceIdsSchema = z
  .array(z.uuid())
  .max(MAX_CHECKOUT_ADD_ONS)
  .refine((ids) => new Set(ids).size === ids.length, 'Select each add-on once');

export const createCustomerOrderRequestSchema = orderSelectionSchema
  .extend({
    addOnPriceIds: addOnPriceIdsSchema.optional(),
    domainQuoteId: z.uuid().optional(),
    acceptedTermsVersion: z.uuid().optional(),
  })
  .strict();

export const guestHostingCheckoutRequestSchema = registrationRequestSchema
  .safeExtend({
    productId: z.uuid(),
    priceId: z.uuid(),
    requestedDomain: requestedDomainSchema,
    submissionKey: z.uuid(),
    domainChoice: z.literal('EXISTING'),
    addOnPriceIds: addOnPriceIdsSchema.optional(),
    acceptedTermsVersion: z.uuid().optional(),
  })
  .strict();

export const createAdminOrderRequestSchema = orderSelectionSchema
  .extend({
    customerId: z.uuid(),
    hostingProvisioningMode: hostingProvisioningModeSchema.optional(),
    domainOrder: z
      .discriminatedUnion('mode', [
        z
          .object({
            mode: z.literal('EXISTING'),
            domainId: z.uuid(),
            priceId: z.uuid(),
            sendToRegistrar: z.literal(false),
          })
          .strict(),
        z
          .object({
            mode: z.literal('REGISTRATION'),
            quoteId: z.uuid(),
            sendToRegistrar: z.literal(true),
          })
          .strict(),
      ])
      .optional(),
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
    configuration: hostingConfigurationChoiceSchema.optional(),
    id: z.uuid(),
    kind: z.enum(['HOSTING', 'DOMAIN', 'ADD_ON']).optional(),
    productId: z.uuid(),
    productPriceId: z.uuid(),
    productName: z.string().min(1).max(160),
    hostingProvisioningMode: hostingProvisioningModeSchema.optional(),
    domainAction: z.enum(['EXISTING', 'REGISTRATION']).optional(),
    domainId: z.uuid().optional(),
    description: z.string().max(2_000).nullable(),
    billingPeriod: z.union([hostingBillingPeriodSchema, z.literal('ONE_TIME')]),
    fulfilledAt: z.iso.datetime({ offset: true }).nullable().optional(),
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
    termsAcceptance: checkoutTermsAcceptanceSchema.optional(),
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
export type GuestHostingCheckoutRequest = z.infer<
  typeof guestHostingCheckoutRequestSchema
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

export const adminOrderDomainOptionsSchema = z
  .object({
    customerId: z.uuid(),
    prices: z
      .array(
        z
          .object({
            tld: z.string().min(1).max(50),
            priceId: z.uuid(),
            name: z.string().min(1).max(160),
            amount: moneySchema,
          })
          .strict(),
      )
      .max(100),
    domains: z
      .array(
        z
          .object({
            id: z.uuid(),
            domainName: requestedDomainSchema,
            ownershipVerifiedAt: z.iso.datetime(),
            expiresAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type AdminOrderDomainOptions = z.infer<
  typeof adminOrderDomainOptionsSchema
>;

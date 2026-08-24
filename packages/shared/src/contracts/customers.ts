import { z } from 'zod';
import { normalizedEmailSchema, passwordSchema } from './authentication';
import { moneySchema } from './money';
import { paginationQuerySchema } from './pagination';
import {
  invoiceStatusSchema,
  orderStatusSchema,
  paymentStatusSchema,
  serviceStatusSchema,
  ticketStatusSchema,
} from './states';

export const customerStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
export const customerAccountStatusSchema = z.enum([
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'DISABLED',
]);

const optionalText = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable().optional();

export const customerProfileFieldsSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    companyName: z.string().trim().min(1).max(200).nullable(),
    phone: z.string().trim().min(1).max(32).nullable(),
    addressLine1: z.string().trim().min(1).max(200),
    addressLine2: z.string().trim().min(1).max(200).nullable(),
    city: z.string().trim().min(1).max(100),
    region: z.string().trim().min(1).max(100).nullable(),
    postalCode: z.string().trim().min(1).max(32).nullable(),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .pipe(z.string().regex(/^[A-Z]{2}$/)),
  })
  .strict();

export const createCustomerRequestSchema = z
  .object({
    email: normalizedEmailSchema,
    password: passwordSchema,
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    companyName: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().min(1).max(32).optional(),
    addressLine1: z.string().trim().min(1).max(200),
    addressLine2: z.string().trim().min(1).max(200).optional(),
    city: z.string().trim().min(1).max(100),
    region: z.string().trim().min(1).max(100).optional(),
    postalCode: z.string().trim().min(1).max(32).optional(),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .pipe(z.string().regex(/^[A-Z]{2}$/)),
    taxIdentifier: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export const updateCustomerProfileRequestSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    companyName: optionalText(200),
    phone: optionalText(32),
    addressLine1: z.string().trim().min(1).max(200).optional(),
    addressLine2: optionalText(200),
    city: z.string().trim().min(1).max(100).optional(),
    region: optionalText(100),
    postalCode: optionalText(32),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .pipe(z.string().regex(/^[A-Z]{2}$/))
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one profile field is required',
  });

export const updateCustomerBillingRequestSchema = z
  .object({ taxIdentifier: optionalText(64) })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one billing field is required',
  });

export const updateCustomerAccessRequestSchema = z
  .object({ active: z.boolean() })
  .strict();

export const changeCustomerPasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'New password must differ from the current password',
  });

export const customerListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  status: customerStatusSchema.optional(),
});

export const customerSummarySchema = z
  .object({
    id: z.uuid(),
    customerNumber: z.string().min(1).max(32),
    status: customerStatusSchema,
    accountStatus: customerAccountStatusSchema,
    email: normalizedEmailSchema,
    emailVerified: z.boolean(),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    companyName: z.string().max(200).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    linkedCounts: z
      .object({
        orders: z.number().int().min(0),
        services: z.number().int().min(0),
        invoices: z.number().int().min(0),
        tickets: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

const datedEntitySchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const customerDetailSchema = customerSummarySchema
  .omit({ linkedCounts: true })
  .extend({
    phone: z.string().max(32).nullable(),
    addressLine1: z.string().min(1).max(200),
    addressLine2: z.string().max(200).nullable(),
    city: z.string().min(1).max(100),
    region: z.string().max(100).nullable(),
    postalCode: z.string().max(32).nullable(),
    countryCode: z.string().length(2),
    taxIdentifier: z.string().max(64).nullable(),
    updatedAt: z.iso.datetime({ offset: true }),
    linked: z
      .object({
        orders: z.array(
          datedEntitySchema
            .extend({
              status: orderStatusSchema,
              total: moneySchema,
            })
            .strict(),
        ),
        services: z.array(
          datedEntitySchema
            .extend({
              status: serviceStatusSchema,
              productName: z.string().min(1).max(160),
              domain: z.string().max(253).nullable(),
              recurringAmount: moneySchema,
            })
            .strict(),
        ),
        invoices: z.array(
          datedEntitySchema
            .extend({
              invoiceNumber: z.string().min(1).max(32),
              status: invoiceStatusSchema,
              total: moneySchema,
              balanceDue: moneySchema,
              dueAt: z.iso.datetime({ offset: true }),
            })
            .strict(),
        ),
        payments: z.array(
          datedEntitySchema
            .extend({
              invoiceId: z.uuid(),
              invoiceNumber: z.string().min(1).max(32),
              kind: z.enum(['CHARGE', 'REFUND', 'REVERSAL', 'CREDIT']),
              status: paymentStatusSchema,
              provider: z.string().min(1).max(64),
              amount: moneySchema,
            })
            .strict(),
        ),
        tickets: z.array(
          datedEntitySchema
            .extend({
              ticketNumber: z.string().min(1).max(32),
              subject: z.string().min(1).max(200),
              status: ticketStatusSchema,
              priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
              updatedAt: z.iso.datetime({ offset: true }),
            })
            .strict(),
        ),
        counts: z
          .object({
            orders: z.number().int().min(0),
            services: z.number().int().min(0),
            invoices: z.number().int().min(0),
            payments: z.number().int().min(0),
            tickets: z.number().int().min(0),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type CreateCustomerRequest = z.infer<typeof createCustomerRequestSchema>;
export type UpdateCustomerProfileRequest = z.infer<
  typeof updateCustomerProfileRequestSchema
>;
export type UpdateCustomerBillingRequest = z.infer<
  typeof updateCustomerBillingRequestSchema
>;
export type UpdateCustomerAccessRequest = z.infer<
  typeof updateCustomerAccessRequestSchema
>;
export type ChangeCustomerPasswordRequest = z.infer<
  typeof changeCustomerPasswordRequestSchema
>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type CustomerSummary = z.infer<typeof customerSummarySchema>;
export type CustomerDetail = z.infer<typeof customerDetailSchema>;

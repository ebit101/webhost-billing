import { z } from 'zod';
import {
  currencyCodeSchema,
  minorUnitAmountSchema,
  moneySchema,
} from './money';
import { hostingBillingPeriodSchema, productStatusSchema } from './states';
import { hostingConfigurationChoiceSchema } from './hosting-options';

const positiveMinorUnitAmountSchema = minorUnitAmountSchema.refine(
  (value) => value !== '0',
  'Price amount must be greater than zero',
);

export const productSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers, and single hyphens',
  );

export const productPriceInputSchema = z
  .object({
    billingPeriod: hostingBillingPeriodSchema,
    currency: currencyCodeSchema,
    amount: positiveMinorUnitAmountSchema,
    setupFee: minorUnitAmountSchema.default('0'),
  })
  .strict();

const productFieldsSchema = z
  .object({
    groupId: z.uuid().nullable(),
    slug: productSlugSchema,
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().min(1).max(2_000).nullable(),
    publicVisible: z.boolean(),
    displayOrder: z.number().int().min(0).max(10_000),
    hostingPackageIdentifier: z.string().trim().min(1).max(191).nullable(),
    storageFeature: z.string().trim().min(1).max(80).nullable(),
    websiteFeature: z.string().trim().min(1).max(80).nullable(),
    emailFeature: z.string().trim().min(1).max(80).nullable(),
    bandwidthFeature: z.string().trim().min(1).max(80).nullable(),
  })
  .strict();

export const createProductRequestSchema = productFieldsSchema
  .extend({
    groupId: z.uuid().nullable().optional(),
    description: z.string().trim().min(1).max(2_000).optional(),
    publicVisible: z.boolean().default(false),
    displayOrder: z.number().int().min(0).max(10_000).default(0),
    hostingPackageIdentifier: z.string().trim().min(1).max(191).optional(),
    storageFeature: z.string().trim().min(1).max(80).optional(),
    websiteFeature: z.string().trim().min(1).max(80).optional(),
    emailFeature: z.string().trim().min(1).max(80).optional(),
    bandwidthFeature: z.string().trim().min(1).max(80).optional(),
    prices: z.array(productPriceInputSchema).max(3).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const keys = new Set<string>();
    for (const [index, price] of (value.prices ?? []).entries()) {
      const key = `${price.billingPeriod}:${price.currency}`;
      if (keys.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['prices', index],
          message: 'Each billing period and currency pair must be unique',
        });
      }
      keys.add(key);
    }
  });

export const updateProductRequestSchema = productFieldsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one product field is required',
  });

export const updateProductStatusRequestSchema = z
  .object({ status: productStatusSchema })
  .strict();

export const publicProductQuerySchema = z
  .object({ currency: currencyCodeSchema.optional() })
  .strict();

export const productPriceSchema = z
  .object({
    id: z.uuid(),
    billingPeriod: hostingBillingPeriodSchema,
    amount: moneySchema,
    setupFee: moneySchema,
    isActive: z.boolean(),
    validFrom: z.iso.datetime({ offset: true }).nullable(),
    validUntil: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const productSchema = productFieldsSchema
  .extend({
    id: z.uuid(),
    status: productStatusSchema,
    prices: z.array(productPriceSchema),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const eligibleProductIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(100)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Select each hosting plan once',
  );

export const hostingAddOnBillingPeriodSchema = z.union([
  z.literal('ONE_TIME'),
  hostingBillingPeriodSchema,
]);

export const hostingAddOnInputSchema = z
  .object({
    configuration: hostingConfigurationChoiceSchema.nullable().optional(),
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(2_000).nullable(),
    currency: currencyCodeSchema,
    billingPeriod: hostingAddOnBillingPeriodSchema.default('ONE_TIME'),
    amount: positiveMinorUnitAmountSchema,
    hostingProductIds: eligibleProductIdsSchema,
    enabled: z.boolean(),
  })
  .strict();

export const publicHostingAddOnSchema = z
  .object({
    configuration: hostingConfigurationChoiceSchema.nullable().optional(),
    id: z.uuid(),
    priceId: z.uuid(),
    name: z.string().min(2).max(160),
    description: z.string().max(2_000).nullable(),
    amount: moneySchema,
    billingPeriod: hostingAddOnBillingPeriodSchema,
  })
  .strict();

export const hostingAddOnSchema = publicHostingAddOnSchema
  .extend({
    hostingProductIds: z.array(z.uuid()),
    enabled: z.boolean(),
  })
  .strict();

export type HostingAddOnInput = z.infer<typeof hostingAddOnInputSchema>;
export type HostingAddOn = z.infer<typeof hostingAddOnSchema>;
export type PublicHostingAddOn = z.infer<typeof publicHostingAddOnSchema>;

export const publicProductSchema = z
  .object({
    id: z.uuid(),
    slug: productSlugSchema,
    name: z.string().min(2).max(160),
    description: z.string().max(2_000).nullable(),
    displayOrder: z.number().int().min(0),
    features: z
      .object({
        storage: z.string().max(80).nullable(),
        websites: z.string().max(80).nullable(),
        email: z.string().max(80).nullable(),
        bandwidth: z.string().max(80).nullable(),
      })
      .strict(),
    prices: z.array(productPriceSchema.omit({ isActive: true })),
    addOns: z.array(publicHostingAddOnSchema).optional(),
  })
  .strict();

export type ProductPriceInput = z.infer<typeof productPriceInputSchema>;
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;
export type UpdateProductStatusRequest = z.infer<
  typeof updateProductStatusRequestSchema
>;
export type PublicProductQuery = z.infer<typeof publicProductQuerySchema>;
export type ProductPrice = z.infer<typeof productPriceSchema>;
export type Product = z.infer<typeof productSchema>;
export type PublicProduct = z.infer<typeof publicProductSchema>;

export const productGroupInputSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    displayOrder: z.number().int().min(0).max(10_000),
  })
  .strict();

export const productGroupSchema = productGroupInputSchema
  .extend({
    id: z.uuid(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type ProductGroupInput = z.infer<typeof productGroupInputSchema>;
export type ProductGroup = z.infer<typeof productGroupSchema>;

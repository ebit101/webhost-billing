import { z } from 'zod';
import {
  currencyCodeSchema,
  minorUnitAmountSchema,
  moneySchema,
} from './money';
import { hostingBillingPeriodSchema, productStatusSchema } from './states';

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

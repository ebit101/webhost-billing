import { z } from 'zod';

const hostingInvoiceProductAttributionSchema = z
  .object({
    version: z.literal(1),
    productId: z.uuid(),
    productPriceId: z.uuid(),
    name: z.string().min(1).max(160),
    kind: z.enum(['HOSTING', 'ADD_ON']),
    source: z.enum([
      'HOSTING_RENEWAL',
      'ADD_ON_RENEWAL',
      'HOSTING_PLAN_CHANGE',
    ]),
  })
  .strict()
  .refine(
    (value) =>
      (value.source === 'ADD_ON_RENEWAL') === (value.kind === 'ADD_ON'),
    { message: 'Invoice attribution source must match its product kind.' },
  );

// Domain renewals have catalogue revision prices, not hosting product-price IDs.
export const domainRenewalProductAttributionSchema = z
  .object({
    version: z.literal(2),
    productId: z.uuid(),
    catalogueId: z.uuid(),
    catalogueRevision: z.number().int().positive().max(2147483647),
    name: z.string().min(1).max(160),
    kind: z.literal('DOMAIN'),
    source: z.literal('DOMAIN_RENEWAL'),
  })
  .strict();
export const invoiceProductAttributionSchema = z.union([
  hostingInvoiceProductAttributionSchema,
  domainRenewalProductAttributionSchema,
]);
export type InvoiceProductAttribution = z.infer<
  typeof invoiceProductAttributionSchema
>;

/** Capture existing trusted purchase/service/quote fields, never current catalogue labels. */
export function snapshotInvoiceProduct(
  input: Omit<
    z.infer<typeof hostingInvoiceProductAttributionSchema>,
    'version'
  >,
): z.infer<typeof hostingInvoiceProductAttributionSchema> {
  return hostingInvoiceProductAttributionSchema.parse({ version: 1, ...input });
}

export function snapshotDomainRenewalProduct(
  input: Omit<
    z.infer<typeof domainRenewalProductAttributionSchema>,
    'version' | 'kind' | 'source'
  >,
) {
  return domainRenewalProductAttributionSchema.parse({
    ...input,
    version: 2,
    kind: 'DOMAIN',
    source: 'DOMAIN_RENEWAL',
  });
}

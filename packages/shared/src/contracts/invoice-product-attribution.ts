import { z } from 'zod';

export const invoiceProductAttributionSchema = z
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
export type InvoiceProductAttribution = z.infer<
  typeof invoiceProductAttributionSchema
>;

/** Capture existing trusted purchase/service/quote fields, never current catalogue labels. */
export function snapshotInvoiceProduct(
  input: Omit<InvoiceProductAttribution, 'version'>,
): InvoiceProductAttribution {
  return invoiceProductAttributionSchema.parse({ version: 1, ...input });
}

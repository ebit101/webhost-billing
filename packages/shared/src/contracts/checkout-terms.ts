import { z } from 'zod';

const termsUrl = z
  .url({ protocol: /^https$/ })
  .max(2048)
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return !url.username && !url.password;
  }, 'Enter an HTTPS terms URL without credentials');
const revision = z.string().trim().min(1).max(80);
const fields = { url: termsUrl.nullable(), revision: revision.nullable() };
const enabled = { required: z.literal(true), url: termsUrl, revision };
const disabled = { required: z.literal(false), ...fields };

export const checkoutTermsInputSchema = z.discriminatedUnion('required', [
  z.object(enabled).strict(),
  z.object(disabled).strict(),
]);
export const checkoutTermsPolicySchema = z.discriminatedUnion('required', [
  z.object({ ...enabled, version: z.uuid() }).strict(),
  z.object({ ...disabled, version: z.uuid().nullable() }).strict(),
]);
export const checkoutTermsAcceptanceSchema = z
  .object({
    url: termsUrl,
    revision,
    version: z.uuid(),
    acceptedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type CheckoutTermsInput = z.infer<typeof checkoutTermsInputSchema>;
export type CheckoutTermsPolicy = z.infer<typeof checkoutTermsPolicySchema>;
export type CheckoutTermsAcceptance = z.infer<
  typeof checkoutTermsAcceptanceSchema
>;
export const DEFAULT_CHECKOUT_TERMS: CheckoutTermsPolicy = {
  required: false,
  url: null,
  revision: null,
  version: null,
};

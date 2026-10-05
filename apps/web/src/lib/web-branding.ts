import { webBrandingSchema, type WebBranding } from '@webhost-billing/shared';
import type { Metadata } from 'next';

function optional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

// Explicit accesses are required for Next.js build-time inlining in client bundles.
// Only these public values are read; never serialize process.env into the browser.
export function getWebBranding(): WebBranding {
  const parsed = webBrandingSchema.safeParse({
    name: optional(process.env.NEXT_PUBLIC_BRAND_NAME) ?? 'Webhost Billing',
    logoPath: optional(process.env.NEXT_PUBLIC_BRAND_LOGO_PATH),
    logoWidth: optional(process.env.NEXT_PUBLIC_BRAND_LOGO_WIDTH),
    logoHeight: optional(process.env.NEXT_PUBLIC_BRAND_LOGO_HEIGHT),
    tagline: optional(process.env.NEXT_PUBLIC_BRAND_TAGLINE),
    contactEmail: optional(process.env.NEXT_PUBLIC_BRAND_CONTACT_EMAIL),
    contactPhone: optional(process.env.NEXT_PUBLIC_BRAND_CONTACT_PHONE),
    contactAddress: optional(process.env.NEXT_PUBLIC_BRAND_CONTACT_ADDRESS),
    website: optional(process.env.NEXT_PUBLIC_BRAND_WEBSITE),
  });
  if (!parsed.success)
    throw new Error('Invalid public web branding configuration.');
  return parsed.data;
}

export function getBrandTitle(
  scope?: 'Administrator' | 'Customer portal',
): Metadata['title'] {
  const name = getWebBranding().name;
  const suffix = scope ? `${scope} · ${name}` : name;
  return { default: suffix, template: `%s · ${suffix}` };
}

import type { NextConfig } from 'next';
import {
  loadEnvironmentFiles,
  parseWebEnvironment,
} from '@webhost-billing/config';
import { resolve } from 'node:path';
import { getWebBranding } from './src/lib/web-branding';
import { validateBrandLogo } from './src/lib/validate-brand-logo';

loadEnvironmentFiles();
const environment = parseWebEnvironment(process.env);
const branding = getWebBranding();
validateBrandLogo(branding, resolve(process.cwd(), 'public'));
const isDevelopment = environment.NODE_ENV === 'development';
const isSecurePublicOrigin =
  new URL(environment.NEXT_PUBLIC_API_URL).protocol === 'https:';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  `connect-src 'self' ${environment.NEXT_PUBLIC_API_URL}${isDevelopment ? ' ws: wss:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDevelopment || !isSecurePublicOrigin
    ? []
    : ['upgrade-insecure-requests']),
].join('; ');

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: environment.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_BRAND_NAME: branding.name,
    NEXT_PUBLIC_BRAND_LOGO_PATH: branding.logoPath ?? '',
    NEXT_PUBLIC_BRAND_LOGO_WIDTH: String(branding.logoWidth),
    NEXT_PUBLIC_BRAND_LOGO_HEIGHT: String(branding.logoHeight),
    NEXT_PUBLIC_BRAND_TAGLINE: branding.tagline ?? '',
    NEXT_PUBLIC_BRAND_CONTACT_EMAIL: branding.contactEmail ?? '',
    NEXT_PUBLIC_BRAND_CONTACT_PHONE: branding.contactPhone ?? '',
    NEXT_PUBLIC_BRAND_CONTACT_ADDRESS: branding.contactAddress ?? '',
    NEXT_PUBLIC_BRAND_WEBSITE: branding.website ?? '',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          ...(environment.NODE_ENV === 'production' && isSecurePublicOrigin
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains; preload',
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;

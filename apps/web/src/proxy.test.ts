import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';
import { CHECKOUT_INTENT_HEADER } from './lib/checkout-intent';

describe('workspace route proxy', () => {
  const query =
    'productId=10000000-0000-4000-8000-000000000080&priceId=10000000-0000-4000-8000-000000000081';
  it('retains anonymous checkout IDs but discards arbitrary return and payment fields', () => {
    const response = proxy(
      new NextRequest(
        `https://billing.example.test/portal/checkout?${query}&next=https://evil.example&amount=1`,
      ),
    );
    expect(response.headers.get('location')).toBe(
      `https://billing.example.test/login?${query}`,
    );
  });
  it.each(['webhost_session', '__Host-webhost_session'])(
    'overwrites forged context for %s and forwards only checkout IDs to the server',
    (cookie) => {
      const response = proxy(
        new NextRequest(
          `https://billing.example.test/portal/checkout?${query}&returnTo=/admin`,
          {
            headers: {
              cookie: `${cookie}=expired-cookie`,
              [CHECKOUT_INTENT_HEADER]: 'https://evil.example',
            },
          },
        ),
      );
      expect(
        response.headers.get(`x-middleware-request-${CHECKOUT_INTENT_HEADER}`),
      ).toBe(query);
      expect(response.headers.get(CHECKOUT_INTENT_HEADER)).toBeNull();
      expect(response.headers.get('location')).toBeNull();
    },
  );
  it.each(['/portal', '/admin', `/portal/checkout?${query}&priceId=duplicate`])(
    'removes forged intent on non-checkout or invalid path %s',
    (path) => {
      const response = proxy(
        new NextRequest(`https://billing.example.test${path}`, {
          headers: {
            cookie: 'webhost_session=expired-cookie',
            [CHECKOUT_INTENT_HEADER]: query,
          },
        }),
      );
      expect(
        response.headers.get(`x-middleware-request-${CHECKOUT_INTENT_HEADER}`),
      ).toBeNull();
    },
  );
  it.each(['/portal', '/portal/invoices'])(
    'redirects anonymous access to %s before the route renders',
    (path) => {
      const response = proxy(
        new NextRequest(`http://billing.example.test${path}`),
      );

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://billing.example.test/login',
      );
    },
  );

  it('allows the anonymous administrator entry page to render its dedicated sign-in form', () => {
    const response = proxy(
      new NextRequest('https://billing.example.test/admin'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('returns anonymous administrator subpages to the administrator entry page', () => {
    const response = proxy(
      new NextRequest('https://billing.example.test/admin/customers'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://billing.example.test/admin',
    );
  });

  it.each(['webhost_session', '__Host-webhost_session'])(
    'allows the %s cookie through to authoritative session validation',
    (cookieName) => {
      const response = proxy(
        new NextRequest('https://billing.example.test/admin', {
          headers: { cookie: `${cookieName}=opaque-session-token` },
        }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
    },
  );
});

import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

describe('workspace route proxy', () => {
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

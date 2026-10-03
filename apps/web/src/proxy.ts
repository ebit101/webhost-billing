import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  CHECKOUT_INTENT_HEADER,
  checkoutEntryHref,
  checkoutIntentQuery,
  readCheckoutIntent,
} from './lib/checkout-intent';

export function proxy(request: NextRequest) {
  const intent =
    request.nextUrl.pathname === '/portal/checkout'
      ? readCheckoutIntent(request.nextUrl.searchParams)
      : undefined;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(CHECKOUT_INTENT_HEADER);
  if (intent) {
    requestHeaders.set(CHECKOUT_INTENT_HEADER, checkoutIntentQuery(intent));
  }
  const sessionCookie =
    request.cookies.get('__Host-webhost_session') ??
    request.cookies.get('webhost_session');

  if (!sessionCookie) {
    if (request.nextUrl.pathname === '/admin') {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    const destination = request.nextUrl.pathname.startsWith('/admin/')
      ? '/admin'
      : checkoutEntryHref('/login', intent);
    return NextResponse.redirect(new URL(destination, request.url));
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/admin/:path*', '/portal/:path*'],
};

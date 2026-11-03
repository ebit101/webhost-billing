import {
  apiSuccessResponseSchema,
  authenticatedIdentitySchema,
  customerDetailSchema,
  type AuthenticatedIdentity,
} from '@webhost-billing/shared';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  CHECKOUT_INTENT_HEADER,
  adminOrderEntryHref,
  checkoutEntryHref,
  readCheckoutIntent,
} from './checkout-intent';
import {
  DOMAIN_INTENT_HEADER,
  domainEntryHref,
  readDomainIntent,
} from './domain-intent';

const API_URL =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';
const authenticatedIdentityResponseSchema = apiSuccessResponseSchema(
  authenticatedIdentitySchema,
);

export type WorkspaceRole = AuthenticatedIdentity['role'];

async function sessionCookieHeader(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const sessionCookie =
    cookieStore.get('__Host-webhost_session') ??
    cookieStore.get('webhost_session');

  const supportCookie =
    cookieStore.get('__Host-webhost_support_session') ??
    cookieStore.get('webhost_support_session');
  if (!sessionCookie && supportCookie) redirect('/support-session');
  if (!sessionCookie) return undefined;
  return [sessionCookie, ...(supportCookie ? [supportCookie] : [])]
    .map(({ name, value }) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');
}

export async function getCustomerDisplayName(
  customerId: string,
): Promise<string> {
  const cookie = await sessionCookieHeader();
  if (!cookie) return 'Customer';
  try {
    const response = await fetch(
      `${API_URL}/customers/${encodeURIComponent(customerId)}`,
      { cache: 'no-store', headers: { cookie } },
    );
    if (response.ok) {
      const profile = apiSuccessResponseSchema(customerDetailSchema).safeParse(
        await readResponseBody(response),
      );
      if (profile.success) {
        return (
          `${profile.data.data.firstName} ${profile.data.data.lastName}`.trim() ||
          'Customer'
        );
      }
    }
  } catch {
    // Keep the portal usable when the optional display name cannot load.
  }
  return 'Customer';
}

export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
  const cookie = await sessionCookieHeader();
  if (!cookie) return null;

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/me`, {
      cache: 'no-store',
      headers: {
        cookie,
      },
    });
  } catch {
    throw new Error('The authentication service is currently unavailable.');
  }

  if (response.status === 401 || response.status === 403) {
    if (cookie.includes('webhost_support_session='))
      redirect('/support-session');
    return null;
  }

  if (!response.ok) {
    throw new Error('The authentication service could not verify the session.');
  }

  const parsedResponse = authenticatedIdentityResponseSchema.safeParse(
    await readResponseBody(response),
  );

  if (!parsedResponse.success) {
    throw new Error('The authentication service returned an invalid response.');
  }

  return parsedResponse.data.data;
}

export async function requireWorkspaceRole(
  requiredRole: WorkspaceRole,
): Promise<AuthenticatedIdentity> {
  const identity = await getAuthenticatedIdentity();

  if (!identity) {
    const context =
      requiredRole === 'CUSTOMER'
        ? (await headers()).get(CHECKOUT_INTENT_HEADER)
        : null;
    const intent =
      context && context.length <= 128
        ? readCheckoutIntent(new URLSearchParams(context))
        : undefined;
    const domainContext =
      requiredRole === 'CUSTOMER'
        ? (await headers()).get(DOMAIN_INTENT_HEADER)
        : null;
    const domainIntent =
      domainContext && domainContext.length <= 200
        ? readDomainIntent(new URLSearchParams(domainContext))
        : undefined;
    redirect(
      domainIntent
        ? domainEntryHref('/login', domainIntent)
        : checkoutEntryHref('/login', intent),
    );
  }

  if (identity.role !== requiredRole) {
    if (identity.role === 'ADMIN' && requiredRole === 'CUSTOMER') {
      const context = (await headers()).get(CHECKOUT_INTENT_HEADER);
      const intent =
        context && context.length <= 128
          ? readCheckoutIntent(new URLSearchParams(context))
          : undefined;
      if (intent) redirect(adminOrderEntryHref(intent));
    }
    redirect(identity.role === 'ADMIN' ? '/admin' : '/portal');
  }

  return identity;
}

async function readResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

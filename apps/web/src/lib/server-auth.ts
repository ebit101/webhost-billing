import {
  apiSuccessResponseSchema,
  authenticatedIdentitySchema,
  type AuthenticatedIdentity,
} from '@webhost-billing/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const authenticatedIdentityResponseSchema = apiSuccessResponseSchema(
  authenticatedIdentitySchema,
);

export type WorkspaceRole = AuthenticatedIdentity['role'];

export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
  const cookieStore = await cookies();
  const sessionCookie =
    cookieStore.get('__Host-webhost_session') ??
    cookieStore.get('webhost_session');

  if (!sessionCookie) {
    return null;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/me`, {
      cache: 'no-store',
      headers: {
        cookie: `${sessionCookie.name}=${encodeURIComponent(sessionCookie.value)}`,
      },
    });
  } catch {
    throw new Error('The authentication service is currently unavailable.');
  }

  if (response.status === 401 || response.status === 403) {
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
    redirect('/login');
  }

  if (identity.role !== requiredRole) {
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

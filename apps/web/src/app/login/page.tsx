import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedIdentity } from '../../lib/server-auth';
import { readDomainIntent } from '../../lib/domain-intent';
import { AuthShell } from '../../components/auth/auth-shell';
import { LoginForm } from '../../components/auth/login-form';
import {
  readCheckoutIntent,
  type SelectionQuery,
} from '../../lib/checkout-intent';

export const metadata: Metadata = { title: 'Customer sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SelectionQuery>;
}) {
  const identity = await getAuthenticatedIdentity();
  if (identity) redirect(identity.role === 'ADMIN' ? '/admin' : '/portal');

  const intent = readCheckoutIntent(await searchParams);
  return (
    <AuthShell
      title="Customer sign in"
      description="Manage your hosting services, invoices, payments, and support."
    >
      <LoginForm
        audience="customer"
        checkoutIntent={intent}
        domainIntent={readDomainIntent(await searchParams)}
      />
    </AuthShell>
  );
}

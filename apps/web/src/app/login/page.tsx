import type { Metadata } from 'next';
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
  const intent = readCheckoutIntent(await searchParams);
  return (
    <AuthShell
      title="Customer sign in"
      description="Manage your hosting services, invoices, payments, and support."
    >
      <LoginForm audience="customer" checkoutIntent={intent} />
    </AuthShell>
  );
}

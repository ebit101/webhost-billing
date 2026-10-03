import type { Metadata } from 'next';
import { AuthShell } from '../../components/auth/auth-shell';
import { RegisterForm } from '../../components/auth/register-form';
import {
  readCheckoutIntent,
  type SelectionQuery,
} from '../../lib/checkout-intent';

export const metadata: Metadata = { title: 'Create an account' };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<SelectionQuery>;
}) {
  const intent = readCheckoutIntent(await searchParams);
  return (
    <AuthShell
      title="Create your account"
      description="Register a customer identity for hosting orders, invoices, and support."
    >
      <RegisterForm checkoutIntent={intent} />
    </AuthShell>
  );
}

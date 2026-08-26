import type { Metadata } from 'next';
import { AuthShell } from '../../components/auth/auth-shell';
import { LoginForm } from '../../components/auth/login-form';

export const metadata: Metadata = { title: 'Customer sign in' };

export default function LoginPage() {
  return (
    <AuthShell
      title="Customer sign in"
      description="Manage your hosting services, invoices, payments, and support."
    >
      <LoginForm audience="customer" />
    </AuthShell>
  );
}

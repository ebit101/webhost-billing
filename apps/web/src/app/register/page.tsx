import type { Metadata } from 'next';
import { AuthShell } from '../../components/auth/auth-shell';
import { RegisterForm } from '../../components/auth/register-form';

export const metadata: Metadata = { title: 'Create an account' };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create your account"
      description="Register a customer identity for hosting orders, invoices, and support."
    >
      <RegisterForm />
    </AuthShell>
  );
}

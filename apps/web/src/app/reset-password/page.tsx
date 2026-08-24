import type { Metadata } from 'next';
import { AuthShell } from '../../components/auth/auth-shell';
import { ResetPasswordForm } from '../../components/auth/reset-password-form';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const parameters = await searchParams;
  const token =
    typeof parameters.token === 'string' ? parameters.token : undefined;

  return (
    <AuthShell
      title="Choose a new password"
      description="Reset links are single-use and expire automatically."
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}

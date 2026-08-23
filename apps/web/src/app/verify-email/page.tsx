import { AuthShell } from '../../components/auth/auth-shell';
import { VerifyEmailPanel } from '../../components/auth/verify-email-panel';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const parameters = await searchParams;
  const token =
    typeof parameters.token === 'string' ? parameters.token : undefined;

  return (
    <AuthShell
      title="Verify your email"
      description="Confirm your customer identity before signing in."
    >
      <VerifyEmailPanel token={token} />
    </AuthShell>
  );
}

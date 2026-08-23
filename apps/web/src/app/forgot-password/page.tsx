import { AuthShell } from '../../components/auth/auth-shell';
import { ForgotPasswordForm } from '../../components/auth/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="Request a single-use password-reset link. The response is identical whether an account exists or not."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}

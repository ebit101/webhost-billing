import { AuthShell } from '../../components/auth/auth-shell';
import { LoginForm } from '../../components/auth/login-form';

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to your customer or administrator account."
    >
      <LoginForm />
    </AuthShell>
  );
}

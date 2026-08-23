import { AccountPanel } from '../../components/auth/account-panel';
import { AuthShell } from '../../components/auth/auth-shell';

export default function AccountPage() {
  return (
    <AuthShell
      title="Authenticated account"
      description="Your session is stored in a secure HttpOnly cookie and can be revoked at any time."
    >
      <AccountPanel />
    </AuthShell>
  );
}

import type { Metadata } from 'next';
import { AccountPanel } from '../../components/auth/account-panel';

export const metadata: Metadata = { title: 'Account security' };

export default function AccountPage() {
  return (
    <main
      id="main-content"
      className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 sm:py-8"
    >
      <div className="mx-auto max-w-4xl">
        <header className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight">
            Account settings
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Your profile, sign-in security and sessions.
          </p>
        </header>
        <AccountPanel />
      </div>
    </main>
  );
}

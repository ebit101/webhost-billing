'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { FormNotice } from './form-controls';
import { AdminTwoFactorPanel } from './admin-two-factor-panel';

interface Identity {
  userId: string;
  email: string;
  role: 'ADMIN' | 'CUSTOMER';
}

export function AccountPanel() {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void authenticatedGet<Identity>('/auth/me')
      .then((result) => {
        if (active) setIdentity(result);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Authentication is required.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function logout(all: boolean) {
    setBusy(true);
    setError(undefined);
    try {
      await authMutation(all ? '/auth/logout-all' : '/auth/logout', 'POST');
      router.push('/login');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-out failed.');
      setBusy(false);
    }
  }

  if (!identity) {
    return (
      <div className="grid gap-5">
        <FormNotice error={error} />
        {!error ? (
          <p className="text-sm text-slate-600">Loading your session…</p>
        ) : null}
        {error ? (
          <Link
            href="/login"
            className="font-medium text-cyan-700 hover:underline"
          >
            Sign in
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <FormNotice error={error} />
      <dl className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm">
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {identity.email}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Role</dt>
          <dd className="mt-1 font-semibold text-slate-950">{identity.role}</dd>
        </div>
      </dl>
      {identity.role === 'ADMIN' ? <AdminTwoFactorPanel /> : null}
      <Link
        href={identity.role === 'ADMIN' ? '/admin' : '/portal'}
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        Open {identity.role === 'ADMIN' ? 'administrator' : 'customer'}{' '}
        workspace
      </Link>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void logout(false)}
          className="h-11 rounded-xl border border-slate-300 bg-white px-5 font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-60"
        >
          Sign out
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void logout(true)}
          className="h-11 rounded-xl border border-red-200 bg-red-50 px-5 font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600 disabled:opacity-60"
        >
          Revoke all sessions
        </button>
      </div>
    </div>
  );
}

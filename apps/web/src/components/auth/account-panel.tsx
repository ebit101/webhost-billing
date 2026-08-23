'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { FormNotice } from './form-controls';

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
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void logout(false)}
          className="h-11 rounded-xl bg-slate-950 px-5 font-semibold text-white disabled:opacity-60"
        >
          Sign out
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void logout(true)}
          className="h-11 rounded-xl border border-slate-300 px-5 font-semibold text-slate-800 disabled:opacity-60"
        >
          Revoke all sessions
        </button>
      </div>
    </div>
  );
}

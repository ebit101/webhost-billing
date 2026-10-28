'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { FormNotice } from './form-controls';
import { AdminTwoFactorPanel } from './admin-two-factor-panel';
import {
  staffRoleLabels,
  type AuthenticatedIdentity,
} from '@webhost-billing/shared';
import { accountDisplayName } from '../../lib/account-display';
import { Brand } from '../layout/brand';

export function AccountPanel() {
  const router = useRouter();
  const [identity, setIdentity] = useState<AuthenticatedIdentity>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void authenticatedGet<AuthenticatedIdentity>('/auth/me')
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
    <div className="grid gap-4">
      <FormNotice error={error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Brand href={identity.role === 'ADMIN' ? '/admin' : '/portal'} />
        <Link
          href={identity.role === 'ADMIN' ? '/admin' : '/portal'}
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          Back to workspace
        </Link>
      </div>
      <dl className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-3">
        {identity.role === 'ADMIN' ? (
          <div className="min-w-0">
            <dt className="text-slate-500">Name</dt>
            <dd className="mt-1 break-words font-semibold">
              {accountDisplayName(identity)}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd className="mt-1 break-all font-semibold text-slate-950">
            {identity.email}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Role</dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {identity.role === 'ADMIN'
              ? staffRoleLabels[identity.staffRole]
              : 'Customer'}
          </dd>
        </div>
      </dl>
      {identity.role === 'ADMIN' ? <AdminTwoFactorPanel /> : null}
      <section
        aria-label="Sessions"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <h2 className="font-bold">Sessions</h2>
        <div className="flex flex-wrap gap-2">
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
      </section>
    </div>
  );
}

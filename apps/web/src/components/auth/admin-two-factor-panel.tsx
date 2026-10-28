'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  TwoFactorRecoveryCodesResponse,
  TwoFactorSetupResponse,
  TwoFactorStatus,
} from '@webhost-billing/shared';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { Field, FormNotice, SubmitButton } from './form-controls';

export function AdminTwoFactorPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<TwoFactorStatus>();
  const [setup, setSetup] = useState<TwoFactorSetupResponse>();
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setStatus(await authenticatedGet<TwoFactorStatus>('/auth/two-factor'));
  }

  useEffect(() => {
    let active = true;
    void authenticatedGet<TwoFactorStatus>('/auth/two-factor')
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Could not load two-factor status.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    try {
      setSetup(
        await authMutation<TwoFactorSetupResponse>(
          '/auth/two-factor/setup',
          'POST',
          { password: String(form.get('password') ?? '') },
        ),
      );
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Setup could not start.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function enable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const result = await authMutation<TwoFactorRecoveryCodesResponse>(
        '/auth/two-factor/enable',
        'POST',
        { code: String(form.get('code') ?? '').trim() },
      );
      setRecoveryCodes(result.recoveryCodes);
      setSetup(undefined);
      setMessage(
        'Two-factor authentication is enabled. Save every recovery code now.',
      );
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The code was not accepted.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function protectedAction(
    event: FormEvent<HTMLFormElement>,
    path: string,
    method: 'POST' | 'DELETE',
  ) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const input = {
      password: String(form.get('password') ?? ''),
      code: String(form.get('code') ?? '').trim(),
    };
    try {
      if (method === 'DELETE') {
        await authMutation(path, method, input);
        router.push('/login');
        router.refresh();
        return;
      }
      const result = await authMutation<TwoFactorRecoveryCodesResponse>(
        path,
        method,
        input,
      );
      setRecoveryCodes(result.recoveryCodes);
      setMessage('Old recovery codes were revoked. Save the new codes now.');
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The request failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="font-bold text-slate-950">Two-factor authentication</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Protect administrator sign-in with a TOTP authenticator and single-use
          recovery codes.
        </p>
      </div>
      <FormNotice error={error} message={message} />
      {!status ? (
        <p className="text-sm text-slate-600">Loading security status…</p>
      ) : null}
      {status && !status.enabled && !setup ? (
        <form onSubmit={begin} className="grid gap-4">
          <Field
            label="Current password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <SubmitButton busy={busy}>Start secure setup</SubmitButton>
        </form>
      ) : null}
      {setup ? (
        <form onSubmit={enable} className="grid gap-4">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950">
            <p className="font-semibold">
              Add this secret to your authenticator app:
            </p>
            <code className="mt-2 block break-all font-mono text-base">
              {setup.secret}
            </code>
          </div>
          <Field
            label="Six-digit authenticator code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
          <SubmitButton busy={busy}>Verify and enable</SubmitButton>
        </form>
      ) : null}
      {recoveryCodes ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-950">
            Store these recovery codes offline. They will not be shown again.
          </p>
          <ul className="mt-3 grid gap-1 font-mono text-sm text-amber-950 sm:grid-cols-2">
            {recoveryCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {status?.enabled ? (
        <>
          <p className="text-sm font-semibold text-emerald-700">
            Enabled · {status.recoveryCodesRemaining} recovery codes remain
          </p>
          <details className="rounded-xl border border-slate-200">
            <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
              Replace recovery codes
            </summary>
            <form
              onSubmit={(event) =>
                void protectedAction(
                  event,
                  '/auth/two-factor/recovery-codes',
                  'POST',
                )
              }
              className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2"
            >
              <Field
                label="Current password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
              <Field
                label="Authenticator or recovery code"
                name="code"
                autoComplete="one-time-code"
                required
              />
              <div className="sm:col-span-2">
                <SubmitButton busy={busy}>
                  Generate new recovery codes
                </SubmitButton>
              </div>
            </form>
          </details>
          <details className="rounded-xl border border-red-200">
            <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-red-800 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600">
              Disable two-factor authentication
            </summary>
            <form
              onSubmit={(event) =>
                void protectedAction(event, '/auth/two-factor', 'DELETE')
              }
              className="grid gap-3 border-t border-red-200 bg-red-50 p-4 sm:grid-cols-2"
            >
              <Field
                label="Current password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
              <Field
                label="Authenticator or recovery code"
                name="code"
                autoComplete="one-time-code"
                required
              />
              <div className="sm:col-span-2">
                <SubmitButton busy={busy}>Disable and sign out</SubmitButton>
              </div>
            </form>
          </details>
        </>
      ) : null}
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type {
  AuthenticatedSessionResponse,
  TwoFactorRequiredResponse,
} from '@webhost-billing/shared';
import { authMutation } from '../../lib/auth-api';
import { domainEntryHref, type DomainIntent } from '../../lib/domain-intent';
import {
  adminOrderEntryHref,
  checkoutEntryHref,
  customerLandingHref,
  type CheckoutIntent,
} from '../../lib/checkout-intent';
import { AuthForm, Field, FormNotice, SubmitButton } from './form-controls';

export function LoginForm({
  audience = 'customer',
  checkoutIntent,
  domainIntent,
  onChooseRegister,
}: {
  audience?: 'admin' | 'customer';
  checkoutIntent?: CheckoutIntent;
  domainIntent?: DomainIntent;
  onChooseRegister?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [challenge, setChallenge] = useState<TwoFactorRequiredResponse>();
  const [rememberDevice, setRememberDevice] = useState(false);

  const rememberDeviceOption = (
    <div className="grid gap-2">
      <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          name="rememberDevice"
          checked={rememberDevice}
          disabled={busy}
          onChange={(event) => setRememberDevice(event.target.checked)}
          aria-describedby="remember-device-help"
          className="h-4 w-4 rounded border-slate-300 accent-cyan-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700"
        />
        Remember this device
      </label>
      <p id="remember-device-help" className="text-xs leading-5 text-slate-500">
        Stay signed in for up to 30 days on this browser. Sign out to end
        access. New sign-ins still require two-factor authentication when
        enabled.
      </p>
    </div>
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);

    try {
      const result = await authMutation<
        AuthenticatedSessionResponse | TwoFactorRequiredResponse
      >('/auth/login', 'POST', {
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        ...(audience === 'admin' ? { rememberDevice } : {}),
      });
      if ('requiresTwoFactor' in result) {
        setChallenge(result);
        setBusy(false);
        return;
      }
      router.push(
        result.identity.role === 'ADMIN'
          ? checkoutIntent
            ? adminOrderEntryHref(checkoutIntent)
            : '/admin'
          : domainIntent
            ? domainEntryHref('/portal/domains', domainIntent)
            : customerLandingHref(checkoutIntent),
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed.');
      setBusy(false);
    }
  }

  async function submitTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const result = await authMutation<AuthenticatedSessionResponse>(
        '/auth/login/two-factor',
        'POST',
        {
          challengeToken: challenge.challengeToken,
          code: String(form.get('code') ?? '').trim(),
          rememberDevice,
        },
      );
      router.push(
        result.identity.role === 'ADMIN'
          ? checkoutIntent
            ? adminOrderEntryHref(checkoutIntent)
            : '/admin'
          : domainIntent
            ? domainEntryHref('/portal/domains', domainIntent)
            : customerLandingHref(checkoutIntent),
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Verification failed.',
      );
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <AuthForm key="two-factor" onSubmit={submitTwoFactor}>
        <FormNotice error={error} />
        <p className="text-sm leading-6 text-slate-600">
          Enter the code from your authenticator app, or one unused recovery
          code.
        </p>
        <Field
          label="Authentication code"
          name="code"
          autoComplete="one-time-code"
          placeholder="123456"
          required
        />
        {rememberDeviceOption}
        <SubmitButton busy={busy}>Verify and sign in</SubmitButton>
        <button
          type="button"
          className="text-sm font-medium text-cyan-700 hover:underline"
          onClick={() => {
            setChallenge(undefined);
            setError(undefined);
            setRememberDevice(false);
          }}
        >
          Use a different account
        </button>
      </AuthForm>
    );
  }

  return (
    <AuthForm key="password" onSubmit={submit}>
      <FormNotice error={error} />
      {checkoutIntent ? (
        <p className="text-sm text-slate-600">
          Sign in to continue with your selected hosting plan. Availability and
          pricing will be checked again; no order is placed by signing in.
        </p>
      ) : null}
      <Field
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {audience === 'admin' ? rememberDeviceOption : null}
      <SubmitButton busy={busy}>Sign in</SubmitButton>
      <div className="flex flex-wrap justify-between gap-3 text-sm">
        <Link
          href="/forgot-password"
          className="font-medium text-cyan-700 hover:underline"
        >
          Forgot password?
        </Link>
        {audience === 'customer' && onChooseRegister ? (
          <button
            type="button"
            onClick={onChooseRegister}
            className="font-medium text-cyan-700 hover:underline"
          >
            Create an account
          </button>
        ) : audience === 'customer' ? (
          <Link
            href={checkoutEntryHref('/register', checkoutIntent)}
            className="font-medium text-cyan-700 hover:underline"
          >
            Create an account
          </Link>
        ) : (
          <Link
            href="/login"
            className="font-medium text-cyan-700 hover:underline"
          >
            Customer sign in
          </Link>
        )}
      </div>
    </AuthForm>
  );
}

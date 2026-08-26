'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type {
  AuthenticatedSessionResponse,
  TwoFactorRequiredResponse,
} from '@webhost-billing/shared';
import { authMutation } from '../../lib/auth-api';
import { Field, FormNotice, SubmitButton } from './form-controls';

export function LoginForm({
  audience = 'customer',
}: {
  audience?: 'admin' | 'customer';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [challenge, setChallenge] = useState<TwoFactorRequiredResponse>();

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
      });
      if ('requiresTwoFactor' in result) {
        setChallenge(result);
        setBusy(false);
        return;
      }
      router.push(result.identity.role === 'ADMIN' ? '/admin' : '/portal');
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
        },
      );
      router.push(result.identity.role === 'ADMIN' ? '/admin' : '/portal');
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
      <form onSubmit={submitTwoFactor} className="grid gap-5">
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
        <SubmitButton busy={busy}>Verify and sign in</SubmitButton>
        <button
          type="button"
          className="text-sm font-medium text-cyan-700 hover:underline"
          onClick={() => {
            setChallenge(undefined);
            setError(undefined);
          }}
        >
          Use a different account
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <FormNotice error={error} />
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
      <SubmitButton busy={busy}>Sign in</SubmitButton>
      <div className="flex flex-wrap justify-between gap-3 text-sm">
        <Link
          href="/forgot-password"
          className="font-medium text-cyan-700 hover:underline"
        >
          Forgot password?
        </Link>
        {audience === 'customer' ? (
          <Link
            href="/register"
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
    </form>
  );
}

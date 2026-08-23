'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authMutation } from '../../lib/auth-api';
import { Field, FormNotice, SubmitButton } from './form-controls';

export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);

    try {
      await authMutation('/auth/login', 'POST', {
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      });
      router.push('/account');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed.');
      setBusy(false);
    }
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
        <Link
          href="/register"
          className="font-medium text-cyan-700 hover:underline"
        >
          Create an account
        </Link>
      </div>
    </form>
  );
}

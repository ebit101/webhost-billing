'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { authMutation } from '../../lib/auth-api';
import { Field, FormNotice, SubmitButton } from './form-controls';

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);

    try {
      const result = await authMutation<{ message: string }>(
        '/auth/password-reset/request',
        'POST',
        { email: String(form.get('email') ?? '') },
      );
      setMessage(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <FormNotice error={error} message={message} />
      <Field
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <SubmitButton busy={busy}>Request reset instructions</SubmitButton>
      <Link
        href="/login"
        className="text-center text-sm font-medium text-cyan-700 hover:underline"
      >
        Return to sign in
      </Link>
    </form>
  );
}

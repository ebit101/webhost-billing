'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { authMutation } from '../../lib/auth-api';
import { Field, FormNotice, SubmitButton } from './form-controls';

export function ResetPasswordForm({ token }: { token?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);

    try {
      const result = await authMutation<{ message: string }>(
        '/auth/password-reset/confirm',
        'POST',
        {
          token,
          password: String(form.get('password') ?? ''),
        },
      );
      setMessage(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reset failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="grid gap-5">
        <FormNotice error="This reset link is incomplete." />
        <Link
          href="/forgot-password"
          className="font-medium text-cyan-700 hover:underline"
        >
          Request another reset link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <FormNotice error={error} message={message} />
      <Field
        label="New password (at least 12 characters)"
        name="password"
        type="password"
        minLength={12}
        maxLength={128}
        autoComplete="new-password"
        required
      />
      <SubmitButton busy={busy}>Change password</SubmitButton>
      {message ? (
        <Link
          href="/login"
          className="text-center font-medium text-cyan-700 hover:underline"
        >
          Sign in with the new password
        </Link>
      ) : null}
    </form>
  );
}

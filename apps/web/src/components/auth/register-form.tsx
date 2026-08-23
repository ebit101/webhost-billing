'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { authMutation } from '../../lib/auth-api';
import { Field, FormNotice, SubmitButton } from './form-controls';

export function RegisterForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);

    try {
      const result = await authMutation<{ message: string }>(
        '/auth/register',
        'POST',
        Object.fromEntries(form.entries()),
      );
      setMessage(result.message);
      event.currentTarget.reset();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Registration failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <FormNotice error={error} message={message} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="First name"
          name="firstName"
          autoComplete="given-name"
          required
        />
        <Field
          label="Last name"
          name="lastName"
          autoComplete="family-name"
          required
        />
      </div>
      <Field
        label="Company (optional)"
        name="companyName"
        autoComplete="organization"
      />
      <Field
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <Field
        label="Password (at least 12 characters)"
        name="password"
        type="password"
        minLength={12}
        maxLength={128}
        autoComplete="new-password"
        required
      />
      <Field
        label="Address"
        name="addressLine1"
        autoComplete="address-line1"
        required
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="City"
          name="city"
          autoComplete="address-level2"
          required
        />
        <Field
          label="Country code"
          name="countryCode"
          autoComplete="country"
          minLength={2}
          maxLength={2}
          placeholder="BD"
          required
        />
      </div>
      <SubmitButton busy={busy}>Create customer account</SubmitButton>
      <p className="text-center text-sm text-slate-600">
        Already registered?{' '}
        <Link
          href="/login"
          className="font-medium text-cyan-700 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

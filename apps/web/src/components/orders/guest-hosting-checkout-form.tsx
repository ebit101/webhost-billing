'use client';

import type { OrderCreationResult } from '@webhost-billing/shared';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { authMutation } from '../../lib/auth-api';
import { clearOrderDraft } from '../../lib/order-draft';
import {
  AuthForm,
  Field,
  FormNotice,
  SubmitButton,
} from '../auth/form-controls';
import { formatMinor } from './order-ui';

export function GuestHostingCheckoutForm({
  productId,
  priceId,
  requestedDomain,
  onChooseSignIn,
}: {
  productId: string;
  priceId: string;
  requestedDomain: string;
  onChooseSignIn: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<OrderCreationResult>();
  const submissionKey = useRef('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password !== form.get('confirmPassword')) {
      setError('Passwords do not match.');
      return;
    }
    if (!submissionKey.current) submissionKey.current = crypto.randomUUID();
    setBusy(true);
    setError(undefined);
    try {
      const registration = Object.fromEntries(
        Array.from(form.entries()).filter(
          ([name, value]) => name !== 'confirmPassword' && value !== '',
        ),
      );
      const created = await authMutation<OrderCreationResult>(
        '/orders/guest-checkout',
        'POST',
        {
          ...registration,
          productId,
          priceId,
          requestedDomain,
          submissionKey: submissionKey.current,
          domainChoice: 'EXISTING',
        },
      );
      clearOrderDraft();
      setResult(created);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Checkout could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div
        role="status"
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"
      >
        <h3 className="text-lg font-bold text-emerald-950">Order received</h3>
        <p className="mt-2 text-sm text-emerald-950">
          Order {result.order.orderNumber} and unpaid invoice{' '}
          {result.order.invoice.invoiceNumber} were created for{' '}
          {formatMinor(
            result.order.invoice.balanceDue.amount,
            result.order.invoice.balanceDue.currency,
          )}
          .
        </p>
        <p className="mt-3 text-sm text-emerald-950">
          Check your email to verify your new account, then sign in to see the
          order and invoice in your portal. Hosting activates only after payment
          is verified and provisioning succeeds.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block font-semibold text-brand-700 underline"
        >
          Sign in after verification
        </Link>
      </div>
    );
  }

  return (
    <AuthForm onSubmit={submit}>
      <FormNotice error={error} />
      <h3 className="text-base font-bold text-slate-950">
        Personal information
      </h3>
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
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <Field
          label="Phone (optional)"
          name="phone"
          type="tel"
          autoComplete="tel"
        />
      </div>
      <h3 className="border-t border-slate-200 pt-5 text-base font-bold text-slate-950">
        Billing address
      </h3>
      <Field
        label="Company (optional)"
        name="companyName"
        autoComplete="organization"
      />
      <Field
        label="Street address"
        name="addressLine1"
        autoComplete="address-line1"
        required
      />
      <Field
        label="Address line 2 (optional)"
        name="addressLine2"
        autoComplete="address-line2"
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="City"
          name="city"
          autoComplete="address-level2"
          required
        />
        <Field
          label="Region (optional)"
          name="region"
          autoComplete="address-level1"
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Postal code (optional)"
          name="postalCode"
          autoComplete="postal-code"
        />
        <Field
          label="Country code"
          name="countryCode"
          autoComplete="country"
          defaultValue="BD"
          minLength={2}
          maxLength={2}
          required
        />
      </div>
      <h3 className="border-t border-slate-200 pt-5 text-base font-bold text-slate-950">
        Account security
      </h3>
      <div className="grid gap-5 sm:grid-cols-2">
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
          label="Confirm password"
          name="confirmPassword"
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </div>
      <SubmitButton busy={busy}>Place order and create account</SubmitButton>
      <p className="text-xs leading-5 text-slate-600">
        This creates an unpaid invoice. No payment is collected now. Verify your
        email before signing in and paying.
      </p>
      <p className="text-center text-sm text-slate-600">
        Already registered?{' '}
        <button
          type="button"
          onClick={onChooseSignIn}
          className="font-medium text-cyan-700 underline"
        >
          Sign in
        </button>
      </p>
    </AuthForm>
  );
}

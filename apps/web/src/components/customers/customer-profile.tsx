'use client';

import type {
  AuthenticatedIdentity,
  CustomerDetail,
} from '@webhost-billing/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { authMutation, authenticatedGet } from '../../lib/auth-api';
import { Button } from '../ui/button';
import { ErrorState, LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import {
  Card,
  Field,
  ProfileFields,
  nullableProfileValues,
  valuesFromForm,
} from './customer-fields';

export function CustomerProfile() {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerDetail>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError('');
    try {
      const identity =
        await authenticatedGet<AuthenticatedIdentity>('/auth/me');
      if (identity.role !== 'CUSTOMER')
        throw new Error('Customer profile is unavailable.');
      setCustomer(
        await authenticatedGet<CustomerDetail>(
          `/customers/${identity.customerId}`,
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Profile could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    void authenticatedGet<AuthenticatedIdentity>('/auth/me')
      .then((identity) => {
        if (identity.role !== 'CUSTOMER')
          throw new Error('Customer profile is unavailable.');
        return authenticatedGet<CustomerDetail>(
          `/customers/${identity.customerId}`,
        );
      })
      .then((result) => {
        if (active) setCustomer(result);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : 'Profile could not be loaded.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      setCustomer(
        await authMutation<CustomerDetail>(
          `/customers/${customer.id}/profile`,
          'PATCH',
          nullableProfileValues(event.currentTarget),
        ),
      );
      setNotice('Profile saved.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Profile could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await authMutation<{ message: string }>(
        `/customers/${customer.id}/change-password`,
        'POST',
        valuesFromForm(event.currentTarget),
      );
      router.replace('/login?passwordChanged=1');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Password could not be changed.',
      );
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading profile" />;
  if (!customer)
    return (
      <ErrorState
        description={error || 'Profile is unavailable.'}
        action={<Button onClick={() => void load()}>Try again</Button>}
      />
    );
  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Customer portal"
        title="Profile & security"
        description="Keep your contact and billing address current, and manage your account password."
      />
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone="success">{customer.customerNumber}</StatusBadge>
        <StatusBadge tone={customer.emailVerified ? 'success' : 'warning'}>
          {customer.emailVerified
            ? 'Email verified'
            : 'Email verification pending'}
        </StatusBadge>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"
        >
          {notice}
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card title="Contact and billing address">
          <form
            key={customer.updatedAt}
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={saveProfile}
          >
            <ProfileFields customer={customer} />
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </form>
        </Card>
        <Card
          title="Change password"
          description="Changing your password signs out every active session, including this one."
        >
          <form className="grid gap-4" onSubmit={changePassword}>
            <Field
              label="Current password"
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
            />
            <Field
              label="New password"
              name="newPassword"
              type="password"
              required
              autoComplete="new-password"
            />
            <p className="text-xs leading-5 text-slate-500">
              Use at least 12 characters. Your new password must differ from the
              current one.
            </p>
            <Button type="submit" disabled={saving}>
              {saving ? 'Changing…' : 'Change password'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

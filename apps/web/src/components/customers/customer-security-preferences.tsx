'use client';

import type { CustomerSecurityPreferenceUpdate } from '@webhost-billing/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { Button } from '../ui/button';
import { Card, Field } from './customer-fields';

type Preferences = { emailTwoStep: boolean; marketingConsent: boolean };
const preferencesPath = '/auth/customer-security-preferences';

export function CustomerSecurityPreferences() {
  const [preferences, setPreferences] = useState<Preferences>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    void authenticatedGet<Preferences>(preferencesPath)
      .then((result) => {
        if (active) setPreferences(result);
      })
      .catch(() => {
        if (active)
          setError('Could not load account preferences. Reload to try again.');
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(
    event: FormEvent<HTMLFormElement>,
    kind: 'email' | 'marketing',
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const update: CustomerSecurityPreferenceUpdate =
      kind === 'email'
        ? {
            emailTwoStep: data.has('emailTwoStep'),
            password: String(data.get('password') ?? ''),
          }
        : { marketingConsent: data.has('marketingConsent') };
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setPreferences(
        await authMutation<Preferences>(preferencesPath, 'PATCH', update),
      );
      if (kind === 'email') form.reset();
      setNotice(
        kind === 'email'
          ? 'Email verification preference saved.'
          : 'Marketing preference saved.',
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not save the preference.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}
      <Card
        title="Email two-step verification"
        description="Require a code sent to your verified email on new sign-ins. Changing this setting signs out your other sessions."
      >
        {preferences && (
          <form
            key={String(preferences.emailTwoStep)}
            className="grid gap-4"
            onSubmit={(event) => void save(event, 'email')}
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="emailTwoStep"
                defaultChecked={preferences.emailTwoStep}
                disabled={busy}
              />
              Require an email code when signing in
            </label>
            <Field
              label="Current password for verification settings"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
            <Button type="submit" disabled={busy}>
              Save verification setting
            </Button>
          </form>
        )}
      </Card>
      <Card
        title="Marketing consent"
        description="Choose whether to receive marketing emails. You can change your choice here at any time."
      >
        {preferences && (
          <form
            key={String(preferences.marketingConsent)}
            className="grid gap-4"
            onSubmit={(event) => void save(event, 'marketing')}
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="marketingConsent"
                defaultChecked={preferences.marketingConsent}
                disabled={busy}
              />
              I agree to receive marketing emails
            </label>
            <Button type="submit" disabled={busy}>
              Save marketing preference
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}

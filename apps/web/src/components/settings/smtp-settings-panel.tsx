'use client';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  saveSmtpSettingsSchema,
  smtpSettingsStatusSchema,
  type SmtpSettingsStatus,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { Button } from '../ui/button';
import { ConfirmationDialog } from '../ui/confirmation-dialog';

export function SmtpSettingsPanel() {
  const [status, setStatus] = useState<SmtpSettingsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [review, setReview] = useState(false);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    let active = true;
    void authenticatedGet('/settings/smtp')
      .then((value) => {
        if (active) setStatus(smtpSettingsStatusSchema.parse(value));
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if (
          caught instanceof Error &&
          caught.message ===
            'Protected SMTP configuration is unavailable. Save it again.'
        ) {
          // This fixed response comes only after the API's full-admin MFA check.
          // A fresh replacement can repair unreadable credentials; never enable/fall back silently.
          setRecovery(true);
          setStatus({
            configured: false,
            enabled: false,
            host: null,
            connection: null,
            maskedUsername: null,
            passwordConfigured: false,
            updatedAt: null,
            revision: null,
          });
          setError(
            'Stored SMTP configuration is unreadable. Custom delivery is blocked until you save a replacement.',
          );
        } else {
          setError(
            'SMTP settings could not be loaded. A full administrator with two-factor authentication is required.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const security = data.get('security');
    const parsed = saveSmtpSettingsSchema.safeParse({
      host: data.get('host'),
      connection: { security, port: security === 'TLS' ? 465 : 587 },
      username: data.get('username'),
      password: data.get('password'),
      confirmation: 'SAVE_SMTP',
    });
    setNotice('');
    setError('');
    if (!parsed.success) {
      setError(
        'Enter a public SMTP hostname, username and password, with an encrypted connection.',
      );
      return;
    }
    // Credentials stay only in the request; clear visible secrets before awaiting the response.
    form.reset();
    setBusy(true);
    try {
      setStatus(
        smtpSettingsStatusSchema.parse(
          await authMutation('/settings/smtp', 'PUT', parsed.data),
        ),
      );
      setNotice(
        'SMTP configuration saved and encrypted. It is inactive until you activate it.',
      );
      setRecovery(false);
    } catch {
      setError(
        'SMTP configuration could not be saved. Reload its status before trying again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function activate() {
    if (!status?.revision) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const value = await authMutation('/settings/smtp/activation', 'POST', {
        enabled: !status.enabled,
        confirmation: status.enabled ? 'USE_DEPLOYMENT_EMAIL' : 'ENABLE_SMTP',
        revision: status.revision,
      });
      setStatus(smtpSettingsStatusSchema.parse(value));
      setNotice(
        status.enabled
          ? 'The deployment email transport is now in use.'
          : 'Custom SMTP is now active for queued and future email attempts. Inbox delivery is not yet verified.',
      );
    } catch {
      setError(
        'SMTP activation could not be confirmed. Reload and review the current configuration.',
      );
    } finally {
      setBusy(false);
      setReview(false);
    }
  }
  return (
    <section
      aria-labelledby="smtp-settings-title"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 id="smtp-settings-title" className="text-lg font-bold text-slate-950">
        SMTP email delivery
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Configure a public SMTP provider. Passwords are encrypted and never
        returned. Sender name, from address and reply-to are managed in email
        branding above.
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Saving or replacing credentials keeps custom SMTP inactive and uses the
        existing deployment transport. No test message is sent by saving.
        Activation affects queued and future attempts; previously sent messages
        are not resent.
      </p>
      {loading && <p className="mt-4">Loading SMTP settings…</p>}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {!loading && !status && (
        <Link
          className="mt-4 inline-block text-sm font-semibold text-cyan-700"
          href="/account"
        >
          Open account security to enroll two-factor authentication →
        </Link>
      )}
      {notice && (
        <p role="status" className="mt-4 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {!loading && status && (
        <>
          <p className="mt-4 text-sm font-semibold">
            {recovery
              ? 'Replace unreadable SMTP configuration'
              : status.enabled
                ? 'Custom SMTP active'
                : 'Deployment transport in use (may be a test mail catcher)'}
          </p>
          {status.configured && (
            <p className="mt-2 text-sm">
              Saved server: {status.host}:{status.connection?.port}. Username:{' '}
              {status.maskedUsername}. Password stored securely.
            </p>
          )}
          <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={save}>
            <Field label="SMTP hostname">
              <input
                className={fieldClass}
                name="host"
                required
                maxLength={253}
                defaultValue={status.host ?? ''}
                placeholder="smtp.provider.com"
                autoComplete="off"
              />
            </Field>
            <Field label="Connection security">
              <select
                className={fieldClass}
                name="security"
                defaultValue={status.connection?.security ?? 'STARTTLS'}
              >
                <option value="STARTTLS">Required STARTTLS — port 587</option>
                <option value="TLS">Implicit TLS — port 465</option>
              </select>
            </Field>
            <Field label="SMTP username">
              <input
                className={fieldClass}
                name="username"
                required
                maxLength={320}
                autoComplete="off"
              />
            </Field>
            <Field label="SMTP password">
              <input
                className={fieldClass}
                name="password"
                required
                maxLength={512}
                type="password"
                autoComplete="new-password"
              />
            </Field>
            <p className="text-sm text-slate-600 sm:col-span-2">
              Enter both credentials whenever saving. TLS certificate checks are
              always enabled. Only public IPv4 SMTP servers on ports 587 or 465
              are supported here.
            </p>
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? 'Working…' : 'Save SMTP configuration'}
              </Button>
              {status.configured && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setReview(true)}
                >
                  {status.enabled
                    ? 'Use deployment transport'
                    : 'Activate custom SMTP'}
                </Button>
              )}
            </div>
          </form>
          <ConfirmationDialog
            open={review}
            title={
              status.enabled
                ? 'Use deployment email transport?'
                : 'Activate custom SMTP?'
            }
            description={
              status.enabled
                ? 'Future attempts will use the deployment transport. It may deliver to a test mail catcher rather than real inboxes. In-flight attempts can finish with the current transport.'
                : `Queued and future emails will use ${status.host}:${status.connection?.port}. Confirm that the account and sender are approved for customer email. Saving alone did not verify authentication or inbox delivery. In-flight attempts keep their selected transport.`
            }
            confirmLabel={
              status.enabled
                ? 'Use deployment transport'
                : 'Confirm SMTP activation'
            }
            busy={busy}
            onConfirm={() => void activate()}
            onClose={() => setReview(false)}
          />
        </>
      )}
    </section>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
const fieldClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950';

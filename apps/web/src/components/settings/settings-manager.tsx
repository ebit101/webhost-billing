'use client';

import {
  DEFAULT_BUSINESS_SETTINGS,
  type BusinessSettings,
  type CredentialStatus,
  type SettingsOverview,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { Button } from '../ui/button';
import { LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';

const initialOverview: SettingsOverview = {
  ...DEFAULT_BUSINESS_SETTINGS,
  credentialStatuses: [
    emptyStatus('bkash', 'SETTINGS'),
    emptyStatus('sslcommerz', 'SETTINGS'),
    emptyStatus('cpanel-whm', 'HOSTING_SERVERS'),
  ],
};

export function SettingsManager() {
  const [overview, setOverview] = useState(initialOverview);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void authenticatedGet<SettingsOverview>('/settings')
      .then((settings) => {
        if (active) setOverview(settings);
      })
      .catch((caught: unknown) => {
        if (active) setError(message(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof BusinessSettings>(
    key: K,
    value: BusinessSettings[K],
  ) {
    setOverview((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings() {
    setSaving('settings');
    clearMessages();
    try {
      const { credentialStatuses, ...settings } = overview;
      void credentialStatuses;
      const saved = await authMutation<SettingsOverview>(
        '/settings',
        'PUT',
        settings,
      );
      setOverview(saved);
      setNotice('Business settings were saved and audited.');
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSaving('');
    }
  }

  async function replaceCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const provider = String(values.get('provider')) as 'bkash' | 'sslcommerz';
    setSaving(provider);
    clearMessages();
    try {
      const body =
        provider === 'bkash'
          ? {
              provider,
              confirmation: 'REPLACE_CREDENTIALS',
              credentials: {
                appKey: String(values.get('appKey')),
                appSecret: String(values.get('appSecret')),
                username: String(values.get('username')),
                password: String(values.get('password')),
              },
            }
          : {
              provider,
              confirmation: 'REPLACE_CREDENTIALS',
              credentials: {
                storeId: String(values.get('storeId')),
                storePassword: String(values.get('storePassword')),
              },
            };
      const status = await authMutation<CredentialStatus>(
        '/settings/credentials',
        'PUT',
        body,
      );
      setOverview((current) => ({
        ...current,
        credentialStatuses: current.credentialStatuses.map((entry) =>
          entry.provider === status.provider ? status : entry,
        ),
      }));
      form.reset();
      setNotice(
        `${provider === 'bkash' ? 'bKash' : 'SSLCOMMERZ'} credentials were encrypted and ${status.updatedAt ? 'replaced' : 'configured'}.`,
      );
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSaving('');
    }
  }

  function clearMessages() {
    setError('');
    setNotice('');
  }

  if (loading) return <LoadingState label="Loading protected settings…" />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Business settings and secrets"
        description="Control billing policy and active adapters. Credentials are encrypted at rest and are never returned to this page."
        actions={
          <Button disabled={saving !== ''} onClick={() => void saveSettings()}>
            {saving === 'settings' ? 'Saving…' : 'Save settings'}
          </Button>
        }
      />

      {error ? (
        <Alert role="alert" tone="error">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert role="status" tone="success">
          {notice}
        </Alert>
      ) : null}

      <SettingsCard
        title="Business and invoice identity"
        description="These values are snapshotted onto future invoices; existing issued invoices remain unchanged."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Business name">
            <input
              className={inputStyles}
              value={overview.businessIdentity.name}
              onChange={(event) =>
                update('businessIdentity', {
                  ...overview.businessIdentity,
                  name: event.target.value,
                })
              }
            />
          </Field>
          <Field label="Billing email">
            <input
              className={inputStyles}
              type="email"
              value={overview.businessIdentity.email ?? ''}
              onChange={(event) =>
                update('businessIdentity', {
                  ...overview.businessIdentity,
                  email: event.target.value || undefined,
                })
              }
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputStyles}
              value={overview.businessIdentity.phone ?? ''}
              onChange={(event) =>
                update('businessIdentity', {
                  ...overview.businessIdentity,
                  phone: event.target.value || undefined,
                })
              }
            />
          </Field>
          <Field label="Address line 1">
            <input
              className={inputStyles}
              value={overview.businessIdentity.addressLine1 ?? ''}
              onChange={(event) =>
                update('businessIdentity', {
                  ...overview.businessIdentity,
                  addressLine1: event.target.value || undefined,
                })
              }
            />
          </Field>
          <Field label="City">
            <input
              className={inputStyles}
              value={overview.businessIdentity.city ?? ''}
              onChange={(event) =>
                update('businessIdentity', {
                  ...overview.businessIdentity,
                  city: event.target.value || undefined,
                })
              }
            />
          </Field>
          <Field label="Country code">
            <input
              className={inputStyles}
              maxLength={2}
              value={overview.businessIdentity.countryCode ?? ''}
              onChange={(event) =>
                update('businessIdentity', {
                  ...overview.businessIdentity,
                  countryCode: event.target.value.toUpperCase() || undefined,
                })
              }
            />
          </Field>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Currency">
            <input
              className={inputStyles}
              maxLength={3}
              value={overview.currency}
              onChange={(event) =>
                update('currency', event.target.value.toUpperCase())
              }
            />
          </Field>
          <Field label="Business time zone">
            <input
              className={inputStyles}
              value={overview.timeZone}
              onChange={(event) => {
                update('timeZone', event.target.value);
                update('renewalAutomation', {
                  ...overview.renewalAutomation,
                  timeZone: event.target.value,
                });
              }}
            />
          </Field>
          <Field label="Invoice prefix">
            <input
              className={inputStyles}
              value={overview.invoiceNumbering.prefix}
              onChange={(event) =>
                update('invoiceNumbering', {
                  ...overview.invoiceNumbering,
                  prefix: event.target.value.toUpperCase(),
                })
              }
            />
          </Field>
          <Field label="Next number">
            <input
              className={inputStyles}
              type="number"
              min={1}
              value={overview.invoiceNumbering.nextNumber}
              onChange={(event) =>
                update('invoiceNumbering', {
                  ...overview.invoiceNumbering,
                  nextNumber: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Number padding">
            <input
              className={inputStyles}
              type="number"
              min={4}
              max={12}
              value={overview.invoiceNumbering.padding}
              onChange={(event) =>
                update('invoiceNumbering', {
                  ...overview.invoiceNumbering,
                  padding: Number(event.target.value),
                })
              }
            />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Renewals and service safety"
        description="Permanent termination remains a deliberate administrator-only action and is never scheduled automatically."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Renewal lead days">
            <input
              className={inputStyles}
              type="number"
              min={1}
              max={90}
              value={overview.renewalAutomation.invoiceLeadDays}
              onChange={(event) =>
                update('renewalAutomation', {
                  ...overview.renewalAutomation,
                  invoiceLeadDays: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Reminder days before due">
            <input
              className={inputStyles}
              value={overview.renewalAutomation.reminderDaysBeforeDue.join(
                ', ',
              )}
              onChange={(event) =>
                update('renewalAutomation', {
                  ...overview.renewalAutomation,
                  reminderDaysBeforeDue: event.target.value
                    .split(',')
                    .map((value) => Number(value.trim()))
                    .filter(Number.isFinite),
                })
              }
            />
          </Field>
          <Field label="Suspension grace days">
            <input
              className={inputStyles}
              type="number"
              min={0}
              max={60}
              value={overview.renewalAutomation.gracePeriodDays}
              onChange={(event) =>
                update('renewalAutomation', {
                  ...overview.renewalAutomation,
                  gracePeriodDays: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Termination policy">
            <input
              className={`${inputStyles} bg-slate-50`}
              readOnly
              value="Admin confirmation required"
            />
          </Field>
        </div>
        <label className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={overview.renewalAutomation.enabled}
            onChange={(event) =>
              update('renewalAutomation', {
                ...overview.renewalAutomation,
                enabled: event.target.checked,
              })
            }
          />
          Renewal automation enabled
        </label>
      </SettingsCard>

      <SettingsCard
        title="Payments and hosting adapters"
        description="Only the active online gateway is offered for new checkouts. Manual payment remains available for private operations."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Active payment gateway">
            <select
              className={inputStyles}
              value={overview.activeGateway}
              onChange={(event) =>
                update(
                  'activeGateway',
                  event.target.value as BusinessSettings['activeGateway'],
                )
              }
            >
              <option value="manual">Manual payments</option>
              <option value="bkash">bKash sandbox</option>
              <option value="sslcommerz">SSLCOMMERZ sandbox</option>
              <option value="fake">Fake gateway (development only)</option>
            </select>
          </Field>
          <Field label="Active hosting-panel adapter">
            <select
              className={inputStyles}
              value={overview.activeHostingPanelAdapter}
              onChange={(event) =>
                update(
                  'activeHostingPanelAdapter',
                  event.target
                    .value as BusinessSettings['activeHostingPanelAdapter'],
                )
              }
            >
              <option value="cpanel-whm">cPanel / WHM</option>
              <option value="fake-panel">Fake panel (development only)</option>
            </select>
          </Field>
        </div>
        <Field label="Customer manual-payment instructions" className="mt-4">
          <textarea
            className={`${inputStyles} min-h-28`}
            value={overview.manualPayments.instructions}
            onChange={(event) =>
              update('manualPayments', {
                ...overview.manualPayments,
                instructions: event.target.value,
              })
            }
          />
        </Field>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={overview.manualPayments.partialPaymentsEnabled}
            onChange={(event) =>
              update('manualPayments', {
                ...overview.manualPayments,
                partialPaymentsEnabled: event.target.checked,
              })
            }
          />
          Allow partial manual payments
        </label>
      </SettingsCard>

      <SettingsCard
        title="Email branding"
        description="The worker validates and reloads these non-secret values when rendering each queued email."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Brand name">
            <input
              className={inputStyles}
              value={overview.emailBranding.brandName}
              onChange={(event) =>
                update('emailBranding', {
                  ...overview.emailBranding,
                  brandName: event.target.value,
                })
              }
            />
          </Field>
          <Field label="Brand color">
            <input
              className={inputStyles}
              value={overview.emailBranding.brandColor}
              onChange={(event) =>
                update('emailBranding', {
                  ...overview.emailBranding,
                  brandColor: event.target.value,
                })
              }
            />
          </Field>
          <Field label="Sender name">
            <input
              className={inputStyles}
              value={overview.emailBranding.fromName}
              onChange={(event) =>
                update('emailBranding', {
                  ...overview.emailBranding,
                  fromName: event.target.value,
                })
              }
            />
          </Field>
          <Field label="Sender address">
            <input
              className={inputStyles}
              type="email"
              value={overview.emailBranding.fromAddress}
              onChange={(event) =>
                update('emailBranding', {
                  ...overview.emailBranding,
                  fromAddress: event.target.value,
                })
              }
            />
          </Field>
          <Field label="Reply-to address">
            <input
              className={inputStyles}
              type="email"
              value={overview.emailBranding.replyToAddress ?? ''}
              onChange={(event) =>
                update('emailBranding', {
                  ...overview.emailBranding,
                  replyToAddress: event.target.value || null,
                })
              }
            />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Encrypted integration credentials"
        description="Saving a form replaces the complete provider bundle. Secret fields are write-only; only a masked identifier and encryption-key version come back."
      >
        <div className="grid gap-5 xl:grid-cols-3">
          <CredentialForm
            provider="bkash"
            title="bKash sandbox"
            status={statusFor(overview, 'bkash')}
            saving={saving === 'bkash'}
            onSubmit={replaceCredentials}
          >
            <SecretInput name="appKey" label="App key" />
            <SecretInput name="appSecret" label="App secret" />
            <SecretInput name="username" label="Username" />
            <SecretInput name="password" label="Password" />
          </CredentialForm>
          <CredentialForm
            provider="sslcommerz"
            title="SSLCOMMERZ sandbox"
            status={statusFor(overview, 'sslcommerz')}
            saving={saving === 'sslcommerz'}
            onSubmit={replaceCredentials}
          >
            <SecretInput name="storeId" label="Store ID" />
            <SecretInput name="storePassword" label="Store password" />
          </CredentialForm>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <CredentialHeader
              title="cPanel / WHM"
              status={statusFor(overview, 'cpanel-whm')}
            />
            <p className="mt-4 text-sm leading-6 text-slate-600">
              WHM tokens stay encrypted per hosting server because each server
              can use a different account and token.
            </p>
            <Link
              className="mt-5 inline-flex text-sm font-bold text-cyan-700 hover:text-cyan-900"
              href="/admin/services"
            >
              Manage WHM servers →
            </Link>
          </div>
        </div>
      </SettingsCard>

      <div className="flex justify-end">
        <Button disabled={saving !== ''} onClick={() => void saveSettings()}>
          {saving === 'settings' ? 'Saving…' : 'Save all settings'}
        </Button>
      </div>
    </div>
  );
}

function SettingsCard(props: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">{props.title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        {props.description}
      </p>
      <div className="mt-5">{props.children}</div>
    </section>
  );
}

function Field(props: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${props.className ?? ''}`}>
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
        {props.label}
      </span>
      {props.children}
    </label>
  );
}

function SecretInput(props: { name: string; label: string }) {
  return (
    <Field label={props.label}>
      <input
        autoComplete="new-password"
        className={inputStyles}
        name={props.name}
        required
        type="password"
      />
    </Field>
  );
}

function CredentialForm(props: {
  provider: 'bkash' | 'sslcommerz';
  title: string;
  status: CredentialStatus;
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <form
      className="rounded-xl border border-slate-200 bg-slate-50 p-5"
      onSubmit={props.onSubmit}
    >
      <input name="provider" type="hidden" value={props.provider} />
      <CredentialHeader title={props.title} status={props.status} />
      <div className="mt-4 space-y-3">{props.children}</div>
      <Button className="mt-5 w-full" disabled={props.saving} type="submit">
        {props.saving
          ? 'Encrypting…'
          : props.status.configured
            ? 'Rotate credentials'
            : 'Configure credentials'}
      </Button>
    </form>
  );
}

function CredentialHeader(props: { title: string; status: CredentialStatus }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="font-bold text-slate-950">{props.title}</h3>
        <p className="mt-1 text-xs text-slate-500">
          {props.status.maskedIdentifier ?? 'No identifier stored'}
        </p>
      </div>
      <StatusBadge tone={props.status.configured ? 'success' : 'neutral'}>
        {props.status.configured ? 'Configured' : 'Not configured'}
      </StatusBadge>
    </div>
  );
}

function Alert(props: {
  role: 'alert' | 'status';
  tone: 'error' | 'success';
  children: ReactNode;
}) {
  return (
    <p
      role={props.role}
      className={`rounded-xl p-4 text-sm ${
        props.tone === 'error'
          ? 'bg-red-50 text-red-800'
          : 'bg-emerald-50 text-emerald-800'
      }`}
    >
      {props.children}
    </p>
  );
}

function statusFor(
  overview: SettingsOverview,
  provider: CredentialStatus['provider'],
): CredentialStatus {
  return (
    overview.credentialStatuses.find((entry) => entry.provider === provider) ??
    emptyStatus(
      provider,
      provider === 'cpanel-whm' ? 'HOSTING_SERVERS' : 'SETTINGS',
    )
  );
}

function emptyStatus(
  provider: CredentialStatus['provider'],
  managedAt: CredentialStatus['managedAt'],
): CredentialStatus {
  return {
    provider,
    configured: false,
    maskedIdentifier: null,
    updatedAt: null,
    keyVersion: null,
    managedAt,
  };
}

function message(caught: unknown): string {
  return caught instanceof Error
    ? caught.message
    : 'The request could not be completed.';
}

const inputStyles =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100';

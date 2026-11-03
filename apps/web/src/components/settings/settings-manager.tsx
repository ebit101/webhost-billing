'use client';

import {
  DEFAULT_BUSINESS_SETTINGS,
  PARTIAL_PAYMENT_POLICY_CONFIRMATION,
  type BusinessSettings,
  type PatchBusinessSettingsRequest,
  settingsOverviewSchema,
  type CredentialStatus,
  type SettingsOverview,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { SmtpSettingsPanel } from './smtp-settings-panel';
import { Button } from '../ui/button';
import { ConfirmationDialog } from '../ui/confirmation-dialog';
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

const tabs = [
  ['general', 'General'],
  ['localisation', 'Localisation'],
  ['domains', 'Domains'],
  ['mail', 'Mail'],
  ['support', 'Support'],
  ['billing-policy', 'Invoices'],
  ['automation', 'Automation'],
  ['integrations', 'Security and integrations'],
] as const;
type Tab = (typeof tabs)[number][0];

function readTab(): Tab {
  const hash = window.location.hash.slice(1);
  return tabs.find(([id]) => id === hash)?.[0] ?? 'general';
}

function changed<T>(draft: T, saved: T): T | undefined {
  return JSON.stringify(draft) === JSON.stringify(saved) ? undefined : draft;
}

function tabChanges(
  tab: Tab,
  draft: BusinessSettings,
  saved: BusinessSettings,
): PatchBusinessSettingsRequest {
  switch (tab) {
    case 'general':
      return {
        businessIdentity: changed(
          draft.businessIdentity,
          saved.businessIdentity,
        ),
      };
    case 'localisation':
      return {
        localization: changed(
          { currency: draft.currency, timeZone: draft.timeZone },
          { currency: saved.currency, timeZone: saved.timeZone },
        ),
      };
    case 'billing-policy': {
      const { prefix, nextNumber, padding } = draft.invoiceNumbering;
      const numbering = {
        prefix: changed(prefix, saved.invoiceNumbering.prefix),
        nextNumber: changed(nextNumber, saved.invoiceNumbering.nextNumber),
        padding: changed(padding, saved.invoiceNumbering.padding),
      };
      const payments = {
        instructions: changed(
          draft.manualPayments.instructions,
          saved.manualPayments.instructions,
        ),
        partialPaymentsEnabled: changed(
          draft.manualPayments.partialPaymentsEnabled,
          saved.manualPayments.partialPaymentsEnabled,
        ),
      };
      return {
        invoiceNumbering: Object.values(numbering).some(
          (value) => value !== undefined,
        )
          ? numbering
          : undefined,
        manualPayments: Object.values(payments).some(
          (value) => value !== undefined,
        )
          ? payments
          : undefined,
      };
    }
    case 'automation':
      return {
        renewalAutomation: changed(
          draft.renewalAutomation,
          saved.renewalAutomation,
        ),
      };
    case 'mail':
      return {
        emailBranding: changed(draft.emailBranding, saved.emailBranding),
      };
    case 'integrations':
      return {
        activeProviders: changed(
          {
            activeGateway: draft.activeGateway,
            activeHostingPanelAdapter: draft.activeHostingPanelAdapter,
          },
          {
            activeGateway: saved.activeGateway,
            activeHostingPanelAdapter: saved.activeHostingPanelAdapter,
          },
        ),
      };
    default:
      return {};
  }
}

const tabFields: Record<Tab, readonly (keyof BusinessSettings)[]> = {
  general: ['businessIdentity'],
  localisation: ['currency', 'timeZone'],
  domains: [],
  mail: ['emailBranding'],
  support: [],
  'billing-policy': ['invoiceNumbering', 'manualPayments'],
  automation: ['renewalAutomation'],
  integrations: ['activeGateway', 'activeHostingPanelAdapter'],
};

export function SettingsManager() {
  const [overview, setOverview] = useState(initialOverview);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savedOverview, setSavedOverview] = useState<SettingsOverview>();
  const [tab, setTab] = useState<Tab>('general');
  const [mailVisited, setMailVisited] = useState(false);
  const [policyReview, setPolicyReview] =
    useState<PatchBusinessSettingsRequest>();
  const persistedPartialPayments =
    savedOverview?.manualPayments.partialPaymentsEnabled;
  const dirtyTabs = tabs.filter(
    ([id]) =>
      savedOverview &&
      Object.values(tabChanges(id, overview, savedOverview)).some(
        (value) => value !== undefined,
      ),
  );
  const hasDrafts = dirtyTabs.length > 0;

  useEffect(() => {
    const syncTab = () => {
      const next = readTab();
      setTab(next);
      if (next === 'mail') setMailVisited(true);
    };
    syncTab();
    window.addEventListener('hashchange', syncTab);
    window.addEventListener('popstate', syncTab);
    return () => {
      window.removeEventListener('hashchange', syncTab);
      window.removeEventListener('popstate', syncTab);
    };
  }, []);

  useEffect(() => {
    if (!hasDrafts) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const guardLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target = event.target;
      const link =
        target instanceof Element
          ? target.closest<HTMLAnchorElement>('a[href]')
          : null;
      if (
        !link ||
        (link.target && link.target !== '_self') ||
        link.hasAttribute('download')
      )
        return;
      const destination = new URL(link.href);
      if (
        destination.origin !== window.location.origin ||
        destination.pathname === window.location.pathname
      )
        return;
      if (
        !window.confirm(
          'Leave General settings and discard your unsaved changes?',
        )
      )
        event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guardLink, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', guardLink, true);
    };
  }, [hasDrafts]);

  function selectTab(next: Tab) {
    if (next === tab || saving) return;
    window.history.pushState(
      null,
      '',
      next === 'general'
        ? window.location.pathname + window.location.search
        : `#${next}`,
    );
    clearMessages();
    setTab(next);
    if (next === 'mail') setMailVisited(true);
  }

  useEffect(() => {
    let active = true;
    void authenticatedGet<SettingsOverview>('/settings')
      .then((value) => {
        const settings = settingsOverviewSchema.parse(value);
        if (active) {
          setOverview(settings);
          setSavedOverview(settings);
        }
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

  function requestSave() {
    if (!savedOverview || saving) return;
    clearMessages();
    const changes = tabChanges(tab, overview, savedOverview);
    if (!Object.values(changes).some((value) => value !== undefined)) return;
    if (
      changes.manualPayments?.partialPaymentsEnabled !== undefined &&
      changes.manualPayments.partialPaymentsEnabled !== persistedPartialPayments
    ) {
      setPolicyReview(changes);
    } else {
      void saveSettings(changes, tab);
    }
  }

  function discardChanges() {
    if (!savedOverview) return;
    setOverview((current) => {
      const restored = { ...current };
      for (const key of tabFields[tab])
        Object.assign(restored, { [key]: savedOverview[key] });
      return restored;
    });
    clearMessages();
  }

  function cancelPolicyReview() {
    setPolicyReview(undefined);
    setOverview((current) => ({
      ...current,
      manualPayments: {
        ...current.manualPayments,
        partialPaymentsEnabled: persistedPartialPayments ?? false,
      },
    }));
    clearMessages();
  }

  async function saveSettings(
    changes: PatchBusinessSettingsRequest,
    savedTab: Tab,
    confirmed = false,
  ) {
    if (!savedOverview || saving) return;
    setSaving('settings');
    clearMessages();
    try {
      const saved = settingsOverviewSchema.parse(
        await authMutation('/settings', 'PATCH', {
          ...changes,
          ...(confirmed
            ? {
                partialPaymentPolicyConfirmation:
                  PARTIAL_PAYMENT_POLICY_CONFIRMATION,
              }
            : {}),
        }),
      );
      setOverview((current) => {
        const next = { ...saved };
        for (const [id] of tabs) {
          if (id === savedTab) continue;
          if (id === 'billing-policy') {
            const draft = tabChanges(id, current, savedOverview);
            if (draft.invoiceNumbering) {
              next.invoiceNumbering = {
                prefix:
                  draft.invoiceNumbering.prefix ??
                  saved.invoiceNumbering.prefix,
                nextNumber:
                  draft.invoiceNumbering.nextNumber ??
                  saved.invoiceNumbering.nextNumber,
                padding:
                  draft.invoiceNumbering.padding ??
                  saved.invoiceNumbering.padding,
              };
            }
            if (draft.manualPayments) {
              next.manualPayments = {
                instructions:
                  draft.manualPayments.instructions ??
                  saved.manualPayments.instructions,
                partialPaymentsEnabled:
                  draft.manualPayments.partialPaymentsEnabled ??
                  saved.manualPayments.partialPaymentsEnabled,
              };
            }
            continue;
          }
          for (const key of tabFields[id]) {
            if (changed(current[key], savedOverview[key]) !== undefined)
              Object.assign(next, { [key]: current[key] });
          }
        }
        // The business time zone is the source for the saved renewal policy.
        next.renewalAutomation = {
          ...next.renewalAutomation,
          timeZone: saved.timeZone,
        };
        return next;
      });
      setSavedOverview(saved);
      setPolicyReview(undefined);
      setNotice('Changes saved.');
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
        title="General settings"
        description="Manage your business, billing, and service settings."
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

      <ConfirmationDialog
        open={Boolean(policyReview)}
        title="Review partial-payment policy change"
        description={
          policyReview
            ? `Current policy: ${persistedPartialPayments ? 'Enabled' : 'Disabled'}. Proposed policy: ${policyReview.manualPayments?.partialPaymentsEnabled ? 'Enabled' : 'Disabled'}. ${
                policyReview.manualPayments?.partialPaymentsEnabled
                  ? 'Future manual-payment submissions, administrator recordings, and pending-reference verifications may accept a positive amount up to the invoice’s current balance.'
                  : 'Future manual-payment submissions, administrator recordings, and pending-reference verifications must equal the invoice’s full current balance. Pending references for a smaller amount cannot be verified while this policy is disabled.'
              } Existing invoices, payments, balances, and pending references are unchanged by this save. This saves changes on the Invoices tab.${error ? ` Save failed: ${error} Your draft is retained; retry or cancel.` : ''}`
            : ''
        }
        confirmLabel="Confirm policy change and save settings"
        busy={saving === 'settings'}
        onConfirm={() => {
          if (policyReview)
            void saveSettings(policyReview, 'billing-policy', true);
        }}
        onClose={cancelPolicyReview}
      />

      <div
        role="tablist"
        aria-label="Settings categories"
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-2"
      >
        {tabs.map(([id, label], index) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`settings-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={id}
            aria-describedby={
              dirtyTabs.some(([dirty]) => dirty === id)
                ? `settings-draft-${id}`
                : undefined
            }
            tabIndex={tab === id ? 0 : -1}
            disabled={saving !== ''}
            onClick={() => selectTab(id)}
            onKeyDown={(event) => {
              const nextIndex =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : event.key === 'ArrowRight'
                      ? (index + 1) % tabs.length
                      : event.key === 'ArrowLeft'
                        ? (index + tabs.length - 1) % tabs.length
                        : undefined;
              const next =
                nextIndex === undefined ? undefined : tabs[nextIndex]?.[0];
              if (!next) return;
              event.preventDefault();
              selectTab(next);
              document.getElementById(`settings-tab-${next}`)?.focus();
            }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 ${tab === id ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            {label}
            {dirtyTabs.some(([dirty]) => dirty === id) ? (
              <>
                <span aria-hidden="true"> •</span>
                <span id={`settings-draft-${id}`} hidden>
                  Unsaved changes
                </span>
              </>
            ) : null}
          </button>
        ))}
      </div>

      <fieldset
        disabled={saving !== '' || !savedOverview}
        className="min-w-0 space-y-4"
      >
        <TabPanel id="general" active={tab}>
          <SettingsCard
            title="Business identity"
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
                      countryCode:
                        event.target.value.toUpperCase() || undefined,
                    })
                  }
                />
              </Field>
            </div>
          </SettingsCard>
        </TabPanel>
        <TabPanel id="localisation" active={tab}>
          <SettingsCard
            title="Business localisation"
            description="The business time zone is also used for scheduled renewals."
          >
            <div className="grid gap-4 md:grid-cols-2">
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
                  onChange={(event) => update('timeZone', event.target.value)}
                />
              </Field>
            </div>
          </SettingsCard>
        </TabPanel>
        <TabPanel id="domains" active={tab}>
          <SettingsCard
            title="Domain settings"
            description="Manage domain policies, registrar connections, and catalogue prices."
          >
            <ul className="space-y-3">
              <li>
                <Link
                  className="font-semibold text-brand-700 hover:underline"
                  href="/admin/settings/domain-defaults"
                >
                  Domain defaults
                </Link>
              </li>
              <li>
                <Link
                  className="font-semibold text-brand-700 hover:underline"
                  href="/admin/settings/registrars"
                >
                  Domain registrars
                </Link>
              </li>
              <li>
                <Link
                  className="font-semibold text-brand-700 hover:underline"
                  href="/admin/domain-pricing"
                >
                  Domain pricing and TLDs
                </Link>
              </li>
            </ul>
          </SettingsCard>
        </TabPanel>
        <TabPanel id="mail" active={tab}>
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
          <p>
            <Link
              className="font-semibold text-brand-700 hover:underline"
              href="/admin/email"
            >
              View email delivery
            </Link>
          </p>
          {mailVisited ? <SmtpSettingsPanel /> : null}
        </TabPanel>
        <TabPanel id="support" active={tab}>
          <SettingsCard
            title="Support workspace"
            description="View and manage customer support tickets."
          >
            <Link
              className="font-semibold text-brand-700 hover:underline"
              href="/admin/support"
            >
              Open support
            </Link>
          </SettingsCard>
        </TabPanel>
        <TabPanel id="billing-policy" active={tab}>
          <SettingsCard
            title="Invoice numbering"
            description="Choose the format and next number for future invoices."
          >
            <div className="grid gap-4 md:grid-cols-3">
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
            title="Manual payments"
            description="Set payment instructions and review changes to the partial-payment policy."
          >
            <Field
              label="Customer manual-payment instructions"
              className="mt-4"
            >
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
            <p className="mt-3 text-sm text-slate-600">
              Current saved partial-payment policy:{' '}
              {persistedPartialPayments === undefined
                ? 'Unavailable'
                : persistedPartialPayments
                  ? 'Enabled'
                  : 'Disabled'}
              . Changing the checkbox edits a draft. Save changes to review the
              consequence before confirming a change.
            </p>
          </SettingsCard>
        </TabPanel>
        <TabPanel id="automation" active={tab}>
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
        </TabPanel>
        <TabPanel id="integrations" active={tab}>
          <SettingsCard
            title="Active adapters"
            description="Choose the payment gateway and hosting adapter used by the business."
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
                  <option value="fake-panel">
                    Fake panel (development only)
                  </option>
                </select>
              </Field>
            </div>
          </SettingsCard>{' '}
          <SettingsCard
            title="Encrypted integration credentials"
            description="Saving a form replaces the complete provider bundle. Secret fields are write-only; only a masked identifier and encryption-key version come back."
          >
            <div className="grid gap-5 xl:grid-cols-3">
              <CredentialForm
                provider="bkash"
                title="bKash sandbox"
                status={statusFor(overview, 'bkash')}
                saving={saving !== ''}
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
                saving={saving !== ''}
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
                  WHM tokens stay encrypted per hosting server because each
                  server can use a different account and token.
                </p>
                <Link
                  className="mt-5 inline-flex text-sm font-bold text-cyan-700 hover:text-cyan-900"
                  href="/admin/servers"
                >
                  Manage servers →
                </Link>
              </div>
            </div>
          </SettingsCard>
        </TabPanel>
        {tabFields[tab].length ? (
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={!dirtyTabs.some(([id]) => id === tab)}
              onClick={discardChanges}
            >
              Discard changes
            </Button>
            <Button
              type="button"
              disabled={!dirtyTabs.some(([id]) => id === tab)}
              onClick={requestSave}
            >
              {saving === 'settings' ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        ) : null}
      </fieldset>
    </div>
  );
}

function TabPanel({
  id,
  active,
  children,
}: {
  id: Tab;
  active: Tab;
  children: ReactNode;
}) {
  return (
    <section
      role="tabpanel"
      id={id}
      aria-labelledby={`settings-tab-${id}`}
      hidden={id !== active}
      className="space-y-4"
    >
      {children}
    </section>
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
      <Button className="mt-5 mr-2" disabled={props.saving} type="submit">
        {props.saving
          ? 'Encrypting…'
          : props.status.configured
            ? 'Rotate credentials'
            : 'Configure credentials'}
      </Button>
      <Button type="reset" variant="secondary" disabled={props.saving}>
        Discard credential edits
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

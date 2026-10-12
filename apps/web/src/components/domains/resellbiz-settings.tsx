'use client';
import { useEffect, useState } from 'react';
import {
  resellbizSetupSchema,
  resellbizSettingsSchema,
  type ResellbizSettings,
} from '@webhost-billing/shared';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { Card, fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';

export function ResellbizSettingsPanel() {
  const [settings, setSettings] = useState<ResellbizSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function refresh() {
    setSettings(
      resellbizSettingsSchema
        .nullable()
        .parse(await authenticatedGet('/domains/registrar/live')),
    );
  }
  useEffect(() => {
    let active = true;
    void authenticatedGet('/domains/registrar/live')
      .then((data) => {
        if (active) setSettings(resellbizSettingsSchema.nullable().parse(data));
      })
      .catch(() => {
        if (active) {
          setLoadFailed(true);
          setNotice(
            'Registrar settings could not be loaded. An enrolled full administrator is required.',
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
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice('');
    try {
      await action();
      await refresh();
      if (success) setNotice(success);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Registrar request failed.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p role="status">Loading registrar settings…</p>;
  if (loadFailed) return <p role="alert">{notice}</p>;
  return (
    <Card title="Live resell.biz registrar">
      <div className="space-y-4">
        <p>
          Real account, real charges. This is not a sandbox. Only ordinary .com
          registrations for one year are supported. Auto-renewal, transfers,
          cancellation and deletion are not available.
        </p>
        <p>
          Use a dedicated reseller account and allowlist this server’s outbound
          IP. Do not regenerate the key used by WHMCS. Credentials are encrypted
          and are never shown again.
        </p>
        <p role="status">{notice}</p>
        {!settings ? (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              const input = resellbizSetupSchema.safeParse({
                resellerId: data.get('resellerId'),
                apiKey: data.get('apiKey'),
                sellingAmount: data.get('sellingAmount'),
                nameservers: String(data.get('nameservers'))
                  .split(/[\s,]+/)
                  .filter(Boolean),
                agreementUrl: data.get('agreementUrl'),
                customerTermsUrl: data.get('customerTermsUrl'),
                customerPrivacyUrl: data.get('customerPrivacyUrl'),
                confirmNativeUsdCosts:
                  data.get('confirmNativeUsdCosts') === 'on',
                confirmation: data.get('confirmation'),
              });
              const key = form.elements.namedItem('apiKey');
              if (key instanceof HTMLInputElement) key.value = '';
              if (!input.success) {
                setNotice(
                  'Complete the fields, use valid public nameservers and an HTTPS agreement URL, and confirm the native USD cost policy.',
                );
                return;
              }
              void run(
                () =>
                  authMutation('/domains/registrar/live', 'POST', input.data),
                'Credentials saved. Registrar remains disabled. Run a read-only check before enabling offers.',
              );
            }}
          >
            <label>
              Reseller ID
              <input
                name="resellerId"
                className={fieldClass}
                required
                pattern="[1-9][0-9]*"
                autoComplete="off"
              />
            </label>
            <label>
              API key
              <input
                name="apiKey"
                type="password"
                className={fieldClass}
                required
                autoComplete="new-password"
                maxLength={512}
              />
            </label>
            <label>
              .com selling price in BDT minor units
              <input
                name="sellingAmount"
                className={fieldClass}
                required
                pattern="[1-9][0-9]*"
              />
            </label>
            <label>
              Nameservers, separated by commas
              <input name="nameservers" className={fieldClass} required />
            </label>
            <label>
              Actual registrar agreement URL
              <input
                name="agreementUrl"
                type="url"
                className={fieldClass}
                required
              />
            </label>
            <label>
              Actual registrar customer terms URL
              <input
                name="customerTermsUrl"
                type="url"
                className={fieldClass}
                required
              />
            </label>
            <label>
              Actual registrar customer privacy URL
              <input
                name="customerPrivacyUrl"
                type="url"
                className={fieldClass}
                required
              />
            </label>
            <label>
              Type Configure live resell.biz
              <input name="confirmation" className={fieldClass} required />
            </label>
            <label className="sm:col-span-2">
              <input type="checkbox" name="confirmNativeUsdCosts" required /> I
              verified in the provider account that ordinary registration cost
              prices are native USD with two decimal places. This is not
              verified by an unlabeled API price response.
            </label>
            <p className="text-sm sm:col-span-2">
              Nameservers and the agreement are immutable for this initial
              account. Review them before saving. BDT selling prices are
              independent of USD provider costs; no currency conversion is
              performed.
            </p>
            <Button type="submit" disabled={busy}>
              Save credentials, disabled
            </Button>
          </form>
        ) : (
          <>
            <p>
              Reseller {settings.maskedResellerId} · Credential version{' '}
              {settings.credentialVersion} ·{' '}
              {settings.enabled ? 'Enabled' : 'Disabled'} · Server networking{' '}
              {settings.networkEnabled ? 'permitted' : 'disabled'}
            </p>
            <p>
              Nameservers: {settings.nameservers.join(', ')} · .com selling
              price: BDT {BigInt(settings.sellingAmount) / 100n}.
              {(BigInt(settings.sellingAmount) % 100n)
                .toString()
                .padStart(2, '0')}
            </p>
            <a
              href={settings.agreementUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 underline"
            >
              Review configured registrar agreement
            </a>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const name = new FormData(event.currentTarget).get(
                  'domainName',
                );
                void run(async () => {
                  const result = await authMutation<{
                    available: boolean;
                    costAmount: string;
                    costCurrency: string;
                  }>(`/domains/registrar/live/${settings.id}/check`, 'POST', {
                    domainName: name,
                  });
                  setNotice(
                    `${result.available ? 'Available' : 'Unavailable'} · Provider price ${result.costCurrency} ${BigInt(result.costAmount) / 100n}.${(BigInt(result.costAmount) % 100n).toString().padStart(2, '0')}. Price observation only; not a reservation, all-in charge guarantee or purchase.`,
                  );
                }, '');
              }}
            >
              <label>
                Domain for read-only check
                <input
                  name="domainName"
                  className={fieldClass}
                  required
                  placeholder="your-domain.com"
                />
              </label>
              <Button type="submit" disabled={busy || !settings.networkEnabled}>
                Check availability and cost
              </Button>
            </form>
            <Button
              disabled={busy || (!settings.enabled && !settings.networkEnabled)}
              onClick={() =>
                void run(
                  () =>
                    authMutation(
                      `/domains/registrar/live/${settings.id}`,
                      'PATCH',
                      { enabled: !settings.enabled },
                    ),
                  settings.enabled
                    ? 'Registrar disabled. No new dispatches will run.'
                    : 'Live offers enabled. Payment alone never dispatches registration.',
                )
              }
            >
              {settings.enabled
                ? 'Disable live registrar'
                : 'Enable live offers after connection check'}
            </Button>
            <details>
              <summary>Replace credential</summary>
              <p>
                Replacement disables the account and retains historical
                credential versions. Do not invalidate a key needed for an
                uncertain registration without an operator recovery plan.
              </p>
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const data = new FormData(form);
                  const input = {
                    resellerId: data.get('resellerId'),
                    apiKey: data.get('apiKey'),
                  };
                  const key = form.elements.namedItem('apiKey');
                  if (key instanceof HTMLInputElement) key.value = '';
                  void run(
                    () =>
                      authMutation(
                        `/domains/registrar/live/${settings.id}/credential`,
                        'PATCH',
                        input,
                      ),
                    'Credential replaced. Registrar disabled.',
                  );
                }}
              >
                <label>
                  Same reseller ID
                  <input
                    name="resellerId"
                    className={fieldClass}
                    required
                    autoComplete="off"
                  />
                </label>
                <label>
                  New API key
                  <input
                    name="apiKey"
                    type="password"
                    className={fieldClass}
                    required
                    autoComplete="new-password"
                    maxLength={512}
                  />
                </label>
                <Button type="submit" disabled={busy}>
                  Replace credential and disable
                </Button>
              </form>
            </details>
          </>
        )}
      </div>
    </Card>
  );
}

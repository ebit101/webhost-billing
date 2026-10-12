'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  domainDnsDefaultsSchema,
  domainPolicyInputSchema,
  domainDefaultsStatusSchema as schema,
  type DomainDefaultsStatus,
} from '@webhost-billing/shared';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { Card, Field } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { PageHeader } from '../ui/page-header';
export function DomainDefaults() {
  const [settings, setSettings] = useState<DomainDefaultsStatus>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    void authenticatedGet('/domains/administration/defaults')
      .then((value) => {
        if (active) setSettings(schema.parse(value));
      })
      .catch(() => {
        if (active)
          setError(
            'Domain defaults could not be loaded. An MFA-enrolled full administrator is required.',
          );
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(
    kind: 'dns' | 'policies',
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (pending.current) return;
    const data = new FormData(event.currentTarget);
    const parsed =
      kind === 'dns'
        ? domainDnsDefaultsSchema.safeParse({
            nameservers: String(data.get('nameservers'))
              .split(/[\s,]+/)
              .filter(Boolean),
          })
        : domainPolicyInputSchema.safeParse(Object.fromEntries(data));
    if (!parsed.success) {
      setError(
        'Use 2–5 distinct public nameservers, or valid approved HTTPS policy links.',
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setSettings(
        schema.parse(
          await authMutation(
            `/domains/administration/defaults/${kind}`,
            'PUT',
            parsed.data,
          ),
        ),
      );
      setNotice(
        'Defaults saved for new quotes. Historical consent and nameservers are unchanged.',
      );
    } catch {
      setError('Saving could not be confirmed. Reload before retrying.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Domain DNS defaults and policies"
        description="Configure once for the installation, independently of registrar credentials and hosting panels."
      />
      <nav className="flex gap-4 text-sm underline">
        <Link href="/admin/settings/registrars">Registrar connections</Link>
        <Link href="/admin/domain-pricing">Domain pricing and TLDs</Link>
      </nav>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!settings && !error && <p>Loading domain defaults…</p>}
      {settings && (
        <>
          <Card title="Default nameservers">
            <p className="mb-4 text-sm">
              Domain-only registration uses these defaults. Saving never changes
              an existing domain; nameserver management remains a separate
              confirmed action.
            </p>
            <form
              onSubmit={(event) => void save('dns', event)}
              className="grid gap-4"
            >
              <Field
                name="nameservers"
                label="Nameservers, separated by commas"
                defaultValue={settings.dns?.nameservers.join(', ') ?? ''}
                required
              />
              <Button disabled={busy}>Save DNS defaults</Button>
            </form>
          </Card>
          <Card title="Central registration policies">
            <p className="mb-4 text-sm">
              Use published, owner-approved business/provider policies. These
              links are configured once, not separately in each registrar
              connection. Checkout records the reviewed links and eligible
              registrar accounts; no consent is assumed.
            </p>
            <form
              onSubmit={(event) => void save('policies', event)}
              className="grid gap-4 sm:grid-cols-2"
            >
              <Field
                name="agreementUrl"
                label="Domain-registration policy"
                type="url"
                defaultValue={settings.policies?.agreementUrl ?? ''}
                required
              />
              <Field
                name="customerTermsUrl"
                label="Customer terms"
                type="url"
                defaultValue={settings.policies?.customerTermsUrl ?? ''}
                required
              />
              <Field
                name="customerPrivacyUrl"
                label="Privacy policy"
                type="url"
                defaultValue={settings.policies?.customerPrivacyUrl ?? ''}
                required
              />
              <Button disabled={busy}>Save reviewed policies</Button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}

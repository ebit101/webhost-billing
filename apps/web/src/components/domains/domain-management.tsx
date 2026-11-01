'use client';
import { formatUtcTimestamp } from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  domainActionRequestSchema,
  domainActionSchema,
  domainManagementSchema,
  sentenceCaseLabel,
  type DomainAction,
  type DomainContact,
  type DomainManagement,
} from '@webhost-billing/shared';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';

const contactLabels = {
  name: 'Registrant name',
  company: 'Company',
  email: 'Registrant email',
  address: 'Address',
  addressLine2: 'Address line 2',
  city: 'City',
  region: 'Region',
  postalCode: 'Postal code',
  country: 'Country code',
  phoneCountryCode: 'Phone country code',
  phone: 'Phone number',
} as const;
export function DomainManagementPanel({
  domainId,
  domainName,
  administrator,
  contact,
  renewalPricing,
  allowRenewal = true,
}: {
  domainId: string;
  domainName: string;
  administrator: boolean;
  contact?: DomainContact;
  renewalPricing?: { amount: string | null; revision: number };
  allowRenewal?: boolean;
}) {
  const [observed, setObserved] = useState<DomainManagement | null>(null);
  const [actions, setActions] = useState<DomainAction[]>([]);
  const [kind, setKind] = useState('NAMESERVERS');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const base = `/domains/${domainId}`;
  async function reload() {
    const [state, history] = await Promise.all([
      authenticatedGet(`${base}/management`),
      authenticatedGet(`${base}/actions`),
    ]);
    setObserved(domainManagementSchema.nullable().parse(state));
    setActions(domainActionSchema.array().parse(history));
  }
  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedGet(`${base}/management`),
      authenticatedGet(`${base}/actions`),
    ])
      .then(([state, history]) => {
        if (active) {
          setObserved(domainManagementSchema.nullable().parse(state));
          setActions(domainActionSchema.array().parse(history));
        }
      })
      .catch(() => {
        if (active) setNotice('Domain management history could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [base]);
  // Authorization codes are held only briefly in memory; never storage, URLs or history.
  useEffect(() => {
    if (!code) return;
    const timer = setTimeout(() => setCode(''), 60000);
    const hide = () => setCode('');
    const visibility = () => {
      if (document.hidden) hide();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
    };
  }, [code]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setNotice('');
    setCode('');
    try {
      await action();
      await reload();
      setNotice(
        'Request saved. Only independently confirmed actions are marked succeeded.',
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'The domain action could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  }
  function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value =
      kind === 'NAMESERVERS'
        ? {
            kind,
            nameservers: String(data.get('nameservers'))
              .split(/[\s,]+/)
              .filter(Boolean),
          }
        : kind === 'LOCK'
          ? { kind, locked: data.get('locked') === 'on' }
          : kind === 'CONTACT'
            ? {
                kind,
                contact: {
                  ...Object.fromEntries(
                    Object.keys(contactLabels).map((key) => [
                      key,
                      data.get(key),
                    ]),
                  ),
                  publishOrganization: data.get('publishOrganization') === 'on',
                },
                consent: data.get('consent') === 'on',
                acceptRegistrantChange:
                  data.get('acceptRegistrantChange') === 'on',
              }
            : {
                kind,
                sellingAmount: data.get('sellingAmount'),
                ...(renewalPricing
                  ? { catalogueRevision: renewalPricing.revision }
                  : {}),
                costCeiling: data.get('costCeiling'),
                acceptPriceChangeRisk:
                  data.get('acceptPriceChangeRisk') === 'on',
              };
    const parsed = domainActionRequestSchema.safeParse(value);
    if (!parsed.success) {
      setNotice('Complete the action fields and required confirmations.');
      return;
    }
    void run(() =>
      authMutation(`${base}/actions`, 'POST', {
        request: parsed.data,
        confirmation: data.get('confirmation'),
      }),
    );
  }
  const open = actions.some(
    (action) => !['SUCCEEDED', 'CANCELLED', 'FAILED'].includes(action.state),
  );
  return (
    <section
      aria-label={`Management of ${domainName}`}
      className="mt-5 space-y-4 border-t border-slate-200 pt-5"
    >
      <h3 className="font-semibold">Domain management</h3>
      <p role="status" className="text-sm">
        {notice}
      </p>
      {observed ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt>Observed nameservers</dt>
            <dd>{observed.nameservers.join(', ')}</dd>
          </div>
          <div>
            <dt>Transfer protection</dt>
            <dd>{observed.locked ? 'Locked' : 'Unlocked'}</dd>
          </div>
          <div>
            <dt>Observed expiry</dt>
            <dd>{formatUtcTimestamp(observed.expiresAt)}</dd>
          </div>
          <div>
            <dt>Contact verification</dt>
            <dd>{observed.verification}</dd>
          </div>
          <div>
            <dt>Last registrar check</dt>
            <dd>{formatUtcTimestamp(observed.observedAt)}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm">
          Current nameserver and lock state has not been checked yet.
        </p>
      )}
      {observed?.contact && (
        <div>
          <h4 className="text-sm font-semibold">
            Current observed registrant contact
          </h4>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(observed.contact).map(([key, value]) => (
              <div key={key}>
                <dt>
                  {contactLabels[key as keyof typeof contactLabels] ??
                    sentenceCaseLabel(key)}
                </dt>
                <dd className="break-words">
                  {typeof value === 'boolean'
                    ? value
                      ? 'Consented'
                      : 'Not consented'
                    : value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <Button
        disabled={busy}
        onClick={() =>
          void run(() => authMutation(`${base}/management/refresh`, 'POST'))
        }
      >
        Check registrar state read-only
      </Button>
      {!administrator && (
        <p className="text-sm">
          Ask support for nameserver, lock, contact or renewal changes. Any
          renewal requires its own invoice and verified payment.{' '}
          <Link href="/portal/tickets" className="underline">
            Contact support
          </Link>
        </p>
      )}
      {administrator && (
        <>
          <p className="text-sm">
            Each change is saved for review before dispatch. Uncertain actions
            can only be reconciled read-only. Auto-renewal, transfer,
            cancellation, deletion and paid privacy are not enabled.
          </p>
          <form onSubmit={request} className="grid gap-3 sm:grid-cols-2">
            <label>
              Action
              <select
                className={fieldClass}
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <option value="NAMESERVERS">Change nameservers</option>
                <option value="LOCK">Change transfer protection</option>
                <option value="CONTACT">Change registrant contact</option>
                {allowRenewal && (
                  <option
                    value="RENEW"
                    disabled={Boolean(renewalPricing && !renewalPricing.amount)}
                  >
                    {renewalPricing && !renewalPricing.amount
                      ? 'Renewal price unavailable'
                      : 'Prepare paid one-year renewal'}
                  </option>
                )}
              </select>
            </label>
            <label>
              Type exact domain name
              <input
                name="confirmation"
                className={fieldClass}
                required
                autoComplete="off"
              />
            </label>
            {kind === 'NAMESERVERS' && (
              <label className="sm:col-span-2">
                New nameservers, separated by commas
                <input
                  name="nameservers"
                  className={fieldClass}
                  required
                  defaultValue={observed?.nameservers.join(', ') ?? ''}
                />
              </label>
            )}
            {kind === 'LOCK' && (
              <label>
                <input name="locked" type="checkbox" defaultChecked /> Enable
                transfer protection
              </label>
            )}
            {kind === 'CONTACT' && (
              <>
                {Object.entries(contactLabels).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      name={key}
                      className={fieldClass}
                      type={key === 'email' ? 'email' : 'text'}
                      required={key !== 'addressLine2'}
                      defaultValue={
                        (observed?.contact ?? contact)?.[
                          key as keyof typeof contactLabels
                        ] ?? ''
                      }
                      maxLength={320}
                    />
                  </label>
                ))}
                <label className="sm:col-span-2">
                  <input name="publishOrganization" type="checkbox" /> I
                  explicitly consent to publication of the registrant
                  organization. Leave unchecked to withhold
                  organization-publication consent.
                </label>
                <label className="sm:col-span-2">
                  <input name="consent" type="checkbox" required /> I have
                  explicit registrant authorization to disclose these contact
                  details to the registrar and registry.
                </label>
                <label className="sm:col-span-2">
                  <input
                    name="acceptRegistrantChange"
                    type="checkbox"
                    required
                  />{' '}
                  I understand the registrar may require old/new registrant
                  approval, email verification and a 60-day transfer lock. Do
                  not skip those safeguards or act as designated agent.
                </label>
              </>
            )}
            {kind === 'RENEW' && (
              <>
                <label>
                  One-year BDT selling amount in minor units
                  <input
                    name="sellingAmount"
                    className={fieldClass}
                    defaultValue={renewalPricing?.amount ?? ''}
                    readOnly={Boolean(renewalPricing)}
                    required
                    pattern="[1-9][0-9]*"
                  />
                </label>
                <label>
                  Approved USD provider threshold in minor units
                  <input
                    name="costCeiling"
                    className={fieldClass}
                    required
                    pattern="[1-9][0-9]*"
                  />
                </label>
                <label className="sm:col-span-2">
                  <input
                    name="acceptPriceChangeRisk"
                    type="checkbox"
                    required
                  />{' '}
                  I approve a real paid one-year renewal after verified payment.
                  The price check is not an atomic provider cap, and renewal
                  cannot be undone through this API.
                </label>
              </>
            )}
            <Button type="submit" disabled={busy || open}>
              Save action for review
            </Button>
          </form>
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void (async () => {
                setBusy(true);
                setCode('');
                setNotice('');
                try {
                  const result = await authMutation<{ code: string }>(
                    `${base}/authorization-code`,
                    'POST',
                    { confirmation: data.get('confirmation') },
                  );
                  if (
                    typeof result.code !== 'string' ||
                    result.code.length > 256
                  )
                    throw new Error('Authorization code is unavailable.');
                  setCode(result.code);
                } catch (error) {
                  setNotice(
                    error instanceof Error
                      ? error.message
                      : 'Authorization code is unavailable.',
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <label className="flex-1">
              Confirm domain to reveal authorization code
              <input
                name="confirmation"
                required
                className={fieldClass}
                autoComplete="off"
              />
            </label>
            <Button type="submit" disabled={busy}>
              Reveal authorization code
            </Button>
          </form>
          {code && (
            <div className="rounded-lg border p-3">
              <p className="break-all font-mono">{code}</p>
              <p className="text-sm">
                Sensitive code: hidden automatically after one minute.
              </p>
              <Button onClick={() => setCode('')}>Hide code now</Button>
            </div>
          )}
        </>
      )}
      <h4 className="text-sm font-semibold">Action history</h4>
      {!actions.length && (
        <p className="text-sm">No management or renewal actions yet.</p>
      )}
      {actions.map((action) => (
        <div
          key={action.id}
          className="space-y-2 rounded-lg border p-3 text-sm"
        >
          <p>
            {sentenceCaseLabel(action.kind)} · {sentenceCaseLabel(action.state)}{' '}
            · {formatUtcTimestamp(action.createdAt)}
          </p>
          {action.invoiceId && (
            <Link
              className="underline"
              href={
                administrator
                  ? `/admin/invoices?invoiceId=${action.invoiceId}`
                  : `/portal/invoices/${action.invoiceId}`
              }
            >
              View renewal invoice and payment
            </Link>
          )}
          {action.financialAttention && (
            <p className="text-amber-800">
              Financial review required. Payment or refund does not prove a
              registrar outcome; no automatic refund is issued.
            </p>
          )}
          {administrator &&
            !['SUCCEEDED', 'CANCELLED', 'FAILED'].includes(action.state) && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void run(() =>
                    authMutation(
                      `${base}/actions/${action.id}/${action.claimed ? 'reconcile' : 'execute'}`,
                      'POST',
                      { confirmation: data.get('confirmation') },
                    ),
                  );
                }}
              >
                <label>
                  Confirm domain for{' '}
                  {action.claimed
                    ? 'read-only reconciliation'
                    : 'one-time dispatch'}
                  <input
                    name="confirmation"
                    className={fieldClass}
                    required
                    autoComplete="off"
                  />
                </label>
                <Button type="submit" disabled={busy}>
                  {action.claimed
                    ? 'Reconcile action read-only'
                    : 'Dispatch approved action once'}
                </Button>
                {!action.claimed && (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={(event) => {
                      const form = event.currentTarget.form;
                      if (!form) return;
                      const data = new FormData(form);
                      void run(() =>
                        authMutation(
                          `${base}/actions/${action.id}/cancel-unsent`,
                          'POST',
                          { confirmation: data.get('confirmation') },
                        ),
                      );
                    }}
                  >
                    Cancel unsent local action
                  </Button>
                )}
              </form>
            )}
          {administrator &&
            action.kind === 'CONTACT' &&
            action.claimed &&
            action.state === 'NEEDS_RECONCILIATION' && (
              <details>
                <summary>Recover a known replacement contact read-only</summary>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void run(() =>
                      authMutation(
                        `${base}/actions/${action.id}/recover-contact`,
                        'POST',
                        {
                          confirmation: data.get('confirmation'),
                          contactId: data.get('contactId'),
                        },
                      ),
                    );
                  }}
                >
                  <p>
                    For a lost contact-creation response, find the exact contact
                    in the provider panel. This only verifies ownership and the
                    saved contact snapshot. It cannot create another contact or
                    resend the change.
                  </p>
                  <label>
                    Confirm domain for contact recovery
                    <input
                      name="confirmation"
                      className={fieldClass}
                      required
                    />
                  </label>
                  <label>
                    Verified provider contact ID
                    <input
                      name="contactId"
                      className={fieldClass}
                      pattern="[1-9][0-9]*"
                      required
                    />
                  </label>
                  <Button type="submit" disabled={busy}>
                    Verify replacement contact read-only
                  </Button>
                </form>
              </details>
            )}
        </div>
      ))}
    </section>
  );
}

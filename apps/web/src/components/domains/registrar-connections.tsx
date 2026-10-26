'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  createRegistrarConnectionSchema,
  registrarConnectionListSchema,
  type RegistrarConnection,
} from '@webhost-billing/shared';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { Card, Field } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { RecordAction, RecordDialog } from '../ui/record-dialog';
import { DataTable } from '../ui/data-table';
import { PageHeader } from '../ui/page-header';
import { ConfirmationDialog } from '../ui/confirmation-dialog';

const base = '/domains/administration/registrars';
export function RegistrarConnections() {
  const [selectedId, setSelectedId] = useState<string>();
  const [accounts, setAccounts] = useState<RegistrarConnection[]>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [review, setReview] = useState<{
    account: RegistrarConnection;
    kind: 'default' | 'toggle';
  }>();
  const [costConfirmed, setCostConfirmed] = useState<Set<string>>(new Set());
  async function refresh() {
    setAccounts(
      registrarConnectionListSchema.parse(await authenticatedGet(base)),
    );
  }
  useEffect(() => {
    let active = true;
    void authenticatedGet(base)
      .then((data) => {
        if (active) setAccounts(registrarConnectionListSchema.parse(data));
      })
      .catch(() => {
        if (active)
          setError(
            'Registrar settings could not be loaded. An MFA-enrolled full administrator is required.',
          );
      });
    return () => {
      active = false;
    };
  }, []);
  async function run(action: () => Promise<unknown>, message: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      if (message) setNotice(message);
    } catch {
      setError('The change could not be confirmed. Refresh before retrying.');
      return;
    } finally {
      pending.current = false;
      setBusy(false);
      setReview(undefined);
    }
    try {
      await refresh();
    } catch {
      setAccounts(undefined);
      setError(
        'The change completed, but refreshed settings are unavailable. Do not repeat the write.',
      );
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = createRegistrarConnectionSchema.safeParse({
      ...Object.fromEntries(new FormData(form)),
      module: 'logicboxes',
      confirmation: 'Save registrar connection',
    });
    if (!parsed.success) {
      setError('Enter a connection name, reseller ID and valid API key.');
      return;
    }
    form.reset();
    await run(
      () => authMutation(base, 'POST', parsed.data),
      'Connection saved and encrypted, disabled. No product, customer or domain was created.',
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Domain registrars"
        description="Manage independent LogicBoxes connections. The default only preselects a registrar; payment never registers a domain."
      />
      <nav
        aria-label="Domain configuration"
        className="flex flex-wrap gap-4 text-sm underline"
      >
        <Link href="/admin/domain-pricing">Domain pricing and TLDs</Link>
        <Link href="/admin/settings/domain-defaults">
          DNS defaults and business policies
        </Link>
        <Link href="/admin/domains">Domain requests</Link>
      </nav>
      {error && (
        <p role="alert" className="text-red-700">
          {error}{' '}
          <Link href="/account" className="underline">
            Account security
          </Link>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!accounts && !error && (
        <p role="status">Loading registrar connections…</p>
      )}
      {accounts && (
        <>
          <RecordAction
            label="Add registrar connection"
            busy={busy}
            feedback={error || notice}
          >
            <Card title="Add registrar connection">
              <form
                onSubmit={(event) => void save(event)}
                className="grid gap-4 sm:grid-cols-2"
              >
                <Field
                  label="Connection name"
                  name="name"
                  required
                  maxLength={100}
                />
                <p className="self-center text-sm">
                  Module: LogicBoxes (Resell.biz / StarGate). Other provider
                  modules are not supported yet.
                </p>
                <Field
                  label="Reseller ID"
                  name="resellerId"
                  required
                  maxLength={19}
                  autoComplete="off"
                />
                <Field
                  label="API key"
                  name="apiKey"
                  type="password"
                  required
                  maxLength={512}
                  autoComplete="new-password"
                />
                <Button type="submit" disabled={busy}>
                  Save connection
                </Button>
              </form>
            </Card>
          </RecordAction>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setError('');
              void refresh().catch(() => {
                setAccounts(undefined);
                setError('Registrar settings could not be refreshed.');
              });
            }}
          >
            Refresh connections
          </Button>
          {!accounts.length && <p>No registrar connections configured.</p>}
          <p className="text-sm">{accounts.length} registrar connections</p>
          <DataTable
            caption="Registrar connections"
            rows={accounts}
            rowKey={(account) => account.id}
            columns={[
              {
                key: 'name',
                header: 'Connection',
                render: (account) => account.name,
              },
              {
                key: 'mode',
                header: 'Mode',
                render: (account) => account.mode,
              },
              {
                key: 'enabled',
                header: 'Status',
                render: (account) => (account.enabled ? 'Enabled' : 'Disabled'),
              },
              {
                key: 'default',
                header: 'Installation default',
                render: (account) => (account.isDefault ? 'Yes' : 'No'),
              },
              {
                key: 'reseller',
                header: 'Reseller ID',
                render: (account) => account.maskedResellerId,
              },
              {
                key: 'credential',
                header: 'Credential version',
                render: (account) => account.credentialVersion,
              },
              {
                key: 'manage',
                header: 'Actions',
                render: (account) => (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelectedId(account.id)}
                  >
                    Manage <span className="sr-only">{account.name}</span>
                  </Button>
                ),
              },
            ]}
          />
          {accounts
            .filter((account) => account.id === selectedId)
            .map((account) => (
              <RecordDialog
                key={account.id}
                open
                title={account.name}
                busy={busy}
                feedback={error || notice}
                onClose={() => setSelectedId(undefined)}
              >
                <Card key={account.id} title={account.name}>
                  <p className="text-sm">
                    {account.mode} · {account.enabled ? 'Enabled' : 'Disabled'}
                    {account.isDefault ? ' · Installation default' : ''} ·
                    Reseller {account.maskedResellerId} · Credential version{' '}
                    {account.credentialVersion}
                  </p>
                  <p className="mt-2 text-sm">
                    Ordinary .com registration, one year. Transfers, DNS
                    management, email forwarding and paid identity protection
                    are not supported.
                  </p>
                  {account.mode === 'Live' && (
                    <>
                      <form
                        className="my-4 flex flex-wrap items-end gap-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const data = new FormData(event.currentTarget);
                          void run(async () => {
                            const result = await authMutation<{
                              available: boolean;
                              costAmount: string;
                              costCurrency: string;
                            }>(`${base}/${account.id}/check`, 'POST', {
                              domainName: data.get('domainName'),
                            });
                            setNotice(
                              `Read-only check completed: ${result.available ? 'available' : 'unavailable'}, native cost ${result.costCurrency} ${result.costAmount} minor units. No registration submitted.`,
                            );
                          }, '');
                        }}
                      >
                        <Field
                          name="domainName"
                          label="Domain for read-only check"
                          required
                          placeholder="ordinary-name.com"
                        />
                        <Button disabled={busy || !account.networkEnabled}>
                          Check connection
                        </Button>
                      </form>
                      {!account.enabled && (
                        <label className="my-3 flex gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={costConfirmed.has(account.id)}
                            onChange={(event) =>
                              setCostConfirmed((old) => {
                                const next = new Set(old);
                                if (event.target.checked) next.add(account.id);
                                else next.delete(account.id);
                                return next;
                              })
                            }
                          />
                          I independently verified that this account&apos;s
                          ordinary costs are native USD with two decimal places.
                          An unlabeled API price does not prove this.
                        </label>
                      )}
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="secondary"
                          disabled={
                            busy ||
                            (!account.enabled &&
                              (!account.networkEnabled ||
                                !costConfirmed.has(account.id)))
                          }
                          onClick={() => setReview({ account, kind: 'toggle' })}
                        >
                          {account.enabled
                            ? 'Disable registrar'
                            : 'Enable registrar'}
                        </Button>
                      </div>
                      <details className="mt-4">
                        <summary>Replace API key</summary>
                        <form
                          className="mt-3 grid gap-3 sm:grid-cols-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const form = event.currentTarget;
                            const data = Object.fromEntries(new FormData(form));
                            form.reset();
                            void run(
                              () =>
                                authMutation(
                                  `${base}/${account.id}/credential`,
                                  'PATCH',
                                  data,
                                ),
                              'Credential replaced; connection disabled. Existing approvals retain their original credential version.',
                            );
                          }}
                        >
                          <Field
                            label="Existing reseller ID"
                            name="resellerId"
                            required
                            autoComplete="off"
                          />
                          <Field
                            label="Replacement API key"
                            name="apiKey"
                            type="password"
                            required
                            maxLength={512}
                            autoComplete="new-password"
                          />
                          <Button disabled={busy}>
                            Replace key and disable
                          </Button>
                        </form>
                      </details>
                    </>
                  )}
                  <Button
                    disabled={busy || !account.enabled || account.isDefault}
                    onClick={() => setReview({ account, kind: 'default' })}
                  >
                    Set as default
                  </Button>
                </Card>
              </RecordDialog>
            ))}
        </>
      )}
      <ConfirmationDialog
        open={Boolean(review)}
        title={
          review?.kind === 'default'
            ? 'Set default registrar?'
            : review?.account.enabled
              ? 'Disable registrar?'
              : 'Enable registrar?'
        }
        description={
          review
            ? review.kind === 'default'
              ? `Use ${review.account.name} when a TLD has no preferred registrar. Existing quotes, approvals and domains will not be rerouted.`
              : review.account.enabled
                ? `Disable ${review.account.name}. This does not cancel in-flight purchases or refund invoices; queued work stays bound to this account.`
                : `Enable ${review.account.name} after a read-only connection check. Sales still require separately configured TLD pricing, DNS, policies, customer consent and paid administrator approval. No domain will be registered by enabling.`
            : ''
        }
        busy={busy}
        onClose={() => setReview(undefined)}
        onConfirm={() => {
          if (!review) return;
          const { account, kind } = review;
          void run(
            () =>
              kind === 'default'
                ? authMutation(`${base}/${account.id}/default`, 'PUT', {
                    confirmation: 'Set default registrar',
                  })
                : authMutation(`${base}/${account.id}`, 'PATCH', {
                    enabled: !account.enabled,
                    ...(!account.enabled
                      ? { confirmNativeUsdCosts: true }
                      : {}),
                  }),
            kind === 'default'
              ? 'Installation default saved. Existing execution choices are unchanged.'
              : 'Registrar activation updated.',
          );
        }}
      />
    </div>
  );
}

'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  bdtPriceToMinor,
  domainTldListSchema,
  domainTldRequestSchema,
  registrarConnectionListSchema,
  type DomainTld,
  type RegistrarConnection,
} from '@webhost-billing/shared';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { Card, Field, fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { PageHeader } from '../ui/page-header';
import { ConfirmationDialog } from '../ui/confirmation-dialog';
const base = '/domains/administration';
const price = (value: string | null) =>
  value === null
    ? ''
    : `${BigInt(value) / 100n}.${(BigInt(value) % 100n).toString().padStart(2, '0')}`;
export function TldManager() {
  const [rows, setRows] = useState<DomainTld[]>();
  const [registrars, setRegistrars] = useState<RegistrarConnection[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<DomainTld | 'new'>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [bulkAction, setBulkAction] = useState('disable');
  const [bulkRegistrar, setBulkRegistrar] = useState('');
  const [review, setReview] = useState<{
    entries: { id: string; revision: number }[];
    names: string;
    enabled?: boolean;
    preferredRegistrarId?: string | null;
  }>();
  async function refresh() {
    const [tlds, accounts] = await Promise.all([
      authenticatedGet(`${base}/tlds`),
      authenticatedGet(`${base}/registrars`),
    ]);
    setRows(domainTldListSchema.parse(tlds));
    setRegistrars(registrarConnectionListSchema.parse(accounts));
    setSelected(new Set());
  }
  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedGet(`${base}/tlds`),
      authenticatedGet(`${base}/registrars`),
    ])
      .then(([tlds, accounts]) => {
        if (active) {
          setRows(domainTldListSchema.parse(tlds));
          setRegistrars(registrarConnectionListSchema.parse(accounts));
        }
      })
      .catch(() => {
        if (active)
          setError(
            'TLD settings could not be loaded. An MFA-enrolled full administrator is required.',
          );
      });
    return () => {
      active = false;
    };
  }, []);
  async function write(action: () => Promise<unknown>, message: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let written = false;
    try {
      await action();
      written = true;
      setNotice(message);
      setEdit(undefined);
      setReview(undefined);
    } catch {
      setError(
        'The change could not be confirmed. Refresh before retrying; another administrator may have changed the revision.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
    if (written)
      try {
        await refresh();
      } catch {
        setRows(undefined);
        setError(
          'The change completed, but the catalogue could not be refreshed. Do not repeat the write.',
        );
      }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const parsed = domainTldRequestSchema.parse({
        tld: String(data.get('tld')).replace(/^\./, ''),
        registrationAmount: bdtPriceToMinor(
          String(data.get('registrationAmount') ?? ''),
        ),
        renewalAmount: bdtPriceToMinor(String(data.get('renewalAmount') ?? '')),
        enabled: data.get('enabled') === 'on',
        featured: data.get('featured') === 'on',
        displayOrder: Number(data.get('displayOrder')),
        preferredRegistrarId:
          String(data.get('preferredRegistrarId') ?? '') || null,
        revision: typeof edit === 'object' ? edit.revision : 0,
      });
      await write(
        () => authMutation(`${base}/tlds`, 'PUT', parsed),
        'TLD revision saved. Existing quotes, invoices and approved executions were not rewritten.',
      );
    } catch {
      setError(
        'Enter a valid extension and positive BDT prices. Only priced ordinary .com registrations can be enabled; blank means unavailable, not free.',
      );
    }
  }
  const filtered = (rows ?? []).filter((row) =>
    row.tld.includes(search.trim().toLowerCase().replace(/^\./, '')),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const visible = filtered.slice(
    (Math.min(page, pages) - 1) * 20,
    Math.min(page, pages) * 20,
  );
  const editing = typeof edit === 'object' ? edit : undefined;
  const choices = registrars.filter((entry) => entry.enabled);
  const registrarName = (id: string | null) =>
    id
      ? (registrars.find((entry) => entry.id === id)?.name ??
        'Unavailable registrar')
      : 'Use installation default';
  return (
    <div className="space-y-6">
      <PageHeader
        title="Domain pricing and TLDs"
        description="Customer selling prices are independent of registrar costs. Pricing never configures credentials or submits a registration."
      />
      <nav
        aria-label="Domain configuration"
        className="flex flex-wrap gap-4 text-sm underline"
      >
        <Link href="/admin/settings/registrars">Registrar connections</Link>
        <Link href="/admin/settings/domain-defaults">
          DNS defaults and business policies
        </Link>
        <Link href="/admin/domains">Domain requests</Link>
      </nav>
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
        The supported live path is ordinary .com registration and manual renewal
        for one year. Other TLDs can be kept as disabled catalogue drafts. An
        enabled extension also needs an enabled default or preferred registrar
        and configured DNS defaults and policies before customers can order it.
        Transfers, premium domains, automatic registration, DNS-management
        add-ons, email forwarding and paid identity protection are not
        supported.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}{' '}
          <Link href="/account" className="underline">
            Account security
          </Link>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!rows && !error && <p role="status">Loading TLD catalogue…</p>}
      {rows && (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <label className="min-w-48 text-sm font-semibold">
              Search TLDs
              <input
                className={fieldClass}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <Button
              disabled={busy}
              onClick={() => {
                setEdit('new');
                setError('');
              }}
            >
              Add TLD
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setError('');
                void refresh().catch(() => {
                  setRows(undefined);
                  setError('TLD catalogue could not be refreshed.');
                });
              }}
            >
              Refresh catalogue
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[850px] text-left text-sm">
              <caption className="p-3 text-left">
                {filtered.length} domain extensions · Selling currency BDT ·
                One-year prices
              </caption>
              <thead className="bg-brand-700 text-white">
                <tr>
                  <th className="p-3">Select</th>
                  <th>TLD</th>
                  <th>Registration</th>
                  <th>Renewal</th>
                  <th>Preferred registrar</th>
                  <th>Status</th>
                  <th>Featured</th>
                  <th>Order</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Select .${row.tld}`}
                        checked={selected.has(row.id)}
                        onChange={(event) =>
                          setSelected((old) => {
                            const next = new Set(old);
                            if (event.target.checked) next.add(row.id);
                            else next.delete(row.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <th scope="row">.{row.tld}</th>
                    <td>
                      {row.registrationAmount
                        ? `BDT ${price(row.registrationAmount)}`
                        : 'Unavailable'}
                    </td>
                    <td>
                      {row.renewalAmount
                        ? `BDT ${price(row.renewalAmount)}`
                        : 'Unavailable'}
                    </td>
                    <td>{registrarName(row.preferredRegistrarId)}</td>
                    <td>
                      {row.enabled
                        ? 'Enabled'
                        : row.registrationSupported
                          ? 'Disabled'
                          : 'Unsupported draft'}
                    </td>
                    <td>{row.featured ? 'Yes' : 'No'}</td>
                    <td>{row.displayOrder}</td>
                    <td>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setEdit(row);
                          setError('');
                        }}
                      >
                        Pricing for .{row.tld}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filtered.length && (
            <p>No matching TLDs. Add an extension to configure pricing.</p>
          )}
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((old) => old - 1)}
            >
              Previous
            </Button>
            <p>
              Page {Math.min(page, pages)} of {pages}
            </p>
            <Button
              variant="secondary"
              disabled={page >= pages}
              onClick={() => setPage((old) => old + 1)}
            >
              Next
            </Button>
          </div>
          <Card title="Bulk management">
            <p className="mb-3 text-sm">
              Select up to 100 TLDs. Review the batch before applying; a stale
              revision rejects the entire batch. Historical prices are
              unchanged.
            </p>
            <div className="flex flex-wrap gap-3">
              <label>
                Action
                <select
                  className={fieldClass}
                  value={bulkAction}
                  onChange={(event) => setBulkAction(event.target.value)}
                >
                  <option value="disable">Disable registrations</option>
                  <option value="enable">Enable supported registrations</option>
                  <option value="registrar">Set preferred registrar</option>
                </select>
              </label>
              {bulkAction === 'registrar' && (
                <label>
                  Preferred registrar
                  <select
                    className={fieldClass}
                    value={bulkRegistrar}
                    onChange={(event) => setBulkRegistrar(event.target.value)}
                  >
                    <option value="">Use installation default</option>
                    {choices.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Button
                disabled={busy || selected.size === 0 || selected.size > 100}
                onClick={() => {
                  const entries = rows.filter((row) => selected.has(row.id));
                  setReview({
                    entries: entries.map(({ id, revision }) => ({
                      id,
                      revision,
                    })),
                    names: entries.map((row) => `.${row.tld}`).join(', '),
                    ...(bulkAction === 'registrar'
                      ? { preferredRegistrarId: bulkRegistrar || null }
                      : { enabled: bulkAction === 'enable' }),
                  });
                }}
              >
                Review selected TLDs
              </Button>
            </div>
          </Card>
          {edit && (
            <Card
              title={
                editing ? `Pricing for .${editing.tld}` : 'Add domain extension'
              }
            >
              <form
                key={editing?.revision ?? 'new'}
                onSubmit={(event) => void save(event)}
                className="grid gap-4 sm:grid-cols-2"
              >
                <Field
                  name="tld"
                  label="TLD"
                  defaultValue={editing?.tld ?? ''}
                  readOnly={Boolean(editing)}
                  required
                  maxLength={50}
                />
                <Field
                  name="registrationAmount"
                  label="One-year registration price (BDT)"
                  defaultValue={price(editing?.registrationAmount ?? null)}
                  placeholder="1500.00"
                />
                <Field
                  name="renewalAmount"
                  label="One-year renewal price (BDT)"
                  defaultValue={price(editing?.renewalAmount ?? null)}
                  placeholder="1600.00"
                />
                <label>
                  Preferred registrar
                  <select
                    className={fieldClass}
                    name="preferredRegistrarId"
                    aria-label="Preferred registrar"
                    defaultValue={editing?.preferredRegistrarId ?? ''}
                  >
                    <option value="">Use installation default</option>
                    {choices.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                    {editing?.preferredRegistrarId &&
                      !choices.some(
                        (account) =>
                          account.id === editing.preferredRegistrarId,
                      ) && (
                        <option value={editing.preferredRegistrarId}>
                          {registrarName(editing.preferredRegistrarId)}{' '}
                          (unavailable)
                        </option>
                      )}
                  </select>
                </label>
                <Field
                  name="displayOrder"
                  label="Display order"
                  type="number"
                  defaultValue={String(editing?.displayOrder ?? 0)}
                  required
                />
                <p>
                  Period: one year. Transfer and other periods: not supported.
                </p>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={editing?.enabled ?? false}
                  />
                  Offer registration
                </label>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    name="featured"
                    defaultChecked={editing?.featured ?? false}
                  />
                  Featured extension
                </label>
                <p className="text-sm sm:col-span-2">
                  Blank prices disable the corresponding sale; zero is not a
                  free registration. Changes create a new price revision and
                  require stale quotes to be reviewed again. Use Add TLD for a
                  different extension; existing extensions cannot be renamed.
                </p>
                <Button disabled={busy}>Save TLD pricing</Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setEdit(undefined)}
                >
                  Cancel
                </Button>
              </form>
            </Card>
          )}
        </>
      )}
      <ConfirmationDialog
        open={Boolean(review)}
        title="Apply TLD changes?"
        description={
          review
            ? `${review.names}: ${review.enabled !== undefined ? (review.enabled ? 'enable supported registrations' : 'disable registrations') : `preferred registrar: ${registrarName(review.preferredRegistrarId ?? null)}`}. ${review.entries.length} revisions will change together. Existing orders, invoices and execution choices are retained.`
            : ''
        }
        busy={busy}
        onClose={() => setReview(undefined)}
        onConfirm={() => {
          if (review) {
            const { names, ...changes } = review;
            void names;
            void write(
              () =>
                authMutation(`${base}/tlds/bulk`, 'POST', {
                  ...changes,
                  confirmation: 'Apply TLD changes',
                }),
              'Reviewed TLD batch applied.',
            );
          }
        }}
      />
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  notificationDefinition,
  sentenceCaseLabel,
  type notificationCatalog,
  type NotificationEntry,
  type NotificationPreferences,
} from '@webhost-billing/shared';
import {
  authenticatedGet,
  authenticatedPaginatedGet,
  authMutation,
} from '../../lib/auth-api';
import { Button } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { PageHeader } from '../ui/page-header';
import { RecordAction } from '../ui/record-dialog';
import { fieldClass } from '../customers/customer-fields';

type CatalogItem = (typeof notificationCatalog)[number];
type EmailEntry = {
  id: string;
  subjectSnapshot: string;
  status: string;
  provider: string | null;
  queuedAt: string;
  sentAt: string | null;
};
const tabs = [
  'Notification list',
  'Alert history',
  'Transactional email history',
] as const;
type Tab = (typeof tabs)[number];

export function NotificationManager() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>();
  const [tab, setTab] = useState<Tab>('Notification list');
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState('');
  const [entries, setEntries] = useState<NotificationEntry[]>([]);
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedGet<CatalogItem[]>('/notifications/catalog'),
      authenticatedGet<NotificationPreferences>('/notifications/preferences'),
    ])
      .then(([items, pref]) => {
        if (active) {
          setCatalog(items);
          setPreferences(pref);
        }
      })
      .catch(() => {
        if (active) setError('Notifications could not be loaded.');
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  useEffect(() => {
    if (tab === 'Notification list') return;
    let active = true;
    const query = new URLSearchParams({ page: String(page) });
    if (channel && tab === 'Alert history') query.set('channel', channel);
    const request =
      tab === 'Alert history'
        ? authenticatedPaginatedGet<NotificationEntry>(
            `/notifications?${query}`,
          )
        : authenticatedPaginatedGet<EmailEntry>(
            `/notifications/email-history?${query}`,
          );
    void request
      .then((result) => {
        if (!active) return;
        if (tab === 'Alert history')
          setEntries(result.data as NotificationEntry[]);
        else setEmails(result.data as EmailEntry[]);
        setTotal(result.pagination.totalItems);
        setPages(result.pagination.totalPages);
      })
      .catch(() => {
        if (active) setError('Notification history could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, page, channel, revision]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    const phone = String(form.get('phone') ?? '').trim();
    try {
      const result = await authMutation<NotificationPreferences>(
        '/notifications/preferences',
        'PATCH',
        {
          whatsAppEnabled: form.get('whatsAppEnabled') === 'on',
          ...(phone ? { phone } : {}),
        },
      );
      setPreferences(result);
      setNotice(
        'Notification preferences saved. Live delivery remains disabled.',
      );
    } catch {
      setError(
        'Preferences could not be saved. Use an international number beginning with + and try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  const columns: DataColumn<CatalogItem>[] = [
    {
      key: 'notification',
      header: 'Notification',
      render: (item) => item.label,
    },
    {
      key: 'trigger',
      header: 'When it is sent',
      render: (item) => item.description,
    },
    { key: 'email', header: 'Email', render: () => 'Yes' },
    {
      key: 'whatsapp',
      header: 'WhatsApp',
      render: (item) => (item.whatsApp ? 'Important alert' : '—'),
    },
  ];
  const historyColumns: DataColumn<NotificationEntry>[] = [
    {
      key: 'notification',
      header: 'Notification',
      render: (item) => notificationDefinition(item.key).label,
    },
    {
      key: 'channel',
      header: 'Channel',
      render: (item) => (item.channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) =>
        item.status === 'PREVIEWED'
          ? 'Local preview saved'
          : item.status === 'SUPPRESSED'
            ? 'Skipped'
            : sentenceCaseLabel(item.status),
    },
    {
      key: 'date',
      header: 'Created',
      render: (item) => new Date(item.createdAt).toLocaleString('en-GB'),
    },
    {
      key: 'action',
      header: 'Action',
      render: (item) => (
        <Link
          className="font-semibold text-brand-700 hover:underline"
          href={notificationDefinition(item.key).path}
        >
          View details
        </Link>
      ),
    },
  ];
  const emailColumns: DataColumn<EmailEntry>[] = [
    {
      key: 'subject',
      header: 'Subject',
      render: (item) => item.subjectSnapshot,
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) =>
        item.provider === 'preview' && item.status === 'SENT'
          ? 'Local preview saved'
          : sentenceCaseLabel(item.status),
    },
    {
      key: 'date',
      header: 'Queued',
      render: (item) => new Date(item.queuedAt).toLocaleString('en-GB'),
    },
  ];
  return (
    <div className="grid min-w-0 gap-5" aria-busy={loading || initialLoading}>
      <PageHeader
        title="Notifications"
        description="Email notifications and important WhatsApp alerts for your account."
        actions={
          preferences ? (
            <RecordAction
              label="Notification preferences"
              busy={saving}
              feedback={error || notice}
            >
              <form
                className="grid gap-4"
                onSubmit={(event) => void save(event)}
              >
                <label className="flex items-center gap-3 font-semibold">
                  <input
                    type="checkbox"
                    name="whatsAppEnabled"
                    defaultChecked={preferences.whatsAppEnabled}
                  />
                  Receive important WhatsApp alerts
                </label>
                <p className="text-sm text-slate-600">
                  Important alerts are automatic when a valid number is
                  available. Your current number:{' '}
                  {preferences.maskedPhone ?? 'Not available'}. Your account
                  phone is used when no separate number is saved.
                </p>
                <label className="grid gap-2 text-sm font-semibold">
                  WhatsApp number
                  <input
                    className={fieldClass}
                    name="phone"
                    type="tel"
                    placeholder="+8801…"
                    pattern="\+[1-9][0-9]{7,14}"
                    autoComplete="tel"
                  />
                </label>
                <p className="text-sm text-slate-600">
                  Leave the number blank to keep the current number. Turning
                  alerts off skips queued WhatsApp alerts. Email notifications
                  remain enabled.
                </p>
                <Button disabled={saving} type="submit">
                  {saving ? 'Saving…' : 'Save preferences'}
                </Button>
              </form>
            </RecordAction>
          ) : undefined
        }
      />
      {preferences ? (
        <p className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900">
          {preferences.deliveryMode === 'preview'
            ? 'Local preview only. This feature sends no external messages.'
            : 'New alert delivery is disabled. Alerts are recorded without sending. Existing transactional email uses its current email settings.'}
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <div className="flex flex-wrap gap-2" aria-label="Notification sections">
        {tabs.map((item) => (
          <Button
            key={item}
            variant={tab === item ? 'primary' : 'secondary'}
            aria-pressed={tab === item}
            onClick={() => {
              if (item === tab) return;
              setLoading(item !== 'Notification list');
              setTab(item);
              setPage(1);
              setError('');
            }}
          >
            {item}
          </Button>
        ))}
        <Button
          variant="secondary"
          onClick={() => {
            setInitialLoading(true);
            if (tab !== 'Notification list') setLoading(true);
            setRevision((value) => value + 1);
          }}
        >
          Refresh
        </Button>
      </div>
      {tab === 'Notification list' ? (
        <>
          {initialLoading ? <p role="status">Loading notifications…</p> : null}
          <p className="text-sm text-slate-600">
            WhatsApp is limited to the important events listed below, including
            new invoices and overdue notices.
          </p>
          <DataTable
            caption="Notification list"
            columns={columns}
            rows={catalog}
            rowKey={(item) => item.key}
          />
        </>
      ) : (
        <>
          {tab === 'Alert history' ? (
            <label className="grid max-w-xs gap-2 text-sm font-semibold">
              Channel
              <select
                className={fieldClass}
                value={channel}
                onChange={(event) => {
                  setLoading(true);
                  setChannel(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All channels</option>
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp</option>
              </select>
            </label>
          ) : null}
          <p className="text-sm text-slate-600">
            {loading
              ? 'Loading…'
              : `${total} records found. Page ${page} of ${Math.max(1, pages)}.`}
          </p>
          {tab === 'Alert history' ? (
            <DataTable
              caption="Alert history"
              columns={historyColumns}
              rows={entries}
              rowKey={(item) => item.id}
            />
          ) : (
            <DataTable
              caption="Transactional email history"
              columns={emailColumns}
              rows={emails}
              rowKey={(item) => item.id}
            />
          )}
          {!loading && total === 0 ? <p>No notifications yet.</p> : null}
          <p className="text-sm text-slate-600">
            Local previews are not delivery confirmations. Skipped alerts can
            mean a missing number, changed account details or alerts turned off.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={loading || page <= 1}
              onClick={() => {
                setLoading(true);
                setPage((value) => value - 1);
              }}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={loading || page >= pages}
              onClick={() => {
                setLoading(true);
                setPage((value) => value + 1);
              }}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

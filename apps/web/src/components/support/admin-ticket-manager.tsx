'use client';

import type {
  TicketDetail,
  TicketSetupOptions,
  TicketSummary,
} from '@webhost-billing/shared';
import { useEffect, useState, type FormEvent } from 'react';
import {
  authenticatedGet,
  authenticatedPaginatedGet,
  authMutation,
} from '../../lib/auth-api';
import { Button } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { EmptyState, LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import {
  fieldStyles,
  formatTicketDate,
  priorityTone,
  summaryFromDetail,
  TicketConversation,
  ticketError,
  ticketPriorities,
  ticketStatuses,
  ticketTone,
} from './support-ui';

const emptyOptions: TicketSetupOptions = { admins: [] };

export function AdminTicketManager() {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [options, setOptions] = useState(emptyOptions);
  const [selected, setSelected] = useState<TicketDetail>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedPaginatedGet<TicketSummary>('/tickets?pageSize=100'),
      authenticatedGet<TicketSetupOptions>('/tickets/setup-options'),
    ])
      .then(async ([ticketResult, setup]) => {
        if (!active) return;
        setTickets(ticketResult.data);
        setOptions(setup);
        const first = ticketResult.data[0];
        if (first) {
          const detail = await authenticatedGet<TicketDetail>(
            `/tickets/${first.id}`,
          );
          if (active) setSelected(detail);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(ticketError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const columns: DataColumn<TicketSummary>[] = [
    {
      key: 'ticket',
      header: 'Ticket',
      render: (ticket) => (
        <button
          type="button"
          className="text-left font-bold text-brand-700 hover:text-brand-900 hover:underline"
          onClick={() => void open(ticket.id)}
        >
          <span className="block text-xs uppercase tracking-wide">
            {ticket.ticketNumber}
          </span>
          <span className="mt-1 block text-slate-950">{ticket.subject}</span>
        </button>
      ),
    },
    {
      key: 'customer',
      header: 'Customer / service',
      render: (ticket) => (
        <div>
          <p className="font-semibold text-slate-900">{ticket.customer.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            {ticket.service?.domain ?? 'General support'}
          </p>
        </div>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (ticket) => (
        <div className="flex flex-col gap-2">
          <StatusBadge tone={ticketTone(ticket.status)}>
            {ticket.status.replaceAll('_', ' ')}
          </StatusBadge>
          <StatusBadge tone={priorityTone(ticket.priority)}>
            {ticket.priority}
          </StatusBadge>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Assigned to',
      render: (ticket) => ticket.assignee?.displayName ?? 'Unassigned',
    },
    {
      key: 'activity',
      header: 'Last reply',
      render: (ticket) => (
        <div>
          <p>{formatTicketDate(ticket.lastReplyAt)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {ticket.messageCount} messages
          </p>
        </div>
      ),
    },
  ];

  async function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const query = new URLSearchParams({ pageSize: '100' });
    for (const key of ['search', 'status', 'priority', 'assignedAdminId']) {
      const value = String(values.get(key) ?? '');
      if (value) query.set(key, value);
    }
    if (values.get('unassigned') === 'on') query.set('unassigned', 'true');
    setLoading(true);
    clearMessages();
    try {
      const result = await authenticatedPaginatedGet<TicketSummary>(
        `/tickets?${query.toString()}`,
      );
      setTickets(result.data);
      const first = result.data[0];
      setSelected(
        first
          ? await authenticatedGet<TicketDetail>(`/tickets/${first.id}`)
          : undefined,
      );
    } catch (caught) {
      setError(ticketError(caught));
    } finally {
      setLoading(false);
    }
  }

  async function open(ticketId: string) {
    clearMessages();
    try {
      setSelected(await authenticatedGet<TicketDetail>(`/tickets/${ticketId}`));
    } catch (caught) {
      setError(ticketError(caught));
    }
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const values = new FormData(event.currentTarget);
    setSaving(true);
    clearMessages();
    try {
      const assignedAdminId = String(values.get('assignedAdminId') ?? '');
      const updated = await authMutation<TicketDetail>(
        `/tickets/${selected.id}`,
        'PATCH',
        {
          status: String(values.get('status')),
          priority: String(values.get('priority')),
          assignedAdminId: assignedAdminId || null,
        },
      );
      replace(updated);
      setNotice('Ticket assignment, priority, and status were saved.');
    } catch (caught) {
      setError(ticketError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const body = String(new FormData(form).get('body'));
    setSaving(true);
    clearMessages();
    try {
      const updated = await authMutation<TicketDetail>(
        `/tickets/${selected.id}/replies`,
        'POST',
        { submissionKey: crypto.randomUUID(), body },
      );
      replace(updated);
      form.reset();
      setNotice('Reply added. A customer email notification was queued.');
    } catch (caught) {
      setError(ticketError(caught));
    } finally {
      setSaving(false);
    }
  }

  function replace(ticket: TicketDetail) {
    setSelected(ticket);
    setTickets((current) =>
      current.map((candidate) =>
        candidate.id === ticket.id ? summaryFromDetail(ticket) : candidate,
      ),
    );
  }

  function clearMessages() {
    setError('');
    setNotice('');
  }

  if (loading) return <LoadingState label="Loading the support queue" />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administrator"
        title="Support queue"
        description="Filter customer requests, assign ownership, set priority, and keep every status change auditable."
      />
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
        </p>
      ) : null}

      <form
        onSubmit={filter}
        className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end"
      >
        <label className="text-sm font-semibold text-slate-700">
          Search queue
          <input
            name="search"
            className={fieldStyles}
            placeholder="Ticket, subject, customer, or domain"
          />
        </label>
        <FilterSelect name="status" label="Status" values={ticketStatuses} />
        <FilterSelect
          name="priority"
          label="Priority"
          values={ticketPriorities}
        />
        <label className="text-sm font-semibold text-slate-700">
          Assigned to
          <select
            name="assignedAdminId"
            className={fieldStyles}
            defaultValue=""
          >
            <option value="">Any administrator</option>
            {options.admins.map((admin) => (
              <option key={admin.userId} value={admin.userId}>
                {admin.displayName}
              </option>
            ))}
          </select>
          <span className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-600">
            <input name="unassigned" type="checkbox" /> Unassigned only
          </span>
        </label>
        <Button type="submit">Apply filters</Button>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {tickets.length ? (
          <DataTable
            caption="Filtered support tickets"
            columns={columns}
            rows={tickets}
            rowKey={(ticket) => ticket.id}
          />
        ) : (
          <div className="p-6">
            <EmptyState
              title="No matching tickets"
              description="Change the filters to inspect another part of the support queue."
            />
          </div>
        )}
      </section>

      <TicketConversation
        ticket={selected}
        saving={saving}
        onReply={reply}
        controls={
          selected ? (
            <form
              key={`${selected.id}-${selected.updatedAt}`}
              onSubmit={update}
              className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3 md:items-end"
            >
              <FilterSelect
                name="assignedAdminId"
                label="Assign administrator"
                values={options.admins.map((admin) => admin.userId)}
                labels={Object.fromEntries(
                  options.admins.map((admin) => [
                    admin.userId,
                    admin.displayName,
                  ]),
                )}
                emptyLabel="Unassigned"
                defaultValue={selected.assignee?.userId ?? ''}
              />
              <FilterSelect
                name="priority"
                label="Priority"
                values={ticketPriorities}
                defaultValue={selected.priority}
              />
              <FilterSelect
                name="status"
                label="Status"
                values={ticketStatuses}
                defaultValue={selected.status}
              />
              <div className="md:col-span-3 flex justify-end">
                <Button disabled={saving} type="submit">
                  {saving ? 'Saving…' : 'Save ticket controls'}
                </Button>
              </div>
            </form>
          ) : null
        }
      />
    </div>
  );
}

function FilterSelect({
  name,
  label,
  values,
  labels = {},
  emptyLabel = 'Any',
  defaultValue = '',
}: {
  name: string;
  label: string;
  values: readonly string[];
  labels?: Record<string, string>;
  emptyLabel?: string;
  defaultValue?: string;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <select name={name} className={fieldStyles} defaultValue={defaultValue}>
        <option value="">{emptyLabel}</option>
        {values.map((value) => (
          <option key={value} value={value}>
            {labels[value] ?? value.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    </label>
  );
}

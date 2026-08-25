'use client';

import type {
  Service,
  TicketDetail,
  TicketSummary,
} from '@webhost-billing/shared';
import { useEffect, useState, type FormEvent } from 'react';
import {
  authenticatedGet,
  authenticatedPaginatedGet,
  authMutation,
} from '../../lib/auth-api';
import { Button } from '../ui/button';
import { EmptyState, LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import {
  fieldStyles,
  summaryFromDetail,
  TicketConversation,
  ticketError,
  TicketListButton,
} from './support-ui';

export function CustomerTicketManager() {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<TicketDetail>();
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedPaginatedGet<TicketSummary>('/tickets/my?pageSize=100'),
      authenticatedPaginatedGet<Service>('/services/my?pageSize=100'),
    ])
      .then(async ([ticketResult, serviceResult]) => {
        if (!active) return;
        setTickets(ticketResult.data);
        setServices(serviceResult.data);
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

  async function open(ticketId: string) {
    clearMessages();
    try {
      setSelected(await authenticatedGet<TicketDetail>(`/tickets/${ticketId}`));
    } catch (caught) {
      setError(ticketError(caught));
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    clearMessages();
    try {
      const serviceId = String(values.get('serviceId') ?? '');
      const created = await authMutation<TicketDetail>('/tickets', 'POST', {
        submissionKey: crypto.randomUUID(),
        subject: String(values.get('subject')),
        body: String(values.get('body')),
        serviceId: serviceId || null,
      });
      setTickets((current) => [
        summaryFromDetail(created),
        ...current.filter((ticket) => ticket.id !== created.id),
      ]);
      setSelected(created);
      form.reset();
      setShowCreate(false);
      setNotice(`${created.ticketNumber} was opened.`);
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
      setNotice('Your reply was added and the support team was notified.');
    } catch (caught) {
      setError(ticketError(caught));
    } finally {
      setSaving(false);
    }
  }

  function replace(ticket: TicketDetail) {
    setSelected(ticket);
    setTickets((current) => [
      summaryFromDetail(ticket),
      ...current.filter((candidate) => candidate.id !== ticket.id),
    ]);
  }

  function clearMessages() {
    setError('');
    setNotice('');
  }

  if (loading) return <LoadingState label="Loading support tickets" />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Customer portal"
        title="Support tickets"
        description="Open a focused support request and keep every reply connected to the right hosting service."
        actions={
          <Button onClick={() => setShowCreate((current) => !current)}>
            {showCreate ? 'Cancel new ticket' : 'Open ticket'}
          </Button>
        }
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

      {showCreate ? (
        <form
          onSubmit={create}
          className="rounded-2xl border border-brand-200 bg-brand-50/60 p-5 shadow-sm sm:p-6"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">
              Subject
              <input
                required
                name="subject"
                maxLength={200}
                className={fieldStyles}
                placeholder="Briefly describe the problem"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Hosting service (optional)
              <select name="serviceId" className={fieldStyles} defaultValue="">
                <option value="">General support</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.productName} · {service.domain ?? 'No domain'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-4 block text-sm font-semibold text-slate-700">
            What can we help with?
            <textarea
              required
              name="body"
              rows={5}
              maxLength={10_000}
              className={fieldStyles}
              placeholder="Include steps, timing, and any safe error text. Never include a password or API key."
            />
          </label>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              Plain text only. Attachments, HTML, passwords, and secret keys are
              not accepted.
            </p>
            <Button disabled={saving} type="submit">
              {saving ? 'Opening…' : 'Open support ticket'}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="space-y-3" aria-label="Your tickets">
          {tickets.length ? (
            tickets.map((ticket) => (
              <TicketListButton
                key={ticket.id}
                ticket={ticket}
                selected={selected?.id === ticket.id}
                onClick={() => void open(ticket.id)}
              />
            ))
          ) : (
            <EmptyState
              title="No support tickets"
              description="Open a ticket when you need help with your hosting service or account."
            />
          )}
        </aside>
        <TicketConversation ticket={selected} saving={saving} onReply={reply} />
      </div>
    </div>
  );
}

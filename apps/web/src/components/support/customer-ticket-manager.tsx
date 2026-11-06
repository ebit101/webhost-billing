'use client';

import { sentenceCaseLabel } from '@webhost-billing/shared';
import { TicketAttachmentInput } from './ticket-attachments';
import { RecordDialog } from '../ui/record-dialog';
import { DataTable } from '../ui/data-table';
import type {
  Service,
  SupportDepartmentOption,
  TicketDetail,
  TicketSummary,
} from '@webhost-billing/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  authenticatedGet,
  authenticatedPaginatedGet,
  authMutation,
} from '../../lib/auth-api';
import {
  uploadTicketAttachments,
  clearTicketUploadDraft,
} from '../../lib/ticket-attachment-upload';
import { Button } from '../ui/button';
import { EmptyState, LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import {
  fieldStyles,
  summaryFromDetail,
  TicketConversation,
  ticketError,
  formatTicketDate,
  ticketTone,
} from './support-ui';

export function CustomerTicketManager() {
  const createKey = useRef<string | undefined>(undefined);
  const replyKeys = useRef(new Map<string, string>());
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [departments, setDepartments] = useState<SupportDepartmentOption[]>([]);
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
      authenticatedGet<SupportDepartmentOption[]>('/tickets/departments'),
    ])
      .then(async ([ticketResult, serviceResult, departmentResult]) => {
        if (!active) return;
        setTickets(ticketResult.data);
        setServices(serviceResult.data);
        setDepartments(departmentResult);
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
      const submissionKey = createKey.current ?? crypto.randomUUID();
      createKey.current = submissionKey;
      const departmentId = String(values.get('departmentId'));
      const attachmentIds = await uploadTicketAttachments(
        form,
        submissionKey,
        undefined,
        departmentId,
      );
      const created = await authMutation<TicketDetail>('/tickets', 'POST', {
        submissionKey,
        ...(attachmentIds.length ? { attachmentIds } : {}),
        departmentId: String(values.get('departmentId')),
        subject: String(values.get('subject')),
        body: String(values.get('body')),
        serviceId: serviceId || null,
      });
      setTickets((current) => [
        summaryFromDetail(created),
        ...current.filter((ticket) => ticket.id !== created.id),
      ]);
      setSelected(created);
      clearTicketUploadDraft(submissionKey);
      createKey.current = undefined;
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
      const submissionKey =
        replyKeys.current.get(selected.id) ?? crypto.randomUUID();
      replyKeys.current.set(selected.id, submissionKey);
      const attachmentIds = await uploadTicketAttachments(
        form,
        submissionKey,
        selected.id,
      );
      const updated = await authMutation<TicketDetail>(
        `/tickets/${selected.id}/replies`,
        'POST',
        {
          submissionKey,
          body,
          ...(attachmentIds.length ? { attachmentIds } : {}),
        },
      );
      replace(updated);
      clearTicketUploadDraft(submissionKey);
      replyKeys.current.delete(selected.id);
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

      <RecordDialog
        open={showCreate}
        title="Open support ticket"
        busy={saving}
        feedback={error || notice}
        onClose={() => setShowCreate(false)}
      >
        <form
          onSubmit={create}
          className="rounded-2xl border border-brand-200 bg-brand-50/60 p-5 shadow-sm sm:p-6"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">
              Department
              <select
                name="departmentId"
                required
                className={fieldStyles}
                defaultValue={departments[0]?.id ?? ''}
              >
                <option value="" disabled>
                  Choose a department
                </option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
              {!departments.length && (
                <span>
                  No departments are currently open. Existing conversations
                  remain available.
                </span>
              )}
            </label>
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
          <div className="mt-4">
            <TicketAttachmentInput disabled={saving} />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              Plain text only. Do not include HTML, passwords or secret keys.
            </p>
            <Button disabled={saving || !departments.length} type="submit">
              {saving ? 'Opening…' : 'Open support ticket'}
            </Button>
          </div>
        </form>
      </RecordDialog>

      <p className="text-sm text-slate-600">
        Latest {tickets.length} tickets · Up to 100 records
      </p>
      {tickets.length ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <DataTable
            caption="Your tickets"
            rows={tickets}
            rowKey={(ticket) => ticket.id}
            columns={[
              {
                key: 'number',
                header: 'Ticket',
                render: (ticket) => (
                  <button
                    type="button"
                    onClick={() => void open(ticket.id)}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    {ticket.ticketNumber}
                  </button>
                ),
              },
              {
                key: 'department',
                header: 'Department',
                render: (ticket) => ticket.department.name,
              },
              {
                key: 'subject',
                header: 'Subject',
                render: (ticket) => ticket.subject,
              },
              {
                key: 'status',
                header: 'Status',
                render: (ticket) => (
                  <span
                    className={
                      ticketTone(ticket.status) === 'success'
                        ? 'text-emerald-700'
                        : 'text-slate-700'
                    }
                  >
                    {sentenceCaseLabel(ticket.status)}
                  </span>
                ),
              },
              {
                key: 'service',
                header: 'Service',
                render: (ticket) => ticket.service?.domain ?? 'General support',
              },
              {
                key: 'reply',
                header: 'Last reply',
                render: (ticket) => formatTicketDate(ticket.lastReplyAt),
              },
              {
                key: 'messages',
                header: 'Messages',
                render: (ticket) => ticket.messageCount,
              },
            ]}
          />
        </div>
      ) : (
        <EmptyState
          title="No support tickets"
          description="Open a ticket when you need help with your hosting service or account."
        />
      )}
      {selected ? (
        <RecordDialog
          open
          title={selected.ticketNumber}
          busy={saving}
          feedback={error || notice}
          onClose={() => setSelected(undefined)}
        >
          <TicketConversation
            ticket={selected}
            saving={saving}
            onReply={reply}
          />
        </RecordDialog>
      ) : null}
    </div>
  );
}

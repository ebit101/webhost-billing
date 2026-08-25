import type {
  TicketDetail,
  TicketPriority,
  TicketStatus,
  TicketSummary,
} from '@webhost-billing/shared';
import type { FormEvent, ReactNode } from 'react';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/feedback-state';
import { StatusBadge, type StatusTone } from '../ui/status-badge';

export const fieldStyles =
  'mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

export const ticketStatuses: TicketStatus[] = [
  'OPEN',
  'WAITING_FOR_STAFF',
  'WAITING_FOR_CUSTOMER',
  'CLOSED',
];

export const ticketPriorities: TicketPriority[] = [
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT',
];

export function ticketTone(status: TicketStatus): StatusTone {
  if (status === 'CLOSED') return 'neutral';
  if (status === 'WAITING_FOR_CUSTOMER') return 'info';
  if (status === 'WAITING_FOR_STAFF') return 'warning';
  return 'success';
}

export function priorityTone(priority: TicketPriority): StatusTone {
  if (priority === 'URGENT') return 'danger';
  if (priority === 'HIGH') return 'warning';
  if (priority === 'LOW') return 'neutral';
  return 'info';
}

export function formatTicketDate(value: string | null): string {
  if (!value) return 'No reply yet';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ticketError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The support request could not be completed.';
}

export function summaryFromDetail(ticket: TicketDetail): TicketSummary {
  const { messages, ...summary } = ticket;
  void messages;
  return summary;
}

export function TicketListButton({
  ticket,
  selected,
  onClick,
}: {
  ticket: TicketSummary;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-2xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
        selected
          ? 'border-brand-400 bg-brand-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-brand-200 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-700">
            {ticket.ticketNumber}
          </p>
          <p className="mt-1 truncate font-bold text-slate-950">
            {ticket.subject}
          </p>
        </div>
        <StatusBadge tone={ticketTone(ticket.status)}>
          {ticket.status.replaceAll('_', ' ')}
        </StatusBadge>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>{ticket.messageCount} messages</span>
        <span>{formatTicketDate(ticket.lastReplyAt)}</span>
      </div>
    </button>
  );
}

export function TicketConversation({
  ticket,
  saving,
  onReply,
  controls,
}: {
  ticket?: TicketDetail;
  saving: boolean;
  onReply: (event: FormEvent<HTMLFormElement>) => void;
  controls?: ReactNode;
}) {
  if (!ticket) {
    return (
      <EmptyState
        title="Select a ticket"
        description="Choose a support conversation to read its complete history."
      />
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/70 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
              {ticket.ticketNumber}
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">
              {ticket.subject}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {ticket.service
                ? `${ticket.service.productName} · ${ticket.service.domain ?? 'No domain'}`
                : 'General support · no hosting service linked'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={priorityTone(ticket.priority)}>
              {ticket.priority} PRIORITY
            </StatusBadge>
            <StatusBadge tone={ticketTone(ticket.status)}>
              {ticket.status.replaceAll('_', ' ')}
            </StatusBadge>
          </div>
        </div>
        {controls}
      </div>

      <ol aria-label="Ticket conversation" className="space-y-4 p-5 sm:p-6">
        {ticket.messages.map((message) => (
          <li
            key={message.id}
            className={`max-w-[92%] rounded-2xl border p-4 sm:max-w-[82%] ${
              message.kind === 'ADMIN'
                ? 'ml-auto border-brand-200 bg-brand-50'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-950">
                {message.authorName}
              </p>
              <p className="text-xs text-slate-500">
                {formatTicketDate(message.createdAt)}
              </p>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
              {message.body}
            </p>
          </li>
        ))}
      </ol>

      <div className="border-t border-slate-200 p-5 sm:p-6">
        {ticket.status === 'CLOSED' ? (
          <p className="rounded-xl bg-slate-100 p-4 text-sm font-semibold text-slate-700">
            This ticket is closed. An administrator must reopen it before a new
            reply can be added.
          </p>
        ) : (
          <form onSubmit={onReply} className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              Reply in plain text
              <textarea
                required
                name="body"
                rows={4}
                maxLength={10_000}
                className={fieldStyles}
                placeholder="Write a clear reply without passwords or secret keys."
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Attachments and HTML are not accepted in this release.
              </p>
              <Button disabled={saving} type="submit">
                {saving ? 'Sending…' : 'Send reply'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

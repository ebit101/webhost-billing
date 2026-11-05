'use client';

import type {
  SupportDepartment,
  TicketAssignee,
} from '@webhost-billing/shared';
import { useState, type FormEvent } from 'react';
import { authMutation } from '../../lib/auth-api';
import { Button } from '../ui/button';
import { fieldStyles, ticketError } from './support-ui';

export function SupportDepartmentManager({
  departments,
  admins,
  onSaved,
}: {
  departments: SupportDepartment[];
  admins: TicketAssignee[];
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<SupportDepartment | null>();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setFeedback('');
    try {
      await authMutation(
        `/tickets/departments${editing ? `/${editing.id}` : ''}`,
        editing ? 'PATCH' : 'POST',
        {
          name: String(values.get('name')),
          enabled: values.get('enabled') === 'on',
          customerVisible: values.get('customerVisible') === 'on',
          restricted: values.get('restricted') === 'on',
          memberUserIds: values.getAll('memberUserIds').map(String),
          reason: String(values.get('reason')),
          ...(editing ? { revision: editing.revision } : {}),
        },
      );
      await onSaved();
      setEditing(undefined);
      setFeedback('Department saved.');
    } catch (error) {
      setFeedback(ticketError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-5">
      <summary className="cursor-pointer font-semibold">
        Manage departments
      </summary>
      <p className="my-3 text-sm text-slate-600">
        Full administrators retain access. Restricted departments allow only
        selected support staff. Disabling a department stops new tickets and
        routing; existing conversations remain available. Assignment always
        requires department access.
      </p>
      <div className="flex flex-wrap gap-2">
        {departments.map((department) => (
          <Button
            key={department.id}
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setEditing(department);
              setFeedback('');
            }}
          >
            {department.name}
            {department.enabled ? '' : ' (disabled)'}
          </Button>
        ))}
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            setEditing(null);
            setFeedback('');
          }}
        >
          Add department
        </Button>
      </div>
      {feedback && (
        <p role="status" className="mt-3 text-sm">
          {feedback}
        </p>
      )}
      {editing !== undefined && (
        <form
          key={editing?.id ?? 'new'}
          onSubmit={save}
          className="mt-4 space-y-3"
        >
          <label className="block text-sm font-semibold">
            Department name
            <input
              required
              name="name"
              maxLength={80}
              defaultValue={editing?.name ?? ''}
              className={fieldStyles}
            />
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={editing?.enabled ?? true}
            />
            Enabled for new tickets and routing
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              name="customerVisible"
              defaultChecked={editing?.customerVisible ?? true}
            />
            Customers can choose this department
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              name="restricted"
              defaultChecked={editing?.restricted ?? false}
            />
            Restrict staff access to selected members
          </label>
          <fieldset className="space-y-2">
            <legend className="font-semibold">Department members</legend>
            {admins.map((admin) => (
              <label className="flex gap-2" key={admin.userId}>
                <input
                  type="checkbox"
                  name="memberUserIds"
                  value={admin.userId}
                  defaultChecked={
                    editing?.memberUserIds.includes(admin.userId) ?? false
                  }
                />
                {admin.displayName}
              </label>
            ))}
          </fieldset>
          <label className="block text-sm font-semibold">
            Support reason
            <input
              required
              name="reason"
              maxLength={500}
              className={fieldStyles}
            />
          </label>
          <div className="flex gap-2">
            <Button disabled={busy} type="submit">
              Save department
            </Button>
            <Button
              disabled={busy}
              type="button"
              variant="secondary"
              onClick={() => setEditing(undefined)}
            >
              Discard changes
            </Button>
          </div>
        </form>
      )}
    </details>
  );
}

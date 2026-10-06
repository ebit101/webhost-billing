'use client';

import {
  staffAccountListSchema,
  staffRoleLabels,
  staffRoleSchema,
  createStaffRequestSchema,
  updateStaffRequestSchema,
  type StaffAccount,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { AuthForm, Field, FormNotice } from '../auth/form-controls';
import { Button } from '../ui/button';
import { PageHeader } from '../ui/page-header';
import { LoadingState } from '../ui/feedback-state';

export function StaffManager({
  currentUserId,
  twoFactorEnabled,
}: {
  currentUserId: string;
  twoFactorEnabled: boolean;
}) {
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pendingWrite = useRef(false);
  useEffect(() => {
    let active = true;
    void authenticatedGet<unknown>('/staff')
      .then((data) => {
        const parsed = staffAccountListSchema.parse(data);
        if (new Set(parsed.map((entry) => entry.id)).size !== parsed.length)
          throw new Error('Invalid staff list');
        if (active) {
          setAccounts(parsed);
          setError('');
        }
      })
      .catch(() => {
        if (active) setError('Administrator accounts could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);

  async function mutate(
    path: string,
    method: 'POST' | 'PATCH',
    body?: Record<string, unknown>,
  ): Promise<boolean> {
    if (pendingWrite.current || !twoFactorEnabled) return false;
    pendingWrite.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await authMutation<unknown>(path, method, body);
      setNotice(
        path.endsWith('/invitation') || (path === '/staff' && method === 'POST')
          ? 'Invitation emails queued. The staff member must verify their email, set a password and enroll in two-factor authentication.'
          : 'Administrator access updated. Existing sessions were revoked.',
      );
      // Refresh is a separate read. A failed refresh must never retry the write.
      setLoading(true);
      setAccounts([]);
      setRevision((value) => value + 1);
      return true;
    } catch {
      setError(
        'The change could not be confirmed. Refresh the account list before trying again.',
      );
      return false;
    } finally {
      pendingWrite.current = false;
      setBusy(false);
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = createStaffRequestSchema.safeParse(
      Object.fromEntries(new FormData(form)),
    );
    if (!input.success) {
      setError('Enter a valid name, email and staff role.');
      return;
    }
    if (await mutate('/staff', 'POST', input.data)) form.reset();
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Administration"
        title="Administrators"
        description="Give each staff member an individual account with the access their job needs."
      />
      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        Billing operators manage invoices and verified manual payments, but
        cannot refund, reverse payments, change settings or operate hosting.
        Support operators manage the single support queue only. Full
        administrators manage all operations and staff.
      </p>
      {!twoFactorEnabled ? (
        <p role="alert">
          Enable{' '}
          <Link href="/account" className="underline">
            two-factor authentication
          </Link>{' '}
          before making staff changes.
        </p>
      ) : null}
      <FormNotice error={error || undefined} message={notice || undefined} />
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold">Invite administrator</h2>
        <AuthForm onSubmit={(event) => void invite(event)}>
          <Field
            label="Display name"
            name="displayName"
            maxLength={150}
            required
          />
          <Field
            label="Email"
            name="email"
            type="email"
            maxLength={320}
            required
          />
          <RoleField defaultValue="SUPPORT_OPERATOR" />
          <Button type="submit" disabled={busy || !twoFactorEnabled}>
            Send invitation
          </Button>
        </AuthForm>
      </section>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Administrator accounts</h2>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setLoading(true);
            setAccounts([]);
            setRevision((value) => value + 1);
          }}
        >
          Refresh accounts
        </Button>
      </div>
      {loading ? (
        <LoadingState label="Loading administrator accounts" />
      ) : (
        accounts.map((account) => (
          <section
            key={`${account.id}:${account.staffRole}:${account.status}:${account.displayName}`}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <h3 className="break-all font-bold">{account.email}</h3>
            <p className="my-3 text-sm text-slate-600">
              {account.status === 'PENDING_VERIFICATION'
                ? 'Invitation pending'
                : account.status === 'DISABLED'
                  ? 'Disabled'
                  : account.status === 'SUSPENDED'
                    ? 'Suspended'
                    : 'Active'}{' '}
              ·{' '}
              {account.twoFactorEnabled
                ? 'Two-factor enabled'
                : 'Two-factor not enrolled'}
            </p>
            <AuthForm
              onSubmit={(event) => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                const parsed = updateStaffRequestSchema.safeParse({
                  displayName: values.get('displayName'),
                  staffRole: values.get('staffRole'),
                  enabled: values.get('enabled') === 'on',
                });
                if (!parsed.success) {
                  setError('Enter a valid display name and role.');
                  return;
                }
                if (
                  !window.confirm(
                    `Save access changes for ${account.email}? Existing sessions will be revoked.`,
                  )
                )
                  return;
                void mutate(`/staff/${account.id}`, 'PATCH', parsed.data);
              }}
            >
              <Field
                label="Display name"
                name="displayName"
                defaultValue={account.displayName}
                maxLength={150}
                required
              />
              <RoleField
                defaultValue={account.staffRole}
                ownAccount={account.id === currentUserId}
              />
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={account.status !== 'DISABLED'}
                  disabled={account.id === currentUserId}
                />
                Account enabled
              </label>
              {account.id === currentUserId ? (
                <input type="hidden" name="enabled" value="on" />
              ) : null}
              <Button
                type="submit"
                disabled={
                  busy || !twoFactorEnabled || account.id === currentUserId
                }
              >
                Save access
              </Button>
            </AuthForm>
            {account.status === 'PENDING_VERIFICATION' ? (
              <Button
                className="mt-4"
                variant="secondary"
                disabled={busy || !twoFactorEnabled}
                onClick={() => {
                  if (
                    window.confirm(
                      `Resend invitation emails to ${account.email}? Previous links will expire.`,
                    )
                  )
                    void mutate(`/staff/${account.id}/invitation`, 'POST');
                }}
              >
                Resend invitation
              </Button>
            ) : null}
            {account.id === currentUserId ? (
              <p className="mt-3 text-sm text-slate-600">
                You cannot disable or demote your own account.
              </p>
            ) : null}
          </section>
        ))
      )}
    </div>
  );
}

function RoleField({
  defaultValue,
  ownAccount = false,
}: {
  defaultValue: StaffAccount['staffRole'];
  ownAccount?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      Administrator role
      <select
        name="staffRole"
        defaultValue={defaultValue}
        className="h-11 rounded-xl border border-slate-300 bg-white px-3"
      >
        {staffRoleSchema.options.map((role) => (
          <option
            key={role}
            value={role}
            disabled={ownAccount && role !== 'FULL_ADMINISTRATOR'}
          >
            {staffRoleLabels[role]}
          </option>
        ))}
      </select>
    </label>
  );
}

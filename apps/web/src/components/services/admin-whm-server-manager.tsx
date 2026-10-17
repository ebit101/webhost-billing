'use client';

import type {
  ManagedCpanelServer,
  HostingPanelOperationResult,
} from '@webhost-billing/shared';
import {
  useEffect,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
} from 'react';
import { authMutation, authenticatedGet } from '../../lib/auth-api';
import { fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { EmptyState, LoadingState } from '../ui/feedback-state';
import { serviceError } from './service-ui';

export function AdminWhmServerManager() {
  const [servers, setServers] = useState<ManagedCpanelServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    setServers(
      await authenticatedGet<ManagedCpanelServer[]>('/hosting-panel/servers'),
    );
  }

  useEffect(() => {
    let active = true;
    void authenticatedGet<ManagedCpanelServer[]>('/hosting-panel/servers')
      .then((items) => {
        if (active) setServers(items);
      })
      .catch((caught: unknown) => {
        if (active) setError(serviceError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const message = await action();
      await refresh();
      setNotice(message);
    } catch (caught) {
      setError(serviceError(caught));
    } finally {
      setBusy(false);
    }
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    void run(async () => {
      await authMutation<ManagedCpanelServer>(
        '/hosting-panel/servers',
        'POST',
        {
          name: String(values.get('name')),
          hostname: String(values.get('hostname')),
          port: Number(values.get('port')),
          apiUsername: String(values.get('apiUsername')),
          apiToken: String(values.get('apiToken')),
          maxAccounts: capacity(values.get('maxAccounts')),
        },
      );
      form.reset();
      return 'Server saved as disabled. Test its connection before activating it.';
    });
  }

  function edit(
    event: FormEvent<HTMLFormElement>,
    server: ManagedCpanelServer,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const token = String(values.get('apiToken') ?? '');
    void run(async () => {
      const updated = await authMutation<ManagedCpanelServer>(
        `/hosting-panel/servers/${server.server.id}`,
        'PATCH',
        {
          name: String(values.get('name')),
          hostname: String(values.get('hostname')),
          port: Number(values.get('port')),
          apiUsername: String(values.get('apiUsername')),
          maxAccounts: capacity(values.get('maxAccounts')),
          status:
            token &&
            server.server.status === 'ACTIVE' &&
            values.get('status') === 'ACTIVE'
              ? 'MAINTENANCE'
              : String(values.get('status')),
          ...(token ? { apiToken: token } : {}),
        },
      );
      const tokenInput = form.elements.namedItem('apiToken');
      if (tokenInput instanceof HTMLInputElement) tokenInput.value = '';
      return updated.server.status === 'MAINTENANCE' && token
        ? 'Token rotated. Test the new connection, then reactivate the server.'
        : 'Server changes saved.';
    });
  }

  function test(server: ManagedCpanelServer) {
    void run(async () => {
      const result = await authMutation<HostingPanelOperationResult>(
        `/hosting-panel/servers/${server.server.id}/test`,
        'POST',
        { submissionKey: crypto.randomUUID() },
      );
      if (result.operation.status !== 'SUCCEEDED') {
        throw new Error(
          result.operation.errorMessage ?? 'The connection test failed.',
        );
      }
      return 'Connection test passed. You can activate the server.';
    });
  }

  function remove(server: ManagedCpanelServer) {
    const confirmation = window.prompt(
      `Remove ${server.server.name}? Type REMOVE_SERVER to confirm. Active or unresolved accounts block removal.`,
    );
    if (confirmation !== 'REMOVE_SERVER') return;
    void run(async () => {
      await authMutation<{ removed: true }>(
        `/hosting-panel/servers/${server.server.id}`,
        'DELETE',
        { confirmation },
      );
      return 'Server removed. Historical service and operation records were preserved.';
    });
  }

  if (loading) return <LoadingState label="Loading WHM servers" />;

  return (
    <div className="grid gap-6">
      <header>
        <p className="text-sm font-semibold text-brand-700">Administrator</p>
        <h1 className="text-2xl font-bold text-slate-950">
          cPanel and WHM servers
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Add a WHM server with a scoped API token, test it, then activate it
          for paid hosting orders. A disabled server cannot run panel actions.
          Maintenance stops new accounts while allowing existing account
          management.
        </p>
      </header>
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
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold text-slate-950">Add WHM server</h2>
        <p className="mt-1 text-sm text-slate-600">
          Saving a server does not connect to WHM or create an account. The
          token is encrypted and never displayed again.
        </p>
        <form
          onSubmit={add}
          className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          <Field label="Server name" name="name" required />
          <Field
            label="WHM hostname"
            name="hostname"
            required
            placeholder="whm.example.com"
          />
          <PortField />
          <Field
            label="WHM username"
            name="apiUsername"
            required
            autoComplete="username"
          />
          <Field
            label="WHM API token"
            name="apiToken"
            required
            type="password"
            minLength={20}
            maxLength={512}
            autoComplete="new-password"
          />
          <Field
            label="Maximum accounts (optional)"
            name="maxAccounts"
            type="number"
            min={1}
          />
          <div className="md:col-span-2 xl:col-span-3">
            <Button type="submit" disabled={busy}>
              Add disabled server
            </Button>
          </div>
        </form>
      </section>
      <section className="grid gap-4">
        <h2 className="text-lg font-bold text-slate-950">Configured servers</h2>
        {servers.length ? (
          servers.map((server) => (
            <div
              key={server.server.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-950">
                    {server.server.name}
                  </h3>
                  <p className="text-sm text-slate-600">
                    {server.server.hostname} · {server.assignedServiceCount}{' '}
                    historical services · Token{' '}
                    {server.credentialConfigured ? 'configured' : 'missing'}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {statusLabel(server.server.status)}
                </span>
              </div>
              <form
                key={`${server.server.id}:${server.server.status}:${server.server.name}:${server.server.hostname}:${server.port}:${server.apiUsername}:${server.maxAccounts}`}
                onSubmit={(event) => edit(event, server)}
                className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              >
                <Field
                  label="Server name"
                  name="name"
                  defaultValue={server.server.name}
                  required
                />
                <Field
                  label="WHM hostname"
                  name="hostname"
                  defaultValue={server.server.hostname}
                  required
                />
                <PortField defaultValue={server.port} />
                <Field
                  label="WHM username"
                  name="apiUsername"
                  defaultValue={server.apiUsername ?? ''}
                  required
                />
                <Field
                  label="New API token (optional)"
                  name="apiToken"
                  type="password"
                  minLength={20}
                  maxLength={512}
                  autoComplete="new-password"
                />
                <Field
                  label="Maximum accounts (optional)"
                  name="maxAccounts"
                  type="number"
                  min={1}
                  defaultValue={server.maxAccounts ?? ''}
                />
                <label className="text-sm font-semibold text-slate-700">
                  Status
                  <select
                    name="status"
                    defaultValue={server.server.status}
                    className={fieldClass}
                  >
                    <option value="DISABLED">Disabled</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="ACTIVE">Active</option>
                  </select>
                </label>
                <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-3">
                  <Button type="submit" disabled={busy}>
                    Save server
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => test(server)}
                  >
                    Test connection
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy}
                    onClick={() => remove(server)}
                  >
                    Remove server
                  </Button>
                </div>
              </form>
            </div>
          ))
        ) : (
          <EmptyState
            title="No WHM servers"
            description="Add a server to prepare hosting account management."
          />
        )}
      </section>
    </div>
  );
}

function capacity(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').trim();
  return raw ? Number(raw) : null;
}

function statusLabel(status: ManagedCpanelServer['server']['status']) {
  return status === 'ACTIVE'
    ? 'Active'
    : status === 'MAINTENANCE'
      ? 'Maintenance'
      : 'Disabled';
}

function Field({
  label,
  name,
  ...props
}: { label: string; name: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input name={name} className={fieldClass} {...props} />
    </label>
  );
}

function PortField({ defaultValue = 2087 }: { defaultValue?: number }) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      HTTPS port
      <select name="port" defaultValue={defaultValue} className={fieldClass}>
        <option value="2087">2087</option>
        <option value="443">443</option>
      </select>
    </label>
  );
}

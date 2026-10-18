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
  const [editor, setEditor] = useState<
    { type: 'add' } | { type: 'edit'; serverId: string } | null
  >(null);
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

  async function run(action: () => Promise<string>, onSuccess?: () => void) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const message = await action();
      await refresh();
      setNotice(message);
      onSuccess?.();
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
    void run(
      async () => {
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
      },
      () => setEditor(null),
    );
  }

  function edit(
    event: FormEvent<HTMLFormElement>,
    server: ManagedCpanelServer,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const token = String(values.get('apiToken') ?? '');
    void run(
      async () => {
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
      },
      () => setEditor(null),
    );
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
    void run(
      async () => {
        await authMutation<{ removed: true }>(
          `/hosting-panel/servers/${server.server.id}`,
          'DELETE',
          { confirmation },
        );
        return 'Server removed. Historical service and operation records were preserved.';
      },
      () => setEditor(null),
    );
  }

  if (loading) return <LoadingState label="Loading WHM servers" />;

  const selectedServer =
    editor?.type === 'edit'
      ? servers.find((item) => item.server.id === editor.serverId)
      : undefined;

  function openEditor(next: typeof editor) {
    setError('');
    setNotice('');
    setEditor(next);
  }

  return (
    <div className="grid gap-6">
      <header className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1.5 bg-gradient-to-r from-brand-600 via-cyan-500 to-emerald-400" />
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="text-sm font-semibold text-brand-700">
              Hosting infrastructure
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              cPanel and WHM servers
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Manage the servers that host customer accounts. New servers stay
              disabled until you test their connection and activate them.
            </p>
          </div>
          <Button
            type="button"
            className="shrink-0"
            disabled={busy}
            onClick={() => openEditor({ type: 'add' })}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              +
            </span>
            Add new server
          </Button>
        </div>
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
      {editor ? (
        <section
          className="overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-sm"
          aria-labelledby="server-editor-title"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-brand-50/60 px-5 py-4 sm:px-6">
            <div>
              <h2
                id="server-editor-title"
                className="text-lg font-bold text-slate-950"
              >
                {editor.type === 'add'
                  ? 'Add new server'
                  : `Edit ${selectedServer?.server.name ?? 'server'}`}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {editor.type === 'add'
                  ? 'Save it as disabled, then test the connection before activation.'
                  : 'Update connection settings and account capacity. The saved API token is never displayed.'}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => openEditor(null)}
            >
              Cancel
            </Button>
          </div>
          {editor.type === 'add' ? (
            <form
              key="add"
              onSubmit={add}
              className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3 sm:p-6"
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
          ) : selectedServer ? (
            <form
              key={`${selectedServer.server.id}:${selectedServer.server.status}:${selectedServer.server.name}:${selectedServer.server.hostname}:${selectedServer.port}:${selectedServer.apiUsername}:${selectedServer.maxAccounts}`}
              onSubmit={(event) => edit(event, selectedServer)}
              className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3 sm:p-6"
            >
              <Field
                label="Server name"
                name="name"
                defaultValue={selectedServer.server.name}
                required
              />
              <Field
                label="WHM hostname"
                name="hostname"
                defaultValue={selectedServer.server.hostname}
                required
              />
              <PortField defaultValue={selectedServer.port} />
              <Field
                label="WHM username"
                name="apiUsername"
                defaultValue={selectedServer.apiUsername ?? ''}
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
                defaultValue={selectedServer.maxAccounts ?? ''}
              />
              <label className="text-sm font-semibold text-slate-700">
                Status
                <select
                  name="status"
                  defaultValue={selectedServer.server.status}
                  className={fieldClass}
                >
                  <option value="DISABLED">Disabled</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="ACTIVE">Active</option>
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5 md:col-span-2 xl:col-span-3">
                <Button type="submit" disabled={busy}>
                  Save changes
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => test(selectedServer)}
                >
                  Test connection
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-red-700 hover:bg-red-50 sm:ml-auto"
                  disabled={busy}
                  onClick={() => remove(selectedServer)}
                >
                  Remove server
                </Button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}
      <section
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        aria-labelledby="server-list-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-5 sm:px-6">
          <div>
            <h2
              id="server-list-title"
              className="text-lg font-bold text-slate-950"
            >
              Server list
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              View status and edit a server when its settings change.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
            {servers.length} {servers.length === 1 ? 'server' : 'servers'}
          </span>
        </div>
        {servers.length ? (
          <ul className="divide-y divide-slate-100">
            {servers.map((server) => (
              <li
                key={server.server.id}
                className="flex flex-col gap-4 px-5 py-5 transition-colors hover:bg-slate-50/70 sm:px-6 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="flex min-w-0 items-start gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-lg font-bold text-brand-700"
                  >
                    {server.server.name.charAt(0).toLocaleUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-bold text-slate-950">
                        {server.server.name}
                      </h3>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(server.server.status)}`}
                      >
                        {statusLabel(server.server.status)}
                      </span>
                    </div>
                    <p className="mt-1 break-all text-sm text-slate-600">
                      {server.server.hostname}:{server.port}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {server.assignedServiceCount}{' '}
                      {server.assignedServiceCount === 1
                        ? 'assigned service'
                        : 'assigned services'}
                      {server.maxAccounts === null
                        ? ''
                        : ` · ${server.maxAccounts} account limit`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                  <span
                    className={`text-xs font-semibold ${server.credentialConfigured ? 'text-emerald-700' : 'text-amber-700'}`}
                  >
                    {server.credentialConfigured
                      ? 'Token configured'
                      : 'Token missing'}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      openEditor({ type: 'edit', serverId: server.server.id })
                    }
                  >
                    Edit <span className="sr-only">{server.server.name}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5 sm:p-6">
            <EmptyState
              title="No WHM servers"
              description="Add a server to prepare hosting account management."
            />
          </div>
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

function statusClass(status: ManagedCpanelServer['server']['status']) {
  return status === 'ACTIVE'
    ? 'bg-emerald-50 text-emerald-700'
    : status === 'MAINTENANCE'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-slate-100 text-slate-700';
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

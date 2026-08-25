'use client';

import type {
  CpanelServerConfiguration,
  HostingPanelOperation,
  HostingPanelOperationResult,
  Service,
  ServiceSetupOptions,
} from '@webhost-billing/shared';
import { useEffect, useState, type FormEvent } from 'react';
import {
  authMutation,
  authenticatedGet,
  authenticatedPaginatedGet,
} from '../../lib/auth-api';
import { fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { EmptyState, LoadingState } from '../ui/feedback-state';
import { StatusBadge } from '../ui/status-badge';
import { serviceDate, serviceError } from './service-ui';

type AccountTool =
  'GET_ACCOUNT' | 'CHANGE_PACKAGE' | 'CHANGE_PASSWORD' | 'GENERATE_LOGIN_URL';

export function AdminHostingOperationManager() {
  const [operations, setOperations] = useState<HostingPanelOperation[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [options, setOptions] = useState<ServiceSetupOptions>({
    servers: [],
    orderItems: [],
  });
  const [tool, setTool] = useState<AccountTool>('GET_ACCOUNT');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loginUrl, setLoginUrl] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedPaginatedGet<HostingPanelOperation>(
        '/hosting-panel/operations?pageSize=100',
      ),
      authenticatedPaginatedGet<Service>('/services?pageSize=100'),
      authenticatedGet<ServiceSetupOptions>('/services/setup-options'),
    ])
      .then(([operationResult, serviceResult, setup]) => {
        if (!active) return;
        setOperations(operationResult.data);
        setServices(serviceResult.data);
        setOptions(setup);
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

  const columns: DataColumn<HostingPanelOperation>[] = [
    {
      key: 'operation',
      header: 'Operation',
      render: (operation) => (
        <div>
          <p className="font-bold text-slate-950">
            {operation.type.replaceAll('_', ' ')}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Attempt {operation.attemptNumber} ·{' '}
            {serviceDate(operation.createdAt)}
          </p>
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      render: (operation) => (
        <div>
          <p className="font-semibold text-slate-900">
            {operation.server.name}
          </p>
          <p className="text-xs text-slate-500">
            {operation.account?.domain ?? operation.server.hostname}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Result',
      render: (operation) => (
        <div>
          <StatusBadge tone={operationTone(operation.status)}>
            {operation.status}
          </StatusBadge>
          {operation.errorMessage ? (
            <p className="mt-1 max-w-xs text-xs text-red-700">
              {operation.errorMessage}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'retry',
      header: 'Recovery',
      align: 'right',
      render: (operation) =>
        operation.retryable &&
        !['CHANGE_PASSWORD', 'TERMINATE_ACCOUNT'].includes(operation.type) ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={saving}
            onClick={() => void retry(operation)}
          >
            Retry manually
          </Button>
        ) : operation.status === 'INCONSISTENT' ? (
          <span className="text-xs font-semibold text-amber-700">
            Reconcile first
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
  ];

  async function testServer(serverId: string) {
    await mutate(
      `/hosting-panel/servers/${serverId}/test`,
      { submissionKey: crypto.randomUUID() },
      'Connection test finished.',
    );
  }

  async function configureServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const configured = await authMutation<CpanelServerConfiguration>(
        `/hosting-panel/servers/${String(values.get('serverId'))}/cpanel-configuration`,
        'POST',
        {
          hostname: String(values.get('hostname')),
          port: Number(values.get('port')),
          apiUsername: String(values.get('apiUsername')),
          apiToken: String(values.get('apiToken')),
          confirmation: 'CONFIGURE_CPANEL',
        },
      );
      setOptions((current) => ({
        ...current,
        servers: current.servers.map((server) =>
          server.id === configured.server.id ? configured.server : server,
        ),
      }));
      const tokenInput = form.elements.namedItem('apiToken');
      if (tokenInput instanceof HTMLInputElement) tokenInput.value = '';
      setNotice(
        'cPanel/WHM configuration encrypted and saved. Run the connection test when this server is approved for network access.',
      );
    } catch (caught) {
      setError(serviceError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function retry(operation: HostingPanelOperation) {
    await mutate(
      `/hosting-panel/operations/${operation.id}/retry`,
      { submissionKey: crypto.randomUUID() },
      'Manual retry finished.',
    );
  }

  async function runTool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const serviceId = String(values.get('serviceId'));
    const body: Record<string, unknown> = {
      type: tool,
      submissionKey: crypto.randomUUID(),
    };
    if (tool === 'CHANGE_PACKAGE') {
      body.packageIdentifier = String(values.get('packageIdentifier'));
    }
    if (tool === 'CHANGE_PASSWORD') {
      body.newPassword = String(values.get('newPassword'));
    }
    await mutate(
      `/hosting-panel/services/${serviceId}/operations`,
      body,
      'Account operation finished.',
    );
    if (tool === 'CHANGE_PASSWORD') form.reset();
  }

  async function mutate(
    path: string,
    body: Record<string, unknown>,
    successMessage: string,
  ) {
    setSaving(true);
    setError('');
    setNotice('');
    setLoginUrl('');
    try {
      const result = await authMutation<HostingPanelOperationResult>(
        path,
        'POST',
        body,
      );
      setOperations((current) => [
        result.operation,
        ...current.filter((item) => item.id !== result.operation.id),
      ]);
      if (result.operation.status === 'SUCCEEDED') {
        setNotice(successMessage);
        if (result.loginUrl) setLoginUrl(result.loginUrl);
      } else {
        setError(
          result.operation.errorMessage ??
            'The operation requires administrator attention.',
        );
      }
    } catch (caught) {
      setError(serviceError(caught));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading panel operations" />;
  const manageable = services.filter((service) =>
    ['ACTIVE', 'SUSPENDED'].includes(service.status),
  );

  return (
    <div className="grid gap-6">
      {error ? <Message error>{error}</Message> : null}
      {notice ? <Message>{notice}</Message> : null}
      {loginUrl ? (
        <a
          href={loginUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-brand-700 px-4 py-3 text-center text-sm font-bold text-white hover:bg-brand-800"
        >
          Open temporary panel login
        </a>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold text-slate-950">
          Hosting-panel connections
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Configure a WHM API token over HTTPS. Tokens are encrypted before
          storage and are never returned to this interface.
        </p>
        <div className="mt-5 grid gap-4">
          {options.servers.map((server) => (
            <form
              key={server.id}
              onSubmit={configureServer}
              className="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-5 lg:items-end"
            >
              <input type="hidden" name="serverId" value={server.id} />
              <label className="text-sm font-semibold text-slate-700 lg:col-span-2">
                {server.name} hostname
                <input
                  name="hostname"
                  type="text"
                  required
                  defaultValue={server.hostname}
                  autoComplete="off"
                  className={fieldClass}
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                HTTPS port
                <select name="port" defaultValue="2087" className={fieldClass}>
                  <option value="2087">2087</option>
                  <option value="443">443</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                WHM username
                <input
                  name="apiUsername"
                  required
                  autoComplete="username"
                  className={fieldClass}
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                New API token
                <input
                  name="apiToken"
                  type="password"
                  minLength={20}
                  maxLength={512}
                  required
                  autoComplete="new-password"
                  className={fieldClass}
                />
              </label>
              <div className="flex flex-wrap gap-2 lg:col-span-5">
                <Button type="submit" disabled={saving}>
                  Encrypt and save cPanel
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => void testServer(server.id)}
                >
                  Test {server.name}
                </Button>
                <span className="self-center text-xs font-semibold text-slate-500">
                  Adapter: {server.adapterKey}
                </span>
              </div>
            </form>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold text-slate-950">Account tools</h2>
        <p className="mt-1 text-sm text-slate-600">
          Query an account, change its mapped package or password, or generate a
          short-lived administrator login link.
        </p>
        {manageable.length ? (
          <form
            onSubmit={runTool}
            className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4 lg:items-end"
          >
            <label className="text-sm font-semibold text-slate-700">
              Service
              <select name="serviceId" required className={fieldClass}>
                {manageable.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.domain} · {service.status.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Action
              <select
                value={tool}
                onChange={(event) => setTool(event.target.value as AccountTool)}
                className={fieldClass}
              >
                <option value="GET_ACCOUNT">Check account</option>
                <option value="CHANGE_PACKAGE">Change package</option>
                <option value="CHANGE_PASSWORD">Change password</option>
                <option value="GENERATE_LOGIN_URL">Generate login URL</option>
              </select>
            </label>
            {tool === 'CHANGE_PACKAGE' ? (
              <label className="text-sm font-semibold text-slate-700">
                Panel package
                <input
                  name="packageIdentifier"
                  required
                  pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]*"
                  className={fieldClass}
                />
              </label>
            ) : tool === 'CHANGE_PASSWORD' ? (
              <label className="text-sm font-semibold text-slate-700">
                New password
                <input
                  name="newPassword"
                  type="password"
                  minLength={16}
                  required
                  autoComplete="new-password"
                  className={fieldClass}
                />
              </label>
            ) : (
              <div />
            )}
            <Button type="submit" disabled={saving}>
              Run account tool
            </Button>
          </form>
        ) : (
          <div className="mt-5">
            <EmptyState
              title="No manageable accounts"
              description="Provision an active hosting account before using account tools."
            />
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-950">Panel operation log</h2>
          <p className="mt-1 text-sm text-slate-600">
            Temporary failures may be retried deliberately. Unknown results stay
            held for reconciliation.
          </p>
        </div>
        {operations.length ? (
          <DataTable
            caption="Hosting-panel operation history"
            columns={columns}
            rows={operations}
            rowKey={(operation) => operation.id}
          />
        ) : (
          <div className="p-5">
            <EmptyState
              title="No panel operations"
              description="Connection tests and service actions will appear here."
            />
          </div>
        )}
      </section>
    </div>
  );
}

function operationTone(status: HostingPanelOperation['status']) {
  if (status === 'SUCCEEDED') return 'success' as const;
  if (status === 'FAILED') return 'danger' as const;
  if (status === 'INCONSISTENT') return 'warning' as const;
  return 'info' as const;
}

function Message({
  children,
  error = false,
}: {
  children: string;
  error?: boolean;
}) {
  return (
    <p
      role={error ? 'alert' : 'status'}
      className={`rounded-xl p-4 text-sm font-semibold ${error ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}
    >
      {children}
    </p>
  );
}

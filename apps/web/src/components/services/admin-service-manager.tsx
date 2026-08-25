'use client';

import type {
  HostingPanelOperationResult,
  Service,
  ServiceCreationResult,
  ServiceSetupOptions,
  ServiceStatus,
} from '@webhost-billing/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  authMutation,
  authenticatedGet,
  authenticatedPaginatedGet,
} from '../../lib/auth-api';
import { fieldClass } from '../customers/customer-fields';
import { formatMinor } from '../invoices/invoice-ui';
import { Button } from '../ui/button';
import { DataTable, type DataColumn } from '../ui/data-table';
import { EmptyState, LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import { serviceDate, serviceError, serviceTone } from './service-ui';

type EvidenceStatus = Extract<
  ServiceStatus,
  'SUSPENDED' | 'CANCELLED' | 'TERMINATED'
>;

interface ActionState {
  service: Service;
  status: EvidenceStatus;
}

export function AdminServiceManager() {
  const [services, setServices] = useState<Service[]>([]);
  const [options, setOptions] = useState<ServiceSetupOptions>({
    servers: [],
    orderItems: [],
  });
  const [action, setAction] = useState<ActionState>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedPaginatedGet<Service>('/services?pageSize=100'),
      authenticatedGet<ServiceSetupOptions>('/services/setup-options'),
    ])
      .then(([serviceResult, setup]) => {
        if (!active) return;
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

  const columns: DataColumn<Service>[] = [
    {
      key: 'service',
      header: 'Service',
      render: (service) => (
        <div>
          <p className="font-bold text-slate-950">{service.domain}</p>
          <p className="mt-1 text-xs text-slate-500">
            {service.productName} · {service.billingPeriod.toLowerCase()}
          </p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (service) => (
        <div>
          <p className="font-semibold text-slate-900">{service.customerName}</p>
          <p className="text-xs text-slate-500">{service.customerEmail}</p>
        </div>
      ),
    },
    {
      key: 'server',
      header: 'Server / account',
      render: (service) => (
        <div>
          <p>{service.server.name}</p>
          <p className="text-xs text-slate-500">
            {service.controlPanelUsername ?? 'Account not created'}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (service) => (
        <StatusBadge tone={serviceTone(service.status)}>
          {service.status.replaceAll('_', ' ')}
        </StatusBadge>
      ),
    },
    {
      key: 'renewal',
      header: 'Renewal',
      render: (service) => (
        <div>
          <p className="font-semibold text-slate-900">
            {serviceDate(service.nextDueAt)}
          </p>
          <p className="text-xs text-slate-500">
            {formatMinor(
              service.recurringAmount.amount,
              service.recurringAmount.currency,
            )}
          </p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (service) => actionButtons(service),
    },
  ];

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    clearMessages();
    try {
      const result = await authMutation<ServiceCreationResult>(
        '/services',
        'POST',
        {
          orderItemId: String(values.get('orderItemId')),
          serverId: String(values.get('serverId')),
        },
      );
      replaceService(result.service);
      setOptions((current) => ({
        ...current,
        orderItems: current.orderItems.filter(
          (item) => item.orderItemId !== result.service.orderItemId,
        ),
      }));
      form.reset();
      setNotice(
        result.duplicate
          ? 'The existing service was returned.'
          : `${result.service.domain} is ready for provisioning.`,
      );
    } catch (caught) {
      setError(serviceError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function runPanelOperation(
    service: Service,
    body: Record<string, unknown>,
  ) {
    setSaving(true);
    clearMessages();
    try {
      const result = await authMutation<HostingPanelOperationResult>(
        `/hosting-panel/services/${service.id}/operations`,
        'POST',
        { submissionKey: crypto.randomUUID(), ...body },
      );
      const updated = await authenticatedGet<Service>(
        `/services/${service.id}`,
      );
      replaceService(updated);
      if (result.operation.status === 'SUCCEEDED') {
        setNotice(
          `${result.operation.type.toLowerCase().replaceAll('_', ' ')} completed for ${updated.domain}.`,
        );
      } else {
        setError(
          result.operation.errorMessage ??
            'The hosting operation needs administrator attention.',
        );
      }
    } catch (caught) {
      setError(serviceError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const values = new FormData(event.currentTarget);
    const reason = String(values.get('reason'));
    setSaving(true);
    clearMessages();
    try {
      if (action.status === 'CANCELLED') {
        await authMutation<Service>(
          `/services/${action.service.id}/status`,
          'PATCH',
          { status: action.status, reason },
        );
      } else {
        const type =
          action.status === 'SUSPENDED'
            ? 'SUSPEND_ACCOUNT'
            : 'TERMINATE_ACCOUNT';
        const result = await authMutation<HostingPanelOperationResult>(
          `/hosting-panel/services/${action.service.id}/operations`,
          'POST',
          {
            type,
            submissionKey: crypto.randomUUID(),
            reason,
            ...(action.status === 'TERMINATED'
              ? { confirmation: String(values.get('confirmation')) }
              : {}),
          },
        );
        if (result.operation.status !== 'SUCCEEDED') {
          throw new Error(
            result.operation.errorMessage ?? 'The hosting operation failed.',
          );
        }
      }
      const updated = await authenticatedGet<Service>(
        `/services/${action.service.id}`,
      );
      replaceService(updated);
      setAction(undefined);
      setNotice(
        `${updated.domain} moved to ${updated.status.toLowerCase().replaceAll('_', ' ')}.`,
      );
    } catch (caught) {
      setError(serviceError(caught));
    } finally {
      setSaving(false);
    }
  }

  function actionButtons(service: Service) {
    if (service.status === 'PENDING') {
      return (
        <ActionGroup>
          <Button
            size="sm"
            disabled={saving}
            onClick={() =>
              void runPanelOperation(service, { type: 'CREATE_ACCOUNT' })
            }
          >
            Provision account
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => setAction({ service, status: 'CANCELLED' })}
          >
            Cancel
          </Button>
        </ActionGroup>
      );
    }
    if (service.status === 'PROVISIONING') {
      return (
        <span className="text-xs text-slate-500">Panel operation running</span>
      );
    }
    if (service.status === 'PROVISION_FAILED') {
      return (
        <ActionGroup>
          <span className="text-xs text-amber-700">Review operation log</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => setAction({ service, status: 'CANCELLED' })}
          >
            Cancel
          </Button>
        </ActionGroup>
      );
    }
    if (service.status === 'ACTIVE') {
      return (
        <ActionGroup>
          <Button
            size="sm"
            variant="secondary"
            disabled={saving}
            onClick={() => setAction({ service, status: 'SUSPENDED' })}
          >
            Suspend
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={saving}
            onClick={() => setAction({ service, status: 'TERMINATED' })}
          >
            Terminate
          </Button>
        </ActionGroup>
      );
    }
    if (service.status === 'SUSPENDED') {
      return (
        <ActionGroup>
          <Button
            size="sm"
            disabled={saving}
            onClick={() =>
              void runPanelOperation(service, { type: 'UNSUSPEND_ACCOUNT' })
            }
          >
            Reactivate
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={saving}
            onClick={() => setAction({ service, status: 'TERMINATED' })}
          >
            Terminate
          </Button>
        </ActionGroup>
      );
    }
    return <span className="text-xs text-slate-400">Final state</span>;
  }

  function replaceService(service: Service) {
    setServices((current) => [
      service,
      ...current.filter((item) => item.id !== service.id),
    ]);
  }

  function clearMessages() {
    setError('');
    setNotice('');
  }

  if (loading) return <LoadingState label="Loading services" />;

  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Administrator"
        title="Hosting services"
        description="Fulfil paid orders and manage provisioning, active, suspended, failed, cancelled, and terminated states independently from billing."
      />
      {error ? <Message error>{error}</Message> : null}
      {notice ? <Message>{notice}</Message> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold text-slate-950">
          Create service from paid order
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Product, price, domain, customer, and billing period are copied from
          the historical order item. Creating the service does not provision the
          hosting account.
        </p>
        {options.orderItems.length && options.servers.length ? (
          <form
            onSubmit={create}
            className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end"
          >
            <label className="text-sm font-semibold text-slate-700">
              Paid order item
              <select name="orderItemId" required className={fieldClass}>
                <option value="">Select order and domain</option>
                {options.orderItems.map((item) => (
                  <option key={item.orderItemId} value={item.orderItemId}>
                    {item.orderNumber} — {item.customerName} — {item.domain}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Active server
              <select name="serverId" required className={fieldClass}>
                <option value="">Select server</option>
                {options.servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name} — {server.hostname}
                  </option>
                ))}
              </select>
            </label>
            <Button disabled={saving} type="submit">
              Create pending service
            </Button>
          </form>
        ) : (
          <div className="mt-5">
            <EmptyState
              title="No fulfilment options"
              description="A paid order item without a service and at least one active server are required."
            />
          </div>
        )}
      </section>

      {action ? (
        <ActionForm
          action={action}
          saving={saving}
          onCancel={() => setAction(undefined)}
          onSubmit={submitAction}
        />
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-950">Service inventory</h2>
          <p className="mt-1 text-sm text-slate-600">
            Hosting lifecycle calls use the configured adapter. This command
            enables only the development/test fake panel.
          </p>
        </div>
        {services.length ? (
          <DataTable
            caption="Hosting service inventory"
            columns={columns}
            rows={services}
            rowKey={(service) => service.id}
          />
        ) : (
          <div className="p-5">
            <EmptyState
              title="No services"
              description="Create the first service from an eligible paid order."
            />
          </div>
        )}
      </section>
    </div>
  );
}

function ActionForm({
  action,
  saving,
  onCancel,
  onSubmit,
}: {
  action: ActionState;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const destructive = action.status === 'TERMINATED';
  return (
    <section
      className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${destructive ? 'border-red-200 bg-red-50' : 'border-brand-200 bg-brand-50'}`}
    >
      <h2 className="text-lg font-bold text-slate-950">
        {action.status.replaceAll('_', ' ')} · {action.service.domain}
      </h2>
      <p className="mt-1 text-sm text-slate-700">
        {destructive
          ? 'Termination is permanent in application state and requires an explicit confirmation phrase.'
          : 'Provide the operational evidence required for this transition.'}
      </p>
      <form onSubmit={onSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">
          Reason
          <textarea
            name="reason"
            required
            maxLength={1000}
            className={fieldClass}
            rows={3}
          />
        </label>
        {action.status === 'TERMINATED' ? (
          <label className="text-sm font-semibold text-red-800 md:col-span-2">
            Type TERMINATE to confirm
            <input
              name="confirmation"
              required
              className={fieldClass}
              autoComplete="off"
            />
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button
            disabled={saving}
            variant={destructive ? 'danger' : 'primary'}
            type="submit"
          >
            Confirm {action.status.toLowerCase().replaceAll('_', ' ')}
          </Button>
          <Button
            disabled={saving}
            variant="ghost"
            type="button"
            onClick={onCancel}
          >
            Keep current state
          </Button>
        </div>
      </form>
    </section>
  );
}

function ActionGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2">{children}</div>;
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

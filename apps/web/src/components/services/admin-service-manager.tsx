'use client';
import { sentenceCaseLabel } from '@webhost-billing/shared';

import type {
  CustomerDetail,
  HostingPanelOperationResult,
  Service,
  ServiceCreationResult,
  ServiceSetupOptions,
  ServiceStatus,
} from '@webhost-billing/shared';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { authMutation, authenticatedGet } from '../../lib/auth-api';
import {
  emptyAdminCustomerFilter,
  type AdminCustomerFilter,
} from '../../lib/admin-customer-filter';
import { AdminCustomerFilterNotice } from '../customers/admin-customer-filter-notice';
import { fieldClass } from '../customers/customer-fields';
import { formatMinor } from '../invoices/invoice-ui';
import { Button } from '../ui/button';
import { type DataColumn } from '../ui/data-table';
import { EmptyState, LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import { serviceDate, serviceError, serviceTone } from './service-ui';
import { AdminServiceReview } from './admin-service-review';
import { AdminServiceLedger } from './admin-service-ledger';
import {
  adminServiceHref,
  adminServiceQueryString,
  readAdminServiceQuery,
  type AdminServiceSelection,
} from '../../lib/admin-service-ledger-query';

type EvidenceStatus = Extract<
  ServiceStatus,
  'SUSPENDED' | 'CANCELLED' | 'TERMINATED'
>;

interface ActionState {
  service: Service;
  status: EvidenceStatus;
}

export function AdminServiceManager({
  customerFilter = emptyAdminCustomerFilter,
  reviewRevision = 0,
  inspectionBlocked = false,
  selection,
  inventoryRevision = 0,
}: {
  customerFilter?: AdminCustomerFilter;
  reviewRevision?: number;
  inspectionBlocked?: boolean;
  selection?: AdminServiceSelection;
  inventoryRevision?: number;
} = {}) {
  const applied = selection ?? {
    ...readAdminServiceQuery({ customerId: customerFilter.customerId }),
    customerFilter,
  };
  customerFilter = applied.customerFilter;
  const [readRevision, setReadRevision] = useState(0);
  const [filteredCustomer, setFilteredCustomer] = useState<CustomerDetail>();
  const [options, setOptions] = useState<ServiceSetupOptions>({
    servers: [],
    orderItems: [],
  });
  const [action, setAction] = useState<ActionState>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const filteredCustomerId = customerFilter.customerId;
  const scope = `${adminServiceQueryString(applied.query)}:${applied.invalid}:${customerFilter.invalid}:${reviewRevision}`;
  const [reviewScope, setReviewScope] = useState(scope);
  const [review, setReview] = useState<{ id: string; sequence: number }>();
  const reviewSequence = useRef(0);
  const reviewTrigger = useRef<HTMLButtonElement | null>(null);
  // Discard selection synchronously on scope change without remounting forms.
  if (reviewScope !== scope) {
    setReviewScope(scope);
    setReview(undefined);
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      authenticatedGet<ServiceSetupOptions>('/services/setup-options'),
      filteredCustomerId
        ? authenticatedGet<CustomerDetail>(`/customers/${filteredCustomerId}`)
        : Promise.resolve(undefined),
    ])
      .then(([setup, customerContext]) => {
        if (!active) return;
        setOptions(setup);
        setFilteredCustomer(customerContext);
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
  }, [filteredCustomerId]);

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
          {sentenceCaseLabel(service.status)}
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
      key: 'review',
      header: 'Review',
      render: (service) => (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={saving || inspectionBlocked}
          aria-label={`Review ${service.domain ?? service.id}`}
          aria-controls="admin-service-review"
          aria-expanded={review?.id === service.id}
          onClick={(event) => {
            reviewTrigger.current = event.currentTarget;
            setReview({ id: service.id, sequence: ++reviewSequence.current });
          }}
        >
          Review
        </Button>
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
    setReview(undefined);
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
      setReadRevision((current) => current + 1);
    }
  }

  async function runPanelOperation(
    service: Service,
    body: Record<string, unknown>,
  ) {
    setReview(undefined);
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
      setReadRevision((current) => current + 1);
    }
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const values = new FormData(event.currentTarget);
    const reason = String(values.get('reason'));
    setReview(undefined);
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
      setAction(undefined);
      setNotice(
        `${updated.domain} moved to ${updated.status.toLowerCase().replaceAll('_', ' ')}.`,
      );
    } catch (caught) {
      setError(serviceError(caught));
    } finally {
      setSaving(false);
      setReadRevision((current) => current + 1);
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
      <AdminCustomerFilterNotice
        customer={
          filteredCustomer?.id.toLowerCase() ===
          filteredCustomerId?.toLowerCase()
            ? filteredCustomer
            : undefined
        }
        invalid={customerFilter.invalid}
        clearHref={adminServiceHref({
          ...applied.query,
          customerId: undefined,
          page: 1,
        })}
        resourceLabel="services"
      />
      {error ? <Message error>{error}</Message> : null}
      {notice ? <Message>{notice}</Message> : null}
      {inspectionBlocked ? (
        <Message>
          Service inspection is paused while a panel operation is in progress.
        </Message>
      ) : null}

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

      {review ? (
        <AdminServiceReview
          key={`${review.id}:${review.sequence}`}
          serviceId={review.id}
          customerId={filteredCustomerId}
          onClose={() => {
            setReview(undefined);
            if (reviewTrigger.current?.isConnected)
              reviewTrigger.current.focus();
          }}
        />
      ) : null}

      <AdminServiceLedger
        selection={applied}
        revision={readRevision + inventoryRevision}
        columns={columns}
        onNavigate={() => setReview(undefined)}
      />
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
        {sentenceCaseLabel(action.status)} · {action.service.domain}
      </h2>
      <p className="mt-1 break-words text-sm text-slate-700">
        Original action target: {action.service.id}. Inventory filters do not
        change this target.
      </p>
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

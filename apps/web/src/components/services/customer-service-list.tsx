'use client';

import type { Service } from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authenticatedPaginatedGet } from '../../lib/auth-api';
import { formatMinor } from '../invoices/invoice-ui';
import { EmptyState, LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';
import { StatusBadge } from '../ui/status-badge';
import { serviceDate, serviceError, serviceTone } from './service-ui';

export function CustomerServiceList() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void authenticatedPaginatedGet<Service>('/services/my?pageSize=100')
      .then((result) => {
        if (active) setServices(result.data);
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

  if (loading) return <LoadingState label="Loading your services" />;
  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Customer portal"
        title="My services"
        description="Review each hosting account, current operational state, server, and next billing date."
      />
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      ) : null}
      {services.length ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {services.map((service) => (
            <Link
              key={service.id}
              href={`/portal/services/${service.id}`}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
                    {service.productName}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">
                    {service.domain}
                  </h2>
                </div>
                <StatusBadge tone={serviceTone(service.status)}>
                  {service.status.replaceAll('_', ' ')}
                </StatusBadge>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <Meta label="Next due" value={serviceDate(service.nextDueAt)} />
                <Meta
                  label="Recurring"
                  value={formatMinor(
                    service.recurringAmount.amount,
                    service.recurringAmount.currency,
                  )}
                />
                <Meta label="Server" value={service.server.hostname} />
                <Meta
                  label="Username"
                  value={service.controlPanelUsername ?? 'Pending setup'}
                />
              </dl>
              <p className="mt-5 text-sm font-bold text-brand-700 group-hover:text-brand-800">
                View service details →
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No hosting services"
          description="A paid order remains separate until the administrator creates its hosting service."
        />
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

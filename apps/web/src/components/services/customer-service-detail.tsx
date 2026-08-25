'use client';

import type {
  HostingPanelOperationResult,
  Service,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authMutation, authenticatedGet } from '../../lib/auth-api';
import { Button, buttonStyles } from '../ui/button';
import { ErrorState, LoadingState } from '../ui/feedback-state';
import { StatusBadge } from '../ui/status-badge';
import { formatMinor } from '../invoices/invoice-ui';
import { serviceDate, serviceError, serviceTone } from './service-ui';

export function CustomerServiceDetail({ serviceId }: { serviceId: string }) {
  const [service, setService] = useState<Service>();
  const [error, setError] = useState('');
  const [loginUrl, setLoginUrl] = useState('');
  const [generatingLogin, setGeneratingLogin] = useState(false);

  useEffect(() => {
    let active = true;
    void authenticatedGet<Service>(`/services/${serviceId}`)
      .then((result) => {
        if (active) setService(result);
      })
      .catch((caught: unknown) => {
        if (active) setError(serviceError(caught));
      });
    return () => {
      active = false;
    };
  }, [serviceId]);

  if (error) return <ErrorState description={error} />;
  if (!service) return <LoadingState label="Loading service" />;

  async function generateLogin() {
    setGeneratingLogin(true);
    setError('');
    setLoginUrl('');
    try {
      const result = await authMutation<HostingPanelOperationResult>(
        `/hosting-panel/services/${serviceId}/login-url`,
        'POST',
        { submissionKey: crypto.randomUUID() },
      );
      if (result.operation.status !== 'SUCCEEDED' || !result.loginUrl) {
        throw new Error(
          result.operation.errorMessage ?? 'Panel login is unavailable.',
        );
      }
      setLoginUrl(result.loginUrl);
    } catch (caught) {
      setError(serviceError(caught));
    } finally {
      setGeneratingLogin(false);
    }
  }
  const reason =
    service.status === 'SUSPENDED'
      ? service.suspensionReason
      : service.status === 'PROVISION_FAILED'
        ? service.provisioningFailureReason
        : service.status === 'CANCELLED'
          ? service.cancellationReason
          : service.status === 'TERMINATED'
            ? service.terminationReason
            : null;
  return (
    <div className="grid gap-6">
      <div>
        <Link href="/portal/services" className={buttonStyles('ghost')}>
          ← Back to services
        </Link>
      </div>
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
              {service.productName}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">
              {service.domain}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Order {service.orderNumber ?? 'not linked'}
            </p>
          </div>
          <StatusBadge tone={serviceTone(service.status)}>
            {service.status.replaceAll('_', ' ')}
          </StatusBadge>
        </div>
        {reason ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
              Status reason
            </p>
            <p className="mt-1 text-sm text-amber-950">{reason}</p>
          </div>
        ) : null}
        <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Server" value={service.server.hostname} />
          <Detail
            label="Control-panel username"
            value={service.controlPanelUsername ?? 'Pending setup'}
          />
          <Detail
            label="Billing period"
            value={service.billingPeriod.toLowerCase()}
          />
          <Detail
            label="Service start"
            value={serviceDate(service.startedAt)}
          />
          <Detail label="Next due" value={serviceDate(service.nextDueAt)} />
          <Detail
            label="Recurring amount"
            value={formatMinor(
              service.recurringAmount.amount,
              service.recurringAmount.currency,
            )}
          />
          <Detail label="Activated" value={serviceDate(service.activatedAt)} />
          <Detail label="Suspended" value={serviceDate(service.suspendedAt)} />
          <Detail
            label="Terminated"
            value={serviceDate(service.terminatedAt)}
          />
        </dl>
        {service.status === 'ACTIVE' ? (
          <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6">
            <Button
              disabled={generatingLogin}
              onClick={() => void generateLogin()}
            >
              Generate secure panel login
            </Button>
            {loginUrl ? (
              <a
                href={loginUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonStyles('secondary')}
              >
                Open control panel ↗
              </a>
            ) : (
              <p className="text-xs text-slate-500">
                Login links are short-lived and are never stored in service
                history.
              </p>
            )}
          </div>
        ) : null}
      </article>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 font-semibold capitalize text-slate-950">{value}</dd>
    </div>
  );
}

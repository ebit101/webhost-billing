'use client';

import {
  apiSuccessResponseSchema,
  businessLocalizationSettingsSchema,
  serviceSchema,
  type Service,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatMinor } from '../invoices/invoice-ui';
import { Button, buttonStyles } from '../ui/button';
import { ErrorState, LoadingState } from '../ui/feedback-state';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const serviceResponse = apiSuccessResponseSchema(serviceSchema);
const settingsResponse = apiSuccessResponseSchema(
  businessLocalizationSettingsSchema.pick({ timeZone: true }).strip(),
);
type Failure =
  'invalid' | 'malformed' | 'mismatched' | 'forbidden' | 'missing' | 'error';
type Result =
  { kind: 'ready'; service: Service; timeZone: string } | { kind: Failure };
const failureTitles: Record<Failure, string> = {
  invalid: 'Invalid service review selection',
  malformed: 'Service review response is invalid',
  mismatched: 'Service review context does not match',
  forbidden: 'Service review access denied',
  missing: 'Service review record not found',
  error: 'Service review could not be loaded',
};

export function AdminServiceReview(props: {
  serviceId: string;
  customerId?: string;
  onClose: () => void;
}) {
  return (
    <ReviewRequest
      key={`${props.serviceId}:${props.customerId ?? ''}`}
      {...props}
    />
  );
}

function ReviewRequest({
  serviceId,
  customerId,
  onClose,
}: {
  serviceId: string;
  customerId?: string;
  onClose: () => void;
}) {
  const valid =
    serviceSchema.shape.id.safeParse(serviceId).success &&
    (customerId === undefined ||
      serviceSchema.shape.customerId.safeParse(customerId).success);
  const [result, setResult] = useState<Result | undefined>(
    valid ? undefined : { kind: 'invalid' },
  );
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (!valid) return;
    let active = true;
    const controller = new AbortController();
    void loadReview(serviceId, customerId, controller.signal)
      .then((value) => {
        if (active) setResult(value);
      })
      .catch(() => {
        if (active) setResult({ kind: 'error' });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [serviceId, customerId, valid, attempt]);
  return (
    <section
      id="admin-service-review"
      aria-labelledby="service-review-heading"
      className="grid min-w-0 gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="service-review-heading"
          ref={heading}
          tabIndex={-1}
          className="text-xl font-bold text-slate-950 focus-visible:outline-brand-600"
        >
          Service review
        </h2>
        <Button type="button" variant="secondary" onClick={onClose}>
          Close service review
        </Button>
      </div>
      <p className="text-sm text-slate-600">
        Read-only application facts as of this request, not a required approval
        gate. This read does not contact the hosting panel or prove current
        remote account state. Payment is not proof of provisioning. Invoice,
        payment and current order state, operation history and provider
        verification time are not supplied here.
      </p>
      {!result ? (
        <LoadingState label="Loading service review" />
      ) : result.kind !== 'ready' ? (
        <ErrorState
          title={failureTitles[result.kind]}
          description="No service context was applied. Retry or close this review."
          action={
            valid ? (
              <Button
                type="button"
                onClick={() => {
                  setResult(undefined);
                  setAttempt((value) => value + 1);
                }}
              >
                Retry service review
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ReviewDetails service={result.service} timeZone={result.timeZone} />
      )}
    </section>
  );
}

async function loadReview(
  serviceId: string,
  customerId: string | undefined,
  signal: AbortSignal,
): Promise<Result> {
  const options: RequestInit = {
    credentials: 'include',
    cache: 'no-store',
    signal,
  };
  const response = await fetch(`${API_URL}/services/${serviceId}`, options);
  if (response.status === 403) return { kind: 'forbidden' };
  if (response.status === 404) return { kind: 'missing' };
  if (!response.ok) return { kind: 'error' };
  signal.throwIfAborted();
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = serviceResponse.safeParse(body);
  if (!parsed.success) return { kind: 'malformed' };
  const service = parsed.data.data;
  if (
    service.id.toLowerCase() !== serviceId.toLowerCase() ||
    (customerId !== undefined &&
      service.customerId.toLowerCase() !== customerId.toLowerCase())
  )
    return { kind: 'mismatched' };
  signal.throwIfAborted();
  const settings = await fetch(`${API_URL}/settings`, options);
  if (!settings.ok) return { kind: 'error' };
  const settingsBody: unknown = await settings.json().catch(() => undefined);
  const parsedSettings = settingsResponse.safeParse(settingsBody);
  if (!parsedSettings.success) return { kind: 'malformed' };
  signal.throwIfAborted();
  return {
    kind: 'ready',
    service,
    timeZone: parsedSettings.data.data.timeZone,
  };
}

function ReviewDetails({
  service,
  timeZone,
}: {
  service: Service;
  timeZone: string;
}) {
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat('en-GB', {
          timeZone,
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(value))
      : 'Not recorded';
  return (
    <div className="grid min-w-0 gap-6">
      <h3 className="break-words text-lg font-bold">
        {service.domain ?? 'Domain not recorded'}
      </h3>
      <div className="grid min-w-0 gap-5 md:grid-cols-2">
        <div className="grid min-w-0 content-start gap-3">
          <h3 className="font-bold">Service and current customer</h3>
          <p className="break-words">
            {service.customerName} · {service.customerEmail}
          </p>
          <p className="text-sm text-slate-600">
            Customer identity is from the current profile, not a historical
            invoice snapshot.
          </p>
          <Link
            prefetch={false}
            href={`/admin/customers/${service.customerId}`}
            className={buttonStyles('secondary')}
          >
            View customer
          </Link>
          <dl className="grid gap-3 text-sm">
            <Fact label="Service ID">{service.id}</Fact>
            <Fact label="Application service state">
              {service.status.replaceAll('_', ' ')}
            </Fact>
            <Fact label="Historical product">{service.productName}</Fact>
            <Fact label="Historical description">
              {service.productDescription ?? 'Not recorded'}
            </Fact>
            <Fact label="Product reference">{service.productId}</Fact>
            <Fact label="Price version reference">
              {service.productPriceId}
            </Fact>
            <Fact label="Billing period">
              {service.billingPeriod.replaceAll('_', ' ')}
            </Fact>
            <Fact label="Recurring amount">
              {formatMinor(
                service.recurringAmount.amount,
                service.recurringAmount.currency,
              )}
            </Fact>
            <Fact label="Order number reference">
              {service.orderNumber ?? 'Not recorded'}
            </Fact>
            <Fact label="Order ID reference">
              {service.orderId ?? 'Not recorded'}
            </Fact>
            <Fact label="Order item reference">
              {service.orderItemId ?? 'Not recorded'}
            </Fact>
          </dl>
          <p className="text-sm text-slate-600">
            Order references are not current order or billing evidence. Related
            invoice and payment data are not supplied.
          </p>
        </div>
        <div className="grid min-w-0 content-start gap-3">
          <h3 className="font-bold">Recorded account and lifecycle facts</h3>
          <dl className="grid gap-3 text-sm">
            <Fact label="Server">{service.server.name}</Fact>
            <Fact label="Server hostname">{service.server.hostname}</Fact>
            <Fact label="Server ID">{service.server.id}</Fact>
            <Fact label="Server state">{service.server.status}</Fact>
            <Fact label="Adapter">{service.server.adapterKey}</Fact>
            <Fact label="Control-panel username">
              {service.controlPanelUsername ?? 'Not recorded'}
            </Fact>
            <Fact label="External account ID">
              {service.externalAccountId ?? 'Not recorded'}
            </Fact>
            <Fact label="Started">{date(service.startedAt)}</Fact>
            <Fact label="Next due">{date(service.nextDueAt)}</Fact>
            <Fact label="Activated">{date(service.activatedAt)}</Fact>
            <Fact label="Suspended">{date(service.suspendedAt)}</Fact>
            <Fact label="Suspension reason">
              {service.suspensionReason ?? 'Not recorded'}
            </Fact>
            <Fact label="Provisioning failure reason">
              {service.provisioningFailureReason ?? 'Not recorded'}
            </Fact>
            <Fact label="Cancelled">{date(service.cancelledAt)}</Fact>
            <Fact label="Cancellation reason">
              {service.cancellationReason ?? 'Not recorded'}
            </Fact>
            <Fact label="Terminated">{date(service.terminatedAt)}</Fact>
            <Fact label="Termination reason">
              {service.terminationReason ?? 'Not recorded'}
            </Fact>
            <Fact label="Created">{date(service.createdAt)}</Fact>
            <Fact label="Updated">{date(service.updatedAt)}</Fact>
          </dl>
          <p className="text-xs text-slate-500">
            Dates shown in {timeZone}. Existing API rules govern every
            deliberate lifecycle action.
          </p>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="whitespace-pre-wrap break-words font-semibold text-slate-950">
        {children}
      </dd>
    </div>
  );
}

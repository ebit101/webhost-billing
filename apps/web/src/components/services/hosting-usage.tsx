'use client';

import {
  apiSuccessResponseSchema,
  serviceUsageSchema,
  type HostingUsageMetric,
  type ServiceUsage,
} from '@webhost-billing/shared';
import { useEffect, useState } from 'react';
import { Button } from '../ui/button';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const responseSchema = apiSuccessResponseSchema(serviceUsageSchema);

export function formatUsageBytes(value: string): string {
  const count = BigInt(value);
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  let divisor = 1n;
  let index = 0;
  while (index < units.length - 1 && count >= divisor * 1024n) {
    divisor *= 1024n;
    index++;
  }
  const tenths = (count * 10n) / divisor;
  return `${tenths / 10n}${tenths % 10n ? `.${tenths % 10n}` : ''} ${units[index]}`;
}

export function HostingUsage({
  serviceId,
  customerId,
  ready = true,
}: {
  serviceId: string;
  customerId?: string;
  ready?: boolean;
}) {
  return (
    <section
      aria-label="Hosting usage"
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-bold text-slate-950">Hosting usage</h2>
      {ready ? (
        <UsageRequest
          key={`${serviceId}:${customerId ?? ''}`}
          serviceId={serviceId}
          customerId={customerId}
        />
      ) : (
        <p className="mt-3 text-sm text-slate-600">
          Usage will appear after the hosting account is ready.
        </p>
      )}
    </section>
  );
}

function UsageRequest({
  serviceId,
  customerId,
}: {
  serviceId: string;
  customerId?: string;
}) {
  const [result, setResult] = useState<ServiceUsage>();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [canRefresh, setCanRefresh] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let cooldown: ReturnType<typeof setTimeout> | undefined;
    let delay = 60;
    async function load() {
      try {
        const query = customerId
          ? `?customerId=${encodeURIComponent(customerId)}`
          : '';
        const response = await fetch(
          `${API_URL}/services/${encodeURIComponent(serviceId)}/usage${query}`,
          {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error('Usage unavailable');
        const body: unknown = await response.json();
        const parsed = responseSchema.safeParse(body);
        if (!parsed.success || parsed.data.data.serviceId !== serviceId)
          throw new Error('Usage unavailable');
        if (controller.signal.aborted) return;
        const reading = parsed.data.data;
        setResult(
          reading.status === 'AVAILABLE' &&
            reading.freshUntil &&
            Date.parse(reading.freshUntil) <= Date.now()
            ? { ...reading, status: 'STALE' }
            : reading,
        );
        setFailed(false);
        delay = parsed.data.data.retryAfterSeconds;
      } catch {
        if (controller.signal.aborted) return;
        // Do not retain another request's data on an authorization or malformed response.
        setResult(undefined);
        setFailed(true);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          cooldown = setTimeout(
            () => {
              setCanRefresh(true);
              setResult((reading) =>
                reading?.status === 'AVAILABLE' &&
                reading.freshUntil &&
                Date.parse(reading.freshUntil) <= Date.now()
                  ? { ...reading, status: 'STALE' }
                  : reading,
              );
            },
            Math.max(1, delay) * 1000,
          );
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(cooldown);
    };
  }, [serviceId, customerId, attempt]);
  const unavailable =
    result?.status === 'UNSUPPORTED'
      ? 'Usage statistics are not supported by this server.'
      : result?.status === 'NOT_READY'
        ? 'Usage is unavailable until the hosting account and server are ready.'
        : 'Usage statistics are temporarily unavailable. Try again later.';
  const sampled = result?.status === 'AVAILABLE' || result?.status === 'STALE';
  return (
    <div className="mt-3 grid gap-4">
      {loading ? (
        <p role="status" className="text-sm text-slate-600">
          Loading hosting usage…
        </p>
      ) : null}
      {sampled && result ? (
        <>
          {result.simulated ? (
            <p className="text-sm font-semibold text-brand-700">
              Fictional usage sample
            </p>
          ) : null}
          {result.status === 'STALE' ? (
            <p role="status" className="text-sm font-semibold text-amber-800">
              Saved sample is stale. Refresh when available for a newer reading.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Metric name="Disk" metric={result.disk} />
            <Metric name="Bandwidth" metric={result.bandwidth} />
          </div>
          <p className="text-xs text-slate-500">
            Sample retrieved:{' '}
            <time dateTime={result.sampledAt!}>
              {new Intl.DateTimeFormat('en-GB', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'UTC',
              }).format(new Date(result.sampledAt!))}{' '}
              UTC
            </time>
            . Bandwidth month: {result.bandwidthPeriod}. Provider statistics may
            lag.
          </p>
        </>
      ) : !loading || failed ? (
        <p role="status" className="text-sm text-slate-600">
          {unavailable}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={loading || !canRefresh}
          onClick={() => {
            setLoading(true);
            setCanRefresh(false);
            setAttempt((value) => value + 1);
          }}
        >
          Refresh usage
        </Button>
        <p className="text-xs text-slate-500">
          Readings are cached for up to five minutes. Refresh becomes available
          after the cooldown.
        </p>
      </div>
      <p className="text-xs text-slate-500">
        Usage is informational. It does not change your plan, billing or hosting
        status.
      </p>
    </div>
  );
}

function Metric({
  name,
  metric,
}: {
  name: string;
  metric: HostingUsageMetric | null;
}) {
  const used = metric?.usedBytes ?? null;
  const limit = metric?.limitBytes ?? null;
  const over = used !== null && limit !== null && BigInt(used) > BigInt(limit);
  const percentage =
    used !== null && limit !== null
      ? Number(
          BigInt(limit) === 0n
            ? BigInt(used) > 0n
              ? 100n
              : 0n
            : (BigInt(used) * 100n) / BigInt(limit) > 100n
              ? 100n
              : (BigInt(used) * 100n) / BigInt(limit),
        )
      : null;
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 p-4">
      <h3 className="font-semibold">{name}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-slate-500">Used</dt>
          <dd className="break-words font-semibold">
            {used === null ? 'Unavailable' : formatUsageBytes(used)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Limit</dt>
          <dd className="break-words font-semibold">
            {metric?.limitKind === 'UNLIMITED'
              ? 'Unlimited'
              : limit !== null
                ? formatUsageBytes(limit)
                : 'Unavailable'}
          </dd>
        </div>
      </dl>
      {percentage !== null ? (
        <progress
          aria-label={`${name} usage`}
          max={100}
          value={percentage}
          className="mt-3 h-2 w-full accent-brand-700"
        />
      ) : null}
      {over ? (
        <p className="mt-2 text-xs font-semibold text-amber-800">
          Over the reported limit
        </p>
      ) : null}
    </div>
  );
}

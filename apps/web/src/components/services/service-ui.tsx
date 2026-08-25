import type { ServiceStatus } from '@webhost-billing/shared';
import type { StatusTone } from '../ui/status-badge';

export function serviceTone(status: ServiceStatus): StatusTone {
  if (status === 'ACTIVE') return 'success';
  if (status === 'PENDING' || status === 'PROVISIONING') return 'info';
  if (status === 'SUSPENDED') return 'warning';
  return 'danger';
}

export function serviceDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(
        new Date(value),
      )
    : '—';
}

export function serviceError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The service request could not be completed.';
}

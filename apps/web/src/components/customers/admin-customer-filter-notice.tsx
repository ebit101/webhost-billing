import type { CustomerDetail } from '@webhost-billing/shared';
import Link from 'next/link';

export function AdminCustomerFilterNotice({
  customer,
  invalid,
  clearHref,
  resourceLabel,
}: {
  customer?: CustomerDetail;
  invalid: boolean;
  clearHref: string;
  resourceLabel: string;
}) {
  if (invalid) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
      >
        <p>
          The customer filter is invalid and was not applied. No customer
          context was inferred.
        </p>
        <Link className="font-bold underline" href={clearHref}>
          Clear invalid filter
        </Link>
      </div>
    );
  }
  if (!customer) return null;

  return (
    <section
      aria-label="Customer filter"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4"
    >
      <div>
        <p className="text-xs font-bold tracking-wider text-brand-800">
          Filtered customer context
        </p>
        <p className="mt-1 text-sm text-slate-700">
          Showing {resourceLabel} for{' '}
          <Link
            className="font-bold text-brand-800 hover:underline"
            href={`/admin/customers/${customer.id}`}
          >
            {customerName(customer)}
          </Link>{' '}
          · {customer.customerNumber}
        </p>
      </div>
      <Link
        className="text-sm font-bold text-brand-800 hover:underline"
        href={clearHref}
      >
        Clear customer filter
      </Link>
    </section>
  );
}

export function customerName(customer: CustomerDetail): string {
  return `${customer.firstName} ${customer.lastName}`;
}

export function filteredEmptyTitle(
  resourceLabel: string,
  customer?: CustomerDetail,
): string | undefined {
  return customer
    ? `No ${resourceLabel} for ${customerName(customer)}`
    : undefined;
}

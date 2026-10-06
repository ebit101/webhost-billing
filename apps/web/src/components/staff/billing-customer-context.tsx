'use client';
import {
  customerDetailSchema,
  type CustomerDetail,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authenticatedGet } from '../../lib/auth-api';
import { ErrorState, LoadingState } from '../ui/feedback-state';
import { PageHeader } from '../ui/page-header';

export function BillingCustomerContext({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<CustomerDetail>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void authenticatedGet<unknown>(`/customers/${customerId}`)
      .then((data) => {
        const parsed = customerDetailSchema.parse(data);
        if (parsed.id !== customerId) throw new Error('Mismatched customer');
        if (active) setCustomer(parsed);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [customerId]);
  if (error)
    return (
      <ErrorState description="Customer context could not be loaded. Return to the customer directory and try again." />
    );
  if (!customer || customer.id !== customerId)
    return <LoadingState label="Loading customer context" />;
  return (
    <div className="grid gap-5">
      <PageHeader
        title={`${customer.firstName} ${customer.lastName}`}
        description="Read-only billing context. Only a full administrator can change customer identity or account access."
      />
      <dl className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <dt>Customer number</dt>
          <dd>{customer.customerNumber}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{customer.email}</dd>
        </div>
        <div>
          <dt>Company</dt>
          <dd>{customer.companyName ?? 'Not provided'}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{customer.phone ?? 'Not provided'}</dd>
        </div>
        <div>
          <dt>Billing address</dt>
          <dd>
            {[
              customer.addressLine1,
              customer.addressLine2,
              customer.city,
              customer.region,
              customer.postalCode,
              customer.countryCode,
            ]
              .filter(Boolean)
              .join(', ')}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-4">
        <Link
          href={`/admin/invoices?customerId=${customer.id}`}
          className="underline"
        >
          Customer invoices
        </Link>
        <Link
          href={`/admin/payments?customerId=${customer.id}`}
          className="underline"
        >
          Customer payments
        </Link>
        <Link href="/admin/customers" className="underline">
          Back to customers
        </Link>
      </div>
    </div>
  );
}

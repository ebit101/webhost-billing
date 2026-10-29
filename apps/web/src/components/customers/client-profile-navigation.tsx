'use client';
import {
  customerSummarySchema,
  type CustomerDetail,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authenticatedPaginatedGet } from '../../lib/auth-api';
import {
  clientRecordHref,
  type ClientRecordSection,
} from '../../lib/client-record-href';
import { fieldClass } from './customer-fields';

export function ClientProfileNavigation({
  customer,
  section,
}: {
  customer: CustomerDetail;
  section: ClientRecordSection;
}) {
  const router = useRouter();
  const [clients, setClients] = useState<
    Array<
      Pick<CustomerDetail, 'id' | 'firstName' | 'lastName' | 'customerNumber'>
    >
  >([customer]);
  useEffect(() => {
    let active = true;
    void authenticatedPaginatedGet<unknown>('/customers?pageSize=100')
      .then((result) => {
        const rows = customerSummarySchema.array().parse(result.data);
        if (active)
          setClients([
            customer,
            ...rows.filter((row) => row.id !== customer.id),
          ]);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [customer]);
  return (
    <div className="grid min-w-0 gap-3">
      <label className="max-w-xl text-sm font-semibold">
        Client
        <select
          className={fieldClass}
          value={customer.id}
          onChange={(event) =>
            router.push(clientRecordHref(event.target.value, section))
          }
        >
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.firstName} {client.lastName} · {client.customerNumber}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-slate-500">
        Current client and up to 100 recent clients. Find older clients through
        Customers.
      </p>
      <nav
        aria-label="Client profile"
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
      >
        {(
          [
            ['summary', 'Summary'],
            ['profile', 'Profile'],
            ['services', 'Products/services'],
            ['domains', 'Domains'],
            ['orders', 'Orders'],
            ['invoices', 'Invoices'],
            ['payments', 'Payments'],
            ['support', 'Support'],
            ['email-history', 'Email history'],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            prefetch={false}
            aria-current={section === value ? 'page' : undefined}
            href={clientRecordHref(customer.id, value)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 ${section === value ? 'bg-brand-700 text-white hover:bg-brand-800' : 'border border-slate-200 bg-white text-slate-700 hover:bg-brand-50'}`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

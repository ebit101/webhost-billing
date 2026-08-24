'use client';

import type { Invoice, InvoiceActionRequest } from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authMutation, authenticatedGet } from '../../lib/auth-api';
import { Button, buttonStyles } from '../ui/button';
import { ErrorState, LoadingState } from '../ui/feedback-state';
import { Icon } from '../ui/icon';
import { InvoiceDocument } from './invoice-document';
import { InvoiceDraftEditor } from './invoice-draft-editor';
import { invoiceError } from './invoice-ui';
import { CustomerManualPayment } from '../payments/customer-manual-payment';

export function InvoiceDetail({
  invoiceId,
  mode,
}: {
  invoiceId: string;
  mode: 'admin' | 'customer' | 'print';
}) {
  const [invoice, setInvoice] = useState<Invoice>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void authenticatedGet<Invoice>(`/invoices/${invoiceId}`)
      .then((result) => {
        if (active) setInvoice(result);
      })
      .catch((caught: unknown) => {
        if (active) setError(invoiceError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [invoiceId]);

  async function action(value: InvoiceActionRequest['action']) {
    setSaving(true);
    setError('');
    try {
      setInvoice(
        await authMutation<Invoice>(`/invoices/${invoiceId}/action`, 'PATCH', {
          action: value,
        }),
      );
    } catch (caught) {
      setError(invoiceError(caught));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading invoice" />;
  if (error && !invoice) return <ErrorState description={error} />;
  if (!invoice) return <ErrorState description="Invoice was not found." />;
  return (
    <div
      className={
        mode === 'print' ? 'mx-auto max-w-5xl p-4 sm:p-8' : 'grid gap-6'
      }
    >
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <Link
          href={mode === 'admin' ? '/admin/invoices' : '/portal/invoices'}
          className={buttonStyles('ghost')}
        >
          ← Back to invoices
        </Link>
        <div className="flex flex-wrap gap-2">
          {mode === 'admin' && invoice.status === 'DRAFT' ? (
            <Button disabled={saving} onClick={() => void action('ISSUE')}>
              Issue invoice
            </Button>
          ) : null}
          {mode === 'admin' &&
          (invoice.status === 'DRAFT' ||
            invoice.status === 'UNPAID' ||
            invoice.status === 'OVERDUE') ? (
            <Button
              variant="danger"
              disabled={saving}
              onClick={() => void action('CANCEL')}
            >
              Cancel invoice
            </Button>
          ) : null}
          {mode === 'customer' ? (
            <Link
              href={`/invoices/${invoice.id}/print`}
              className={buttonStyles('secondary')}
            >
              <Icon name="invoice" className="size-4" /> Printable view
            </Link>
          ) : null}
          {mode === 'print' ? (
            <Button variant="secondary" onClick={() => window.print()}>
              Print invoice
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p
          role="alert"
          className="print:hidden rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      ) : null}
      {mode === 'admin' && invoice.status === 'DRAFT' ? (
        <InvoiceDraftEditor invoice={invoice} onSaved={setInvoice} />
      ) : null}
      <InvoiceDocument invoice={invoice} />
      {mode === 'customer' ? <CustomerManualPayment invoice={invoice} /> : null}
    </div>
  );
}

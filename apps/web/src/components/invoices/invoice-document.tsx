import type { Invoice } from '@webhost-billing/shared';
import { StatusBadge } from '../ui/status-badge';
import { formatMinor, invoiceDate, invoiceTone } from './invoice-ui';

export function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  return (
    <article className="invoice-document rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
      <header className="flex flex-col gap-6 border-b border-slate-200 pb-7 sm:flex-row sm:items-start sm:justify-between">
        <Identity identity={invoice.businessIdentity} />
        <div className="sm:text-right">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Invoice
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">
            {invoice.invoiceNumber}
          </h1>
          <div className="mt-3 sm:flex sm:justify-end">
            <StatusBadge tone={invoiceTone(invoice.status)}>
              {invoice.status.replaceAll('_', ' ')}
            </StatusBadge>
          </div>
        </div>
      </header>

      <div className="grid gap-7 py-7 sm:grid-cols-2">
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            Bill to
          </h2>
          <p className="mt-2 font-bold text-slate-950">
            {invoice.customerName}
          </p>
          <p className="mt-1 text-sm text-slate-600">{invoice.customerEmail}</p>
          <Address address={invoice.customerAddress} />
          {invoice.taxIdentity ? (
            <p className="mt-2 text-sm text-slate-600">
              Tax ID: {invoice.taxIdentity.taxIdentifier}
            </p>
          ) : null}
        </section>
        <dl className="grid content-start gap-3 text-sm sm:justify-self-end sm:text-right">
          <DocumentMeta
            label="Created"
            value={invoiceDate(invoice.createdAt)}
          />
          <DocumentMeta label="Issued" value={invoiceDate(invoice.issuedAt)} />
          <DocumentMeta label="Due" value={invoiceDate(invoice.dueAt)} />
          {invoice.orderNumber ? (
            <DocumentMeta label="Order" value={invoice.orderNumber} />
          ) : null}
        </dl>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit</th>
              <th className="px-4 py-3 text-right">Discount</th>
              <th className="px-4 py-3 text-right">Tax</th>
              <th className="px-4 py-3 text-right">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-4 text-slate-900">
                  <p className="font-semibold">{item.description}</p>
                  {item.servicePeriodStart || item.servicePeriodEnd ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Service period {invoiceDate(item.servicePeriodStart)} –{' '}
                      {invoiceDate(item.servicePeriodEnd)}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-4 text-right">{item.quantity}</td>
                <MoneyCell money={item.unitAmount} />
                <MoneyCell money={item.discountAmount} />
                <MoneyCell money={item.taxAmount} />
                <MoneyCell money={item.lineTotal} strong />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-7 grid gap-3 sm:ml-auto sm:max-w-sm">
        <TotalRow label="Subtotal" money={invoice.subtotal} />
        <TotalRow label="Discount" money={invoice.discountTotal} subtract />
        <TotalRow label="Tax" money={invoice.taxTotal} />
        <TotalRow label="Invoice total" money={invoice.total} strong />
        <TotalRow label="Credit" money={invoice.creditTotal} subtract />
        <TotalRow label="Paid" money={invoice.amountPaid} subtract />
        <div className="flex justify-between border-t-2 border-slate-950 pt-4 text-lg font-bold text-slate-950">
          <dt>Balance due</dt>
          <dd>
            {formatMinor(
              invoice.balanceDue.amount,
              invoice.balanceDue.currency,
            )}
          </dd>
        </div>
      </div>
    </article>
  );
}

function Identity({ identity }: { identity: Invoice['businessIdentity'] }) {
  return (
    <div>
      <p className="text-xl font-bold text-slate-950">{identity.name}</p>
      {[identity.addressLine1, identity.addressLine2, identity.city]
        .filter(Boolean)
        .map((line) => (
          <p key={line} className="mt-1 text-sm text-slate-600">
            {line}
          </p>
        ))}
      {identity.email ? (
        <p className="mt-1 text-sm text-slate-600">{identity.email}</p>
      ) : null}
      {identity.taxIdentifier ? (
        <p className="mt-1 text-sm text-slate-600">
          Tax ID: {identity.taxIdentifier}
        </p>
      ) : null}
    </div>
  );
}

function Address({ address }: { address: Invoice['customerAddress'] }) {
  return (
    <address className="mt-3 text-sm not-italic leading-6 text-slate-600">
      {address.line1}
      <br />
      {address.line2 ? (
        <>
          {address.line2}
          <br />
        </>
      ) : null}
      {[address.city, address.region, address.postalCode]
        .filter(Boolean)
        .join(', ')}
      <br />
      {address.countryCode}
    </address>
  );
}

function DocumentMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-8 sm:justify-end">
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function MoneyCell({
  money,
  strong,
}: {
  money: Invoice['total'];
  strong?: boolean;
}) {
  return (
    <td
      className={`px-4 py-4 text-right ${strong ? 'font-bold text-slate-950' : ''}`}
    >
      {formatMinor(money.amount, money.currency)}
    </td>
  );
}

function TotalRow({
  label,
  money,
  subtract,
  strong,
}: {
  label: string;
  money: Invoice['total'];
  subtract?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between text-sm ${strong ? 'font-bold' : ''}`}
    >
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-slate-950">
        {subtract && money.amount !== '0' ? '−' : ''}
        {formatMinor(money.amount, money.currency)}
      </dd>
    </div>
  );
}

'use client';
import { parseCalendarDateTime } from '@webhost-billing/shared';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  adminDomainQuoteRequestSchema,
  domainDetailSchema,
  domainOfferSchema,
  domainQuoteSchema,
  type CustomerDetail,
  type CustomerSummary,
  type DomainContact,
  type DomainOffer,
  type DomainQuote,
} from '@webhost-billing/shared';
import Link from 'next/link';
import {
  authenticatedGet,
  authenticatedPaginatedGet,
  authMutation,
} from '../../lib/auth-api';
import { domainContactDraft } from '../../lib/domain-contact-draft';
import { Card, fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { formatMinor } from './order-ui';

const contactFields = [
  ['name', 'Registrant name'],
  ['company', 'Company'],
  ['address', 'Address'],
  ['addressLine2', 'Address line 2'],
  ['city', 'City'],
  ['region', 'Region'],
  ['postalCode', 'Postal code'],
  ['country', 'Country code'],
  ['email', 'Registrant email'],
  ['phoneCountryCode', 'Phone country code'],
  ['phone', 'Phone number'],
] as const;

export function AdminDomainOrderForm({ onCreated }: { onCreated: () => void }) {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [offers, setOffers] = useState<DomainOffer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [offerId, setOfferId] = useState('');
  const [contact, setContact] = useState<Partial<DomainContact>>({});
  const [quote, setQuote] = useState<DomainQuote>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ invoiceId: string }>();
  const submissionKey = useRef('');
  const formRevision = useRef(0);
  const selectedCustomer = useRef('');

  useEffect(() => {
    void Promise.all([
      authenticatedPaginatedGet<CustomerSummary>('/customers?pageSize=100'),
      authenticatedGet<unknown>('/domains/offers'),
    ])
      .then(([customerResult, offerResult]) => {
        setCustomers(customerResult.data);
        setOffers(
          domainOfferSchema
            .array()
            .parse(offerResult)
            .filter((entry) => entry.simulated),
        );
      })
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error
            ? caught.message
            : 'Could not load domain order options.',
        ),
      );
  }, []);

  async function selectCustomer(id: string) {
    selectedCustomer.current = id;
    setCustomerId(id);
    setQuote(undefined);
    setCreated(undefined);
    setContact({});
    if (!id) return;
    try {
      const detail = await authenticatedGet<CustomerDetail>(`/customers/${id}`);
      if (selectedCustomer.current === id)
        setContact(domainContactDraft(detail));
    } catch {
      setError(
        'Customer details could not be prefilled. Enter registrant details manually.',
      );
    }
  }

  async function requestQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setQuote(undefined);
    setCreated(undefined);
    const revision = formRevision.current;
    const form = new FormData(event.currentTarget);
    const selected = offers.find((entry) => entry.id === offerId);
    const consentDate = new Date(
      parseCalendarDateTime(String(form.get('consentedAt'))) ?? '',
    );
    const input = adminDomainQuoteRequestSchema.safeParse({
      customerId,
      offerId,
      domainName: form.get('domainName'),
      contact,
      agreement: 'fictional-registration-v1',
      ...(selected?.selectionConsentRevision
        ? { selectionConsentRevision: selected.selectionConsentRevision }
        : {}),
      offlineConsent: {
        method: form.get('consentMethod'),
        reference: form.get('consentReference'),
        consentedAt: Number.isNaN(consentDate.getTime())
          ? ''
          : consentDate.toISOString(),
        attestation: form.get('attestation') === 'on',
      },
    });
    if (!input.success) {
      setError(
        'Select a customer and offer, complete registrant details, and record the customer’s offline consent.',
      );
      return;
    }
    setBusy(true);
    try {
      const result = domainQuoteSchema.parse(
        await authMutation('/domains/admin/quotes', 'POST', input.data),
      );
      if (revision !== formRevision.current) return;
      setQuote(result);
      submissionKey.current = crypto.randomUUID();
      setNotice(
        'Review the quoted price, then create the unpaid order and invoice.',
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not quote the domain.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function createOrder() {
    if (!quote || !customerId) return;
    setBusy(true);
    setError('');
    try {
      const result = domainDetailSchema.parse(
        await authMutation('/domains/admin/orders', 'POST', {
          customerId,
          quoteId: quote.id,
          submissionKey: submissionKey.current,
        }),
      );
      if (!result.invoiceId || result.origin === 'EXISTING')
        throw new Error(
          'The registration order invoice could not be confirmed.',
        );
      setCreated({ invoiceId: result.invoiceId });
      setQuote(undefined);
      setNotice(
        'Domain order and unpaid invoice created. The customer can view them in the portal. Registration still requires verified payment and separate administrator approval.',
      );
      onCreated();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not create the domain order.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Domain registration for a customer"
      description="Enter a customer request received by phone, in person, or in writing. This form uses simulated offers only."
    >
      <p className="mb-4 text-sm text-slate-600">
        One domain, one year. No transfer, automatic registration, or provider
        charge. Payment may be made later; registration needs verified payment
        and separate approval.
      </p>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-3 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {created && (
        <p className="mb-4 text-sm">
          <Link className="text-blue-700 underline" href="/admin/orders">
            View order list
          </Link>
          {' · '}
          <Link
            className="text-blue-700 underline"
            href={`/admin/invoices/${created.invoiceId}`}
          >
            View invoice
          </Link>
        </p>
      )}
      <form
        onSubmit={(event) => void requestQuote(event)}
        onChange={() => {
          formRevision.current += 1;
          setQuote(undefined);
          setCreated(undefined);
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <label className="text-sm font-medium">
          Domain customer
          <select
            className={fieldClass}
            required
            value={customerId}
            onChange={(event) => void selectCustomer(event.target.value)}
          >
            <option value="">Select customer</option>
            {customers
              .filter((entry) => entry.status === 'ACTIVE')
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.firstName} {entry.lastName} — {entry.email}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Domain offer
          <select
            className={fieldClass}
            required
            value={offerId}
            onChange={(event) => setOfferId(event.target.value)}
          >
            <option value="">Select simulated offer</option>
            {offers.map((entry) => (
              <option key={entry.id} value={entry.id}>
                .{entry.tld} ·{' '}
                {formatMinor(entry.sellingAmount, entry.currency)} · One year
              </option>
            ))}
          </select>
        </label>
        {offers.find((entry) => entry.id === offerId) && (
          <p className="sm:col-span-2 text-sm text-slate-600">
            Nameservers:{' '}
            {offers
              .find((entry) => entry.id === offerId)
              ?.nameservers.join(', ')}
            . Eligible registrar connections:{' '}
            {offers
              .find((entry) => entry.id === offerId)
              ?.eligibleRegistrars?.map((entry) => entry.name)
              .join(', ') ?? 'Simulated registrar'}
            . Agreement: fictional-registration-v1.
          </p>
        )}
        <label className="text-sm font-medium sm:col-span-2">
          Domain name
          <input
            className={fieldClass}
            name="domainName"
            required
            placeholder="fictional-example.com"
          />
        </label>
        {contactFields.map(([key, label]) => (
          <label key={key} className="text-sm font-medium">
            {label}
            <input
              className={fieldClass}
              required={key !== 'addressLine2'}
              type={key === 'email' ? 'email' : 'text'}
              maxLength={key === 'email' ? 320 : 160}
              value={contact[key] ?? ''}
              onChange={(event) =>
                setContact((previous) => ({
                  ...previous,
                  [key]: event.target.value,
                }))
              }
            />
          </label>
        ))}
        <div className="sm:col-span-2 border-t border-slate-200 pt-4">
          <p className="mb-3 font-semibold">Recorded customer consent</p>
          <p className="mb-3 text-sm text-slate-600">
            Confirm the customer authorized these registrant details,
            fictional-registration-v1, and the displayed registrar and DNS
            selection for this simulated request.
          </p>
        </div>
        <label className="text-sm font-medium">
          Consent method
          <select className={fieldClass} name="consentMethod" required>
            <option value="PHONE">Phone</option>
            <option value="IN_PERSON">In person</option>
            <option value="WRITTEN">Written message</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Consent date and time
          <input
            className={fieldClass}
            name="consentedAt"
            type="text"
            placeholder="dd/mm/yyyy hh:mm"
            pattern="[0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2}"
            title="Use dd/mm/yyyy hh:mm (local time)"
            required
          />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Consent record reference
          <input
            className={fieldClass}
            name="consentReference"
            required
            minLength={3}
            maxLength={160}
            placeholder="Internal ticket or message reference"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <input name="attestation" type="checkbox" required /> I checked the
          customer’s consent record and the registrant details above.
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy || !offers.length}>
            {busy ? 'Checking…' : 'Check domain and price'}
          </Button>
        </div>
      </form>
      {quote && (
        <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="mb-3 text-sm font-semibold">
            {quote.domainName} ·{' '}
            {formatMinor(quote.sellingAmount, quote.currency)} · quote expires{' '}
            {new Date(quote.expiresAt).toLocaleString('en-GB')}
          </p>
          <Button disabled={busy} onClick={() => void createOrder()}>
            {busy ? 'Creating…' : 'Create order and unpaid invoice'}
          </Button>
        </div>
      )}
    </Card>
  );
}

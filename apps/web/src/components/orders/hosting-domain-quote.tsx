'use client';

import {
  authenticatedIdentitySchema,
  customerDetailSchema,
  domainOfferSchema,
  domainQuoteRequestSchema,
  domainQuoteSchema,
  type DomainContact,
  type DomainOffer,
  type DomainQuote,
} from '@webhost-billing/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { authMutation, authenticatedGet } from '../../lib/auth-api';
import { domainContactDraft } from '../../lib/domain-contact-draft';
import { fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { formatMinor } from './order-ui';

const contactLabels: {
  key: Exclude<keyof DomainContact, 'publishOrganization'>;
  label: string;
}[] = [
  { key: 'name', label: 'Registrant name' },
  { key: 'company', label: 'Company' },
  { key: 'email', label: 'Registrant email' },
  { key: 'address', label: 'Address' },
  { key: 'addressLine2', label: 'Address line 2' },
  { key: 'city', label: 'City' },
  { key: 'region', label: 'Region' },
  { key: 'postalCode', label: 'Postal code' },
  { key: 'country', label: 'Country code' },
  { key: 'phoneCountryCode', label: 'Phone country code' },
  { key: 'phone', label: 'Phone number' },
];

export function HostingDomainQuote({
  quote,
  onQuote,
}: {
  quote?: DomainQuote;
  onQuote: (quote?: DomainQuote) => void;
}) {
  const [offers, setOffers] = useState<DomainOffer[]>([]);
  const [offerId, setOfferId] = useState('');
  const [label, setLabel] = useState('');
  const [contact, setContact] = useState<Partial<DomainContact>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void authenticatedGet<unknown>('/domains/offers')
      .then((result) => {
        if (!active) return;
        const available = domainOfferSchema
          .array()
          .parse(result)
          .filter((offer) => offer.simulated);
        setOffers(available);
        setOfferId(available[0]?.id ?? '');
      })
      .catch((caught: unknown) => {
        if (active) setError(message(caught));
      });
    void authenticatedGet<unknown>('/auth/me')
      .then(async (result) => {
        const identity = authenticatedIdentitySchema.parse(result);
        if (identity.role !== 'CUSTOMER') return;
        const detail = customerDetailSchema.parse(
          await authenticatedGet<unknown>(`/customers/${identity.customerId}`),
        );
        if (active)
          setContact((previous) => ({
            ...domainContactDraft(detail),
            ...previous,
          }));
      })
      .catch(() => {
        // The customer can enter registrant details manually.
      });
    return () => {
      active = false;
    };
  }, []);

  async function requestQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const offer = offers.find((item) => item.id === offerId);
    const parsed = domainQuoteRequestSchema.safeParse({
      offerId,
      domainName: offer ? `${label.trim().toLowerCase()}.${offer.tld}` : '',
      contact,
      agreement: 'fictional-registration-v1',
      consent: true,
      ...(offer?.selectionConsentRevision
        ? { selectionConsentRevision: offer.selectionConsentRevision }
        : {}),
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          'Review the domain and registrant details.',
      );
      return;
    }
    setBusy(true);
    setError('');
    onQuote(undefined);
    try {
      const created = domainQuoteSchema.parse(
        await authMutation<unknown>('/domains/quotes', 'POST', parsed.data),
      );
      if (!created.simulated)
        throw new Error(
          'Only simulated registration is available in this flow.',
        );
      onQuote(created);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <p className="text-sm leading-6 text-slate-600">
        Request a one-year simulated registration quote. The domain and hosting
        plan will appear on one unpaid invoice. No external registrar call
        occurs.
      </p>
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {!offers.length ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Simulated domain registration is unavailable here. You can still order
          hosting with an existing domain.
        </p>
      ) : (
        <form
          onSubmit={(event) => void requestQuote(event)}
          className="grid gap-4 sm:grid-cols-2"
        >
          <label className="block text-sm font-semibold text-slate-700">
            Domain name
            <input
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                onQuote(undefined);
              }}
              className={fieldClass}
              required
              placeholder="yourbusiness"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Domain extension
            <select
              value={offerId}
              onChange={(event) => {
                setOfferId(event.target.value);
                onQuote(undefined);
              }}
              className={fieldClass}
              required
            >
              {offers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  .{offer.tld} · {formatMinor(offer.sellingAmount, 'BDT')} /
                  year
                </option>
              ))}
            </select>
          </label>
          <div className="border-t border-slate-200 pt-4 sm:col-span-2">
            <h3 className="font-semibold text-slate-950">Registrant details</h3>
            <p className="mt-1 text-sm text-slate-600">
              Review the details before requesting a quote.
            </p>
          </div>
          {contactLabels.map(({ key, label: fieldLabel }) => (
            <label
              key={key}
              className="block text-sm font-semibold text-slate-700"
            >
              {fieldLabel}
              <input
                value={contact[key] ?? ''}
                onChange={(event) => {
                  setContact((previous) => ({
                    ...previous,
                    [key]: event.target.value,
                  }));
                  onQuote(undefined);
                }}
                className={fieldClass}
                type={key === 'email' ? 'email' : 'text'}
                required={key !== 'addressLine2'}
                maxLength={key === 'email' ? 320 : 160}
              />
            </label>
          ))}
          {offers.find((offer) => offer.id === offerId)?.eligibleRegistrars ? (
            <p className="text-xs leading-5 text-slate-600 sm:col-span-2">
              Simulated registrar selection:{' '}
              {offers
                .find((offer) => offer.id === offerId)
                ?.eligibleRegistrars?.map((entry) => entry.name)
                .join(', ')}
              .
            </p>
          ) : null}
          <label className="flex gap-3 text-sm leading-6 text-slate-700 sm:col-span-2">
            <input type="checkbox" required className="mt-1" />
            <span>
              I authorize use of this fictional registrant data for the local
              simulation and accept fictional-registration-v1. No real
              registration or provider charge occurs.
            </span>
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Checking domain…' : 'Check domain and get quote'}
            </Button>
          </div>
        </form>
      )}
      {quote ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          {quote.domainName} is available in the simulation at{' '}
          {formatMinor(quote.sellingAmount, 'BDT')} for one year. Quote expires
          at {new Date(quote.expiresAt).toLocaleTimeString()}.
        </p>
      ) : null}
    </div>
  );
}

function message(caught: unknown): string {
  return caught instanceof Error
    ? caught.message
    : 'The domain quote could not be loaded.';
}

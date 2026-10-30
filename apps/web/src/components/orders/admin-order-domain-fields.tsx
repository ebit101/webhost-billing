'use client';

import { useEffect, useRef, useState } from 'react';
import {
  adminOrderDomainOptionsSchema,
  adminDomainQuoteRequestSchema,
  domainOfferSchema,
  domainQuoteSchema,
  customerDetailSchema,
  type AdminOrderDomainOptions,
  type CreateAdminOrderRequest,
  type DomainContact,
  type DomainOffer,
  type DomainQuote,
} from '@webhost-billing/shared';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { domainContactDraft } from '../../lib/domain-contact-draft';
import { ExistingDomainLink } from '../domains/existing-domain-link';
import { fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { formatMinor } from './order-ui';

export type AdminDomainDraft = {
  request: NonNullable<CreateAdminOrderRequest['domainOrder']>;
  amount: string;
};
const contactLabels = [
  ['name', 'Registrant name'],
  ['company', 'Company'],
  ['email', 'Registrant email'],
  ['address', 'Address'],
  ['addressLine2', 'Address line 2'],
  ['city', 'City'],
  ['region', 'Region'],
  ['postalCode', 'Postal code'],
  ['country', 'Country code'],
  ['phoneCountryCode', 'Phone country code'],
  ['phone', 'Phone number'],
] as const;

export function AdminOrderDomainFields({
  customerId,
  domainName,
  onDomainName,
  onSelection,
  onBusy,
  disabled,
}: {
  customerId: string;
  domainName: string;
  onDomainName: (name: string) => void;
  onSelection: (value?: AdminDomainDraft) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
}) {
  const [options, setOptions] = useState<AdminOrderDomainOptions>();
  const [refresh, setRefresh] = useState(0);
  const [domainId, setDomainId] = useState('');
  const [priceId, setPriceId] = useState('');
  const [send, setSend] = useState(false);
  const [error, setError] = useState('');
  const [offers, setOffers] = useState<DomainOffer[]>([]);
  const [offerId, setOfferId] = useState('');
  const [contact, setContact] = useState<Partial<DomainContact>>({});
  const [quote, setQuote] = useState<DomainQuote>();
  const [quoteDomainName, setQuoteDomainName] = useState(domainName);
  if (quoteDomainName !== domainName) {
    setQuoteDomainName(domainName);
    setQuote(undefined);
  }
  const [busy, setBusy] = useState(false);
  const [consentMethod, setConsentMethod] = useState('PHONE');
  const [consentedAt, setConsentedAt] = useState('');
  const [reference, setReference] = useState('');
  const [attestation, setAttestation] = useState(false);
  const revision = useRef(0);
  const mounted = useRef(true);
  const pendingLinkedDomain = useRef('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (customerId)
      void authenticatedGet<unknown>(
        `/orders/admin/domain-options?customerId=${encodeURIComponent(customerId)}`,
      )
        .then((value) => {
          const parsed = adminOrderDomainOptionsSchema.parse(value);
          if (parsed.customerId !== customerId)
            throw new Error('Domain choices do not match this client.');
          if (active) {
            setOptions(parsed);
            setError('');
            const linked = parsed.domains.find(
              (d) => d.id === pendingLinkedDomain.current,
            );
            if (linked) {
              pendingLinkedDomain.current = '';
              onDomainName(linked.domainName);
            }
          }
        })
        .catch(() => {
          if (active)
            setError(
              'Domain choices are unavailable. Select an active verified client and use a full administrator with MFA.',
            );
        });
    return () => {
      active = false;
    };
  }, [customerId, refresh, onDomainName]);

  useEffect(() => {
    let active = true;
    if (send && customerId) {
      const expectedRevision = revision.current;
      void authenticatedGet<unknown>('/domains/offers')
        .then((value) => {
          if (active) setOffers(domainOfferSchema.array().parse(value));
        })
        .catch(() => {
          if (active)
            setError(
              'Registration offers are unavailable. Configure the catalogue and separately enable an approved registrar before checking availability.',
            );
        });
      void authenticatedGet<unknown>(`/customers/${customerId}`)
        .then((value) => {
          if (active && revision.current === expectedRevision)
            setContact(domainContactDraft(customerDetailSchema.parse(value)));
        })
        .catch(() => {
          if (active) setError('Client contact details could not be loaded.');
        });
    }
    return () => {
      active = false;
    };
  }, [send, customerId]);

  const existing = options?.domains.find(
    (d) => d.id === domainId && d.domainName === domainName,
  );
  const price = options?.prices.find(
    (p) => p.priceId === priceId && domainName.endsWith('.' + p.tld),
  );
  useEffect(() => {
    if (send && quote?.domainName === domainName)
      onSelection({
        request: {
          mode: 'REGISTRATION',
          quoteId: quote.id,
          sendToRegistrar: true,
        },
        amount: quote.sellingAmount,
      });
    else if (!send && existing && price)
      onSelection({
        request: {
          mode: 'EXISTING',
          domainId: existing.id,
          priceId: price.priceId,
          sendToRegistrar: false,
        },
        amount: price.amount.amount,
      });
    else onSelection(undefined);
  }, [send, quote, domainName, existing, price, onSelection]);

  function invalidate() {
    revision.current += 1;
    setQuote(undefined);
    onSelection(undefined);
  }
  async function checkQuote() {
    invalidate();
    setError('');
    const selected = offers.find((o) => o.id === offerId);
    const date = new Date(consentedAt);
    const parsed = adminDomainQuoteRequestSchema.safeParse({
      customerId,
      offerId,
      domainName,
      contact,
      agreement: selected?.simulated
        ? 'fictional-registration-v1'
        : 'resellbiz-registration-v1',
      customerPolicyConsent: true,
      ...(selected?.selectionConsentRevision
        ? { selectionConsentRevision: selected.selectionConsentRevision }
        : {}),
      offlineConsent: {
        method: consentMethod,
        reference,
        consentedAt: Number.isNaN(date.getTime()) ? '' : date.toISOString(),
        attestation,
      },
    });
    if (!parsed.success) {
      setError(
        'Review the offer, registrant details and recorded customer consent.',
      );
      return;
    }
    const expected = revision.current;
    setBusy(true);
    onBusy(true);
    try {
      const value = domainQuoteSchema.parse(
        await authMutation('/domains/admin/quotes', 'POST', parsed.data),
      );
      if (
        mounted.current &&
        revision.current === expected &&
        value.domainName === domainName
      )
        setQuote(value);
    } catch {
      if (mounted.current)
        setError(
          'The registration quote could not be verified. No order or registration was submitted.',
        );
    } finally {
      if (mounted.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }

  return (
    <fieldset
      className="md:col-span-2 xl:col-span-5 rounded-xl border border-slate-200 p-4"
      disabled={disabled || busy}
    >
      <legend className="px-2 font-semibold">
        Domain service in this order
      </legend>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={send}
          onChange={(e) => {
            invalidate();
            setSend(e.target.checked);
            setError('');
          }}
        />
        Send registration to registrar
      </label>
      <p className="my-2 text-sm text-slate-600">
        Unchecked: bill an ownership-verified existing domain without
        registration. Checked: create a new registration request; dispatch still
        requires verified payment and a separate administrator approval.
      </p>
      {error && (
        <p role="alert" className="my-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!customerId ? (
        <p>Select the client first.</p>
      ) : !send ? (
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">
            Verified existing domain
            <select
              aria-label="Verified existing domain"
              className={fieldClass}
              required
              value={domainId}
              onChange={(e) => {
                invalidate();
                setDomainId(e.target.value);
                const d = options?.domains.find((d) => d.id === e.target.value);
                if (d) onDomainName(d.domainName);
              }}
            >
              <option value="">Select client domain</option>
              {options?.domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.domainName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Annual domain price
            <select
              aria-label="Annual domain price"
              className={fieldClass}
              required
              value={priceId}
              onChange={(e) => {
                invalidate();
                setPriceId(e.target.value);
              }}
            >
              <option value="">Select catalogue price</option>
              {options?.prices
                .filter((p) => !domainName || domainName.endsWith('.' + p.tld))
                .map((p) => (
                  <option key={p.priceId} value={p.priceId}>
                    .{p.tld} · {formatMinor(p.amount.amount, p.amount.currency)}{' '}
                    · One year
                  </option>
                ))}
            </select>
          </label>
          {options?.prices.length === 0 && (
            <p>
              No annual domain price is configured. Configure Domain pricing and
              TLDs first.
            </p>
          )}
          <div className="md:col-span-2">
            <p className="mb-2 text-sm">
              Only this client’s unexpired, ownership-verified domains without
              an initial billing order are listed. For another existing domain,
              verify and link it first. Review earlier manual invoices before
              adding a new annual charge.
            </p>
            <ExistingDomainLink
              customerId={customerId}
              onLinked={(id) => {
                if (!mounted.current) return;
                invalidate();
                setDomainId(id);
                pendingLinkedDomain.current = id;
                setRefresh((x) => x + 1);
              }}
            />
          </div>
          {existing && (
            <p className="text-sm md:col-span-2">
              Existing registration remains active. This order creates no
              registrar job, purchase, nameserver change or automatic renewal.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2" onChange={invalidate}>
          <label className="text-sm font-semibold md:col-span-2">
            Registration offer
            <select
              className={fieldClass}
              required
              value={offerId}
              onChange={(e) => setOfferId(e.target.value)}
            >
              <option value="">Select registration offer</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  .{o.tld} · {formatMinor(o.sellingAmount, o.currency)} ·{' '}
                  {o.simulated ? 'Simulated' : 'Live'} · One year
                </option>
              ))}
            </select>
          </label>
          {contactLabels.map(([key, label]) => (
            <label key={key} className="text-sm">
              {label}
              <input
                className={fieldClass}
                required={key !== 'addressLine2'}
                type={key === 'email' ? 'email' : 'text'}
                value={contact[key] ?? ''}
                onChange={(e) =>
                  setContact((c) => ({ ...c, [key]: e.target.value }))
                }
              />
            </label>
          ))}
          <label className="text-sm">
            Consent method
            <select
              className={fieldClass}
              value={consentMethod}
              onChange={(e) => setConsentMethod(e.target.value)}
            >
              <option value="PHONE">Phone</option>
              <option value="IN_PERSON">In person</option>
              <option value="WRITTEN">Written message</option>
            </select>
          </label>
          <label className="text-sm">
            Consent date and time
            <input
              className={fieldClass}
              type="datetime-local"
              required
              value={consentedAt}
              onChange={(e) => setConsentedAt(e.target.value)}
            />
          </label>
          <label className="text-sm md:col-span-2">
            Consent record reference
            <input
              className={fieldClass}
              minLength={3}
              maxLength={160}
              required
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <div className="text-sm md:col-span-2">
            {offers.find((o) => o.id === offerId) && (
              <p>
                Nameservers:{' '}
                {offers.find((o) => o.id === offerId)?.nameservers.join(', ')}.
                Review the selected registrar’s agreement, customer terms and
                privacy policy before recording consent.
              </p>
            )}
            {(
              [
                'agreementUrl',
                'customerTermsUrl',
                'customerPrivacyUrl',
              ] as const
            ).map((key) => {
              const url = offers.find((o) => o.id === offerId)?.[key];
              return url ? (
                <a
                  className="mr-3 text-brand-700 underline"
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {key === 'agreementUrl'
                    ? 'Registrar agreement'
                    : key === 'customerTermsUrl'
                      ? 'Customer terms'
                      : 'Privacy policy'}
                </a>
              ) : null;
            })}
          </div>
          <label className="text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={attestation}
              onChange={(e) => setAttestation(e.target.checked)}
            />{' '}
            I verified the customer’s consent to these registrant details,
            registrar/DNS selection and displayed policies.
          </label>
          <Button
            type="button"
            disabled={busy || !offers.length}
            onClick={() => void checkQuote()}
          >
            Check domain and price
          </Button>
          {quote && quote.domainName === domainName && (
            <p role="status">
              Quoted domain: {quote.domainName} ·{' '}
              {formatMinor(quote.sellingAmount, quote.currency)} · One year.
              Registration awaits verified payment and separate approval.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

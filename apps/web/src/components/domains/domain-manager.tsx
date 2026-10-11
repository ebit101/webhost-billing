'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  domainQuoteRequestSchema,
  domainDetailSchema,
  domainOfferSchema,
  domainQuoteSchema,
  fakeRegistrarSettingsSchema,
  type DomainDetail,
  type DomainOffer,
  type DomainQuote,
  type FakeRegistrarSettings,
  sentenceCaseLabel,
} from '@webhost-billing/shared';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import {
  domainEntryHref,
  readDomainIntent,
  type DomainIntent,
} from '../../lib/domain-intent';
import { Card, fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { PageHeader } from '../ui/page-header';

type Offer = DomainOffer;
type Account = FakeRegistrarSettings;
type Quote = DomainQuote;
type Domain = DomainDetail;
const contactFields = [
  'name',
  'company',
  'address',
  'city',
  'region',
  'postalCode',
  'country',
  'email',
  'phoneCountryCode',
  'phone',
] as const;
const labels: Record<(typeof contactFields)[number], string> = {
  name: 'Registrant name',
  company: 'Company',
  address: 'Address',
  city: 'City',
  region: 'Region',
  postalCode: 'Postal code',
  country: 'Country code',
  email: 'Registrant email',
  phoneCountryCode: 'Phone country code',
  phone: 'Phone number',
};
const money = (amount: string, currency: string) =>
  `${currency} ${BigInt(amount) / 100n}.${(BigInt(amount) % 100n).toString().padStart(2, '0')}`;
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

export function DomainManager({
  administrator = false,
  initialIntent,
}: {
  administrator?: boolean;
  initialIntent?: DomainIntent;
}) {
  const [selectedOffer, setSelectedOffer] = useState(
    initialIntent?.domainOfferId ?? '',
  );
  const [selectedDomain, setSelectedDomain] = useState(
    initialIntent?.domainName ?? '',
  );
  const [domains, setDomains] = useState<Domain[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [quote, setQuote] = useState<Quote>();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [submissionKey, setSubmissionKey] = useState('');
  async function refresh() {
    const [records, prices] = await Promise.all([
      authenticatedGet<Domain[]>('/domains'),
      authenticatedGet<Offer[]>('/domains/offers'),
    ]);
    setDomains(domainDetailSchema.array().parse(records));
    setOffers(domainOfferSchema.array().parse(prices));
    if (administrator)
      setAccounts(
        fakeRegistrarSettingsSchema
          .array()
          .parse(await authenticatedGet<unknown>('/domains/registrar')),
      );
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [records, prices] = await Promise.all([
          authenticatedGet<Domain[]>('/domains'),
          authenticatedGet<Offer[]>('/domains/offers'),
        ]);
        if (active) {
          setDomains(domainDetailSchema.array().parse(records));
          setOffers(domainOfferSchema.array().parse(prices));
        }
        if (administrator) {
          const settings =
            await authenticatedGet<Account[]>('/domains/registrar');
          if (active)
            setAccounts(fakeRegistrarSettingsSchema.array().parse(settings));
        }
      } catch (error) {
        if (active)
          setNotice(
            error instanceof Error
              ? error.message
              : 'Domain requests could not be loaded.',
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [administrator]);
  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setNotice('');
    try {
      await action();
      await refresh();
      setNotice('Request completed. Refresh to view worker reconciliation.');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'The request could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function requestQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contact = Object.fromEntries(
      contactFields.map((key) => [key, form.get(key)]),
    );
    const input = domainQuoteRequestSchema.safeParse({
      offerId: form.get('offerId'),
      domainName: form.get('domainName'),
      contact,
      agreement: 'fictional-registration-v1',
      consent: form.get('consent') === 'on',
    });
    if (!input.success) {
      setNotice(
        'Complete all registrant fields, select a supported ordinary domain and accept the fictional agreement.',
      );
      return;
    }
    await perform(async () => {
      setQuote(
        domainQuoteSchema.parse(
          await authMutation<unknown>('/domains/quotes', 'POST', input.data),
        ),
      );
      setSubmissionKey(crypto.randomUUID());
    });
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulated domain registration"
        description="StarGate/UK2 (resell.biz) evaluation workflow. No external calls, real registrations or provider charges."
      />
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Simulation only. Auto-renewal is off. Paying an invoice does not
        register a domain. A full administrator with two-factor authentication
        must approve registration separately. Real provider access and
        customer-facing domain sales remain closed. Simulation writes are
        disabled in production.
      </p>
      <p role="status" className="text-sm">
        {notice}
      </p>
      <Button disabled={busy} onClick={() => void perform(refresh)}>
        Refresh read-only status
      </Button>
      {administrator ? (
        <Card title="Registrar settings">
          <ul className="mb-4 space-y-2 text-sm">
            {offers.map((offer) => (
              <li key={offer.id}>
                .{offer.tld} · One year · Selling price{' '}
                {money(offer.sellingAmount, offer.currency)} · Simulated
                provider cost {money(offer.costAmount, offer.costCurrency)} ·
                Observed {offer.observedAt}. Exact domain cost is checked again
                at approval.
              </li>
            ))}
          </ul>
          <p className="mb-4 text-sm">
            Networking disabled. No external credentials configured. Create
            fictional customers in the customer manager; customers must accept
            their own registration agreement.
          </p>
          <Link href="/admin/customers" className="text-blue-700 underline">
            Customer manager
          </Link>
          {accounts.length === 0 ? (
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void perform(() =>
                  authMutation('/domains/registrar', 'POST', {
                    confirmation: data.get('confirmation'),
                    sellingAmount: data.get('sellingAmount'),
                  }),
                );
              }}
            >
              <Field label="Fixed one-year selling price in BDT minor units">
                <input
                  name="sellingAmount"
                  className={fieldClass}
                  required
                  pattern="[1-9][0-9]*"
                />
              </Field>
              <Field label="Type Enable simulated registrar">
                <input name="confirmation" className={fieldClass} required />
              </Field>
              <Button type="submit" disabled={busy}>
                Create simulated offers
              </Button>
            </form>
          ) : (
            accounts.map((account) => (
              <div
                key={account.id}
                className="mt-4 flex flex-wrap items-center gap-3"
              >
                <p>
                  {account.brand} · {account.mode} ·{' '}
                  {account.enabled ? 'Enabled' : 'Disabled'}
                </p>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void perform(() =>
                      authMutation(
                        `/domains/registrar/${account.id}`,
                        'PATCH',
                        { enabled: !account.enabled },
                      ),
                    )
                  }
                >
                  {account.enabled ? 'Disable registrar' : 'Enable simulation'}
                </Button>
              </div>
            ))
          )}
        </Card>
      ) : (
        <Card title="Request a fictional quote">
          <p className="mb-4 text-sm">
            Only ordinary ASCII .com and .net names, one year, one domain. Fixed
            fictional nameservers: ns1.example.test and ns2.example.test.
            Provider cost is independent of the BDT selling price.
          </p>
          <form
            onSubmit={(event) => void requestQuote(event)}
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field label="Domain offer">
              <select
                name="offerId"
                className={fieldClass}
                required
                value={selectedOffer}
                onChange={(event) => {
                  setSelectedOffer(event.target.value);
                  setQuote(undefined);
                  const intent = readDomainIntent({
                    domainOfferId: event.target.value,
                    domainName: selectedDomain,
                  });
                  if (intent)
                    window.history.replaceState(
                      null,
                      '',
                      domainEntryHref('/portal/domains', intent),
                    );
                }}
              >
                <option value="">Select an offer</option>
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    .{offer.tld} · {money(offer.sellingAmount, offer.currency)}{' '}
                    · One year
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Domain name">
              <input
                name="domainName"
                value={selectedDomain}
                onChange={(event) => {
                  setSelectedDomain(event.target.value);
                  setQuote(undefined);
                  const intent = readDomainIntent({
                    domainOfferId: selectedOffer,
                    domainName: event.target.value,
                  });
                  if (intent)
                    window.history.replaceState(
                      null,
                      '',
                      domainEntryHref('/portal/domains', intent),
                    );
                }}
                className={fieldClass}
                required
                placeholder="fictional-example.com"
              />
            </Field>
            {contactFields.map((key) => (
              <Field key={key} label={labels[key]}>
                <input
                  name={key}
                  type={key === 'email' ? 'email' : 'text'}
                  className={fieldClass}
                  required
                  maxLength={key === 'email' ? 320 : 160}
                />
              </Field>
            ))}
            <label className="text-sm sm:col-span-2">
              <input name="consent" type="checkbox" required /> I authorize use
              of this fictional registrant data for the local simulation and
              accept fictional-registration-v1: no domain is registered, no
              external data is sent and no provider charge occurs. I am not
              accepting a real registry agreement.
            </label>
            <Button type="submit" disabled={busy || !offers.length}>
              Get simulated quote
            </Button>
          </form>
          {quote && (
            <div className="mt-5 space-y-3">
              <p>
                {quote.domainName}: {money(quote.sellingAmount, 'BDT')} selling
                price; {money(quote.costAmount, 'USD')} simulated provider cost.
                Quote expires {quote.expiresAt}.
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await authMutation('/domains/orders', 'POST', {
                      quoteId: quote.id,
                      submissionKey,
                    });
                    setQuote(undefined);
                  })
                }
              >
                Create order and unpaid invoice
              </Button>
            </div>
          )}
        </Card>
      )}
      <section aria-label="Domain requests" className="space-y-4">
        <p className="text-sm text-slate-600">
          Latest 100 domain requests, newest first.
        </p>
        {!domains.length && <p>No domain requests yet.</p>}
        {domains.map((domain) => (
          <Card key={domain.id} title={domain.domainName}>
            <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt>Registrar</dt>
                <dd>{domain.registrar} · Simulated</dd>
              </div>
              <div>
                <dt>Registration period</dt>
                <dd>{domain.registrationYears} year</dd>
              </div>
              <div>
                <dt>Request date</dt>
                <dd>{domain.requestedAt}</dd>
              </div>
              <div>
                <dt>Initial invoice amount</dt>
                <dd>{money(domain.sellingAmount, domain.currency)}</dd>
              </div>
            </dl>
            <p>
              Simulated · {sentenceCaseLabel(domain.state)} · Contact
              verification {sentenceCaseLabel(domain.verification)}
            </p>
            <p>
              Invoice {sentenceCaseLabel(domain.invoiceStatus)} · Balance{' '}
              {money(domain.balanceDue, domain.currency)}
            </p>
            {domain.financialAttention && (
              <p className="text-amber-800">
                Financial review required. A refund or cancellation does not
                undo a registrar action.
              </p>
            )}
            {domain.expiresAt && (
              <p>Observed simulated expiry: {domain.expiresAt}</p>
            )}
            {!domain.expiresAt && <p>Registry expiry not yet confirmed.</p>}
            {administrator && (
              <p className="my-2 text-sm text-slate-600">
                Registration date, renewal price and next billing date are not
                established by this simulation. Renewal, transfer, authorization
                codes, deletion and nameserver editing are unavailable.
              </p>
            )}
            <p>
              Nameservers: {domain.nameservers.join(', ')} · Auto-renewal off
            </p>
            <div className="my-3 flex flex-wrap gap-4">
              <Link
                className="text-blue-700 underline"
                href={
                  administrator
                    ? `/admin/invoices?invoiceId=${domain.invoiceId}`
                    : `/portal/invoices/${domain.invoiceId}`
                }
              >
                View invoice and payment
              </Link>
              {administrator && (
                <>
                  <Link
                    className="text-blue-700 underline"
                    href={`/admin/orders?orderId=${domain.orderId}`}
                  >
                    View order
                  </Link>
                  <Link
                    className="text-blue-700 underline"
                    href={`/admin/customers?customerId=${domain.customerId}`}
                  >
                    View customer
                  </Link>
                </>
              )}
            </div>
            {administrator && (
              <>
                <p>
                  Provider cost snapshot:{' '}
                  {domain.costAmount && domain.costCurrency
                    ? money(domain.costAmount, domain.costCurrency)
                    : 'Unavailable'}{' '}
                  · {domain.agreement}
                </p>
                {domain.contact && (
                  <dl className="my-3 grid gap-2 text-sm sm:grid-cols-2">
                    {Object.entries(domain.contact).map(([key, value]) => (
                      <div key={key}>
                        <dt>
                          {labels[key as (typeof contactFields)[number]] ??
                            sentenceCaseLabel(key)}
                        </dt>
                        <dd className="break-words">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {!domain.dispatchClaimed && (
                  <form
                    className="my-4 grid gap-3 sm:grid-cols-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void perform(() =>
                        authMutation(`/domains/${domain.id}/approve`, 'POST', {
                          confirmation: data.get('confirmation'),
                          costCeiling: data.get('costCeiling'),
                          costCurrency: 'USD',
                        }),
                      );
                    }}
                  >
                    <Field label="Type exact domain name">
                      <input
                        className={fieldClass}
                        name="confirmation"
                        required
                      />
                    </Field>
                    <Field label="Approved USD provider cost ceiling in minor units">
                      <input
                        className={fieldClass}
                        name="costCeiling"
                        required
                        pattern="[1-9][0-9]*"
                      />
                    </Field>
                    <Button
                      disabled={busy || domain.invoiceStatus !== 'PAID'}
                      type="submit"
                    >
                      Approve simulated registration
                    </Button>
                  </form>
                )}
                {domain.dispatchClaimed && domain.state !== 'REGISTERED' && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void perform(() =>
                        authMutation(`/domains/${domain.id}/reconcile`, 'POST'),
                      )
                    }
                  >
                    Reconcile read-only
                  </Button>
                )}
                <ul className="mt-3 text-sm">
                  {domain.evidence?.map((evidence, index) => (
                    <li key={index}>
                      {sentenceCaseLabel(evidence.code)} · {evidence.createdAt}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        ))}
      </section>
    </div>
  );
}

'use client';
import { formatUtcTimestamp } from '@webhost-billing/shared';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
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
  customerDetailSchema,
  authenticatedIdentitySchema,
  type AuthenticatedIdentity,
  type DomainContact,
} from '@webhost-billing/shared';
import { domainContactDraft } from '../../lib/domain-contact-draft';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import {
  domainEntryHref,
  readDomainIntent,
  type DomainIntent,
} from '../../lib/domain-intent';
import { Card, fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { RecordAction } from '../ui/record-dialog';
import { DataTable } from '../ui/data-table';
import { PageHeader } from '../ui/page-header';

type Offer = DomainOffer;
type Account = FakeRegistrarSettings;
type Quote = DomainQuote;
type Domain = DomainDetail;
import { Field, labels, contactFields, money } from './domain-fields';
import { domainRecordHref } from '../../lib/client-record-href';
import { AdminDomainInventory } from './admin-domain-inventory';
import {
  readAdminDomainQuery,
  type AdminDomainSelection,
} from '../../lib/admin-domain-inventory-query';
export function DomainManager({
  administrator = false,
  initialIntent,
  inventorySelection = readAdminDomainQuery({}),
}: {
  administrator?: boolean;
  initialIntent?: DomainIntent;
  inventorySelection?: AdminDomainSelection;
}) {
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const [selectedOffer, setSelectedOffer] = useState(
    initialIntent?.domainOfferId ?? '',
  );
  const [selectedDomain, setSelectedDomain] = useState(
    initialIntent?.domainName ?? '',
  );
  const [search, setSearch] = useState('');
  const [domains, setDomains] = useState<Domain[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [quote, setQuote] = useState<Quote>();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [submissionKey, setSubmissionKey] = useState('');
  const [contactDraft, setContactDraft] = useState<Partial<DomainContact>>({});
  const contactEdited = useRef(false);
  useEffect(() => {
    if (administrator) return;
    let active = true;
    void authenticatedGet<AuthenticatedIdentity>('/auth/me')
      .then(async (identity) => {
        identity = authenticatedIdentitySchema.parse(identity);
        if (identity.role !== 'CUSTOMER') return;
        const profile = customerDetailSchema.parse(
          await authenticatedGet(`/customers/${identity.customerId}`),
        );
        if (active && !contactEdited.current)
          setContactDraft(domainContactDraft(profile));
      })
      .catch(() => {
        if (active)
          setNotice(
            'Customer details could not be prefilled. Enter and review the registrant details below.',
          );
      });
    return () => {
      active = false;
    };
  }, [administrator]);
  async function refresh() {
    if (administrator) setInventoryRevision((value) => value + 1);
    const [records, prices] = await Promise.all([
      administrator
        ? Promise.resolve([])
        : authenticatedGet<Domain[]>('/domains'),
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
          administrator
            ? Promise.resolve([])
            : authenticatedGet<Domain[]>('/domains'),
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
      contact: {
        ...contact,
        ...(offers.find((offer) => offer.id === form.get('offerId'))
          ?.simulated === false
          ? { publishOrganization: form.get('publishOrganization') === 'on' }
          : {}),
      },
      agreement:
        offers.find((offer) => offer.id === form.get('offerId'))?.simulated ===
        false
          ? 'resellbiz-registration-v1'
          : 'fictional-registration-v1',
      consent: form.get('consent') === 'on',
      ...(offers.find((offer) => offer.id === form.get('offerId'))
        ?.selectionConsentRevision
        ? {
            selectionConsentRevision: offers.find(
              (offer) => offer.id === form.get('offerId'),
            )?.selectionConsentRevision,
          }
        : {}),
      ...(offers.find((offer) => offer.id === form.get('offerId'))
        ?.simulated === false
        ? { customerPolicyConsent: form.get('customerPolicyConsent') === 'on' }
        : {}),
    });
    if (!input.success) {
      setNotice(
        'Complete all registrant fields, select a supported ordinary domain and accept its agreement.',
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
        title={administrator ? 'Domains' : 'Domain registration'}
        description={
          administrator
            ? 'Browse saved domains, review matching totals and open the owning client profile.'
            : 'Domain requests, separate invoice/payment states and explicit administrator approval.'
        }
      />
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Offers and records marked simulated make no external calls. Live offers
        are real purchases, not a sandbox. Auto-renewal is off. Paying an
        invoice does not register a domain. A full administrator with two-factor
        authentication must approve registration separately. Simulated writes
        are disabled in production.
      </p>
      <p role="status" className="text-sm">
        {notice}
      </p>
      <Button disabled={busy} onClick={() => void perform(refresh)}>
        Refresh read-only status
      </Button>
      {administrator ? (
        process.env.NODE_ENV !== 'production' && (
          <RecordAction
            label="Simulated registrar settings"
            busy={busy}
            feedback={notice}
          >
            <Card title="Registrar settings">
              <ul className="mb-4 space-y-2 text-sm">
                {offers
                  .filter((offer) => offer.simulated)
                  .map((offer) => (
                    <li key={offer.id}>
                      .{offer.tld} · One year · Selling price{' '}
                      {money(offer.sellingAmount, offer.currency)} · Simulated
                      provider cost{' '}
                      {offer.costAmount && offer.costCurrency
                        ? money(offer.costAmount, offer.costCurrency)
                        : 'Unavailable'}{' '}
                      · Observed {formatUtcTimestamp(offer.observedAt)}. Exact
                      domain cost is checked again at approval.
                    </li>
                  ))}
              </ul>
              <p className="mb-4 text-sm">
                These settings control simulation only. Create fictional
                customers in the customer manager; customers must accept their
                own registration agreement.
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
                    <input
                      name="confirmation"
                      className={fieldClass}
                      required
                    />
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
                      {account.enabled
                        ? 'Disable registrar'
                        : 'Enable simulation'}
                    </Button>
                  </div>
                ))
              )}
            </Card>
          </RecordAction>
        )
      ) : (
        <RecordAction
          label="Request a domain quote"
          initialOpen={Boolean(initialIntent)}
          busy={busy}
          feedback={notice}
        >
          <Card title="Request a domain quote">
            <p className="mb-4 text-sm">
              Only ordinary ASCII .com and .net names, one year, one domain.
              Fixed fictional nameservers apply only to simulation. Live
              nameservers are displayed below. Provider cost is independent of
              the BDT selling price.
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
                      .{offer.tld} ·{' '}
                      {money(offer.sellingAmount, offer.currency)} · One year ·{' '}
                      {offer.simulated ? 'Simulated' : 'Live purchase'}
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
                    required={key !== 'addressLine2'}
                    value={contactDraft[key] ?? ''}
                    onChange={(event) => {
                      contactEdited.current = true;
                      setContactDraft((previous) => ({
                        ...previous,
                        [key]: event.target.value,
                      }));
                      setQuote(undefined);
                    }}
                    maxLength={key === 'email' ? 320 : 160}
                  />
                </Field>
              ))}
              <label className="text-sm sm:col-span-2">
                <input name="consent" type="checkbox" required />{' '}
                {offers.find((offer) => offer.id === selectedOffer)
                  ?.simulated === false ? (
                  <>
                    I am authorized to provide this registrant data and consent
                    to its disclosure to the registrar and registry, including
                    possible public registration data. I accept the{' '}
                    <a
                      href={
                        offers.find((offer) => offer.id === selectedOffer)
                          ?.agreementUrl
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      configured registrar agreement
                    </a>{' '}
                    for this one-year paid registration. This is not a sandbox.
                    Nameservers:{' '}
                    {offers
                      .find((offer) => offer.id === selectedOffer)
                      ?.nameservers.join(', ')}
                    .
                  </>
                ) : (
                  <>
                    I authorize use of this fictional data for the local
                    simulation and accept fictional-registration-v1. No real
                    registration, external disclosure or provider charge occurs.
                  </>
                )}
              </label>
              {offers.find((offer) => offer.id === selectedOffer)
                ?.eligibleRegistrars && (
                <p className="text-sm sm:col-span-2">
                  By accepting the registration policy, I authorize Speed Host
                  to select one of these registrar connections before execution:{' '}
                  {offers
                    .find((offer) => offer.id === selectedOffer)
                    ?.eligibleRegistrars?.map((entry) => entry.name)
                    .join(', ')}
                  . No other registrar is covered by this acceptance.
                </p>
              )}
              {offers.find((offer) => offer.id === selectedOffer)?.simulated ===
                false && (
                <label className="text-sm sm:col-span-2">
                  <input name="publishOrganization" type="checkbox" /> I
                  explicitly consent to publication of the registrant
                  organization in registration data. Leave unchecked to withhold
                  organization-publication consent.
                </label>
              )}
              {offers.find((offer) => offer.id === selectedOffer)?.simulated ===
                false && (
                <label className="text-sm sm:col-span-2">
                  <input
                    name="customerPolicyConsent"
                    type="checkbox"
                    required
                  />{' '}
                  I authorize creation of a registrar customer account and
                  contact when needed, and accept the{' '}
                  <a
                    href={
                      offers.find((offer) => offer.id === selectedOffer)
                        ?.customerTermsUrl
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    customer terms
                  </a>{' '}
                  and{' '}
                  <a
                    href={
                      offers.find((offer) => offer.id === selectedOffer)
                        ?.customerPrivacyUrl
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    privacy policy
                  </a>
                  . No marketing consent is given.
                </label>
              )}
              <Button type="submit" disabled={busy || !offers.length}>
                Get domain quote
              </Button>
            </form>
            {quote && (
              <div className="mt-5 space-y-3">
                <p>
                  {quote.domainName}: {money(quote.sellingAmount, 'BDT')}{' '}
                  selling price.
                  {quote.costAmount && (
                    <>
                      {' '}
                      {money(quote.costAmount, 'USD')} simulated provider cost.
                    </>
                  )}
                  Quote expires {formatUtcTimestamp(quote.expiresAt)}.
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
        </RecordAction>
      )}
      {administrator ? (
        <AdminDomainInventory
          selection={inventorySelection}
          revision={inventoryRevision}
        />
      ) : (
        <section aria-label="Domain requests" className="space-y-4">
          <p className="text-sm text-slate-600">
            Latest 100 domain requests, newest first.
          </p>
          {!domains.length && <p>No domain requests yet.</p>}
          <label className="block text-sm font-semibold">
            Search domains
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={fieldClass}
            />
          </label>
          <p className="text-sm">
            {
              domains.filter((domain) =>
                domain.domainName.includes(search.trim().toLowerCase()),
              ).length
            }{' '}
            matching requests
          </p>
          <DataTable
            caption="Domain requests"
            rows={domains.filter((domain) =>
              domain.domainName.includes(search.trim().toLowerCase()),
            )}
            rowKey={(domain) => domain.id}
            columns={[
              {
                key: 'domain',
                header: 'Domain',
                render: (domain) => (
                  <Link
                    prefetch={false}
                    href={domainRecordHref(domain, administrator)}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    {domain.domainName}
                  </Link>
                ),
              },
              {
                key: 'registrar',
                header: 'Registrar',
                render: (domain) =>
                  domain.registrar +
                  (domain.simulated ? ' · Simulated' : ' · Live'),
              },
              {
                key: 'status',
                header: 'Status',
                render: (domain) => sentenceCaseLabel(domain.state),
              },
              {
                key: 'invoice',
                header: 'Invoice',
                render: (domain) =>
                  domain.invoiceStatus
                    ? sentenceCaseLabel(domain.invoiceStatus)
                    : 'No billing record',
              },
              {
                key: 'balance',
                header: 'Balance',
                render: (domain) =>
                  domain.balanceDue !== null
                    ? money(domain.balanceDue, domain.currency)
                    : 'Not applicable',
              },
              {
                key: 'date',
                header: 'Requested',
                render: (domain) =>
                  new Date(domain.requestedAt).toLocaleDateString('en-GB'),
              },
              {
                key: 'expiry',
                header: 'Expiry',
                render: (domain) =>
                  domain.expiresAt
                    ? new Date(domain.expiresAt).toLocaleDateString('en-GB')
                    : 'Not confirmed',
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (domain) => (
                  <Link
                    prefetch={false}
                    href={domainRecordHref(domain, administrator)}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    View <span className="sr-only">{domain.domainName}</span>
                  </Link>
                ),
              },
            ]}
          />
        </section>
      )}
    </div>
  );
}

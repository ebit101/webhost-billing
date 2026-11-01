'use client';
import Link from 'next/link';
import {
  sentenceCaseLabel,
  formatUtcTimestamp,
  type DomainDetail,
} from '@webhost-billing/shared';
import { authMutation } from '../../lib/auth-api';
import { Card, fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';
import { DomainManagementPanel } from './domain-management';
import { RegistrationApproval } from './registration-approval';
import { Field, labels, contactFields, money } from './domain-fields';
export function DomainRecord({
  domain,
  administrator,
  busy,
  perform,
}: {
  domain: DomainDetail;
  administrator: boolean;
  busy: boolean;
  perform: (action: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <Card key={domain.id} title={domain.domainName}>
      <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt>Registrar</dt>
          <dd>
            {domain.registrar} · {domain.simulated ? 'Simulated' : 'Live'}
          </dd>
        </div>
        <div>
          <dt>Registration period</dt>
          <dd>
            {domain.registrationYears === null
              ? 'Existing registration; period not imported'
              : `${domain.registrationYears} year`}
          </dd>
        </div>
        <div>
          <dt>{domain.origin === 'EXISTING' ? 'Link date' : 'Request date'}</dt>
          <dd>{formatUtcTimestamp(domain.requestedAt)}</dd>
        </div>
        <div>
          <dt>Initial invoice amount</dt>
          <dd>
            {domain.billingOrder
              ? money(
                  domain.billingOrder.sellingAmount,
                  domain.billingOrder.currency,
                )
              : domain.sellingAmount === null
                ? 'No invoice created by linking'
                : money(domain.sellingAmount, domain.currency)}
          </dd>
        </div>
      </dl>
      {domain.billingOrder && (
        <div className="mb-4 rounded-lg border border-slate-200 p-3 text-sm">
          <p>
            Domain service billing · Annual · Invoice{' '}
            {sentenceCaseLabel(domain.billingOrder.invoiceStatus)}. This invoice
            does not register or renew the domain.
          </p>
          <Link
            className="text-brand-700 underline"
            href={`${administrator ? '/admin' : '/portal'}/invoices/${domain.billingOrder.invoiceId}`}
          >
            View domain service invoice
          </Link>
          {administrator && (
            <>
              {' '}
              ·{' '}
              <Link
                className="text-brand-700 underline"
                href={`/admin/orders?orderId=${domain.billingOrder.orderId}`}
              >
                View combined order
              </Link>
            </>
          )}
        </div>
      )}
      <p>
        {domain.simulated ? 'Simulated' : 'Live'} ·{' '}
        {sentenceCaseLabel(domain.state)} · Contact verification{' '}
        {sentenceCaseLabel(domain.verification)}
      </p>
      {domain.origin === 'EXISTING' ? (
        <p>
          Existing domain linked · Registrar-account ownership verified{' '}
          {formatUtcTimestamp(domain.ownershipVerifiedAt)}. Linking did not
          register, transfer or purchase this domain.
        </p>
      ) : (
        <p>
          Invoice{' '}
          {domain.invoiceStatus
            ? sentenceCaseLabel(domain.invoiceStatus)
            : 'Unavailable'}{' '}
          · Balance{' '}
          {domain.balanceDue !== null
            ? money(domain.balanceDue, domain.currency)
            : 'Unavailable'}
        </p>
      )}
      {domain.financialAttention && (
        <p className="text-amber-800">
          Financial review required. A refund or cancellation does not undo a
          registrar action.
        </p>
      )}
      {domain.expiresAt && (
        <p>
          Observed {domain.simulated ? 'simulated ' : ''}expiry:{' '}
          {formatUtcTimestamp(domain.expiresAt)}
        </p>
      )}
      {!domain.expiresAt && <p>Registry expiry not yet confirmed.</p>}
      {administrator && (
        <p className="my-2 text-sm text-slate-600">
          {domain.origin === 'EXISTING'
            ? 'Billing history and renewal terms were not imported. Management remains subject to fresh registrar-account ownership checks.'
            : 'Registration date, renewal price and next billing date are not established by the original registration snapshot. Use the management section for current state and separately paid renewals.'}
        </p>
      )}
      <p>
        {domain.origin === 'EXISTING'
          ? 'Nameservers when linked'
          : 'Registration nameserver snapshot'}
        : {domain.nameservers.join(', ')} ·
        {domain.origin === 'EXISTING'
          ? 'Application auto-renewal off'
          : 'Auto-renewal off'}
      </p>
      <div className="my-3 flex flex-wrap gap-4">
        {domain.invoiceId && (
          <Link
            className="text-blue-700 underline"
            href={
              administrator
                ? `/admin/invoices/${domain.invoiceId}`
                : `/portal/invoices/${domain.invoiceId}`
            }
          >
            View invoice and payment
          </Link>
        )}
        {administrator && (
          <>
            {domain.orderId && (
              <Link
                className="text-blue-700 underline"
                href={`/admin/orders?orderId=${domain.orderId}`}
              >
                View order
              </Link>
            )}
            <Link
              className="text-blue-700 underline"
              href={`/admin/customers/${domain.customerId}`}
            >
              View customer
            </Link>
          </>
        )}
      </div>
      {!domain.simulated && domain.state === 'REGISTERED' && (
        <DomainManagementPanel
          domainId={domain.id}
          domainName={domain.domainName}
          administrator={administrator}
          allowRenewal={domain.origin !== 'EXISTING'}
          contact={domain.contact}
          {...(domain.renewalCatalogueRevision
            ? {
                renewalPricing: {
                  amount: domain.renewalSellingAmount ?? null,
                  revision: domain.renewalCatalogueRevision,
                },
              }
            : {})}
        />
      )}
      {administrator && (
        <>
          {domain.origin !== 'EXISTING' && (
            <p>
              Provider cost snapshot:{' '}
              {domain.costAmount && domain.costCurrency
                ? money(domain.costAmount, domain.costCurrency)
                : 'Unavailable'}{' '}
              · {domain.agreement}
            </p>
          )}
          {domain.contact && (
            <div>
              <h3 className="text-sm font-semibold">
                Registration contact snapshot
              </h3>
              <dl className="my-3 grid gap-2 text-sm sm:grid-cols-2">
                {Object.entries(domain.contact).map(([key, value]) => (
                  <div key={key}>
                    <dt>
                      {labels[key as (typeof contactFields)[number]] ??
                        sentenceCaseLabel(key)}
                    </dt>
                    <dd className="break-words">
                      {typeof value === 'boolean'
                        ? value
                          ? 'Consented'
                          : 'Not consented'
                        : value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {!domain.simulated && !domain.contactMappingVerified && (
            <details>
              <summary className="cursor-pointer text-sm">
                Advanced: verify existing registrar IDs
              </summary>
              <form
                className="my-4 grid gap-3 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void perform(() =>
                    authMutation(
                      `/domains/${domain.id}/registrar-contact`,
                      'POST',
                      {
                        remoteCustomerId: data.get('remoteCustomerId'),
                        remoteContactId: data.get('remoteContactId'),
                      },
                    ),
                  );
                }}
              >
                <p className="sm:col-span-2">
                  Customer and contact preparation normally runs automatically
                  after paid registration approval. This optional check verifies
                  known existing IDs without creating contacts or registering.
                </p>
                <Field label="Registrar customer ID">
                  <input
                    name="remoteCustomerId"
                    className={fieldClass}
                    required
                    pattern="[1-9][0-9]*"
                  />
                </Field>
                <Field label="Registrar contact ID">
                  <input
                    name="remoteContactId"
                    className={fieldClass}
                    required
                    pattern="[1-9][0-9]*"
                  />
                </Field>
                <Button type="submit" disabled={busy}>
                  Verify registrar customer and contact
                </Button>
              </form>
            </details>
          )}
          {domain.origin !== 'EXISTING' && !domain.dispatchClaimed && (
            <RegistrationApproval
              key={`${domain.id}:${domain.selectedRegistrarId ?? 'unapproved'}`}
              domain={domain}
              busy={busy}
              onApprove={(body) =>
                void perform(() =>
                  authMutation(`/domains/${domain.id}/approve`, 'POST', body),
                )
              }
            />
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
                {sentenceCaseLabel(evidence.code)} ·{' '}
                {formatUtcTimestamp(evidence.createdAt)}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

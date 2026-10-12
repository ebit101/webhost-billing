'use client';
import { useState, type FormEvent } from 'react';
import type { DomainDetail } from '@webhost-billing/shared';
import { authMutation } from '../../lib/auth-api';
import { Field, fieldClass } from '../customers/customer-fields';
import { Button } from '../ui/button';

export function RegistrationApproval({
  domain,
  busy,
  onApprove,
}: {
  domain: DomainDetail;
  busy: boolean;
  onApprove: (body: Record<string, unknown>) => void;
}) {
  const choices =
    domain.eligibleRegistrars ??
    (domain.accountId
      ? [{ id: domain.accountId, name: domain.registrar, isDefault: true }]
      : []);
  const [selected, setSelected] = useState(
    domain.selectedRegistrarId ??
      choices.find((entry) => entry.isDefault)?.id ??
      (choices.length === 1 ? choices[0]?.id : '') ??
      '',
  );
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('');
  async function check() {
    if (!selected || checking) return;
    setChecking(true);
    setNotice('');
    try {
      const result = await authMutation<{
        available: boolean;
        costAmount: string;
        costCurrency: string;
        simulated: boolean;
      }>(`/domains/${domain.id}/registration-check`, 'POST', {
        registrarAccountId: selected,
      });
      setNotice(
        `${result.simulated ? 'Simulated' : 'Live'} read-only check: ${result.available ? 'available' : 'unavailable'}. Native cost ${result.costCurrency} ${result.costAmount} minor units. Approval will recheck; no registration was submitted.`,
      );
    } catch {
      setNotice(
        'The selected registrar could not be checked. No registration was submitted.',
      );
    } finally {
      setChecking(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onApprove({
      confirmation: data.get('confirmation'),
      costCeiling: data.get('costCeiling'),
      costCurrency: 'USD',
      ...(selected ? { registrarAccountId: selected } : {}),
      ...(!domain.simulated
        ? { acceptPriceChangeRisk: data.get('acceptPriceChangeRisk') === 'on' }
        : {}),
    });
  }
  return (
    <form
      className="my-4 grid gap-3 sm:grid-cols-2"
      onSubmit={submit}
      aria-label={`Registration approval for ${domain.domainName}`}
    >
      {domain.offlineConsent && (
        <p className="sm:col-span-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
          Customer consent recorded by an administrator:{' '}
          {domain.offlineConsent.method.toLowerCase().replace('_', ' ')} on{' '}
          {new Date(domain.offlineConsent.consentedAt).toLocaleString()}. Record
          reference: {domain.offlineConsent.reference}. Review the registrant
          details and verified payment before approval.
        </p>
      )}
      <label className="text-sm font-semibold">
        Registrar
        <select
          className={fieldClass}
          aria-label="Registrar"
          required
          value={selected}
          disabled={busy || Boolean(domain.operationId)}
          onChange={(event) => {
            setSelected(event.target.value);
            setNotice('');
          }}
        >
          <option value="">Select a registrar</option>
          {choices.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
              {entry.isDefault ? ' (preferred/default)' : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="self-end">
        <Button
          type="button"
          variant="secondary"
          disabled={
            busy || checking || !selected || Boolean(domain.operationId)
          }
          onClick={() => void check()}
        >
          {checking ? 'Checking…' : 'Check selected registrar'}
        </Button>
      </div>
      {notice && (
        <p role="status" className="sm:col-span-2">
          {notice}
        </p>
      )}
      <p className="text-sm sm:col-span-2">
        The installation/TLD default only preselects this choice. Approval locks
        the actual account and credential; changing the default or a timeout
        will never reroute this purchase.
      </p>
      <Field label="Type exact domain name" name="confirmation" required />
      <Field
        label="Approved USD preflight threshold in minor units"
        name="costCeiling"
        required
      />
      {!domain.simulated && (
        <label className="sm:col-span-2">
          <input name="acceptPriceChangeRisk" type="checkbox" required /> I
          approve a real paid purchase of this exact domain through the selected
          registrar, with the customer consent/contact and nameserver snapshot
          for one year. The provider has no verified atomic price cap; its final
          charge may differ from the checked price. No API cancellation or
          automatic refund is available.
        </label>
      )}
      <Button
        type="submit"
        disabled={
          busy || checking || domain.invoiceStatus !== 'PAID' || !selected
        }
      >
        {domain.simulated
          ? 'Approve simulated registration'
          : 'Approve real paid registration'}
      </Button>
    </form>
  );
}

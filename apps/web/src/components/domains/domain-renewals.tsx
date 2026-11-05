'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  domainRenewalViewSchema,
  sentenceCaseLabel,
  type DomainRenewalView,
} from '@webhost-billing/shared';
import { money as formatMoney } from './domain-fields';
import {
  authenticatedGet,
  authMutation,
  ApiMutationError,
} from '../../lib/auth-api';
import { Button } from '../ui/button';
import { RecordDialog } from '../ui/record-dialog';
import { fieldClass } from '../customers/customer-fields';

export function DomainRenewals(props: {
  domainId: string;
  domainName: string;
  administrator: boolean;
}) {
  return <RenewalPanel key={props.domainId} {...props} />;
}
function RenewalPanel({
  domainId,
  domainName,
  administrator,
}: {
  domainId: string;
  domainName: string;
  administrator: boolean;
}) {
  const [view, setView] = useState<DomainRenewalView>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<'configure' | 'toggle'>();
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const base = `/domains/${domainId}/renewal-billing`;
  function parse(data: unknown) {
    const next = domainRenewalViewSchema.parse(data);
    if (next.domainId !== domainId) throw new Error();
    return next;
  }
  useEffect(() => {
    let active = true;
    void authenticatedGet(base)
      .then((data) => {
        const next = domainRenewalViewSchema.parse(data);
        if (next.domainId !== domainId) throw new Error();
        if (active) setView(next);
      })
      .catch(() => {
        if (active) setError('Renewal billing could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [base, domainId]);
  async function refresh() {
    setBusy(true);
    setError('');
    try {
      setView(parse(await authenticatedGet(base)));
    } catch {
      setError('Renewal billing could not be loaded.');
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (
      !view ||
      busy ||
      confirmation !== domainName ||
      (action === 'configure' &&
        (!reason.trim() ||
          !acknowledged ||
          !view.suggestedAmount ||
          !view.catalogueRevision))
    )
      return;
    setBusy(true);
    setError('');
    try {
      setView(
        parse(
          await authMutation(
            action === 'configure' ? `${base}/terms` : base,
            action === 'configure' ? 'POST' : 'PATCH',
            {
              confirmation,
              expectedRevision: view.revision,
              enabled: action === 'configure' ? view.enabled : !view.enabled,
              ...(action === 'configure'
                ? {
                    sellingAmount: view.suggestedAmount,
                    catalogueRevision: view.catalogueRevision,
                    years: 1,
                    ordinaryRenewalConfirmed: true,
                    reason,
                  }
                : {}),
            },
          ),
        ),
      );
      setAction(undefined);
    } catch (caught) {
      setError(
        caught instanceof ApiMutationError
          ? caught.message
          : 'Renewal preferences could not be saved. Refresh and retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  function open(kind: 'configure' | 'toggle') {
    setAction(kind);
    setConfirmation('');
    setReason('');
    setAcknowledged(false);
    setError('');
  }
  return (
    <section
      aria-label="Domain renewal billing"
      className="my-4 grid gap-3 rounded-xl border border-slate-200 p-4"
    >
      <h3 className="text-lg font-semibold">Domain renewal billing</h3>
      <p>
        Application-managed billing: {view?.enabled ? 'On' : 'Off'}. Registrar
        auto-renewal is separate.
      </p>
      {view?.terms && (
        <p>
          Confirmed ordinary renewal:{' '}
          {formatMoney(view.terms.amount, view.terms.currency)} for one year.
        </p>
      )}
      {view?.reviewCode && (
        <p className="text-sm text-amber-800">
          Review required: {sentenceCaseLabel(view.reviewCode)}.
        </p>
      )}
      <p className="text-sm">
        Renewal invoices and reminders use the business automation schedule.
        Payment does not renew the domain. Registrar renewal dispatch is
        disabled.
      </p>
      <p className="text-sm">
        Turning billing off stops future invoices and reminders. Issued invoices
        remain unchanged and require staff review.
      </p>
      {view?.invoice && (
        <p>
          Latest renewal invoice: {sentenceCaseLabel(view.invoice.status)} ·{' '}
          {formatMoney(view.invoice.amount, view.invoice.currency)} ·{' '}
          <Link
            className="underline"
            href={`${administrator ? '/admin' : '/portal'}/invoices/${view.invoice.id}`}
          >
            View renewal invoice
          </Link>
          . Registrar renewal pending.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy}
          variant="secondary"
          onClick={() => void refresh()}
        >
          Refresh renewal billing
        </Button>
        {view?.canConfigure && (
          <Button
            disabled={busy || !view.suggestedAmount}
            onClick={() => open('configure')}
          >
            Confirm renewal terms
          </Button>
        )}
        {view?.canChangePreference && (
          <Button
            disabled={
              busy ||
              (!view.enabled && (!view.terms || Boolean(view.reviewCode)))
            }
            onClick={() => open('toggle')}
          >
            {view.enabled
              ? 'Turn renewal billing off'
              : 'Turn renewal billing on'}
          </Button>
        )}
      </div>
      {error && !action && <p role="alert">{error}</p>}
      <RecordDialog
        open={Boolean(action)}
        title={
          action === 'configure'
            ? 'Confirm renewal terms'
            : 'Change renewal billing'
        }
        busy={busy}
        onClose={() => setAction(undefined)}
      >
        {action && (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <p>
              {action === 'configure'
                ? `Confirm the current ordinary one-year catalogue price: ${view?.suggestedAmount ? formatMoney(view.suggestedAmount, 'BDT') : 'Unavailable'}. Grace/redemption charges are not supported.`
                : `Turn application-managed renewal billing ${view?.enabled ? 'off' : 'on'} for ${domainName}. Existing invoices remain unchanged.`}
            </p>
            <label>
              Confirm domain name
              <input
                className={fieldClass}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
              />
            </label>
            {action === 'configure' && (
              <>
                <label>
                  Review reason
                  <textarea
                    className={fieldClass}
                    value={reason}
                    maxLength={1000}
                    onChange={(event) => setReason(event.target.value)}
                    required
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />{' '}
                  I verified ordinary one-year terms and application-managed
                  renewal responsibility.
                </label>
              </>
            )}
            {error && <p role="alert">{error}</p>}
            <Button
              type="submit"
              disabled={
                busy ||
                confirmation !== domainName ||
                (action === 'configure' && (!reason.trim() || !acknowledged))
              }
            >
              {busy ? 'Saving…' : 'Save renewal preferences'}
            </Button>
          </form>
        )}
      </RecordDialog>
    </section>
  );
}

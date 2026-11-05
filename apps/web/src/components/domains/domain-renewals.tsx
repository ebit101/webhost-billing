'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  domainRenewalViewSchema,
  sentenceCaseLabel,
  formatUtcTimestamp,
  type DomainRenewalView,
} from '@webhost-billing/shared';
import { moneyToMinor } from '../../lib/money-input';
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
  onUpdated?: () => void;
}) {
  return <RenewalPanel key={props.domainId} {...props} />;
}
function RenewalPanel({
  domainId,
  domainName,
  administrator,
  onUpdated,
}: {
  domainId: string;
  domainName: string;
  administrator: boolean;
  onUpdated?: () => void;
}) {
  const [view, setView] = useState<DomainRenewalView>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<
    'configure' | 'toggle' | 'approve' | 'reconcile'
  >();
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [costCeiling, setCostCeiling] = useState('');
  const [submissionKey, setSubmissionKey] = useState('');
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
      onUpdated?.();
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
      if (action === 'approve' || action === 'reconcile') {
        if (
          !reason.trim() ||
          !view.invoice ||
          (action === 'approve' && !acknowledged)
        )
          return;
        const body = {
          submissionKey,
          confirmation,
          reason,
          ...(action === 'approve'
            ? {
                invoiceId: view.invoice.id,
                costCeiling: moneyToMinor(
                  costCeiling,
                  'USD',
                  'Registrar cost ceiling',
                ),
                costCurrency: 'USD',
                years: 1,
                approved: true,
              }
            : {}),
        };
        setView(
          parse(
            await authMutation(
              action === 'approve'
                ? `${base}/execute`
                : `${base}/${view.execution?.id}/reconcile`,
              'POST',
              body,
            ),
          ),
        );
      } else {
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
      }
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
  function open(kind: 'configure' | 'toggle' | 'approve' | 'reconcile') {
    setAction(kind);
    setSubmissionKey(crypto.randomUUID());
    setCostCeiling('');
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
        Payment alone does not renew the domain.{' '}
        {view?.externalDispatchEnabled
          ? 'Real registrar dispatch is enabled for approved operations.'
          : 'Registrar renewal dispatch is disabled for live providers.'}
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
          .{' '}
          {view.execution?.status === 'SUCCEEDED'
            ? 'Registrar renewal confirmed.'
            : 'Registrar renewal pending.'}
        </p>
      )}
      {view?.execution && (
        <div className="rounded-lg border border-slate-200 p-3 text-sm">
          <p>
            Renewal fulfillment: {sentenceCaseLabel(view.execution.status)} ·
            Attempt {view.execution.attempt}.
          </p>
          {view.execution.code && (
            <p>Review: {sentenceCaseLabel(view.execution.code)}.</p>
          )}
          {view.execution.expiryAfter && (
            <p>
              Confirmed provider expiry:{' '}
              {formatUtcTimestamp(view.execution.expiryAfter)}.
            </p>
          )}
          {view.execution.financialReviewRequired && (
            <p>
              Financial review required after the registrar renewal. Payment
              history is retained.
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy}
          variant="secondary"
          onClick={() => void refresh()}
        >
          Refresh renewal billing
        </Button>
        {administrator && view?.canApprove && (
          <Button disabled={busy} onClick={() => open('approve')}>
            Approve paid renewal
          </Button>
        )}
        {administrator && view?.canReconcile && (
          <Button
            disabled={busy}
            variant="secondary"
            onClick={() => open('reconcile')}
          >
            Reconcile renewal
          </Button>
        )}
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
          action === 'approve'
            ? 'Approve paid renewal'
            : action === 'reconcile'
              ? 'Reconcile renewal'
              : action === 'configure'
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
            {(action === 'approve' || action === 'reconcile') && (
              <p>
                {action === 'approve'
                  ? 'Approve one paid one-year renewal within the reviewed registrar cost ceiling. No purchase is confirmed until the worker independently verifies expiry.'
                  : 'Request a read-only check of the existing operation. This never submits another renewal purchase.'}
              </p>
            )}
            {(action === 'configure' || action === 'toggle') && (
              <p>
                {action === 'configure'
                  ? `Confirm the current ordinary one-year catalogue price: ${view?.suggestedAmount ? formatMoney(view.suggestedAmount, 'BDT') : 'Unavailable'}. Grace/redemption charges are not supported.`
                  : `Turn application-managed renewal billing ${view?.enabled ? 'off' : 'on'} for ${domainName}. Existing invoices remain unchanged.`}
              </p>
            )}
            <label>
              Confirm domain name
              <input
                className={fieldClass}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
              />
            </label>
            {(action === 'configure' ||
              action === 'approve' ||
              action === 'reconcile') && (
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
                {action !== 'reconcile' && (
                  <label>
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(event) =>
                        setAcknowledged(event.target.checked)
                      }
                    />{' '}
                    {action === 'approve'
                      ? 'I approve this verified paid renewal within the stated USD cost ceiling.'
                      : 'I verified ordinary one-year terms and application-managed renewal responsibility.'}
                  </label>
                )}
              </>
            )}
            {action === 'approve' && (
              <label>
                Registrar cost ceiling (USD)
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  value={costCeiling}
                  onChange={(event) => setCostCeiling(event.target.value)}
                  required
                />
              </label>
            )}
            {error && <p role="alert">{error}</p>}
            <Button
              type="submit"
              disabled={
                busy ||
                confirmation !== domainName ||
                (action === 'configure' && (!reason.trim() || !acknowledged)) ||
                ((action === 'approve' || action === 'reconcile') &&
                  !reason.trim()) ||
                (action === 'approve' && (!acknowledged || !costCeiling.trim()))
              }
            >
              {busy
                ? 'Saving…'
                : action === 'approve'
                  ? 'Queue approved renewal'
                  : action === 'reconcile'
                    ? 'Request reconciliation'
                    : 'Save renewal preferences'}
            </Button>
          </form>
        )}
      </RecordDialog>
    </section>
  );
}

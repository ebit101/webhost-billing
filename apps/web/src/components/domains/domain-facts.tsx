'use client';
import { useEffect, useState } from 'react';
import {
  domainFactSyncSchema,
  formatUtcTimestamp,
  sentenceCaseLabel,
  type DomainFactSync,
} from '@webhost-billing/shared';
import {
  authenticatedGet,
  authMutation,
  ApiMutationError,
} from '../../lib/auth-api';
import { Button } from '../ui/button';
import { RecordDialog } from '../ui/record-dialog';
import { fieldClass } from '../customers/customer-fields';

export function DomainFacts(props: {
  domainId: string;
  domainName: string;
  administrator: boolean;
  onUpdated?: () => void;
}) {
  return <Facts key={props.domainId} {...props} />;
}
function Facts({
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
  const [facts, setFacts] = useState<DomainFactSync>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<'synchronize' | 'review'>();
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submissionKey, setSubmissionKey] = useState('');
  const base = `/domains/${domainId}/registrar-facts`;
  useEffect(() => {
    let active = true;
    void authenticatedGet(base)
      .then((data) => {
        const parsed = domainFactSyncSchema.parse(data);
        if (parsed.domainId !== domainId) throw new Error();
        if (active) setFacts(parsed);
      })
      .catch(() => {
        if (active) setError('Registrar facts could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [base, domainId]);
  async function refresh() {
    setBusy(true);
    setError('');
    try {
      const next = domainFactSyncSchema.parse(await authenticatedGet(base));
      if (next.domainId !== domainId) throw new Error();
      setFacts(next);
    } catch {
      setError('Registrar facts could not be loaded.');
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (
      !action ||
      busy ||
      confirmation !== domainName ||
      (action === 'review' && (!acknowledged || !reason.trim()))
    )
      return;
    setBusy(true);
    setError('');
    try {
      const next = domainFactSyncSchema.parse(
        await authMutation(
          action === 'synchronize'
            ? `${base}/synchronize`
            : `${base}/${facts?.attemptId}/review`,
          'POST',
          action === 'synchronize'
            ? { submissionKey, confirmation }
            : { confirmation, reason, acknowledged: true },
        ),
      );
      if (next.domainId !== domainId) throw new Error();
      setFacts(next);
      setAction(undefined);
      onUpdated?.();
    } catch (caught) {
      setError(
        caught instanceof ApiMutationError
          ? caught.message
          : 'The registrar check could not be saved. Refresh and retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  function open(kind: 'synchronize' | 'review') {
    setAction(kind);
    setConfirmation('');
    setReason('');
    setAcknowledged(false);
    setError('');
    setSubmissionKey(crypto.randomUUID());
  }
  const date = (value: string | null | undefined) =>
    value ? formatUtcTimestamp(value) : 'Not available';
  return (
    <section
      aria-label="Registrar facts"
      className="my-4 grid gap-3 rounded-xl border border-slate-200 p-4"
    >
      <h3 className="text-lg font-semibold">Registrar facts</h3>
      {facts ? (
        <>
          <p>
            {facts.simulated ? 'Simulated' : 'Live'} · Latest check:{' '}
            {sentenceCaseLabel(facts.outcome)} · Source freshness:{' '}
            {sentenceCaseLabel(facts.freshness)}
          </p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {Object.entries({
              'Last attempt': date(facts.lastAttemptAt),
              'Last successful synchronization': date(facts.lastSuccessAt),
              'Provider observation': date(facts.observedAt),
              'Trusted provider expiry': date(facts.expiresAt),
              'Provider status': facts.providerStatus
                ? sentenceCaseLabel(facts.providerStatus)
                : 'Not available',
              'Renewal eligibility': sentenceCaseLabel(
                facts.renewalEligibility,
              ),
              'Registrar auto-renewal':
                facts.registrarAutoRenew === null
                  ? 'Unknown'
                  : facts.registrarAutoRenew
                    ? 'On at registrar'
                    : 'Off at registrar',
            }).map(([label, value]) => (
              <div key={label}>
                <dt className="text-slate-500">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {facts.reviewRequired && (
            <p className="text-sm text-amber-800">
              Review required:{' '}
              {facts.code
                ? sentenceCaseLabel(facts.code)
                : 'The last facts are stale or incomplete'}
              . Prior trusted facts are retained.
            </p>
          )}
          {facts.candidateExpiry && (
            <p>Unapplied expiry for review: {date(facts.candidateExpiry)}.</p>
          )}
        </>
      ) : (
        !error && <p>Loading saved registrar facts…</p>
      )}
      <p className="text-xs text-slate-600">
        Provider expiry is separate from invoice due dates. This check does not
        register, transfer or renew a domain, or enable automatic renewal.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Refresh saved facts
        </Button>
        {administrator && (
          <Button disabled={busy} onClick={() => open('synchronize')}>
            Synchronize registrar facts
          </Button>
        )}
        {administrator && facts?.canReview && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => open('review')}
          >
            Review observed expiry
          </Button>
        )}
      </div>
      {error && !action && <p role="alert">{error}</p>}
      <RecordDialog
        open={Boolean(action)}
        title={
          action === 'review'
            ? 'Review observed expiry'
            : 'Synchronize registrar facts'
        }
        busy={busy}
        onClose={() => {
          setAction(undefined);
          setError('');
        }}
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
              {action === 'review'
                ? 'Accept the fresh, ownership-verified expiry shown below. This cannot resolve an ownership mismatch or change financial history.'
                : 'Request a read-only check of this domain at its recorded registrar account.'}
            </p>
            {action === 'review' && (
              <p>Candidate expiry: {date(facts?.candidateExpiry)}.</p>
            )}
            <label>
              Confirm domain name
              <input
                className={fieldClass}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={domainName}
                required
              />
            </label>
            {action === 'review' && (
              <>
                <label>
                  Review reason
                  <textarea
                    className={fieldClass}
                    value={reason}
                    maxLength={1000}
                    required
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />{' '}
                  I verified this expiry conflict and accept the observed date.
                </label>
              </>
            )}
            {error && <p role="alert">{error}</p>}
            <Button
              type="submit"
              disabled={
                busy ||
                confirmation !== domainName ||
                (action === 'review' && (!acknowledged || !reason.trim()))
              }
            >
              {busy
                ? 'Checking…'
                : action === 'review'
                  ? 'Accept observed expiry'
                  : 'Check registrar facts'}
            </Button>
          </form>
        )}
      </RecordDialog>
    </section>
  );
}

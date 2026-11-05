'use client';

import {
  createHostingUpgradeQuoteSchema,
  hostingUpgradeSchema,
  productSchema,
  sentenceCaseLabel,
  type HostingUpgrade,
  type Product,
  type Service,
} from '@webhost-billing/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  authenticatedGet,
  authMutation,
  ApiMutationError,
} from '../../lib/auth-api';
import { formatMinor } from '../invoices/invoice-ui';
import { Button } from '../ui/button';
import { RecordDialog } from '../ui/record-dialog';
import { fieldClass } from '../customers/customer-fields';

export function HostingUpgrades(props: {
  service: Service;
  administrator?: boolean;
  onCompleted?: () => void;
}) {
  return (
    <UpgradeRequests
      key={`${props.service.id}:${props.service.customerId}`}
      {...props}
    />
  );
}
function UpgradeRequests({
  service,
  administrator = false,
  onCompleted,
}: {
  service: Service;
  administrator?: boolean;
  onCompleted?: () => void;
}) {
  const [rows, setRows] = useState<HostingUpgrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [offerOpen, setOfferOpen] = useState(false);
  const [change, setChange] = useState<'UPGRADE' | 'DOWNGRADE'>('UPGRADE');
  const [capacityFits, setCapacityFits] = useState(true);
  const [reviewReason, setReviewReason] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submissionKey, setSubmissionKey] = useState('');
  const [action, setAction] = useState<{
    row: HostingUpgrade;
    kind: 'accept' | 'approve' | 'cancel' | 'withdraw';
  }>();
  const path = `/services/${service.id}/upgrades${administrator ? `?customerId=${service.customerId}` : ''}`;
  useEffect(() => {
    let active = true;
    void authenticatedGet(path)
      .then((data) => {
        const parsed = hostingUpgradeSchema.array().max(20).parse(data);
        if (active) {
          setRows(parsed);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('Upgrade requests could not be loaded.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  const date = (value: string) =>
    new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(value)) + ' UTC';
  async function beginOffer(kind: 'UPGRADE' | 'DOWNGRADE' = 'UPGRADE') {
    setBusy(true);
    setError('');
    try {
      setProducts(
        productSchema.array().parse(await authenticatedGet('/products')),
      );
      setTarget('');
      setChange(kind);
      setReason('');
      setConfirmed(false);
      setSubmissionKey(crypto.randomUUID());
      setOfferOpen(true);
    } catch {
      setError('Eligible product prices could not be loaded.');
    } finally {
      setBusy(false);
    }
  }
  async function offer() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError('');
    try {
      const input = createHostingUpgradeQuoteSchema.parse({
        submissionKey,
        change,
        targetPriceId: target,
        requirementsVerified: confirmed,
        reason,
      });
      hostingUpgradeSchema.parse(await authMutation(path, 'POST', input));
      setOfferOpen(false);
      setRevision((value) => value + 1);
    } catch (caught) {
      failure(caught);
    } finally {
      setBusy(false);
    }
  }
  function failure(caught: unknown) {
    setError(
      caught instanceof ApiMutationError
        ? caught.message
        : 'The upgrade could not be saved. Refresh and retry.',
    );
  }
  async function perform() {
    if (!action || !confirmed || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = hostingUpgradeSchema.parse(
        await authMutation(
          `/services/${service.id}/upgrades/${action.row.id}/${action.kind}${administrator ? `?customerId=${service.customerId}` : ''}`,
          'POST',
          {
            acknowledged: true,
            ...(action.kind === 'approve' && action.row.change === 'DOWNGRADE'
              ? { downgradeReview: { capacityFits, reason: reviewReason } }
              : {}),
          },
        ),
      );
      if (result.id !== action.row.id || result.serviceId !== service.id)
        throw new Error('Mismatched upgrade');
      setRows((current) =>
        current.map((row) => (row.id === result.id ? result : row)),
      );
      setAction(undefined);
      if (result.status === 'COMPLETED') onCompleted?.();
    } catch (caught) {
      failure(caught);
    } finally {
      setBusy(false);
    }
  }
  const active = rows.some((row) =>
    ['REQUESTED', 'SCHEDULED', 'APPLYING', 'REVIEW_REQUIRED'].includes(
      row.status,
    ),
  );
  return (
    <section
      aria-label="Hosting plan changes"
      className="grid min-w-0 gap-4 rounded-2xl border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-wrap justify-between gap-3">
        <h3 className="text-lg font-bold">Hosting plan changes</h3>
        {administrator && service.status === 'ACTIVE' && (
          <Button
            variant="secondary"
            disabled={busy || active}
            onClick={() => void beginOffer()}
          >
            Offer an upgrade
          </Button>
        )}
        {administrator && service.status === 'ACTIVE' && (
          <Button
            variant="secondary"
            disabled={busy || active}
            onClick={() => void beginOffer('DOWNGRADE')}
          >
            Offer a downgrade
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setError('');
            setRevision((value) => value + 1);
          }}
        >
          Refresh plan changes
        </Button>
      </div>
      {error && !offerOpen && !action && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading upgrade requests…</p>
      ) : !rows.length ? (
        <p className="text-sm text-slate-600">
          No plan-change quote is available. Contact support to review eligible
          plans.
        </p>
      ) : (
        <ul className="grid gap-4">
          {rows.map((row) => (
            <li
              key={row.id}
              className="grid gap-2 rounded-xl border border-slate-200 p-4"
            >
              <p className="font-semibold">
                {row.sourceName} → {row.targetName}
              </p>
              <p>
                {row.change === 'DOWNGRADE' ? 'Downgrade' : 'Upgrade'} request:{' '}
                {sentenceCaseLabel(row.status)} · Payment:{' '}
                {row.paymentStatus
                  ? sentenceCaseLabel(row.paymentStatus)
                  : row.change === 'DOWNGRADE'
                    ? 'No charge or credit'
                    : 'Not invoiced'}{' '}
                · Package change:{' '}
                {row.operationStatus
                  ? sentenceCaseLabel(row.operationStatus)
                  : 'Not started'}
              </p>
              <p>
                {row.change === 'DOWNGRADE'
                  ? 'Immediate charge'
                  : 'Prorated charge'}
                : {formatMinor(row.amount.amount, row.amount.currency)}.{' '}
                {row.change === 'DOWNGRADE' && row.status !== 'COMPLETED'
                  ? 'Quoted renewal price'
                  : 'Next hosting renewal'}
                :{' '}
                {formatMinor(
                  row.nextRecurringAmount.amount,
                  row.nextRecurringAmount.currency,
                )}
                .
              </p>
              {row.change === 'DOWNGRADE' &&
                row.status !== 'COMPLETED' &&
                row.status !== 'CANCELLED' && (
                  <p className="text-sm text-slate-600">
                    {row.status === 'QUOTED' ? 'Proposed for' : 'Scheduled for'}{' '}
                    {date(row.periodEndAt)}. Your current hosting stays
                    unchanged until a full administrator rechecks capacity and
                    confirms the package change.{' '}
                    {row.status === 'QUOTED'
                      ? 'Accept this quote to reserve the change and hold renewal billing.'
                      : 'Renewal billing waits for this review.'}{' '}
                    No mid-period credit or automatic refund.
                  </p>
                )}
              <p className="text-sm text-slate-600">
                Calculated at {date(row.quotedAt)}. Quote expires{' '}
                {date(row.expiresAt)}. Billing boundary: {date(row.periodEndAt)}
                .
              </p>
              {row.error && (
                <p className="text-sm text-amber-800">{row.error}</p>
              )}
              {row.status === 'COMPLETED' && (
                <p className="font-semibold text-emerald-700">
                  The hosting package and recorded plan are updated.
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                {row.invoiceId && (
                  <Link
                    className="font-semibold text-brand-700 underline"
                    href={
                      administrator
                        ? `/admin/invoices/${row.invoiceId}`
                        : `/portal/invoices/${row.invoiceId}`
                    }
                  >
                    View upgrade invoice {row.invoiceNumber}
                  </Link>
                )}
                {row.canAccept && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setAction({ row, kind: 'accept' });
                      setConfirmed(false);
                      setError('');
                    }}
                  >
                    {row.change === 'DOWNGRADE'
                      ? 'Schedule downgrade'
                      : 'Review and accept upgrade'}
                  </Button>
                )}
                {administrator &&
                  [
                    'REQUESTED',
                    'SCHEDULED',
                    'APPLYING',
                    'REVIEW_REQUIRED',
                  ].includes(row.status) && (
                    <Button
                      disabled={
                        busy ||
                        (row.change === 'DOWNGRADE'
                          ? Date.now() < Date.parse(row.periodEndAt)
                          : row.paymentStatus !== 'PAID')
                      }
                      onClick={() => {
                        setAction({ row, kind: 'approve' });
                        setConfirmed(false);
                        setError('');
                        setCapacityFits(true);
                        setReviewReason('');
                      }}
                    >
                      {row.change === 'DOWNGRADE'
                        ? 'Review due downgrade'
                        : row.status === 'REQUESTED'
                          ? 'Approve paid upgrade'
                          : 'Review and recover upgrade'}
                    </Button>
                  )}
                {administrator &&
                  (['QUOTED', 'REQUESTED', 'SCHEDULED'].includes(row.status) ||
                    (row.status === 'REVIEW_REQUIRED' &&
                      (row.paymentStatus === 'REFUNDED' ||
                        row.change === 'DOWNGRADE'))) &&
                  row.paymentStatus !== 'PAID' && (
                    <Button
                      disabled={busy}
                      variant="secondary"
                      onClick={() => {
                        setAction({ row, kind: 'cancel' });
                        setConfirmed(false);
                        setError('');
                      }}
                    >
                      {row.change === 'DOWNGRADE'
                        ? 'Close downgrade reservation'
                        : row.paymentStatus === 'REFUNDED'
                          ? 'Close refunded upgrade'
                          : 'Close unpaid upgrade'}
                    </Button>
                  )}
                {row.canWithdraw && !administrator && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setAction({ row, kind: 'withdraw' });
                      setConfirmed(false);
                      setError('');
                    }}
                  >
                    Withdraw downgrade
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">
        Payment and package fulfillment are separate. Hosting keeps its billing
        cycle. Existing invoices and purchased add-ons remain unchanged.
      </p>
      <RecordDialog
        open={offerOpen}
        title={
          change === 'DOWNGRADE'
            ? 'Offer a hosting downgrade'
            : 'Offer a hosting upgrade'
        }
        busy={busy}
        onClose={() => {
          setOfferOpen(false);
          setError('');
        }}
      >
        {offerOpen && (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void offer();
            }}
          >
            <label>
              Target plan and price
              <select
                className={fieldClass}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                required
              >
                <option value="">Select an eligible price</option>
                {products
                  .filter(
                    (product) =>
                      product.status === 'ACTIVE' &&
                      product.id !== service.productId,
                  )
                  .flatMap((product) =>
                    product.prices
                      .filter(
                        (price) =>
                          price.isActive &&
                          price.billingPeriod === service.billingPeriod &&
                          price.amount.currency ===
                            service.recurringAmount.currency &&
                          (change === 'DOWNGRADE'
                            ? BigInt(price.amount.amount) <=
                              BigInt(service.recurringAmount.amount)
                            : BigInt(price.amount.amount) >=
                              BigInt(service.recurringAmount.amount)),
                      )
                      .map((price) => (
                        <option key={price.id} value={price.id}>
                          {product.name} ·{' '}
                          {formatMinor(
                            price.amount.amount,
                            price.amount.currency,
                          )}
                        </option>
                      )),
                  )}
              </select>
            </label>
            <label>
              Review reason
              <textarea
                className={fieldClass}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                maxLength={1000}
              />
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I verified that this is an allowed{' '}
              {change === 'DOWNGRADE' ? 'downgrade' : 'upgrade'}, the target
              package exists on this server, capacity fits, and retained add-ons
              are compatible.
            </label>
            <p>
              The customer receives a 15-minute quote. A downgrade reserves the
              billing boundary with no immediate charge or credit. A full
              administrator must recheck usage and capacity at that boundary.
            </p>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={busy || !confirmed || !target || !reason.trim()}
            >
              {change === 'DOWNGRADE'
                ? 'Create downgrade quote'
                : 'Create upgrade quote'}
            </Button>
          </form>
        )}
      </RecordDialog>
      <RecordDialog
        open={Boolean(action)}
        title={
          action?.row.change === 'DOWNGRADE'
            ? 'Confirm hosting downgrade action'
            : 'Confirm hosting upgrade action'
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
              void perform();
            }}
          >
            <p>
              {action.row.sourceName} → {action.row.targetName}
            </p>
            <p>
              Prorated charge:{' '}
              {formatMinor(
                action.row.amount.amount,
                action.row.amount.currency,
              )}
              . Renewal price:{' '}
              {formatMinor(
                action.row.nextRecurringAmount.amount,
                action.row.nextRecurringAmount.currency,
              )}
              . Existing cycle ends {date(action.row.periodEndAt)}.
            </p>
            <p>
              {action.row.change === 'DOWNGRADE'
                ? action.kind === 'accept'
                  ? 'Schedule at the shown billing boundary. No invoice, credit or refund is created. You can withdraw before the boundary; renewal billing waits for the administrator capacity review and confirmed package change.'
                  : action.kind === 'approve'
                    ? 'Recheck current account usage against target limits and retained add-on compatibility. Record the result; unknown or insufficient capacity must stay in review.'
                    : 'Release the reservation. Hosting keeps its current plan and normal renewal billing resumes. Issued invoices and payments stay unchanged.'
                : action.kind === 'accept'
                  ? 'Accepting creates one invoice. Hosting changes after verified payment and administrator approval.'
                  : action.kind === 'approve'
                    ? 'Verify capacity and package compatibility again. Approval can change the hosting package after payment verification. Uncertain outcomes require reconciliation.'
                    : 'This closes an unstarted, unpaid upgrade, or a fully refunded request after the original package is verified. Refunded invoices and payment records are preserved.'}
            </p>
            {action.kind === 'approve' && action.row.change === 'DOWNGRADE' && (
              <>
                <label>
                  Capacity and add-on review
                  <select
                    className={fieldClass}
                    value={capacityFits ? 'fits' : 'review'}
                    onChange={(event) =>
                      setCapacityFits(event.target.value === 'fits')
                    }
                  >
                    <option value="fits">
                      Usage fits and retained add-ons are compatible
                    </option>
                    <option value="review">
                      Unknown or insufficient capacity; keep in review
                    </option>
                  </select>
                </label>
                <label>
                  Review reason
                  <textarea
                    className={fieldClass}
                    required
                    maxLength={1000}
                    value={reviewReason}
                    onChange={(event) => setReviewReason(event.target.value)}
                  />
                </label>
              </>
            )}
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {action.row.change === 'DOWNGRADE'
                ? 'I confirm this downgrade action.'
                : 'I confirm this upgrade action.'}
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={
                busy ||
                !confirmed ||
                (action.kind === 'approve' &&
                  action.row.change === 'DOWNGRADE' &&
                  !reviewReason.trim())
              }
            >
              {busy
                ? 'Saving change…'
                : action.row.change === 'DOWNGRADE'
                  ? 'Confirm downgrade action'
                  : 'Confirm upgrade action'}
            </Button>
          </form>
        )}
      </RecordDialog>
    </section>
  );
}

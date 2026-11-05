import { z } from 'zod';
import {
  currencyCodeSchema,
  moneySchema,
  serializeMoney,
  type SerializedMoney,
} from './contracts/money';
import { hostingBillingPeriodSchema } from './contracts/states';

// Command 210 reference model. Not connected to application requests or billing.
export const HOSTING_PLAN_CHANGE_POLICY =
  'hosting-plan-change-proposal-v1' as const;
const quoteLifetimeMs = 900_000n;
const timestampSchema = z.iso.datetime({ precision: 3 });
const planSnapshotSchema = z
  .object({
    productId: z.uuid(),
    priceId: z.uuid(),
    name: z.string().min(1).max(160),
    recurringAmount: moneySchema,
    billingPeriod: hostingBillingPeriodSchema,
    serverId: z.uuid(),
    adapterKey: z.string().min(1).max(64),
    packageIdentifier: z.string().min(1).max(191),
  })
  .strict();

export const hostingPlanChangeQuoteInputSchema = z
  .object({
    serviceId: z.uuid(),
    serviceUpdatedAt: timestampSchema,
    baseCurrency: currencyCodeSchema,
    change: z.enum(['UPGRADE', 'DOWNGRADE']),
    quotedAt: timestampSchema,
    paidPeriod: z
      .object({
        startAt: timestampSchema,
        endAt: timestampSchema,
        invoiceId: z.uuid(),
      })
      .strict(),
    current: planSnapshotSchema,
    target: planSnapshotSchema,
    targetActive: z.boolean(),
    // Facts must be loaded by a future authorized server caller, never a browser.
    facts: z
      .object({
        customerOwnsService: z.boolean(),
        customerActive: z.boolean(),
        serviceActive: z.boolean(),
        serverReady: z.boolean(),
        packageChangeSupported: z.boolean(),
        sourcePackageVerified: z.boolean(),
        targetPackageVerified: z.boolean(),
        changeAllowed: z.boolean(),
        paidPeriodVerified: z.boolean(),
        targetCapacityFits: z.boolean(),
        addOnsCompatible: z.boolean(),
        hasOpenFinancialWork: z.boolean(),
        hasCancellation: z.boolean(),
        hasPendingChange: z.boolean(),
        hasUncertainOperation: z.boolean(),
        hasChangeInPaidPeriod: z.boolean(),
        preserveExistingHosting: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type HostingPlanChangeQuoteInput = z.infer<
  typeof hostingPlanChangeQuoteInputSchema
>;
export type HostingPlanChangeBlocker =
  | 'CUSTOMER_ACCESS_REQUIRED'
  | 'ACTIVE_SERVICE_REQUIRED'
  | 'SERVER_REVIEW_REQUIRED'
  | 'CHANGE_NOT_ALLOWED'
  | 'PAID_PERIOD_REQUIRED'
  | 'CAPACITY_REVIEW_REQUIRED'
  | 'ADD_ON_REVIEW_REQUIRED'
  | 'OPEN_FINANCIAL_WORK'
  | 'CANCELLATION_PENDING'
  | 'CHANGE_PENDING'
  | 'PROVIDER_OUTCOME_UNCERTAIN'
  | 'PERIOD_CHANGE_LIMIT'
  | 'EXISTING_HOSTING_REVIEW'
  | 'TARGET_UNAVAILABLE'
  | 'SAME_PLAN'
  | 'CURRENCY_MISMATCH'
  | 'CYCLE_MISMATCH'
  | 'SERVER_MISMATCH'
  | 'INVALID_PERIOD'
  | 'PRICE_REVIEW_REQUIRED';

export type HostingPlanChangeQuote = {
  status: 'QUOTED';
  policyVersion: typeof HOSTING_PLAN_CHANGE_POLICY;
  change: HostingPlanChangeQuoteInput['change'];
  serviceId: string;
  serviceUpdatedAt: string;
  quotedAt: string;
  expiresAt: string;
  effectiveAt: string;
  nextDueAt: string;
  paidPeriod: HostingPlanChangeQuoteInput['paidPeriod'];
  current: HostingPlanChangeQuoteInput['current'];
  target: HostingPlanChangeQuoteInput['target'];
  immediateCharge: SerializedMoney;
  nextRecurringAmount: SerializedMoney;
  periodMs: string;
  remainingMs: string;
  rounding: 'HALF_UP_ON_NET_DIFFERENCE';
};

export function quoteHostingPlanChange(
  value: unknown,
):
  | HostingPlanChangeQuote
  | { status: 'BLOCKED'; reasons: HostingPlanChangeBlocker[] } {
  const input = hostingPlanChangeQuoteInputSchema.parse(value);
  const reasons: HostingPlanChangeBlocker[] = [];
  const { facts, current, target } = input;
  if (!facts.customerOwnsService || !facts.customerActive)
    reasons.push('CUSTOMER_ACCESS_REQUIRED');
  if (!facts.serviceActive) reasons.push('ACTIVE_SERVICE_REQUIRED');
  if (
    !facts.serverReady ||
    !facts.packageChangeSupported ||
    !facts.sourcePackageVerified ||
    !facts.targetPackageVerified
  )
    reasons.push('SERVER_REVIEW_REQUIRED');
  if (!facts.changeAllowed) reasons.push('CHANGE_NOT_ALLOWED');
  if (!facts.paidPeriodVerified) reasons.push('PAID_PERIOD_REQUIRED');
  if (!facts.targetCapacityFits) reasons.push('CAPACITY_REVIEW_REQUIRED');
  if (!facts.addOnsCompatible) reasons.push('ADD_ON_REVIEW_REQUIRED');
  if (facts.hasOpenFinancialWork) reasons.push('OPEN_FINANCIAL_WORK');
  if (facts.hasCancellation) reasons.push('CANCELLATION_PENDING');
  if (facts.hasPendingChange) reasons.push('CHANGE_PENDING');
  if (facts.hasUncertainOperation) reasons.push('PROVIDER_OUTCOME_UNCERTAIN');
  if (facts.hasChangeInPaidPeriod) reasons.push('PERIOD_CHANGE_LIMIT');
  if (facts.preserveExistingHosting) reasons.push('EXISTING_HOSTING_REVIEW');
  if (!input.targetActive || BigInt(target.recurringAmount.amount) === 0n)
    reasons.push('TARGET_UNAVAILABLE');
  if (current.productId === target.productId) reasons.push('SAME_PLAN');
  if (
    current.recurringAmount.currency !== input.baseCurrency ||
    target.recurringAmount.currency !== input.baseCurrency
  )
    reasons.push('CURRENCY_MISMATCH');
  if (current.billingPeriod !== target.billingPeriod)
    reasons.push('CYCLE_MISMATCH');
  if (
    current.serverId !== target.serverId ||
    current.adapterKey !== target.adapterKey
  )
    reasons.push('SERVER_MISMATCH');

  const start = BigInt(Date.parse(input.paidPeriod.startAt));
  const end = BigInt(Date.parse(input.paidPeriod.endAt));
  const now = BigInt(Date.parse(input.quotedAt));
  if (start >= end || now < start || now >= end) reasons.push('INVALID_PERIOD');
  const difference =
    BigInt(target.recurringAmount.amount) -
    BigInt(current.recurringAmount.amount);
  if (
    (input.change === 'UPGRADE' && difference < 0n) ||
    (input.change === 'DOWNGRADE' && difference > 0n)
  )
    reasons.push('PRICE_REVIEW_REQUIRED');
  if (reasons.length) return { status: 'BLOCKED', reasons };

  const period = end - start;
  const remaining = end - now;
  const numerator = input.change === 'UPGRADE' ? difference * remaining : 0n;
  const quotient = numerator / period;
  const charge = quotient + ((numerator % period) * 2n >= period ? 1n : 0n);
  const expires = now + quoteLifetimeMs < end ? now + quoteLifetimeMs : end;
  return {
    status: 'QUOTED',
    policyVersion: HOSTING_PLAN_CHANGE_POLICY,
    change: input.change,
    serviceId: input.serviceId,
    serviceUpdatedAt: input.serviceUpdatedAt,
    quotedAt: input.quotedAt,
    expiresAt: new Date(Number(expires)).toISOString(),
    effectiveAt:
      input.change === 'UPGRADE' ? input.quotedAt : input.paidPeriod.endAt,
    nextDueAt: input.paidPeriod.endAt,
    paidPeriod: input.paidPeriod,
    current,
    target,
    immediateCharge: serializeMoney(charge, input.baseCurrency),
    nextRecurringAmount: target.recurringAmount,
    periodMs: period.toString(),
    remainingMs: remaining.toString(),
    rounding: 'HALF_UP_ON_NET_DIFFERENCE',
  };
}

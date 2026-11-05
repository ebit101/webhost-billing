import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  quoteHostingPlanChange,
  type HostingPlanChangeQuote,
  type HostingPlanChangeQuoteInput,
} from '../src/hosting-plan-change';
import { POSTGRES_BIGINT_MAX } from '../src/contracts/money';

function fixture(): HostingPlanChangeQuoteInput {
  const current = {
    productId: '21000000-0000-4000-8000-000000000001',
    priceId: '21000000-0000-4000-8000-000000000002',
    name: 'Fictional starter',
    recurringAmount: { amount: '100000', currency: 'BDT' },
    billingPeriod: 'MONTHLY' as const,
    serverId: '21000000-0000-4000-8000-000000000003',
    adapterKey: 'fake-panel',
    packageIdentifier: 'fictional-starter',
  };
  return {
    serviceId: '21000000-0000-4000-8000-000000000004',
    serviceUpdatedAt: '2026-04-01T00:00:00.000Z',
    baseCurrency: 'BDT',
    change: 'UPGRADE',
    quotedAt: '2026-04-16T00:00:00.000Z',
    paidPeriod: {
      startAt: '2026-04-01T00:00:00.000Z',
      endAt: '2026-05-01T00:00:00.000Z',
      invoiceId: '21000000-0000-4000-8000-000000000005',
    },
    current,
    target: {
      ...current,
      productId: '21000000-0000-4000-8000-000000000006',
      priceId: '21000000-0000-4000-8000-000000000007',
      name: 'Fictional business',
      recurringAmount: { amount: '160000', currency: 'BDT' },
      packageIdentifier: 'fictional-business',
    },
    targetActive: true,
    facts: {
      customerOwnsService: true,
      customerActive: true,
      serviceActive: true,
      serverReady: true,
      packageChangeSupported: true,
      sourcePackageVerified: true,
      targetPackageVerified: true,
      changeAllowed: true,
      paidPeriodVerified: true,
      targetCapacityFits: true,
      addOnsCompatible: true,
      hasOpenFinancialWork: false,
      hasCancellation: false,
      hasPendingChange: false,
      hasUncertainOperation: false,
      hasChangeInPaidPeriod: false,
      preserveExistingHosting: false,
    },
  };
}
function quoted(input: unknown): HostingPlanChangeQuote {
  const result = quoteHostingPlanChange(input);
  assert.equal(result.status, 'QUOTED');
  if (result.status !== 'QUOTED')
    throw new Error('Expected an eligible fictional quote');
  return result;
}

describe('Command 210 reference hosting quotes', () => {
  const examples = [
    {
      label: 'monthly half period',
      period: 'MONTHLY',
      start: '2026-04-01',
      end: '2026-05-01',
      at: '2026-04-16',
      old: '100000',
      target: '160000',
      charge: '30000',
    },
    {
      label: 'quarterly 90-day period',
      period: 'QUARTERLY',
      start: '2026-01-01',
      end: '2026-04-01',
      at: '2026-02-15',
      old: '300000',
      target: '480000',
      charge: '90000',
    },
    {
      label: 'annual 365-day period',
      period: 'ANNUAL',
      start: '2026-01-01',
      end: '2027-01-01',
      at: '2026-07-02',
      old: '1200000',
      target: '1800000',
      charge: '300822',
    },
    {
      label: 'leap-year 366-day period',
      period: 'ANNUAL',
      start: '2024-01-01',
      end: '2025-01-01',
      at: '2024-07-02',
      old: '1200000',
      target: '1800000',
      charge: '300000',
    },
    {
      label: 'clamped January-to-February period',
      period: 'MONTHLY',
      start: '2026-01-31',
      end: '2026-02-28',
      at: '2026-02-14',
      old: '100000',
      target: '160000',
      charge: '30000',
    },
  ] as const;
  for (const example of examples)
    it(`matches the documented ${example.label} example`, () => {
      const input = fixture();
      const date = (value: string) => `${value}T00:00:00.000Z`;
      input.paidPeriod.startAt = date(example.start);
      input.paidPeriod.endAt = date(example.end);
      input.quotedAt = date(example.at);
      input.serviceUpdatedAt = date(example.start);
      input.current.billingPeriod = example.period;
      input.target.billingPeriod = example.period;
      input.current.recurringAmount.amount = example.old;
      input.target.recurringAmount.amount = example.target;
      const quote = quoted(input);
      assert.deepEqual(quote.immediateCharge, {
        amount: example.charge,
        currency: 'BDT',
      });
      assert.equal(quote.nextDueAt, input.paidPeriod.endAt);
      assert.deepEqual(quote.nextRecurringAmount, input.target.recurringAmount);
    });
  it('schedules a cheaper plan at period end without any immediate credit or refund', () => {
    const input = fixture();
    input.change = 'DOWNGRADE';
    input.target.recurringAmount.amount = '70000';
    const quote = quoted(input);
    assert.equal(quote.effectiveAt, input.paidPeriod.endAt);
    assert.deepEqual(quote.immediateCharge, { amount: '0', currency: 'BDT' });
    assert.equal(quote.nextRecurringAmount.amount, '70000');
  });
  it('rounds the net difference once, half up, including a single minor unit', () => {
    const input = fixture();
    input.current.recurringAmount.amount = '1';
    input.target.recurringAmount.amount = '2';
    assert.equal(quoted(input).immediateCharge.amount, '1');
    input.quotedAt = '2026-04-16T00:00:00.001Z';
    assert.equal(quoted(input).immediateCharge.amount, '0');
    input.quotedAt = '2026-04-15T23:59:59.999Z';
    assert.equal(quoted(input).immediateCharge.amount, '1');
  });
  it('handles intraday changes using elapsed UTC time, not date-only rounding', () => {
    const input = fixture();
    input.quotedAt = '2026-04-16T12:00:00.000Z';
    assert.equal(quoted(input).immediateCharge.amount, '29000');
  });
  it('uses the full difference at the period start and retains a zero-price-difference plan quote', () => {
    const input = fixture();
    input.quotedAt = input.paidPeriod.startAt;
    assert.equal(quoted(input).immediateCharge.amount, '60000');
    input.target.recurringAmount.amount = input.current.recurringAmount.amount;
    assert.equal(quoted(input).immediateCharge.amount, '0');
  });
  it('sets a 15-minute acceptance window and clips it at the billing boundary', () => {
    const input = fixture();
    assert.equal(quoted(input).expiresAt, '2026-04-16T00:15:00.000Z');
    input.quotedAt = '2026-04-30T23:55:00.000Z';
    assert.equal(quoted(input).expiresAt, input.paidPeriod.endAt);
  });
  it('preserves amounts above the JavaScript safe integer range and the PostgreSQL maximum', () => {
    const input = fixture();
    input.current.recurringAmount.amount = '0';
    input.target.recurringAmount.amount = POSTGRES_BIGINT_MAX.toString();
    assert.equal(quoted(input).immediateCharge.amount, '4611686018427387904');
    input.quotedAt = input.paidPeriod.startAt;
    assert.equal(
      quoted(input).immediateCharge.amount,
      POSTGRES_BIGINT_MAX.toString(),
    );
  });
  it('does not mutate the supplied snapshots or depend on the wall clock', () => {
    const input = fixture();
    const before = JSON.stringify(input);
    const first = quoted(input);
    first.target.recurringAmount.amount = '1';
    assert.equal(JSON.stringify(input), before);
    assert.equal(quoted(input).target.recurringAmount.amount, '160000');
    assert.doesNotThrow(() => JSON.stringify(quoted(input)));
  });

  const blockedFacts = {
    customerOwnsService: 'CUSTOMER_ACCESS_REQUIRED',
    customerActive: 'CUSTOMER_ACCESS_REQUIRED',
    serviceActive: 'ACTIVE_SERVICE_REQUIRED',
    serverReady: 'SERVER_REVIEW_REQUIRED',
    packageChangeSupported: 'SERVER_REVIEW_REQUIRED',
    sourcePackageVerified: 'SERVER_REVIEW_REQUIRED',
    targetPackageVerified: 'SERVER_REVIEW_REQUIRED',
    changeAllowed: 'CHANGE_NOT_ALLOWED',
    paidPeriodVerified: 'PAID_PERIOD_REQUIRED',
    targetCapacityFits: 'CAPACITY_REVIEW_REQUIRED',
    addOnsCompatible: 'ADD_ON_REVIEW_REQUIRED',
    hasOpenFinancialWork: 'OPEN_FINANCIAL_WORK',
    hasCancellation: 'CANCELLATION_PENDING',
    hasPendingChange: 'CHANGE_PENDING',
    hasUncertainOperation: 'PROVIDER_OUTCOME_UNCERTAIN',
    hasChangeInPaidPeriod: 'PERIOD_CHANGE_LIMIT',
    preserveExistingHosting: 'EXISTING_HOSTING_REVIEW',
  } as const;
  for (const key of Object.keys(blockedFacts) as Array<
    keyof typeof blockedFacts
  >)
    it(`blocks ineligible fact: ${key}`, () => {
      const input = fixture();
      input.facts[key] = !input.facts[key];
      assert.deepEqual(quoteHostingPlanChange(input), {
        status: 'BLOCKED',
        reasons: [blockedFacts[key]],
      });
    });
  it('blocks same-plan, mixed currency, cycle and server or adapter changes', () => {
    const input = fixture();
    input.target.productId = input.current.productId;
    input.target.recurringAmount.currency = 'USD';
    input.target.billingPeriod = 'ANNUAL';
    input.target.serverId = input.serviceId;
    assert.deepEqual(quoteHostingPlanChange(input), {
      status: 'BLOCKED',
      reasons: [
        'SAME_PLAN',
        'CURRENCY_MISMATCH',
        'CYCLE_MISMATCH',
        'SERVER_MISMATCH',
      ],
    });
    input.target.serverId = input.current.serverId;
    input.target.adapterKey = 'another-adapter';
    const result = quoteHostingPlanChange(input);
    assert.equal(result.status, 'BLOCKED');
    if (result.status === 'BLOCKED')
      assert.ok(result.reasons.includes('SERVER_MISMATCH'));
  });
  it('blocks source currency outside the installation base currency', () => {
    const input = fixture();
    input.current.recurringAmount.currency = 'USD';
    assert.deepEqual(quoteHostingPlanChange(input), {
      status: 'BLOCKED',
      reasons: ['CURRENCY_MISMATCH'],
    });
  });
  it('requires manual review for a cheaper upgrade or a dearer downgrade', () => {
    const input = fixture();
    input.change = 'DOWNGRADE';
    assert.deepEqual(quoteHostingPlanChange(input), {
      status: 'BLOCKED',
      reasons: ['PRICE_REVIEW_REQUIRED'],
    });
    input.change = 'UPGRADE';
    input.target.recurringAmount.amount = '70000';
    assert.deepEqual(quoteHostingPlanChange(input), {
      status: 'BLOCKED',
      reasons: ['PRICE_REVIEW_REQUIRED'],
    });
  });
  it('rejects unavailable or zero-price target plans', () => {
    const input = fixture();
    input.targetActive = false;
    assert.deepEqual(quoteHostingPlanChange(input), {
      status: 'BLOCKED',
      reasons: ['TARGET_UNAVAILABLE'],
    });
    input.targetActive = true;
    input.target.recurringAmount.amount = '0';
    input.change = 'DOWNGRADE';
    assert.deepEqual(quoteHostingPlanChange(input), {
      status: 'BLOCKED',
      reasons: ['TARGET_UNAVAILABLE'],
    });
  });
  for (const at of [
    '2026-03-31T23:59:59.999Z',
    '2026-05-01T00:00:00.000Z',
    '2026-05-02T00:00:00.000Z',
  ])
    it(`blocks quotes outside the paid half-open interval: ${at}`, () => {
      const input = fixture();
      input.quotedAt = at;
      assert.deepEqual(quoteHostingPlanChange(input), {
        status: 'BLOCKED',
        reasons: ['INVALID_PERIOD'],
      });
    });
  it('rejects empty or inverted coverage intervals', () => {
    const input = fixture();
    input.paidPeriod.endAt = input.paidPeriod.startAt;
    assert.deepEqual(quoteHostingPlanChange(input), {
      status: 'BLOCKED',
      reasons: ['INVALID_PERIOD'],
    });
    input.paidPeriod.endAt = '2026-03-01T00:00:00.000Z';
    assert.deepEqual(quoteHostingPlanChange(input), {
      status: 'BLOCKED',
      reasons: ['INVALID_PERIOD'],
    });
  });
  for (const amount of ['-1', '1.5', '1e3', '01', '9223372036854775808'])
    it(`rejects noncanonical or overflowing money: ${amount}`, () => {
      const input = fixture();
      input.target.recurringAmount.amount = amount;
      assert.throws(() => quoteHostingPlanChange(input));
    });
  it('rejects numeric money, missing eligibility evidence, unknown fields and invalid dates', () => {
    const input = fixture();
    assert.throws(() =>
      quoteHostingPlanChange({
        ...input,
        current: {
          ...input.current,
          recurringAmount: { amount: 100000, currency: 'BDT' },
        },
      }),
    );
    assert.throws(() => quoteHostingPlanChange({ ...input, facts: {} }));
    assert.throws(() => quoteHostingPlanChange({ ...input, execute: true }));
    assert.throws(() =>
      quoteHostingPlanChange({
        ...input,
        quotedAt: '2026-02-30T00:00:00.000Z',
      }),
    );
  });
});

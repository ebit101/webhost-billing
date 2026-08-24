import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import {
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
  authenticatedSessionResponseSchema,
  authenticatedIdentitySchema,
  createApiErrorResponse,
  createPaginationMeta,
  invoiceStatusSchema,
  loginRequestSchema,
  moneySchema,
  passwordSchema,
  orderStatusSchema,
  paginatedApiSuccessResponseSchema,
  paginationQuerySchema,
  paymentStatusSchema,
  roleSchema,
  registrationRequestSchema,
  createProductRequestSchema,
  productPriceInputSchema,
  serializeMoney,
  serviceStatusSchema,
  ticketStatusSchema,
} from '../src';

describe('money contracts', () => {
  it('serializes bigint minor units as a lossless decimal string', () => {
    assert.deepEqual(serializeMoney(9_007_199_254_740_993n, 'BDT'), {
      amount: '9007199254740993',
      currency: 'BDT',
    });
  });

  it('rejects floating point, negative, non-canonical, and oversized amounts', () => {
    for (const amount of ['12.50', '-1', '01', '9223372036854775808']) {
      assert.equal(
        moneySchema.safeParse({ amount, currency: 'BDT' }).success,
        false,
      );
    }
  });

  it('rejects invalid currency codes', () => {
    assert.equal(
      moneySchema.safeParse({ amount: '100', currency: 'bdt' }).success,
      false,
    );
  });
});

describe('boundary contracts', () => {
  it('keeps shared states aligned with the database state vocabulary', () => {
    assert.equal(roleSchema.parse('ADMIN'), 'ADMIN');
    assert.equal(
      orderStatusSchema.parse('AWAITING_PAYMENT'),
      'AWAITING_PAYMENT',
    );
    assert.equal(
      invoiceStatusSchema.parse('PARTIALLY_REFUNDED'),
      'PARTIALLY_REFUNDED',
    );
    assert.equal(paymentStatusSchema.parse('SUCCEEDED'), 'SUCCEEDED');
    assert.equal(
      serviceStatusSchema.parse('PROVISION_FAILED'),
      'PROVISION_FAILED',
    );
    assert.equal(
      ticketStatusSchema.parse('WAITING_FOR_STAFF'),
      'WAITING_FOR_STAFF',
    );
  });

  it('validates role-specific authenticated identities', () => {
    const identity = authenticatedIdentitySchema.parse({
      userId: '10000000-0000-4000-8000-000000000001',
      email: 'admin@example.test',
      role: 'ADMIN',
      adminProfileId: '10000000-0000-4000-8000-000000000002',
    });

    assert.equal(identity.role, 'ADMIN');
    assert.equal(
      authenticatedIdentitySchema.safeParse({
        userId: '10000000-0000-4000-8000-000000000001',
        email: 'customer@example.test',
        role: 'CUSTOMER',
      }).success,
      false,
    );
  });

  it('normalizes and validates authentication input', () => {
    const registration = registrationRequestSchema.parse({
      email: ' Customer@Example.Test ',
      password: 'correct horse battery staple',
      firstName: 'Fictional',
      lastName: 'Customer',
      addressLine1: '1 Example Road',
      city: 'Dhaka',
      countryCode: 'bd',
    });

    assert.equal(registration.email, 'customer@example.test');
    assert.equal(registration.countryCode, 'BD');
    assert.equal(passwordSchema.safeParse('short').success, false);
    assert.equal(
      loginRequestSchema.safeParse({
        email: 'not-an-email',
        password: 'irrelevant',
      }).success,
      false,
    );
  });

  it('validates authenticated session responses', () => {
    assert.equal(
      authenticatedSessionResponseSchema.safeParse({
        identity: {
          userId: '10000000-0000-4000-8000-000000000001',
          email: 'admin@example.test',
          role: 'ADMIN',
          adminProfileId: '10000000-0000-4000-8000-000000000002',
        },
        session: {
          id: '10000000-0000-4000-8000-000000000003',
          createdAt: '2026-08-24T00:00:00.000Z',
          lastSeenAt: '2026-08-24T00:00:00.000Z',
          expiresAt: '2026-08-31T00:00:00.000Z',
          current: true,
        },
      }).success,
      true,
    );
  });

  it('validates supported hosting products and lossless prices', () => {
    const product = createProductRequestSchema.parse({
      slug: 'business-hosting',
      name: 'Business Hosting',
      publicVisible: true,
      displayOrder: 20,
      hostingPackageIdentifier: 'business_pkg',
      storageFeature: '30 GB SSD',
      websiteFeature: '5 websites',
      emailFeature: '50 email accounts',
      bandwidthFeature: 'Unlimited',
      prices: [
        {
          billingPeriod: 'ANNUAL',
          currency: 'BDT',
          amount: '240000',
        },
      ],
    });
    assert.equal(product.prices?.[0]?.setupFee, '0');
    assert.throws(() =>
      productPriceInputSchema.parse({
        billingPeriod: 'SEMIANNUAL',
        currency: 'bdt',
        amount: '12.50',
      }),
    );
    assert.throws(() =>
      createProductRequestSchema.parse({
        slug: 'duplicate-price',
        name: 'Duplicate Price',
        prices: [
          { billingPeriod: 'MONTHLY', currency: 'BDT', amount: '100' },
          { billingPeriod: 'MONTHLY', currency: 'BDT', amount: '200' },
        ],
      }),
    );
  });

  it('coerces bounded pagination input and calculates metadata', () => {
    assert.deepEqual(
      paginationQuerySchema.parse({ page: '2', pageSize: '25' }),
      {
        page: 2,
        pageSize: 25,
      },
    );
    assert.deepEqual(createPaginationMeta(2, 25, 51), {
      page: 2,
      pageSize: 25,
      totalItems: 51,
      totalPages: 3,
    });
    assert.equal(
      paginationQuerySchema.safeParse({ page: 1, pageSize: 101 }).success,
      false,
    );
  });

  it('validates success, paginated success, and stable error envelopes', () => {
    const successSchema = apiSuccessResponseSchema(
      z.object({ id: z.uuid() }).strict(),
    );
    assert.equal(
      successSchema.safeParse({
        success: true,
        data: { id: '10000000-0000-4000-8000-000000000001' },
      }).success,
      true,
    );

    const paginatedSchema = paginatedApiSuccessResponseSchema(z.string());
    assert.equal(
      paginatedSchema.safeParse({
        success: true,
        data: ['one'],
        pagination: createPaginationMeta(1, 20, 1),
      }).success,
      true,
    );

    const error = createApiErrorResponse({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      issues: [{ field: 'email', message: 'Invalid email address' }],
    });
    assert.deepEqual(apiErrorResponseSchema.parse(error), error);
  });
});

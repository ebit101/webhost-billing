import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import {
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
  authenticatedIdentitySchema,
  createApiErrorResponse,
  createPaginationMeta,
  invoiceStatusSchema,
  moneySchema,
  orderStatusSchema,
  paginatedApiSuccessResponseSchema,
  paginationQuerySchema,
  paymentStatusSchema,
  roleSchema,
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

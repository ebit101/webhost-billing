import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import {
  backgroundJobDataSchema,
  backgroundQueuePolicies,
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
  authenticatedSessionResponseSchema,
  authenticatedIdentitySchema,
  createApiErrorResponse,
  createPaginationMeta,
  invoiceStatusSchema,
  loginRequestSchema,
  manualPaymentStateSchema,
  moneySchema,
  passwordSchema,
  orderStatusSchema,
  paginatedApiSuccessResponseSchema,
  paginationQuerySchema,
  paymentStatusSchema,
  paymentGatewayDescriptorSchema,
  paymentGatewayFailureSchema,
  createPaymentSessionRequestSchema,
  normalizedPaymentEventSchema,
  roleSchema,
  registrationRequestSchema,
  submitManualPaymentRequestSchema,
  createProductRequestSchema,
  productPriceInputSchema,
  serializeMoney,
  serviceStatusSchema,
  createServiceRequestSchema,
  transitionServiceRequestSchema,
  executeHostingOperationRequestSchema,
  retryHostingOperationRequestSchema,
  hostingPanelLoginUrlSchema,
  configureCpanelServerRequestSchema,
  emailTemplateKeys,
  parseEmailEventPayload,
  routeOutboxEvent,
  renewalAutomationPolicySchema,
  hostingAutomationPayloadSchema,
  ticketStatusSchema,
  createTicketRequestSchema,
  replyToTicketRequestSchema,
  updateTicketRequestSchema,
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
  it('validates bounded renewal rules and strict hosting automation references', () => {
    assert.equal(
      renewalAutomationPolicySchema.safeParse({
        enabled: true,
        invoiceLeadDays: 14,
        reminderDaysBeforeDue: [7, 3, 1],
        gracePeriodDays: 3,
        timeZone: 'Asia/Dhaka',
      }).success,
      true,
    );
    assert.equal(
      renewalAutomationPolicySchema.safeParse({
        enabled: true,
        invoiceLeadDays: 7,
        reminderDaysBeforeDue: [7, 7],
        gracePeriodDays: 3,
        timeZone: 'not/a-zone',
      }).success,
      false,
    );
    assert.equal(
      hostingAutomationPayloadSchema.safeParse({
        schemaVersion: 1,
        serviceId: '10000000-0000-4000-8000-000000000001',
        invoiceId: '10000000-0000-4000-8000-000000000002',
        automationRunId: '10000000-0000-4000-8000-000000000003',
        apiToken: 'must-not-pass',
      }).success,
      false,
    );
  });
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
    assert.equal(manualPaymentStateSchema.parse('VERIFIED'), 'VERIFIED');
    assert.equal(
      serviceStatusSchema.parse('PROVISION_FAILED'),
      'PROVISION_FAILED',
    );
    assert.equal(
      ticketStatusSchema.parse('WAITING_FOR_STAFF'),
      'WAITING_FOR_STAFF',
    );
  });

  it('accepts plain-text ticket workflows and rejects markup or attachments', () => {
    const submissionKey = '10000000-0000-4000-8000-000000000001';
    assert.equal(
      createTicketRequestSchema.safeParse({
        submissionKey,
        subject: 'Unable to reach my hosting account',
        body: 'Please check the fictional development hosting account.',
        serviceId: null,
      }).success,
      true,
    );
    assert.equal(
      createTicketRequestSchema.safeParse({
        submissionKey,
        subject: '<script>alert(1)</script>',
        body: 'Unsafe markup',
      }).success,
      false,
    );
    assert.equal(
      createTicketRequestSchema.safeParse({
        submissionKey,
        subject: 'Attachment attempt',
        body: 'A file-shaped field must not cross this boundary.',
        attachments: [{ name: 'proof.html' }],
      }).success,
      false,
    );
    assert.equal(
      replyToTicketRequestSchema.safeParse({
        submissionKey,
        body: 'A plain-text follow-up.',
      }).success,
      true,
    );
    assert.equal(updateTicketRequestSchema.safeParse({}).success, false);
    assert.equal(
      updateTicketRequestSchema.safeParse({
        status: 'CLOSED',
        priority: 'HIGH',
        assignedAdminId: null,
      }).success,
      true,
    );
  });

  it('accepts structured manual proof and rejects file-shaped input', () => {
    const request = {
      invoiceId: '10000000-0000-4000-8000-000000000001',
      amount: '12000',
      submissionKey: '10000000-0000-4000-8000-000000000002',
      proof: {
        method: 'BANK_TRANSFER',
        reference: 'BANK-REFERENCE-001',
        payerName: 'Fictional Payer',
      },
    };
    assert.equal(
      submitManualPaymentRequestSchema.safeParse(request).success,
      true,
    );
    assert.equal(
      submitManualPaymentRequestSchema.safeParse({
        ...request,
        proof: { ...request.proof, fileUrl: 'https://example.test/proof' },
      }).success,
      false,
    );
  });

  it('validates gateway sessions and normalized provider events', () => {
    const invoiceId = '10000000-0000-4000-8000-000000000001';
    const paymentId = '10000000-0000-4000-8000-000000000002';
    assert.equal(
      createPaymentSessionRequestSchema.safeParse({
        invoiceId,
        submissionKey: '10000000-0000-4000-8000-000000000003',
      }).success,
      true,
    );
    assert.equal(
      normalizedPaymentEventSchema.safeParse({
        providerEventId: 'fake-event-1',
        eventType: 'payment.succeeded',
        status: 'SUCCEEDED',
        merchantId: 'webhost-billing-fake',
        paymentId,
        invoiceId,
        amount: '12000',
        currency: 'BDT',
        providerTransactionId: 'fake-transaction-1',
        occurredAt: '2026-08-25T10:00:00.000Z',
        failureReason: null,
      }).success,
      true,
    );
    assert.equal(
      normalizedPaymentEventSchema.safeParse({
        providerEventId: 'fake-event-1',
        eventType: 'payment.succeeded',
        status: 'SUCCEEDED',
        merchantId: 'webhost-billing-fake',
        paymentId,
        invoiceId,
        amount: 12000,
        currency: 'BDT',
        providerTransactionId: 'fake-transaction-1',
        occurredAt: '2026-08-25T10:00:00.000Z',
        failureReason: null,
      }).success,
      false,
    );
  });

  it('keeps enabled gateways and administrator failures redacted', () => {
    assert.deepEqual(
      paymentGatewayDescriptorSchema.parse({
        key: 'bkash',
        displayName: 'bKash',
        mode: 'SANDBOX',
      }),
      { key: 'bkash', displayName: 'bKash', mode: 'SANDBOX' },
    );
    assert.equal(
      paymentGatewayFailureSchema.safeParse({
        paymentId: '10000000-0000-4000-8000-000000000002',
        invoiceId: '10000000-0000-4000-8000-000000000001',
        invoiceNumber: 'INV-20260825-0001',
        provider: 'sslcommerz',
        status: 'PENDING',
        failureReason: 'Provider status could not be confirmed.',
        updatedAt: '2026-08-25T10:00:00.000Z',
        storePassword: 'must-not-pass',
      }).success,
      false,
    );
  });

  it('validates service creation and state-specific transition evidence', () => {
    assert.equal(
      createServiceRequestSchema.safeParse({
        orderItemId: '10000000-0000-4000-8000-000000000001',
        serverId: '10000000-0000-4000-8000-000000000002',
      }).success,
      true,
    );
    assert.equal(
      transitionServiceRequestSchema.safeParse({
        status: 'SUSPENDED',
        reason: 'Invoice overdue after the configured grace period.',
      }).success,
      true,
    );
    assert.equal(
      transitionServiceRequestSchema.safeParse({
        status: 'TERMINATED',
        reason: 'Administrator-approved closure.',
      }).success,
      false,
    );
    assert.equal(
      transitionServiceRequestSchema.safeParse({
        status: 'TERMINATED',
        reason: 'Administrator-approved closure.',
        confirmation: 'TERMINATE',
      }).success,
      true,
    );
  });

  it('validates hosting-panel actions without accepting weak destructive input', () => {
    assert.equal(
      executeHostingOperationRequestSchema.safeParse({
        type: 'CHANGE_PASSWORD',
        submissionKey: '10000000-0000-4000-8000-000000000001',
        newPassword: 'fictional-secure-password-123',
      }).success,
      true,
    );
    assert.equal(
      executeHostingOperationRequestSchema.safeParse({
        type: 'TERMINATE_ACCOUNT',
        submissionKey: '10000000-0000-4000-8000-000000000001',
        reason: 'Confirmed closure.',
        confirmation: 'terminate',
      }).success,
      false,
    );
    assert.equal(
      retryHostingOperationRequestSchema.safeParse({
        submissionKey: '10000000-0000-4000-8000-000000000002',
        newPassword: 'short',
      }).success,
      false,
    );
    assert.equal(
      hostingPanelLoginUrlSchema.safeParse('javascript:alert(1)').success,
      false,
    );
    assert.equal(
      configureCpanelServerRequestSchema.safeParse({
        hostname: 'whm.example.test',
        port: 2087,
        apiUsername: 'reseller',
        apiToken: 'fictional-token-value-123456',
        confirmation: 'CONFIGURE_CPANEL',
      }).success,
      true,
    );
    assert.equal(
      configureCpanelServerRequestSchema.safeParse({
        hostname: 'http://whm.example.test/path',
        port: 2086,
        apiUsername: 'reseller',
        apiToken: 'short',
        confirmation: 'CONFIGURE_CPANEL',
      }).success,
      false,
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

  it('keeps background payloads reference-only and risky mutations single-attempt', () => {
    const data = backgroundJobDataSchema.parse({
      schemaVersion: 1,
      outboxEventId: '10000000-0000-4000-8000-000000000001',
      aggregateType: 'SERVICE',
      aggregateId: '10000000-0000-4000-8000-000000000002',
      eventType: 'HOSTING_PROVISIONING_REQUESTED',
      correlationId: '10000000-0000-4000-8000-000000000001',
    });
    assert.equal('payload' in data, false);
    assert.equal(backgroundQueuePolicies['hosting-provisioning'].attempts, 1);
    assert.equal(backgroundQueuePolicies['hosting-suspension'].attempts, 1);
    assert.equal(backgroundQueuePolicies['hosting-unsuspension'].attempts, 1);
    assert.equal(backgroundQueuePolicies.emails.attempts, 5);
    assert.equal(
      backgroundJobDataSchema.safeParse({ ...data, credential: 'hidden' })
        .success,
      false,
    );
  });

  it('routes every email event and strictly validates durable event references', () => {
    assert.equal(emailTemplateKeys.length, 12);
    assert.deepEqual(routeOutboxEvent('EMAIL_PAYMENT_RECEIVED'), {
      queueName: 'emails',
      jobName: 'send-payment-email',
    });
    assert.deepEqual(
      parseEmailEventPayload('EMAIL_PAYMENT_RECEIVED', {
        schemaVersion: 1,
        paymentId: '10000000-0000-4000-8000-000000000001',
        invoiceId: '10000000-0000-4000-8000-000000000002',
      }),
      {
        schemaVersion: 1,
        paymentId: '10000000-0000-4000-8000-000000000001',
        invoiceId: '10000000-0000-4000-8000-000000000002',
      },
    );
    assert.throws(() =>
      parseEmailEventPayload('EMAIL_INVOICE_CREATED', {
        invoiceId: '10000000-0000-4000-8000-000000000002',
        rawToken: 'must-not-pass',
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

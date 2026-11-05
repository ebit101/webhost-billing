import type { ApiEnvironment } from '@webhost-billing/config';
import { BkashPaymentGateway } from './bkash-payment.gateway';
import type {
  PaymentHttpClient,
  PaymentHttpResponse,
} from './payment-http.client';
import { PaymentProviderError } from './payment-provider.error';
import type { IntegrationCredentialService } from '../settings/integration-credential.service';
import type { PrismaClient } from '@webhost-billing/database';
import { PaymentGatewayService } from './payment-gateway.service';
import type { PaymentGatewayRegistry } from './payment-gateway.registry';
import type { AuthRequestContext } from '../auth/auth.types';

const environment = {
  NODE_ENV: 'test',
  NOTIFICATION_DELIVERY_MODE: 'disabled',
  WHATSAPP_LIVE_ENABLED: false,
  RESELLBIZ_LIVE_ENABLED: false,
  REGISTRAR_RENEWAL_DISPATCH_ENABLED: false,
  REGISTRAR_DOMAIN_SYNC_LIVE_ENABLED: false,
  VIRTUALIZOR_API_ENABLED: false,
  PORT: 3001,
  DATABASE_URL: 'postgresql://example.test/database',
  REDIS_URL: 'redis://example.test',
  BULLMQ_PREFIX: 'test',
  SESSION_SECRET: 's'.repeat(32),
  CREDENTIAL_ENCRYPTION_KEY: 'e'.repeat(32),
  WEB_ORIGIN: 'http://localhost:3000',
  API_PUBLIC_ORIGIN: 'https://api.example.test',
  TRUST_PROXY_HOPS: 0,
  PAYMENT_PROVIDER_TIMEOUT_MS: 5_000,
  HOSTING_PANEL_TIMEOUT_MS: 10_000,
  BKASH_ENABLED: true,
  BKASH_SANDBOX_BASE_URL: 'https://tokenized.sandbox.bka.sh/v1.2.0-beta',
  BKASH_APP_KEY: 'sandbox-app-key',
  BKASH_APP_SECRET: 'sandbox-app-secret',
  BKASH_USERNAME: 'sandbox-user',
  BKASH_PASSWORD: 'sandbox-password',
  SSLCOMMERZ_ENABLED: false,
  SESSION_TTL_SECONDS: 604_800,
  PASSWORD_RESET_TTL_SECONDS: 3_600,
  EMAIL_VERIFICATION_TTL_SECONDS: 86_400,
  AUTH_RATE_LIMIT_NAMESPACE: 'test',
} satisfies ApiEnvironment;

const credentials = {
  bkash: jest.fn().mockResolvedValue({
    value: {
      appKey: 'sandbox-app-key',
      appSecret: 'sandbox-app-secret',
      username: 'sandbox-user',
      password: 'sandbox-password',
    },
    revision: 'test-credentials',
  }),
} as unknown as IntegrationCredentialService;

const input = {
  paymentId: '10000000-0000-4000-8000-000000000001',
  invoiceId: '10000000-0000-4000-8000-000000000002',
  invoiceNumber: 'INV-20260825-0001',
  amount: 12_345n,
  currency: 'BDT',
  customerName: 'Sandbox Customer',
  customerEmail: 'customer@example.test',
  customerAddress: {
    line1: '1 Test Road',
    line2: null,
    city: 'Dhaka',
    region: null,
    postalCode: '1200',
    countryCode: 'BD',
  },
  idempotencyKey: 'gateway-session:bkash:test',
};

describe('BkashPaymentGateway provider contract', () => {
  it.each(['success', 'failure', 'cancel'])(
    'does not settle the invoice from mismatched evidence after a %s browser return',
    async (callbackStatus) => {
      const { gateway } = mockResponses(
        { status: 200, body: { ...transaction, paymentID: 'OTHER-PAYMENT' } },
        { status: 200, body: { ...transaction, paymentID: 'OTHER-PAYMENT' } },
      );
      const { service, database } = settlementBoundary(gateway);
      await expect(
        service.completeBkashCallback(
          completion.providerSessionId,
          callbackStatus,
        ),
      ).resolves.toEqual({ invoiceId: input.invoiceId });
      expect(database.payment.update).toHaveBeenCalledWith({
        where: { id: input.paymentId },
        data: {
          status: 'PENDING',
          failureReason:
            'bKash returned a different payment identity. Reconciliation is required.',
        },
      });
      expect(database.$transaction).not.toHaveBeenCalled();
      expect(database.paymentEvent.findFirst).not.toHaveBeenCalled();
    },
  );

  it('keeps reconciliation unresolved when the provider returns another payment ID', async () => {
    const { gateway } = mockResponses({
      status: 200,
      body: { ...transaction, paymentID: 'OTHER-PAYMENT' },
    });
    const { service, database } = settlementBoundary(gateway);
    await expect(
      service.reconcilePayment('bkash', input.paymentId, {
        identity: { userId: 'fictional-admin' },
      } as AuthRequestContext),
    ).rejects.toMatchObject({ status: 503 });
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(database.paymentEvent.findFirst).not.toHaveBeenCalled();
  });

  it('shares token acquisition across concurrent sandbox checkouts', async () => {
    let release: (response: PaymentHttpResponse) => void = () => undefined;
    const token = new Promise<PaymentHttpResponse>((resolve) => {
      release = resolve;
    });
    const request: jest.MockedFunction<PaymentHttpClient['request']> = jest
      .fn<
        ReturnType<PaymentHttpClient['request']>,
        Parameters<PaymentHttpClient['request']>
      >()
      .mockImplementation(async (call) => {
        if (call.url.endsWith('/token/grant')) return token;
        return {
          status: 200,
          body: {
            paymentID: 'TR0011PGW20260825',
            bkashURL: 'https://sandbox.payment.bkash.com/checkout/test',
          },
        };
      });
    const gateway = new BkashPaymentGateway(
      environment,
      { request },
      credentials,
    );
    const first = gateway.createPaymentSession(input);
    const second = gateway.createPaymentSession({
      ...input,
      idempotencyKey: 'fictional-second-checkout',
    });
    release({
      status: 200,
      body: { id_token: 'fictional-shared-token', expires_in: 3600 },
    });
    await Promise.all([first, second]);
    expect(
      request.mock.calls.filter(([call]) => call.url.endsWith('/token/grant')),
    ).toHaveLength(1);
    expect(
      request.mock.calls.filter(([call]) => call.url.endsWith('/create')),
    ).toHaveLength(2);
    expect(
      request.mock.calls
        .filter(([call]) => call.url.endsWith('/create'))
        .every(
          ([call]) => call.headers?.authorization === 'fictional-shared-token',
        ),
    ).toBe(true);
  });

  it('accepts the lowercase sandbox checkout URL field and sends a full decimal amount', async () => {
    const { gateway, request } = mockResponses({
      status: 200,
      body: {
        paymentID: 'TR0011PGW20260825',
        statusCode: '0000',
        bkashURL: 'https://sandbox.payment.bkash.com/checkout/test',
      },
    });
    await expect(
      gateway.createPaymentSession({ ...input, amount: 390000n }),
    ).resolves.toMatchObject({
      providerSessionId: 'TR0011PGW20260825',
      checkoutUrl: 'https://sandbox.payment.bkash.com/checkout/test',
    });
    expect(JSON.parse(String(request.mock.calls[1]?.[0].body))).toMatchObject({
      amount: '3900.00',
      currency: 'BDT',
      intent: 'sale',
      mode: '0001',
    });
  });

  it('rejects conflicting checkout URL aliases and provider error codes', async () => {
    for (const changes of [
      { bKashURL: 'https://checkout.sandbox.bka.sh/another' },
      { statusCode: '9999' },
    ]) {
      const { gateway, request } = mockResponses({
        status: 200,
        body: {
          paymentID: 'TR0011PGW20260825',
          bkashURL: 'https://sandbox.payment.bkash.com/checkout/test',
          ...changes,
        },
      });
      await expect(gateway.createPaymentSession(input)).rejects.toMatchObject({
        outcome: 'UNKNOWN',
      });
      expect(request).toHaveBeenCalledTimes(2);
    }
  });

  it.each([
    'https://tokenized.pay.bka.sh/v1.2.0-beta',
    'https://attacker.example/v1.2.0-beta',
    'https://tokenized.sandbox.bka.sh/v1.2.0-beta?redirect=other',
  ])(
    'rejects non-pinned API endpoint %s even with stored credentials and the bootstrap flag off',
    async (baseUrl) => {
      const request = jest.fn();
      const gateway = new BkashPaymentGateway(
        {
          ...environment,
          BKASH_ENABLED: false,
          BKASH_SANDBOX_BASE_URL: baseUrl,
        },
        { request },
        credentials,
      );
      await expect(gateway.createPaymentSession(input)).rejects.toMatchObject({
        outcome: 'FAILED',
      });
      await expect(
        gateway.queryTransactionStatus('TR0011PGW20260825'),
      ).rejects.toMatchObject({ outcome: 'FAILED' });
      await expect(
        gateway.completePaymentSession(completion),
      ).rejects.toMatchObject({ outcome: 'FAILED' });
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('does not accept status evidence for a different payment ID', async () => {
    const { gateway } = mockResponses({
      status: 200,
      body: { ...transaction, paymentID: 'OTHER-PAYMENT' },
    });
    await expect(
      gateway.queryTransactionStatus(completion.providerSessionId),
    ).rejects.toMatchObject({ outcome: 'UNKNOWN' });
  });

  it.each([true, false])(
    'queries the expected payment after mismatched execute evidence (matching query: %s)',
    async (matchingQuery) => {
      const { gateway, request } = mockResponses(
        { status: 200, body: { ...transaction, paymentID: 'OTHER-PAYMENT' } },
        {
          status: 200,
          body: {
            ...transaction,
            paymentID: matchingQuery
              ? completion.providerSessionId
              : 'OTHER-PAYMENT',
          },
        },
      );
      if (matchingQuery)
        await expect(
          gateway.completePaymentSession(completion),
        ).resolves.toMatchObject({
          status: 'SUCCEEDED',
          providerTransactionId: transaction.trxID,
        });
      else
        await expect(
          gateway.completePaymentSession(completion),
        ).rejects.toMatchObject({ outcome: 'UNKNOWN' });
      expect(
        request.mock.calls.filter(([call]) => call.url.endsWith('/execute')),
      ).toHaveLength(1);
      expect(
        request.mock.calls.filter(([call]) =>
          call.url.endsWith('/payment/status'),
        ),
      ).toHaveLength(1);
      expect(JSON.parse(String(request.mock.calls[2]?.[0].body))).toEqual({
        paymentID: completion.providerSessionId,
      });
    },
  );

  it.each([
    { amount: 123.45 },
    { amount: '1e3' },
    { amount: '123.451' },
    { statusCode: '9999' },
    { transactionStatus: 'unrecognized' },
  ])(
    'keeps invalid or contradictory transaction evidence unresolved: %j',
    async (changes) => {
      const { gateway } = mockResponses({
        status: 200,
        body: { ...transaction, ...changes },
      });
      await expect(
        gateway.queryTransactionStatus(completion.providerSessionId),
      ).rejects.toMatchObject({ outcome: 'UNKNOWN' });
    },
  );

  it('does not persist provider error text as a payment failure reason', async () => {
    const { gateway } = mockResponses({
      status: 200,
      body: {
        ...transaction,
        transactionStatus: 'Failed',
        statusMessage: 'FICTIONAL-PRIVATE-PROVIDER-TEXT',
        errorMessage: 'FICTIONAL-PRIVATE-PROVIDER-TEXT',
      },
    });
    const status = await gateway.queryTransactionStatus(
      completion.providerSessionId,
    );
    expect(status).toMatchObject({
      status: 'FAILED',
      failureReason: 'bKash reported payment failure.',
    });
    expect(status).not.toHaveProperty('errorMessage');
    expect(status).not.toHaveProperty('statusMessage');
  });

  it('grants a token and creates a non-retried sandbox checkout', async () => {
    const request: jest.MockedFunction<PaymentHttpClient['request']> = jest
      .fn<
        ReturnType<PaymentHttpClient['request']>,
        Parameters<PaymentHttpClient['request']>
      >()
      .mockResolvedValueOnce({
        status: 200,
        body: { id_token: 'sandbox-token', expires_in: 3600 },
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          paymentID: 'TR0011PGW20260825',
          bKashURL: 'https://sandbox.payment.bkash.com/checkout/test',
        },
      });
    const gateway = new BkashPaymentGateway(
      environment,
      { request },
      credentials,
    );

    await expect(gateway.createPaymentSession(input)).resolves.toMatchObject({
      providerSessionId: 'TR0011PGW20260825',
    });
    const grant = request.mock.calls[0]?.[0];
    const create = request.mock.calls[1]?.[0];
    expect(grant?.url).toMatch(/\/tokenized\/checkout\/token\/grant$/);
    expect(grant?.retries).toBe(1);
    expect(create?.url).toMatch(/\/tokenized\/checkout\/create$/);
    expect(create?.retries).toBe(0);
    expect(create?.body).toContain('"amount":"123.45"');
  });

  it('rejects a provider-supplied checkout URL outside pinned sandbox hosts', async () => {
    const request: jest.MockedFunction<PaymentHttpClient['request']> = jest
      .fn<
        ReturnType<PaymentHttpClient['request']>,
        Parameters<PaymentHttpClient['request']>
      >()
      .mockResolvedValueOnce({
        status: 200,
        body: { id_token: 'sandbox-token', expires_in: 3600 },
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          paymentID: 'TR0011PGW20260825',
          bKashURL: 'https://attacker.example/collect',
        },
      });
    const gateway = new BkashPaymentGateway(
      environment,
      { request },
      credentials,
    );

    await expect(gateway.createPaymentSession(input)).rejects.toMatchObject({
      safeMessage: 'bKash returned an unsafe checkout URL.',
    });
  });

  it('executes a returned payment and normalizes a completed transaction', async () => {
    const request: jest.MockedFunction<PaymentHttpClient['request']> = jest
      .fn<
        ReturnType<PaymentHttpClient['request']>,
        Parameters<PaymentHttpClient['request']>
      >()
      .mockResolvedValueOnce({
        status: 200,
        body: { id_token: 'sandbox-token', expires_in: 3600 },
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          paymentID: 'TR0011PGW20260825',
          trxID: 'BK8A25TEST',
          transactionStatus: 'Completed',
          amount: '123.45',
          currency: 'BDT',
          completedTime: '2026-08-25T10:00:00.000Z',
        },
      });
    const gateway = new BkashPaymentGateway(
      environment,
      { request },
      credentials,
    );
    const event = await gateway.completePaymentSession({
      providerSessionId: 'TR0011PGW20260825',
      paymentId: input.paymentId,
      invoiceId: input.invoiceId,
      amount: input.amount,
      currency: input.currency,
    });

    expect(event).toMatchObject({
      status: 'SUCCEEDED',
      amount: '12345',
      currency: 'BDT',
      providerTransactionId: 'BK8A25TEST',
    });
    const execute = request.mock.calls.at(-1)?.[0];
    expect(execute?.url).toMatch(/\/tokenized\/checkout\/execute$/);
    expect(execute?.retries).toBe(0);
  });

  it('classifies an uncertain checkout response for reconciliation', async () => {
    const request: jest.MockedFunction<PaymentHttpClient['request']> = jest
      .fn<
        ReturnType<PaymentHttpClient['request']>,
        Parameters<PaymentHttpClient['request']>
      >()
      .mockResolvedValueOnce({
        status: 200,
        body: { id_token: 'sandbox-token', expires_in: 3600 },
      })
      .mockResolvedValueOnce({ status: 503, body: null });
    const gateway = new BkashPaymentGateway(
      environment,
      { request },
      credentials,
    );
    await expect(gateway.createPaymentSession(input)).rejects.toMatchObject({
      outcome: 'UNKNOWN',
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('queries status after an uncertain execute response', async () => {
    const request: jest.MockedFunction<PaymentHttpClient['request']> = jest
      .fn<
        ReturnType<PaymentHttpClient['request']>,
        Parameters<PaymentHttpClient['request']>
      >()
      .mockResolvedValueOnce({
        status: 200,
        body: { id_token: 'sandbox-token', expires_in: 3600 },
      })
      .mockRejectedValueOnce(
        new PaymentProviderError('provider timeout', 'UNKNOWN'),
      )
      .mockResolvedValueOnce({
        status: 200,
        body: {
          paymentID: 'TR0011PGW20260825',
          trxID: 'BK8A25QUERY',
          transactionStatus: 'Completed',
          amount: '123.45',
          currency: 'BDT',
        },
      });
    const gateway = new BkashPaymentGateway(
      environment,
      {
        request,
      } satisfies PaymentHttpClient,
      credentials,
    );
    const event = await gateway.completePaymentSession({
      providerSessionId: 'TR0011PGW20260825',
      paymentId: input.paymentId,
      invoiceId: input.invoiceId,
      amount: input.amount,
      currency: input.currency,
    });
    expect(event.providerTransactionId).toBe('BK8A25QUERY');
    const query = request.mock.calls.at(-1)?.[0];
    expect(query?.url).toMatch(/\/tokenized\/checkout\/payment\/status$/);
    expect(query?.retries).toBe(2);
  });
});

const completion = {
  providerSessionId: 'TR0011PGW20260825',
  paymentId: input.paymentId,
  invoiceId: input.invoiceId,
  amount: input.amount,
  currency: input.currency,
};
const transaction = {
  paymentID: completion.providerSessionId,
  trxID: 'FICTIONAL-BKASH-TRANSACTION',
  transactionStatus: 'Completed',
  amount: '123.45',
  currency: 'BDT',
  statusCode: '0000',
};
function mockResponses(...responses: PaymentHttpResponse[]) {
  const request: jest.MockedFunction<PaymentHttpClient['request']> = jest.fn();
  request.mockResolvedValueOnce({
    status: 200,
    body: {
      id_token: 'fictional-sandbox-token',
      expires_in: 3600,
      statusCode: '0000',
    },
  });
  for (const response of responses) request.mockResolvedValueOnce(response);
  return {
    request,
    gateway: new BkashPaymentGateway(environment, { request }, credentials),
  };
}

function settlementBoundary(gateway: BkashPaymentGateway) {
  const payment = {
    id: input.paymentId,
    invoiceId: input.invoiceId,
    amount: input.amount,
    currency: 'BDT',
    status: 'PENDING',
    provider: 'bkash',
    reference: completion.providerSessionId,
  };
  const database = {
    payment: {
      findFirst: jest.fn().mockResolvedValue(payment),
      findUnique: jest.fn().mockResolvedValue(payment),
      update: jest.fn().mockResolvedValue({}),
    },
    paymentEvent: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  return {
    database,
    service: new PaymentGatewayService(
      database as unknown as PrismaClient,
      {
        get: jest.fn().mockResolvedValue(gateway),
      } as unknown as PaymentGatewayRegistry,
    ),
  };
}

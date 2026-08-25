import type { ApiEnvironment } from '@webhost-billing/config';
import { BkashPaymentGateway } from './bkash-payment.gateway';
import type { PaymentHttpClient } from './payment-http.client';
import { PaymentProviderError } from './payment-provider.error';

const environment = {
  NODE_ENV: 'test',
  PORT: 3001,
  DATABASE_URL: 'postgresql://example.test/database',
  REDIS_URL: 'redis://example.test',
  SESSION_SECRET: 's'.repeat(32),
  CREDENTIAL_ENCRYPTION_KEY: 'e'.repeat(32),
  WEB_ORIGIN: 'http://localhost:3000',
  API_PUBLIC_ORIGIN: 'https://api.example.test',
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
    const gateway = new BkashPaymentGateway(environment, { request });

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
    const gateway = new BkashPaymentGateway(environment, { request });
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
    const gateway = new BkashPaymentGateway(environment, { request });
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
    const gateway = new BkashPaymentGateway(environment, {
      request,
    } satisfies PaymentHttpClient);
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

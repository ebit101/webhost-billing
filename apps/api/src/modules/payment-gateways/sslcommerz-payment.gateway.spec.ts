import type { ApiEnvironment } from '@webhost-billing/config';
import { SslCommerzPaymentGateway } from './sslcommerz-payment.gateway';
import type { PaymentHttpClient } from './payment-http.client';
import type { IntegrationCredentialService } from '../settings/integration-credential.service';

const environment = {
  NODE_ENV: 'test',
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
  BKASH_ENABLED: false,
  BKASH_SANDBOX_BASE_URL: 'https://tokenized.sandbox.bka.sh/v1.2.0-beta',
  SSLCOMMERZ_ENABLED: true,
  SSLCOMMERZ_STORE_ID: 'sandbox-store',
  SSLCOMMERZ_STORE_PASSWORD: 'sandbox-password',
  SESSION_TTL_SECONDS: 604_800,
  PASSWORD_RESET_TTL_SECONDS: 3_600,
  EMAIL_VERIFICATION_TTL_SECONDS: 86_400,
  AUTH_RATE_LIMIT_NAMESPACE: 'test',
} satisfies ApiEnvironment;

const credentials = {
  sslCommerz: jest.fn().mockResolvedValue({
    value: {
      storeId: 'sandbox-store',
      storePassword: 'sandbox-password',
    },
    revision: 'test-credentials',
  }),
} as unknown as IntegrationCredentialService;

const input = {
  paymentId: '20000000-0000-4000-8000-000000000001',
  invoiceId: '20000000-0000-4000-8000-000000000002',
  invoiceNumber: 'INV-20260825-0002',
  amount: 25_000n,
  currency: 'BDT',
  customerName: 'Sandbox Customer',
  customerEmail: 'customer@example.test',
  customerAddress: {
    line1: '1 Test Road',
    line2: null,
    city: 'Dhaka',
    region: 'Dhaka',
    postalCode: '1200',
    countryCode: 'BD',
  },
  idempotencyKey: 'gateway-session:sslcommerz:test',
};

describe('SslCommerzPaymentGateway provider contract', () => {
  it('creates a v4 hosted sandbox session without retrying the mutation', async () => {
    const request: jest.MockedFunction<PaymentHttpClient['request']> = jest
      .fn<
        ReturnType<PaymentHttpClient['request']>,
        Parameters<PaymentHttpClient['request']>
      >()
      .mockResolvedValue({
        status: 200,
        body: {
          status: 'SUCCESS',
          sessionkey: 'sandbox-session',
          GatewayPageURL: 'https://sandbox.sslcommerz.com/EasyCheckOut/test',
        },
      });
    const gateway = new SslCommerzPaymentGateway(
      environment,
      { request },
      credentials,
    );
    const session = await gateway.createPaymentSession(input);
    const call = request.mock.calls[0]?.[0];

    expect(session.providerSessionId).toMatch(/^WHB[a-f0-9]{27}$/);
    expect(call?.retries).toBe(0);
    expect(call?.body).toContain('total_amount=250.00');
    expect(call?.body).toContain(`value_a=${input.paymentId}`);
    expect(call?.body).toContain(`value_b=${input.invoiceId}`);
  });

  it('rejects a provider-supplied checkout URL outside the sandbox host', async () => {
    const request: jest.MockedFunction<PaymentHttpClient['request']> = jest
      .fn<
        ReturnType<PaymentHttpClient['request']>,
        Parameters<PaymentHttpClient['request']>
      >()
      .mockResolvedValue({
        status: 200,
        body: {
          status: 'SUCCESS',
          sessionkey: 'sandbox-session',
          GatewayPageURL: 'https://attacker.example/collect',
        },
      });
    const gateway = new SslCommerzPaymentGateway(
      environment,
      { request },
      credentials,
    );

    await expect(gateway.createPaymentSession(input)).rejects.toMatchObject({
      safeMessage: 'SSLCOMMERZ returned an unsafe checkout URL.',
    });
  });

  it('accepts an IPN only after authoritative validation and normalizes it', async () => {
    const request: jest.MockedFunction<PaymentHttpClient['request']> = jest
      .fn<
        ReturnType<PaymentHttpClient['request']>,
        Parameters<PaymentHttpClient['request']>
      >()
      .mockResolvedValue({
        status: 200,
        body: {
          status: 'VALID',
          APIConnect: 'DONE',
          val_id: 'validation-1',
          tran_id: 'WHBTESTTRANSACTION',
          amount: '250.00',
          currency: 'BDT',
          bank_tran_id: 'bank-transaction-1',
          tran_date: '2026-08-25 12:30:00',
          value_a: input.paymentId,
          value_b: input.invoiceId,
          risk_level: '0',
        },
      });
    const gateway = new SslCommerzPaymentGateway(
      environment,
      { request },
      credentials,
    );
    const raw = Buffer.from(
      new URLSearchParams({
        val_id: 'validation-1',
        tran_id: 'WHBTESTTRANSACTION',
        amount: '250.00',
        currency: 'BDT',
        store_id: 'sandbox-store',
        status: 'VALID',
        value_a: input.paymentId,
        value_b: input.invoiceId,
        risk_level: '0',
      }).toString(),
    );

    await expect(gateway.verifyWebhookSignature(raw, '')).resolves.toBe(true);
    expect(gateway.normalizeProviderEvent(raw)).toMatchObject({
      status: 'SUCCEEDED',
      amount: '25000',
      providerTransactionId: 'WHBTESTTRANSACTION',
    });
    const validation = request.mock.calls[0]?.[0];
    expect(validation?.url).toContain('validationserverAPI.php');
    expect(validation?.retries).toBe(2);
    expect(() => gateway.normalizeProviderEvent(raw)).toThrow();
  });

  it('classifies an uncertain session response for reconciliation', async () => {
    const request: jest.MockedFunction<PaymentHttpClient['request']> = jest
      .fn<
        ReturnType<PaymentHttpClient['request']>,
        Parameters<PaymentHttpClient['request']>
      >()
      .mockResolvedValue({ status: 503, body: null });
    const gateway = new SslCommerzPaymentGateway(
      environment,
      { request },
      credentials,
    );
    await expect(gateway.createPaymentSession(input)).rejects.toMatchObject({
      outcome: 'UNKNOWN',
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects validation responses whose amount differs from the IPN', async () => {
    const request: jest.MockedFunction<PaymentHttpClient['request']> = jest
      .fn<
        ReturnType<PaymentHttpClient['request']>,
        Parameters<PaymentHttpClient['request']>
      >()
      .mockResolvedValue({
        status: 200,
        body: {
          status: 'VALID',
          APIConnect: 'DONE',
          val_id: 'validation-2',
          tran_id: 'WHBTESTTRANSACTION2',
          amount: '251.00',
          currency: 'BDT',
          bank_tran_id: 'bank-transaction-2',
          value_a: input.paymentId,
          value_b: input.invoiceId,
        },
      });
    const gateway = new SslCommerzPaymentGateway(
      environment,
      { request },
      credentials,
    );
    const raw = Buffer.from(
      new URLSearchParams({
        val_id: 'validation-2',
        tran_id: 'WHBTESTTRANSACTION2',
        amount: '250.00',
        currency: 'BDT',
        store_id: 'sandbox-store',
        status: 'VALID',
        value_a: input.paymentId,
        value_b: input.invoiceId,
      }).toString(),
    );
    await expect(gateway.verifyWebhookSignature(raw, '')).resolves.toBe(false);
  });

  it('holds a validated high-risk transaction as pending', async () => {
    const request: jest.MockedFunction<PaymentHttpClient['request']> = jest
      .fn<
        ReturnType<PaymentHttpClient['request']>,
        Parameters<PaymentHttpClient['request']>
      >()
      .mockResolvedValue({
        status: 200,
        body: {
          status: 'VALID',
          APIConnect: 'DONE',
          val_id: 'validation-risk',
          tran_id: 'WHBRISKTRANSACTION',
          amount: '250.00',
          currency: 'BDT',
          bank_tran_id: 'bank-risk-transaction',
          value_a: input.paymentId,
          value_b: input.invoiceId,
          risk_level: '1',
        },
      });
    const gateway = new SslCommerzPaymentGateway(
      environment,
      { request },
      credentials,
    );
    const raw = Buffer.from(
      new URLSearchParams({
        val_id: 'validation-risk',
        tran_id: 'WHBRISKTRANSACTION',
        amount: '250.00',
        currency: 'BDT',
        store_id: 'sandbox-store',
        status: 'VALID',
        value_a: input.paymentId,
        value_b: input.invoiceId,
        risk_level: '1',
      }).toString(),
    );
    await expect(gateway.verifyWebhookSignature(raw, '')).resolves.toBe(true);
    const event = gateway.normalizeProviderEvent(raw);
    expect(event.status).toBe('PENDING');
    expect(event.failureReason).toContain('high risk');
  });
});

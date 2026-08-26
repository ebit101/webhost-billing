'use strict';

const { createRequire } = require('node:module');
const appRequire = createRequire('/app/package.json');
const { FakePaymentGateway } = appRequire(
  '/app/dist/modules/payment-gateways/fake-payment.gateway.js',
);
const { FakeHostingPanel } = appRequire(
  '/app/dist/modules/hosting-panels/fake-hosting-panel.js',
);

async function main() {
  const payment = new FakePaymentGateway({
    WEB_ORIGIN: 'https://my.speedhost.bd',
    CREDENTIAL_ENCRYPTION_KEY: 'staging-provider-smoke-key'.repeat(3),
  });
  const session = await payment.createPaymentSession({
    paymentId: '32000000-0000-4000-8000-000000000001',
    invoiceId: '32000000-0000-4000-8000-000000000002',
    invoiceNumber: 'STAGE-INV-SMOKE',
    amount: 1000n,
    currency: 'BDT',
    customerName: 'Fictional Customer',
    customerEmail: 'customer@example.test',
    customerAddress: {
      line1: '1 Example Road',
      line2: null,
      city: 'Dhaka',
      region: null,
      postalCode: '1000',
      countryCode: 'BD',
    },
    idempotencyKey: 'staging-provider-smoke',
  });
  if (
    !session.checkoutUrl.startsWith('https://my.speedhost.bd/fake-payment/')
  ) {
    throw new Error('Fake payment adapter smoke failed');
  }

  const hosting = new FakeHostingPanel();
  const connection = await hosting.testConnection({
    hostname: 'cpanel.example.test',
    port: 2087,
    apiUsername: 'staging',
    apiToken: 'not-used-by-fake-adapter',
  });
  if (connection.providerVersion !== 'fake-whm-1.0') {
    throw new Error('Fake hosting-panel adapter smoke failed');
  }

  console.log('Fake payment adapter contract: PASS');
  console.log('Fake hosting-panel adapter contract: PASS');
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Provider smoke failed',
  );
  process.exitCode = 1;
});

import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { e2ePrisma } from '../database';
import {
  E2E_DATABASE_URL,
  E2E_SCHEMA,
  E2E_WEB_ORIGIN,
  e2eApiEnvironment,
} from '../environment';
import { assertBrowserDatabaseScope } from '../database-scope';
import { E2E_HEALTHY_CUSTOMER } from '../fixtures';
import { BackgroundQueueCatalog } from '@webhost-billing/queue';
import { OutboxDispatcherService } from '../../../worker/dist/outbox/outbox-dispatcher.service';
import { RegistrarConsumer } from '../../../worker/dist/registrar/registrar.module';
import { parseWorkerEnvironment } from '@webhost-billing/config';
import { backgroundQueueNames } from '@webhost-billing/shared';
import { TotpService } from '../../../api/dist/modules/auth/services/totp.service';
import { parseApiEnvironment } from '@webhost-billing/config';

test.use({
  viewport: { width: 390, height: 844 },
  trace: 'off',
  screenshot: 'off',
  video: 'off',
});
test.afterAll(async () => e2ePrisma.$disconnect());
test('mobile customer and administrator complete a clearly simulated domain workflow', async ({
  browser,
}) => {
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const adminContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const customerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  async function session(context: BrowserContext, administrator: boolean) {
    const userId = randomUUID();
    const now = new Date();
    const totp = new TotpService(
      parseApiEnvironment({ ...e2eApiEnvironment, PORT: '3201' }),
    );
    await e2ePrisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        status: 'ACTIVE',
        role: administrator ? 'ADMIN' : 'CUSTOMER',
        emailVerifiedAt: now,
        ...(administrator
          ? {
              adminProfile: {
                create: {
                  displayName: 'Fictional domain administrator',
                  staffRole: 'FULL_ADMINISTRATOR',
                },
              },
              adminTotpCredential: {
                create: {
                  secretCiphertext: totp.encryptSecret(totp.generateSecret()),
                  keyVersion: 'mfa-v1',
                  createdAt: now,
                  enabledAt: now,
                },
              },
            }
          : {
              customer: {
                create: {
                  customerNumber: `D-${userId.slice(0, 20)}`,
                  firstName: 'Fictional',
                  lastName: 'Registrant',
                  status: 'ACTIVE',
                  addressLine1: '1 Test Street',
                  city: 'Dhaka',
                  countryCode: 'BD',
                },
              },
            }),
      },
    });
    const token = randomBytes(32).toString('hex');
    await e2ePrisma.authSession.create({
      data: {
        userId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        createdAt: now,
        expiresAt: new Date(Date.now() + 3600000),
        twoFactorVerifiedAt: administrator ? now : null,
      },
    });
    await context.addCookies([
      {
        name: 'webhost_session',
        value: token,
        url: E2E_WEB_ORIGIN,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
  }
  try {
    await session(adminContext, true);
    await session(customerContext, false);
    const admin = await adminContext.newPage();
    const customer = await customerContext.newPage();
    await admin.goto('/admin/domains');
    await admin
      .getByLabel('Fixed one-year selling price in BDT minor units')
      .fill('150000');
    await admin
      .getByLabel('Type Enable simulated registrar')
      .fill('Enable simulated registrar');
    await admin
      .getByRole('button', { name: 'Create simulated offers' })
      .click();
    await expect(
      admin.getByRole('button', { name: 'Disable registrar' }),
    ).toBeVisible();
    await customer.goto('/portal/domains');
    await expect(
      customer.getByLabel('Domain offer').locator('option'),
    ).toHaveCount(3);
    const offer = (
      await e2ePrisma.domainOffer.findFirstOrThrow({ where: { tld: 'com' } })
    ).id;
    const signInContext = await browser.newContext();
    try {
      const signIn = await signInContext.newPage();
      const query = `domainOfferId=${offer}&domainName=signin-fictional.com`;
      await signIn.goto(`/portal/domains?${query}`);
      await expect(signIn).toHaveURL(new RegExp(`/login\\?${query}$`));
      await signIn.getByLabel('Email address').fill(E2E_HEALTHY_CUSTOMER.email);
      await signIn
        .getByLabel('Password', { exact: true })
        .fill(E2E_HEALTHY_CUSTOMER.password);
      await signIn
        .getByRole('button', { name: 'Sign in', exact: true })
        .click();
      await expect(signIn).toHaveURL(new RegExp(`/portal/domains\\?${query}$`));
      await expect(signIn.getByLabel('Domain offer')).toHaveValue(offer);
      await expect(
        signIn.getByLabel('Domain name', { exact: true }),
      ).toHaveValue('signin-fictional.com');
      await expect(signIn.getByRole('checkbox')).not.toBeChecked();
    } finally {
      await signInContext.close();
    }
    await customer.getByLabel('Domain offer').selectOption(offer);
    const domainName = `browser-${randomUUID()}.com`;
    await customer.getByLabel('Domain name', { exact: true }).fill(domainName);
    for (const [label, value] of Object.entries({
      'Registrant name': 'Fictional registrant',
      Company: 'Fictional company',
      Address: '1 Test Street',
      City: 'Dhaka',
      Region: 'Dhaka',
      'Postal code': '1000',
      'Country code': 'BD',
      'Registrant email': 'fictional@example.test',
      'Phone country code': '880',
      'Phone number': '1700000000',
    }))
      await customer.getByLabel(label, { exact: true }).fill(value);
    await customer.getByRole('checkbox').check();
    await customer.getByRole('button', { name: 'Get simulated quote' }).click();
    await customer
      .getByRole('button', { name: 'Create order and unpaid invoice' })
      .click();
    await expect(
      customer.getByRole('heading', { name: domainName }),
    ).toBeVisible();
    const domain = await e2ePrisma.domain.findUniqueOrThrow({
      where: { domainName },
    });
    // Exercise the existing authenticated manual proof/review, never an invoice-paid setter.
    const csrf = await customer.request.get(
      `${e2eApiEnvironment.API_PUBLIC_ORIGIN}/auth/csrf`,
    );
    const customerCsrf = (
      (await csrf.json()) as { data: { csrfToken: string } }
    ).data.csrfToken;
    const payment = await customer.request.post(
      `${e2eApiEnvironment.API_PUBLIC_ORIGIN}/payments/manual/customer`,
      {
        headers: { 'X-CSRF-Token': customerCsrf },
        data: {
          invoiceId: domain.invoiceId,
          amount: '150000',
          submissionKey: randomUUID(),
          proof: {
            method: 'BANK_TRANSFER',
            reference: randomUUID(),
            payerName: 'Fictional payer',
          },
        },
      },
    );
    expect(payment.status()).toBe(201);
    const paymentId = (
      (await payment.json()) as { data: { payment: { id: string } } }
    ).data.payment.id;
    const adminCsrf = (
      (await (
        await admin.request.get(
          `${e2eApiEnvironment.API_PUBLIC_ORIGIN}/auth/csrf`,
        )
      ).json()) as { data: { csrfToken: string } }
    ).data.csrfToken;
    expect(
      (
        await admin.request.patch(
          `${e2eApiEnvironment.API_PUBLIC_ORIGIN}/payments/${paymentId}/review`,
          {
            headers: { 'X-CSRF-Token': adminCsrf },
            data: { action: 'VERIFY' },
          },
        )
      ).status(),
    ).toBe(200);
    await admin
      .getByRole('button', { name: 'Refresh read-only status' })
      .click();
    await expect(
      admin.getByRole('heading', { name: domainName }),
    ).toBeVisible();
    await admin.getByLabel('Type exact domain name').fill(domainName);
    await admin
      .getByLabel('Approved USD provider cost ceiling in minor units')
      .fill('1000');
    await admin
      .getByRole('button', { name: 'Approve simulated registration' })
      .click();
    await expect
      .poll(async () =>
        e2ePrisma.registrarOperation.count({ where: { domainId: domain.id } }),
      )
      .toBe(1);
    const operation = await e2ePrisma.registrarOperation.findUniqueOrThrow({
      where: { domainId: domain.id },
    });
    const environment = parseWorkerEnvironment({
      ...e2eApiEnvironment,
      DATABASE_URL: E2E_DATABASE_URL,
      BULLMQ_PREFIX: `registrar-browser-${randomUUID().replaceAll('-', '')}`,
    });
    const queues = new BackgroundQueueCatalog(
      environment.REDIS_URL,
      environment.BULLMQ_PREFIX,
    );
    const consumer = new RegistrarConsumer(environment, e2ePrisma);
    try {
      consumer.onApplicationBootstrap();
      const dispatcher = new OutboxDispatcherService(
        e2ePrisma,
        queues,
        environment,
      );
      for (let batch = 0; batch < 10; batch++) {
        await dispatcher.dispatchOnce();
        if (
          await e2ePrisma.outboxEvent.count({
            where: { aggregateId: operation.id, status: 'PUBLISHED' },
          })
        )
          break;
      }
      await expect
        .poll(
          async () =>
            (
              await e2ePrisma.domain.findUniqueOrThrow({
                where: { id: domain.id },
              })
            ).state,
        )
        .toBe('REGISTERED');
      const events = await e2ePrisma.outboxEvent.findMany({
        where: { aggregateId: operation.id },
      });
      expect(events).toHaveLength(1);
      expect(events[0]?.status).toBe('PUBLISHED');
      await expect
        .poll(
          async () =>
            (await queues.queue('domain-registration').getJobs(['completed']))
              .length,
        )
        .toBe(1);
      const jobs = await queues
        .queue('domain-registration')
        .getJobs(['completed']);
      expect(jobs).toHaveLength(1);
      expect(JSON.stringify(jobs[0]?.data)).not.toMatch(
        /contact|api-key|fictional@example/,
      );
      const original = jobs[0];
      if (!original)
        throw new Error('Expected the committed registrar reference.');
      await queues
        .queue('domain-registration')
        .add('simulated-redelivery', original.data, {
          jobId: `replay-${randomUUID()}`,
          attempts: 1,
        });
      await expect
        .poll(
          async () =>
            (await queues.queue('domain-registration').getJobs(['completed']))
              .length,
        )
        .toBe(2);
      expect(
        await e2ePrisma.fakeRegistrarRegistration.count({
          where: { operationId: operation.id },
        }),
      ).toBe(1);
    } finally {
      await consumer.onApplicationShutdown();
      // Only this test's random prefix, never application queues.
      for (const name of backgroundQueueNames)
        await queues.queue(name).obliterate({ force: true });
      await queues.close();
    }
    await customer
      .getByRole('button', { name: 'Refresh read-only status' })
      .click();
    await expect(
      customer.getByText(
        'Simulated · Registered · Contact verification Pending',
      ),
    ).toBeVisible();
    const before = await e2ePrisma.fakeRegistrarRegistration.count();
    await admin
      .getByRole('button', { name: 'Refresh read-only status' })
      .click();
    await customer
      .getByRole('button', { name: 'Refresh read-only status' })
      .click();
    expect(await e2ePrisma.fakeRegistrarRegistration.count()).toBe(before);
    expect(
      await e2ePrisma.service.count({
        where: { orderItemId: domain.orderItemId },
      }),
    ).toBe(0);
    expect(
      await customer.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await adminContext.close();
    await customerContext.close();
  }
});

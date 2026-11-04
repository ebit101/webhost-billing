import { expect, test, type APIRequestContext } from '@playwright/test';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { e2ePrisma } from '../database';
import { assertBrowserDatabaseScope } from '../database-scope';
import {
  E2E_API_ORIGIN,
  E2E_DATABASE_URL,
  E2E_SCHEMA,
  E2E_WEB_ORIGIN,
  e2eApiEnvironment,
} from '../environment';
import { E2E_ADMIN, E2E_PRODUCT, E2E_SERVER } from '../fixtures';

test.use({ trace: 'off' });
test.afterAll(async () => e2ePrisma.$disconnect());

test('the scheduled renewal and customer messages run through local workers', async ({
  playwright,
}, info) => {
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const redis = new URL(e2eApiEnvironment.REDIS_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(redis.hostname)) {
    throw new Error('The renewal rehearsal requires loopback Redis.');
  }
  const mailDirectory = info.outputPath('mail-preview');
  const clockFile = info.outputPath('renewal-clock.txt');
  const email = 'command197-pilot@example.test';
  const password = 'Command197-Fictional-Password!';
  const initialDate = '2025-01-10';
  const dueAt = new Date('2025-01-11T12:00:00.000Z');
  const setClock = (day: string) =>
    writeFile(clockFile, `${day}T12:00:00.000Z`);
  await setClock(initialDate);

  const processes: { stop: () => Promise<void> }[] = [];
  const processLogs: string[] = [];
  function start(entry: 'main' | 'scheduler-main') {
    // Only substitute the renewal clock. Both entry points run their normal lifecycle hooks.
    const preload = `
      const [clockModule, entryPoint, timeFile] = process.argv.slice(1);
      const { readFileSync } = require('node:fs');
      const { SystemClock } = require(clockModule);
      SystemClock.prototype.now = () => new Date(readFileSync(timeFile, 'utf8'));
      require(entryPoint);
    `;
    const child = spawn(
      process.execPath,
      [
        '-e',
        preload,
        resolve('../worker/dist/renewal/clock.js'),
        resolve(`../worker/dist/${entry}.js`),
        clockFile,
      ],
      {
        env: {
          ...e2eApiEnvironment,
          EMAIL_TRANSPORT: 'preview',
          EMAIL_PREVIEW_DIRECTORY: mailDirectory,
          NOTIFICATION_DELIVERY_MODE: 'preview',
          WHATSAPP_LIVE_ENABLED: 'false',
          SCHEDULER_POLL_INTERVAL_MS: '1000',
          OUTBOX_POLL_INTERVAL_MS: '250',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    const capture = (chunk: Buffer) => {
      processLogs.push(chunk.toString());
      if (processLogs.length > 80) processLogs.shift();
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    const closed = once(child, 'close');
    void closed.catch(() => undefined);
    processes.push({
      stop: async () => {
        child.kill();
        await closed;
      },
    });
  }

  async function preview(subject: string) {
    const files = await readdir(mailDirectory);
    const messages = await Promise.all(
      files
        .filter((file) => file.endsWith('.eml'))
        .map((file) => readFile(join(mailDirectory, file), 'utf8')),
    );
    const matches = messages
      .map((message) => message.replace(/=\r?\n/g, '').replace(/=3D/g, '='))
      .filter(
        (message) =>
          message.includes(`To: ${email}`) &&
          message.split(/\r?\n/).includes(`Subject: ${subject}`),
      );
    expect(matches).toHaveLength(1);
    return matches[0]!;
  }

  async function mutation(
    client: APIRequestContext,
    method: 'POST' | 'PATCH',
    path: string,
    data: Record<string, unknown>,
    expectedStatus?: number,
  ) {
    const csrf = await client.get('/auth/csrf');
    expect(csrf.ok()).toBe(true);
    const body = (await csrf.json()) as { data: { csrfToken: string } };
    const response = await client.fetch(path, {
      method,
      headers: { 'X-CSRF-Token': body.data.csrfToken },
      data,
    });
    expect(
      expectedStatus ? response.status() === expectedStatus : response.ok(),
      `${method} ${path} returned HTTP ${response.status()}`,
    ).toBe(true);
    return response;
  }

  const clientOptions = {
    baseURL: E2E_API_ORIGIN,
    extraHTTPHeaders: { Origin: E2E_WEB_ORIGIN },
  };
  const customer = await playwright.request.newContext(clientOptions);
  const admin = await playwright.request.newContext(clientOptions);
  const policyKey = 'automation.renewal-policy';
  const previousPolicy = await e2ePrisma.setting.findUnique({
    where: { key: policyKey },
  });
  try {
    start('main');
    await mutation(customer, 'POST', '/auth/register', {
      email,
      password,
      firstName: 'Fictional',
      lastName: 'Renewal',
      addressLine1: '197 Test Road',
      city: 'Dhaka',
      countryCode: 'BD',
    });
    const user = await e2ePrisma.user.findUniqueOrThrow({
      where: { email },
      include: { customer: true },
    });
    const customerId = user.customer!.id;
    async function delivered(templateKey: string, invoiceId?: string) {
      await expect
        .poll(
          () =>
            e2ePrisma.emailLog.count({
              where: {
                recipientEmail: email,
                templateKey,
                status: 'SENT',
                provider: 'preview',
                ...(invoiceId ? { invoiceId } : {}),
              },
            }),
          { timeout: 25_000 },
        )
        .toBe(1);
    }
    await delivered('email-verification');
    const verification = await preview('Verify your email address');
    const token = /\/verify-email\?token=([\w-]+)/.exec(verification)?.[1];
    if (!token)
      throw new Error('Verification preview did not contain a usable link.');
    await mutation(customer, 'POST', '/auth/verify-email', { token });
    await mutation(customer, 'POST', '/auth/login', { email, password });
    await mutation(admin, 'POST', '/auth/login', {
      email: E2E_ADMIN.email,
      password: E2E_ADMIN.password,
    });
    async function createAddOn(
      name: string,
      billingPeriod: string,
      amount: string,
    ) {
      const input = {
        name,
        billingPeriod,
        amount,
        currency: 'BDT',
        description: null,
        hostingProductIds: [E2E_PRODUCT.id],
        enabled: true,
      };
      const response = await mutation(
        admin,
        'POST',
        '/products/add-ons',
        input,
      );
      const { data } = (await response.json()) as {
        data: { id: string; priceId: string };
      };
      return { ...data, input };
    }
    const backup = await createAddOn(
      'Fictional managed backup',
      'MONTHLY',
      '30000',
    );
    const migration = await createAddOn(
      'Fictional migration',
      'ONE_TIME',
      '12000',
    );
    const pending = await createAddOn(
      'Pending monthly add-on',
      'MONTHLY',
      '10000',
    );
    const annual = await createAddOn('Annual add-on', 'ANNUAL', '25000');
    const checkout = {
      productId: E2E_PRODUCT.id,
      priceId: E2E_PRODUCT.priceId,
      requestedDomain: 'command197-pilot.example.test',
      submissionKey: randomUUID(),
    };
    await mutation(
      customer,
      'POST',
      '/orders/checkout',
      {
        ...checkout,
        addOnPriceIds: [annual.priceId],
      },
      422,
    );
    await mutation(customer, 'POST', '/orders/checkout', {
      ...checkout,
      addOnPriceIds: [backup.priceId, migration.priceId, pending.priceId],
    });
    const order = await e2ePrisma.order.findFirstOrThrow({
      where: { customerId },
      include: { items: true, invoices: true },
    });
    const backupItem = order.items.find(
      (item) => item.productPriceId === backup.priceId,
    )!;
    const migrationItem = order.items.find(
      (item) => item.productPriceId === migration.priceId,
    )!;
    expect(backupItem.billingPeriod).toBe('MONTHLY');
    expect(order.invoices[0]?.total).toBe(182_000n);
    async function pay(
      invoice: { id: string; balanceDue: bigint },
      reference: string,
    ) {
      await mutation(admin, 'POST', '/payments/manual/admin', {
        invoiceId: invoice.id,
        amount: invoice.balanceDue.toString(),
        submissionKey: randomUUID(),
        proof: { method: 'BANK_TRANSFER', reference },
      });
    }
    await pay(order.invoices[0]!, 'COMMAND197-INITIAL');
    await mutation(admin, 'PATCH', `/orders/${order.id}/status`, {
      status: 'PROCESSING',
    });
    await mutation(admin, 'POST', '/services', {
      orderItemId: order.items.find((item) => item.kind === 'HOSTING')!.id,
      serverId: E2E_SERVER.id,
    });
    const service = await e2ePrisma.service.findFirstOrThrow({
      where: { customerId },
    });
    await mutation(
      admin,
      'POST',
      `/hosting-panel/services/${service.id}/operations`,
      {
        type: 'CREATE_ACCOUNT',
        submissionKey: randomUUID(),
      },
    );
    expect(
      await e2ePrisma.service.findUniqueOrThrow({ where: { id: service.id } }),
    ).toMatchObject({ status: 'ACTIVE' });
    await delivered('service-provisioned');
    await preview(`${E2E_PRODUCT.name} is ready`);
    for (const item of [backupItem, migrationItem]) {
      await mutation(
        admin,
        'PATCH',
        `/orders/${order.id}/add-ons/${item.id}/fulfill`,
        {},
      );
    }
    await mutation(admin, 'PATCH', `/products/add-ons/${backup.id}`, {
      ...backup.input,
      name: 'Repriced backup',
      amount: '35000',
      enabled: false,
    });

    // Backdate only this fictional service so the scheduler can run on controlled business dates.
    const startedAt = new Date('2024-12-11T12:00:00.000Z');
    await e2ePrisma.service.update({
      where: { id: service.id },
      data: { startedAt, activatedAt: startedAt, nextDueAt: dueAt },
    });
    const policy = {
      enabled: true,
      timeZone: 'UTC',
      invoiceLeadDays: 2,
      reminderDaysBeforeDue: [1],
      gracePeriodDays: 1,
    };
    await e2ePrisma.setting.upsert({
      where: { key: policyKey },
      create: { key: policyKey, category: 'AUTOMATION', value: policy },
      update: { value: policy },
    });
    start('scheduler-main');
    async function cycle(day: string) {
      await expect
        .poll(
          async () =>
            (
              await e2ePrisma.automationRun.findUnique({
                where: { idempotencyKey: `renewal-cycle:${day}` },
              })
            )?.status,
          { timeout: 30_000 },
        )
        .toBe('SUCCEEDED');
    }
    await cycle(initialDate);
    await expect
      .poll(
        () =>
          e2ePrisma.notificationEntry.count({
            where: {
              userId: user.id,
              key: 'client-welcome',
              channel: 'EMAIL',
              status: 'PREVIEWED',
            },
          }),
        { timeout: 25_000 },
      )
      .toBe(1);
    expect(await preview('Welcome')).toContain(
      'Your email is verified and your account is ready.',
    );
    const renewals = (periodStart = dueAt) =>
      e2ePrisma.invoice.findMany({
        where: {
          customerId,
          items: {
            some: { serviceId: service.id, servicePeriodStart: periodStart },
          },
        },
        include: { items: { orderBy: { linePosition: 'asc' } } },
      });
    const invoices = await renewals();
    expect(invoices).toHaveLength(1);
    const renewal = invoices[0]!;
    expect(renewal).toMatchObject({
      status: 'UNPAID',
      dueAt,
      balanceDue: service.recurringAmount + 30_000n,
    });
    const backupLine = (periodStart: Date, periodEnd: Date) => ({
      orderItemId: backupItem.id,
      descriptionSnapshot: 'Renewal: Fictional managed backup',
      lineTotal: 30_000n,
      servicePeriodStart: periodStart,
      servicePeriodEnd: periodEnd,
    });
    expect(renewal.items).toMatchObject([
      { serviceId: service.id, lineTotal: service.recurringAmount },
      backupLine(dueAt, new Date('2025-02-11T12:00:00.000Z')),
    ]);
    await delivered('renewal-reminder', renewal.id);
    expect(
      await preview(`Renewal reminder for invoice ${renewal.invoiceNumber}`),
    ).toContain(renewal.invoiceNumber);

    await setClock('2025-01-12');
    await cycle('2025-01-12');
    expect(
      await e2ePrisma.invoice.findUniqueOrThrow({ where: { id: renewal.id } }),
    ).toMatchObject({ status: 'OVERDUE' });
    expect(
      await e2ePrisma.service.findUniqueOrThrow({ where: { id: service.id } }),
    ).toMatchObject({ status: 'ACTIVE' });
    await delivered('overdue-notice', renewal.id);
    await preview(`Invoice ${renewal.invoiceNumber} is overdue`);

    await setClock('2025-01-13');
    await cycle('2025-01-13');
    const serviceState = () =>
      e2ePrisma.service.findUniqueOrThrow({ where: { id: service.id } });
    await expect
      .poll(serviceState, { timeout: 25_000 })
      .toMatchObject({ status: 'SUSPENDED', suspensionInvoiceId: renewal.id });
    await delivered('service-suspended');
    await preview(`${E2E_PRODUCT.name} has been suspended`);
    await pay(renewal, 'COMMAND197-RENEWAL');
    await expect.poll(serviceState, { timeout: 25_000 }).toMatchObject({
      status: 'ACTIVE',
      suspensionInvoiceId: null,
      nextDueAt: renewal.items[0]!.servicePeriodEnd,
    });
    expect(
      await e2ePrisma.invoice.findUniqueOrThrow({ where: { id: renewal.id } }),
    ).toMatchObject({ status: 'PAID', balanceDue: 0n });
    await delivered('payment-received', renewal.id);
    await preview(`Payment received for invoice ${renewal.invoiceNumber}`);
    await delivered('service-reactivated');
    await preview(`${E2E_PRODUCT.name} has been reactivated`);
    expect(await renewals()).toHaveLength(1);
    expect(
      await e2ePrisma.invoiceItem.count({
        where: { orderItemId: backupItem.id, servicePeriodStart: dueAt },
      }),
    ).toBe(1);
    expect(
      await e2ePrisma.payment.count({
        where: { invoiceId: renewal.id, kind: 'CHARGE', status: 'SUCCEEDED' },
      }),
    ).toBe(1);
    const operations = await e2ePrisma.hostingPanelOperation.findMany({
      where: {
        serviceId: service.id,
        type: { in: ['SUSPEND_ACCOUNT', 'UNSUSPEND_ACCOUNT'] },
      },
      select: { type: true, status: true },
      orderBy: { type: 'asc' },
    });
    expect(operations).toEqual([
      { type: 'SUSPEND_ACCOUNT', status: 'SUCCEEDED' },
      { type: 'UNSUSPEND_ACCOUNT', status: 'SUCCEEDED' },
    ]);

    // Skip the next renewal window and resume after the original grace period would have expired.
    const missedDueAt = new Date('2025-02-11T12:00:00.000Z');
    const resumedAt = new Date('2025-02-20T12:00:00.000Z');
    expect(await renewals(missedDueAt)).toHaveLength(0);
    await setClock('2025-02-20');
    await cycle('2025-02-20');
    const catchUpInvoices = await renewals(missedDueAt);
    expect(catchUpInvoices).toHaveLength(1);
    const catchUp = catchUpInvoices[0]!;
    expect(catchUp).toMatchObject({
      status: 'UNPAID',
      issuedAt: resumedAt,
      dueAt: resumedAt,
      balanceDue: service.recurringAmount + 30_000n,
      items: [
        {
          servicePeriodStart: missedDueAt,
          servicePeriodEnd: new Date('2025-03-11T12:00:00.000Z'),
        },
        backupLine(missedDueAt, new Date('2025-03-11T12:00:00.000Z')),
      ],
    });
    const suspensionRequests = () =>
      e2ePrisma.outboxEvent.count({
        where: {
          eventType: 'HOSTING_SUSPENSION_REQUESTED',
          idempotencyKey: `automation:suspend:${service.id}:${catchUp.id}`,
        },
      });
    expect(await serviceState()).toMatchObject({
      status: 'ACTIVE',
      nextDueAt: missedDueAt,
    });
    expect(await suspensionRequests()).toBe(0);

    await setClock('2025-02-21');
    await cycle('2025-02-21');
    expect(await renewals(missedDueAt)).toMatchObject([
      { id: catchUp.id, status: 'OVERDUE', dueAt: resumedAt },
    ]);
    expect(await serviceState()).toMatchObject({ status: 'ACTIVE' });
    expect(await suspensionRequests()).toBe(0);

    await setClock('2025-02-22');
    await cycle('2025-02-22');
    expect(await renewals(missedDueAt)).toMatchObject([{ id: catchUp.id }]);
    expect(
      await e2ePrisma.invoiceItem.count({
        where: { orderItemId: backupItem.id, servicePeriodStart: missedDueAt },
      }),
    ).toBe(1);
    expect(await suspensionRequests()).toBe(1);
  } catch (error) {
    await info.attach('scheduler-and-worker', {
      body: processLogs.join(''),
      contentType: 'text/plain',
    });
    throw error;
  } finally {
    await Promise.all(processes.reverse().map((process) => process.stop()));
    await Promise.all([customer.dispose(), admin.dispose()]);
    if (previousPolicy) {
      await e2ePrisma.setting.update({
        where: { key: policyKey },
        data: {
          value: previousPolicy.value as NonNullable<
            typeof previousPolicy.value
          >,
        },
      });
    } else {
      await e2ePrisma.setting.deleteMany({ where: { key: policyKey } });
    }
  }
});

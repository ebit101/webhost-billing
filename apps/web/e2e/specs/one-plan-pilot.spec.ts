import { expect, test } from '@playwright/test';
import { e2ePrisma } from '../database';
import { assertBrowserDatabaseScope } from '../database-scope';
import { E2E_DATABASE_URL, E2E_SCHEMA } from '../environment';
import { E2E_ADMIN, E2E_HEALTHY_CUSTOMER } from '../fixtures';

test.afterAll(async () => e2ePrisma.$disconnect());

test('one fictional plan settles one manual payment despite repeated submissions', async ({
  browser,
  page: admin,
}) => {
  test.setTimeout(240_000);
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const slug = 'command194-pilot';
  const name = 'Fictional pilot hosting';
  const domain = 'command194-pilot.example.test';
  const reference = 'FICTIONAL-PILOT-194';
  const amount = 123_456n;

  await admin.goto('/admin');
  await admin.getByLabel('Email address').fill(E2E_ADMIN.email);
  await admin.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await admin.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    admin.getByRole('heading', { name: 'Business overview' }),
  ).toBeVisible();
  await admin.goto('/admin/products');
  await admin.getByRole('button', { name: 'Create product' }).click();
  const draft = admin.getByRole('dialog', { name: 'Create draft product' });
  await draft.getByLabel('Name', { exact: true }).fill(name);
  await draft.getByLabel('Slug').fill(slug);
  await draft.getByLabel('cPanel package identifier').fill('command26_starter');
  await draft.getByLabel('Storage display').fill('10 GB SSD');
  await draft.getByLabel('Websites display').fill('1 website');
  await draft.getByLabel('Email display').fill('10 email accounts');
  await draft.getByLabel('Bandwidth display').fill('100 GB monthly');
  await draft.getByLabel('Show after activation').check();
  await draft.getByLabel('Price', { exact: true }).fill('1234.56');
  await draft.getByRole('button', { name: 'Create draft' }).click();
  const editor = admin.getByRole('dialog', { name, exact: true });
  await editor.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(
    editor.getByText('Product activated.', { exact: true }),
  ).toBeVisible();
  const product = await e2ePrisma.product.findUniqueOrThrow({
    where: { slug },
    include: { prices: true },
  });
  expect(product.status).toBe('ACTIVE');
  expect(product.prices).toMatchObject([
    { amount, billingPeriod: 'MONTHLY', currency: 'BDT', isActive: true },
  ]);

  const context = await browser.newContext();
  try {
    const customer = await context.newPage();
    await customer.goto('/login');
    await customer.getByLabel('Email address').fill(E2E_HEALTHY_CUSTOMER.email);
    await customer
      .getByLabel('Password', { exact: true })
      .fill(E2E_HEALTHY_CUSTOMER.password);
    await customer
      .getByRole('button', { name: 'Sign in', exact: true })
      .click();
    await expect(
      customer.getByRole('heading', { name: 'Welcome, Healthy', exact: true }),
    ).toBeVisible();
    await customer.goto('/hosting');
    await expect(
      customer.getByRole('link', { name: `Choose ${name}` }),
    ).toBeVisible();
    await customer.goto(
      `/portal/checkout?productId=${product.id}&priceId=${product.prices[0]!.id}`,
    );
    await customer
      .getByRole('textbox', { name: 'Domain', exact: true })
      .fill(domain);
    await customer.getByRole('button', { name: 'Place order' }).click();
    await expect(
      customer.getByRole('heading', { name: /^ORD-/ }),
    ).toBeVisible();
    const order = await e2ePrisma.order.findFirstOrThrow({
      where: {
        customerId: E2E_HEALTHY_CUSTOMER.customerId,
        items: { some: { productId: product.id } },
      },
      include: { invoices: true },
    });
    expect(order.status).toBe('AWAITING_PAYMENT');
    expect(order.invoices).toMatchObject([
      { total: amount, balanceDue: amount, status: 'UNPAID' },
    ]);
    const invoice = order.invoices[0]!;
    await customer.goto(`/portal/invoices/${invoice.id}`);
    await expect(
      customer.getByLabel('Amount (BDT)', { exact: true }),
    ).toHaveValue('1234.56');

    const submitReference = async () => {
      await customer.getByLabel('Transaction/reference ID').fill(reference);
      const response = customer.waitForResponse(
        (entry) =>
          new URL(entry.url()).pathname === '/payments/manual/customer' &&
          entry.request().method() === 'POST',
      );
      await customer
        .getByRole('button', { name: 'Submit payment reference' })
        .click();
      return response;
    };
    const first = await submitReference();
    expect(first.status()).toBe(201);
    await expect(
      customer.getByText(
        'Payment reference submitted for administrator verification.',
      ),
    ).toBeVisible();
    const submitted = await e2ePrisma.payment.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });
    expect(submitted).toMatchObject({ amount, status: 'PENDING', reference });

    const replay = await customer.request.post(first.url(), {
      headers: {
        'X-CSRF-Token': (await first.request().headerValue('x-csrf-token'))!,
      },
      data: first.request().postDataJSON() as unknown,
    });
    expect(replay.status()).toBe(201);
    expect(await replay.json()).toMatchObject({
      data: { duplicate: true, payment: { id: submitted.id } },
    });
    expect(
      await e2ePrisma.payment.count({ where: { invoiceId: invoice.id } }),
    ).toBe(1);

    const repeated = await submitReference();
    expect(repeated.status()).toBe(409);
    await expect(
      customer.getByText(
        'This payment reference is already awaiting verification for this invoice.',
      ),
    ).toBeVisible();
    const pending = await e2ePrisma.payment.findMany({
      where: { invoiceId: invoice.id },
    });
    expect(pending).toMatchObject([{ id: submitted.id, status: 'PENDING' }]);
    expect(
      await e2ePrisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
    ).toMatchObject({
      status: 'UNPAID',
      amountPaid: 0n,
      balanceDue: amount,
    });

    await admin.goto(
      `/admin/payments?customerId=${E2E_HEALTHY_CUSTOMER.customerId}`,
    );
    const row = admin.getByRole('row').filter({ hasText: reference }).first();
    await row
      .getByRole('button', { name: `Review payment ${reference}` })
      .click();
    const review = admin.getByRole('region', { name: 'Payment review' });
    await expect(review).toContainText('BDT 1,234.56');
    await expect(review).toContainText('Pending');
    await admin
      .getByRole('dialog', { name: 'Payment details' })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    const verification = admin.waitForResponse(
      (entry) =>
        /^\/payments\/[^/]+\/review$/.test(new URL(entry.url()).pathname) &&
        entry.request().method() === 'PATCH',
    );
    await row.getByRole('button', { name: 'Verify', exact: true }).click();
    const verified = await verification;
    expect(verified.status()).toBe(200);
    await expect(
      admin.getByText('Payment verified and invoice recalculated.'),
    ).toBeVisible();
    const settled = await e2ePrisma.payment.findFirstOrThrow({
      where: { invoiceId: invoice.id, status: 'SUCCEEDED' },
    });
    expect(settled).toMatchObject({
      amount,
      reviewedByUserId: E2E_ADMIN.userId,
    });
    for (const payment of pending) {
      const rejected = await admin.request.patch(
        new URL(`/payments/${payment.id}/review`, verified.url()).href,
        {
          headers: {
            'X-CSRF-Token': (await verified
              .request()
              .headerValue('x-csrf-token'))!,
          },
          data: { action: 'VERIFY' },
        },
      );
      expect([409, 422]).toContain(rejected.status());
    }
    expect(
      await e2ePrisma.payment.count({
        where: { invoiceId: invoice.id, status: 'SUCCEEDED' },
      }),
    ).toBe(1);
    expect(
      await e2ePrisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
    ).toMatchObject({
      status: 'PAID',
      amountPaid: amount,
      balanceDue: 0n,
      paidAt: expect.any(Date),
    });
    expect(
      await e2ePrisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({ status: 'PAID' });
    expect(
      await e2ePrisma.service.count({ where: { productId: product.id } }),
    ).toBe(0);

    const audit = await e2ePrisma.activityLog.findMany({
      where: { entityId: { in: [order.id, ...pending.map(({ id }) => id)] } },
    });
    expect(
      audit.filter(
        ({ action }) => action === 'MANUAL_PAYMENT_SUBMITTED_BY_CUSTOMER',
      ),
    ).toHaveLength(pending.length);
    expect(
      audit.filter(
        ({ action }) => action === 'MANUAL_PAYMENT_VERIFIED_BY_ADMIN',
      ),
    ).toMatchObject([
      {
        actorUserId: E2E_ADMIN.userId,
        entityId: settled.id,
        metadata: {
          invoiceId: invoice.id,
          amount: amount.toString(),
          balanceDue: '0',
        },
      },
    ]);
    expect(
      audit.filter(
        ({ action }) => action === 'ORDER_MARKED_PAID_BY_VERIFIED_PAYMENT',
      ),
    ).toHaveLength(1);
    expect(
      await e2ePrisma.outboxEvent.count({
        where: { aggregateId: settled.id, eventType: 'EMAIL_PAYMENT_RECEIVED' },
      }),
    ).toBe(1);
    await customer.reload();
    await expect(
      customer.getByRole('button', { name: 'Submit payment reference' }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});

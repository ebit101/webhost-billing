import { randomUUID } from 'node:crypto';
import { expect as playwrightExpect, test, type Page } from '@playwright/test';
import { createCustomerOrderRequestSchema } from '@webhost-billing/shared';
import { e2ePrisma } from '../database';
import { assertBrowserDatabaseScope } from '../database-scope';
import {
  E2E_API_ORIGIN,
  E2E_DATABASE_URL,
  E2E_SCHEMA,
  E2E_WEB_ORIGIN,
} from '../environment';
import {
  E2E_ADMIN,
  E2E_HEALTHY_CUSTOMER,
  E2E_PRODUCT,
  E2E_SERVER,
} from '../fixtures';

const expect = playwrightExpect.configure({ timeout: 40_000 });

test.use({ video: 'off' });
test.afterAll(async () => e2ePrisma.$disconnect());

async function apiMutation(
  page: Page,
  method: 'POST' | 'PATCH',
  path: string,
  data: unknown,
) {
  const csrf = await page.request.get(`${E2E_API_ORIGIN}/auth/csrf`);
  expect(csrf.ok()).toBe(true);
  const body = (await csrf.json()) as { data: { csrfToken: string } };
  return page.request.fetch(`${E2E_API_ORIGIN}${path}`, {
    method,
    headers: { 'X-CSRF-Token': body.data.csrfToken, Origin: E2E_WEB_ORIGIN },
    data,
  });
}

test('a one-time website migration is billed and fulfilled once after a checkout retry', async ({
  browser,
  page: admin,
}) => {
  test.setTimeout(300_000);
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const name = 'Fictional website migration';
  const domain = 'command199-migration.example.test';
  const reference = 'FICTIONAL-MIGRATION-199';
  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  try {
    await expect(
      await apiMutation(admin, 'POST', '/auth/login', {
        email: E2E_ADMIN.email,
        password: E2E_ADMIN.password,
      }),
    ).toBeOK();
    await admin.goto('/admin/products');
    await admin.getByRole('link', { name: 'Product add-ons' }).click();
    await admin.getByLabel('Add-on name').fill(name);
    await admin
      .getByLabel('Description (optional)')
      .fill('Staff copy a fictional site to the new hosting account.');
    await admin.getByLabel('One-time price').fill('800.00');
    await admin
      .getByRole('checkbox', { name: E2E_PRODUCT.name, exact: true })
      .check();
    await admin.getByRole('button', { name: 'Save add-on' }).click();
    await expect(admin.getByRole('status')).toContainText(`${name} saved.`);

    await expect(
      await apiMutation(customer, 'POST', '/auth/login', {
        email: E2E_HEALTHY_CUSTOMER.email,
        password: E2E_HEALTHY_CUSTOMER.password,
      }),
    ).toBeOK();
    await customer.goto(
      `/portal/checkout?productId=${E2E_PRODUCT.id}&priceId=${E2E_PRODUCT.priceId}`,
    );
    const migration = customer.getByRole('checkbox', {
      name: new RegExp(name),
    });
    await expect(migration).not.toBeChecked();
    await migration.check();
    await expect(
      customer.getByText('BDT 2,100.00', { exact: true }),
    ).toBeVisible();
    await customer
      .getByRole('textbox', { name: 'Domain', exact: true })
      .fill(domain);
    const placed = customer.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/orders/checkout' &&
        response.request().method() === 'POST',
    );
    await customer
      .getByRole('button', { name: 'Place order', exact: true })
      .click();
    const checkoutResponse = await placed;
    expect(checkoutResponse.status()).toBe(201);
    const checkout = createCustomerOrderRequestSchema.parse(
      checkoutResponse.request().postDataJSON(),
    );
    expect(checkout.addOnPriceIds).toHaveLength(1);
    await expect(
      customer.getByRole('heading', { name: /^ORD-/ }),
    ).toBeVisible();
    await expect(
      customer.getByText('BDT 800.00 one time', { exact: true }),
    ).toBeVisible();

    const order = await e2ePrisma.order.findUniqueOrThrow({
      where: { submissionKey: checkout.submissionKey },
      include: { items: true, invoices: { include: { items: true } } },
    });
    const addOn = order.items.find((item) => item.kind === 'ADD_ON')!;
    const hosting = order.items.find((item) => item.kind === 'HOSTING')!;
    const invoice = order.invoices[0]!;
    expect(order.invoices).toHaveLength(1);
    expect(invoice).toMatchObject({
      total: 210_000n,
      balanceDue: 210_000n,
      status: 'UNPAID',
    });
    expect(addOn).toMatchObject({
      productNameSnapshot: name,
      lineTotal: 80_000n,
      billingPeriod: 'ONE_TIME',
      fulfilledAt: null,
    });
    expect(
      invoice.items.filter((item) => item.orderItemId === addOn.id),
    ).toMatchObject([
      {
        lineTotal: 80_000n,
        serviceId: null,
        servicePeriodStart: null,
        servicePeriodEnd: null,
      },
    ]);

    const retry = await apiMutation(
      customer,
      'POST',
      '/orders/checkout',
      checkout,
    );
    expect(retry.status()).toBe(201);
    expect(await retry.json()).toMatchObject({
      data: {
        duplicate: true,
        order: { id: order.id, invoice: { id: invoice.id } },
      },
    });
    expect(
      (
        await apiMutation(customer, 'POST', '/orders/checkout', {
          ...checkout,
          addOnPriceIds: [],
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await apiMutation(customer, 'POST', '/orders/checkout', {
          ...checkout,
          submissionKey: randomUUID(),
          addOnPriceIds: [E2E_PRODUCT.priceId],
        })
      ).status(),
    ).toBe(422);
    const fulfillPath = `/orders/${order.id}/add-ons/${addOn.id}/fulfill`;
    expect(
      (await apiMutation(customer, 'PATCH', fulfillPath, {})).status(),
    ).toBe(403);
    expect((await apiMutation(admin, 'PATCH', fulfillPath, {})).status()).toBe(
      409,
    );
    expect(
      await e2ePrisma.order.count({
        where: { items: { some: { requestedDomain: domain } } },
      }),
    ).toBe(1);
    expect(
      await e2ePrisma.invoice.count({ where: { orderId: order.id } }),
    ).toBe(1);
    expect(
      await e2ePrisma.payment.count({ where: { invoiceId: invoice.id } }),
    ).toBe(0);

    await customer.goto(`/portal/invoices/${invoice.id}`);
    await expect(
      customer.getByText(`${name} — one-time add-on for ${domain}`),
    ).toBeVisible();
    await expect(
      customer.getByLabel('Amount (BDT)', { exact: true }),
    ).toHaveValue('2100.00');
    await customer.getByLabel('Transaction/reference ID').fill(reference);
    await customer
      .getByRole('button', { name: 'Submit payment reference' })
      .click();
    await expect(
      customer.getByText(
        'Payment reference submitted for administrator verification.',
      ),
    ).toBeVisible();
    await admin.goto(
      `/admin/payments?customerId=${E2E_HEALTHY_CUSTOMER.customerId}`,
    );
    await admin
      .getByRole('row')
      .filter({ hasText: reference })
      .getByRole('button', { name: 'Verify', exact: true })
      .click();
    await expect(
      admin.getByText('Payment verified and invoice recalculated.'),
    ).toBeVisible();
    expect(
      await e2ePrisma.payment.findMany({ where: { invoiceId: invoice.id } }),
    ).toMatchObject([{ amount: 210_000n, status: 'SUCCEEDED' }]);
    expect(
      await e2ePrisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
    ).toMatchObject({ status: 'PAID', balanceDue: 0n });

    expect(
      (
        await apiMutation(admin, 'PATCH', `/orders/${order.id}/status`, {
          status: 'PROCESSING',
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await apiMutation(admin, 'POST', '/services', {
          orderItemId: hosting.id,
          serverId: E2E_SERVER.id,
        })
      ).status(),
    ).toBe(201);
    const service = await e2ePrisma.service.findUniqueOrThrow({
      where: { orderItemId: hosting.id },
    });
    expect(
      (
        await apiMutation(
          admin,
          'POST',
          `/hosting-panel/services/${service.id}/operations`,
          { type: 'CREATE_ACCOUNT', submissionKey: randomUUID() },
        )
      ).status(),
    ).toBe(201);
    expect(
      await e2ePrisma.service.findUniqueOrThrow({ where: { id: service.id } }),
    ).toMatchObject({ status: 'ACTIVE', recurringAmount: 120_000n });
    expect(
      await e2ePrisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({ status: 'PROCESSING' });
    expect(
      (
        await apiMutation(admin, 'PATCH', `/orders/${order.id}/status`, {
          status: 'COMPLETED',
        })
      ).status(),
    ).toBe(409);

    await admin.goto(
      `/admin/orders?customerId=${E2E_HEALTHY_CUSTOMER.customerId}`,
    );
    await admin
      .getByRole('button', { name: `Review order ${order.orderNumber}` })
      .click();
    const review = admin.getByRole('region', { name: 'Order review' });
    await expect(review.getByText('Awaiting fulfillment')).toBeVisible();
    await review
      .getByRole('button', { name: `Mark as fulfilled ${name}` })
      .click();
    await expect(review.getByText('Fulfilled', { exact: true })).toBeVisible();
    expect((await apiMutation(admin, 'PATCH', fulfillPath, {})).status()).toBe(
      200,
    );
    expect(
      await e2ePrisma.activityLog.count({
        where: { entityId: order.id, action: 'HOSTING_ADD_ON_FULFILLED' },
      }),
    ).toBe(1);
    expect(
      await e2ePrisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({ status: 'COMPLETED' });
    await customer.goto('/portal/orders');
    await expect(
      customer.getByText(`${name} · Fulfilled`, { exact: true }),
    ).toBeVisible();
  } finally {
    await customerContext.close();
  }
});

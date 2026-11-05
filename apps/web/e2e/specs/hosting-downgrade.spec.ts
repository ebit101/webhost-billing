import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  apiSuccessResponseSchema,
  hostingUpgradeSchema,
} from '@webhost-billing/shared';
import { createPurchaseTestActors } from '../purchase-test-actors';
import { e2ePrisma } from '../database';
import { E2E_API_ORIGIN, E2E_WEB_ORIGIN } from '../environment';
import { E2E_PRODUCT, E2E_SERVER } from '../fixtures';

test.afterAll(async () => e2ePrisma.$disconnect());
test('a customer schedules and withdraws a zero-charge period-end downgrade', async ({
  playwright,
  browser,
  page: admin,
}, info) => {
  test.setTimeout(300_000);
  const { buyer, staff } = await createPurchaseTestActors();
  const options = {
    baseURL: E2E_API_ORIGIN,
    extraHTTPHeaders: { Origin: E2E_WEB_ORIGIN },
  };
  const staffApi = await playwright.request.newContext(options);
  const buyerApi = await playwright.request.newContext(options);
  const customerContext = await browser.newContext();
  async function mutation(
    client: APIRequestContext,
    method: 'POST' | 'PATCH',
    path: string,
    data: unknown,
    status?: number,
  ) {
    const csrfBody: unknown = await (await client.get('/auth/csrf')).json();
    if (!csrfBody || typeof csrfBody !== 'object' || !('data' in csrfBody))
      throw new Error('Missing fictional CSRF envelope');
    const csrfData = csrfBody.data;
    if (
      !csrfData ||
      typeof csrfData !== 'object' ||
      !('csrfToken' in csrfData) ||
      typeof csrfData.csrfToken !== 'string'
    )
      throw new Error('Missing fictional CSRF token');
    const token = csrfData.csrfToken;
    const result = await client.fetch(path, {
      method,
      data,
      headers: { 'X-CSRF-Token': token },
    });
    if (status) expect(result.status()).toBe(status);
    else expect(result.ok(), `${path}: ${await result.text()}`).toBe(true);
    return result;
  }
  try {
    await mutation(staffApi, 'POST', '/auth/login', {
      email: staff.email,
      password: staff.password,
    });
    await mutation(buyerApi, 'POST', '/auth/login', {
      email: buyer.email,
      password: buyer.password,
    });
    await mutation(buyerApi, 'POST', '/orders/checkout', {
      productId: E2E_PRODUCT.id,
      priceId: E2E_PRODUCT.priceId,
      requestedDomain: 'command212-downgrade.example.test',
      submissionKey: randomUUID(),
    });
    const order = await e2ePrisma.order.findFirstOrThrow({
      where: { customerId: buyer.customerId },
      include: { invoices: true, items: true },
    });
    const initial = order.invoices[0]!;
    await mutation(staffApi, 'POST', '/payments/manual/admin', {
      invoiceId: initial.id,
      amount: initial.balanceDue.toString(),
      submissionKey: randomUUID(),
      proof: {
        method: 'BANK_TRANSFER',
        reference: `FICTIONAL-212-INITIAL-${buyer.customerId}`,
      },
    });
    await mutation(staffApi, 'PATCH', `/orders/${order.id}/status`, {
      status: 'PROCESSING',
    });
    await mutation(staffApi, 'POST', '/services', {
      orderItemId: order.items[0]!.id,
      serverId: E2E_SERVER.id,
    });
    const service = await e2ePrisma.service.findFirstOrThrow({
      where: { customerId: buyer.customerId },
    });
    await mutation(
      staffApi,
      'POST',
      `/hosting-panel/services/${service.id}/operations`,
      { type: 'CREATE_ACCOUNT', submissionKey: randomUUID() },
    );
    const target = await e2ePrisma.product.create({
      data: {
        name: 'Fictional smaller hosting',
        slug: `command212-${randomUUID()}`,
        publicVisible: true,
        status: 'ACTIVE',
        hostingPackageIdentifier: 'command212_small',
        prices: {
          create: {
            billingPeriod: 'MONTHLY',
            currency: 'BDT',
            amount: 80_000n,
          },
        },
      },
      include: { prices: true },
    });
    await admin.context().addCookies((await staffApi.storageState()).cookies);
    await admin.goto(
      `/admin/customers/${buyer.customerId}/services/${service.id}`,
    );
    const changes = admin.getByRole('region', { name: 'Hosting plan changes' });
    await changes.getByRole('button', { name: 'Offer a downgrade' }).click();
    const offer = admin.getByRole('dialog', {
      name: 'Offer a hosting downgrade',
    });
    await offer
      .getByLabel('Target plan and price')
      .selectOption(target.prices[0]!.id);
    await offer
      .getByLabel('Review reason')
      .fill(
        'Fictional target package, usage limits and add-on compatibility checked.',
      );
    await offer.getByRole('checkbox').check();
    await offer.getByRole('button', { name: 'Create downgrade quote' }).click();
    await expect(offer).not.toBeVisible();
    const customer = await customerContext.newPage();
    await customerContext.addCookies((await buyerApi.storageState()).cookies);
    await customer.goto(`/portal/services/${service.id}`);
    const portal = customer.getByRole('region', {
      name: 'Hosting plan changes',
    });
    await portal.getByRole('button', { name: 'Schedule downgrade' }).click();
    const confirmation = customer.getByRole('dialog', {
      name: 'Confirm hosting downgrade action',
    });
    await expect(confirmation).toContainText(
      'No invoice, credit or refund is created.',
    );
    await confirmation.getByRole('checkbox').check();
    await confirmation
      .getByRole('button', { name: 'Confirm downgrade action' })
      .click();
    await expect(portal).toContainText('Downgrade request: Scheduled');
    await expect(
      portal.getByRole('button', { name: 'Withdraw downgrade' }),
    ).toBeVisible();
    await expect(portal).toContainText('Immediate charge: BDT 0.00');
    const request = await e2ePrisma.serviceUpgrade.findFirstOrThrow({
      where: { serviceId: service.id },
    });
    expect(request).toMatchObject({ status: 'SCHEDULED', invoiceId: null });
    const replay = await mutation(
      buyerApi,
      'POST',
      `/services/${service.id}/upgrades/${request.id}/accept`,
      { acknowledged: true },
    );
    expect(
      apiSuccessResponseSchema(hostingUpgradeSchema).parse(await replay.json())
        .data.status,
    ).toBe('SCHEDULED');
    await mutation(
      staffApi,
      'POST',
      `/services/${service.id}/upgrades/${request.id}/approve`,
      {
        acknowledged: true,
        downgradeReview: {
          capacityFits: true,
          reason: 'Fictional early approval must be denied.',
        },
      },
      409,
    );
    await portal.getByRole('button', { name: 'Withdraw downgrade' }).click();
    await confirmation.getByRole('checkbox').check();
    await confirmation
      .getByRole('button', { name: 'Confirm downgrade action' })
      .click();
    await expect(portal).toContainText('Downgrade request: Cancelled');
    await customer.reload();
    await expect(portal).toContainText('Downgrade request: Cancelled');
    await expect(
      portal.getByRole('button', { name: 'Withdraw downgrade' }),
    ).toHaveCount(0);
    expect(
      await e2ePrisma.invoice.count({
        where: { customerId: buyer.customerId },
      }),
    ).toBe(1);
    expect(
      await e2ePrisma.payment.count({ where: { invoiceId: initial.id } }),
    ).toBe(1);
    expect(
      await e2ePrisma.service.findUniqueOrThrow({ where: { id: service.id } }),
    ).toMatchObject({
      status: 'ACTIVE',
      productId: service.productId,
      recurringAmount: service.recurringAmount,
      nextDueAt: service.nextDueAt,
      provisioningSnapshot: service.provisioningSnapshot,
    });
    expect(
      await e2ePrisma.hostingPanelOperation.count({
        where: { serviceId: service.id, type: 'CHANGE_PACKAGE' },
      }),
    ).toBe(0);
    await customer.screenshot({
      path: info.outputPath('scheduled-downgrade-withdrawn.png'),
      fullPage: true,
    });
  } finally {
    await Promise.all([
      staffApi.dispose(),
      buyerApi.dispose(),
      customerContext.close(),
    ]);
  }
});

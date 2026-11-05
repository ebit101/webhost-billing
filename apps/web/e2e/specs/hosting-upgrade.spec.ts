import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  apiSuccessResponseSchema,
  hostingUpgradeSchema,
} from '@webhost-billing/shared';
import { createPurchaseTestActors } from '../purchase-test-actors';
import { createRenewalInvoice, e2ePrisma } from '../database';
import { E2E_API_ORIGIN, E2E_WEB_ORIGIN } from '../environment';
import { E2E_PRODUCT, E2E_SERVER } from '../fixtures';

test.afterAll(async () => e2ePrisma.$disconnect());
test('a customer accepts one upgrade invoice and an administrator applies the paid package once', async ({
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
      requestedDomain: 'command211-upgrade.example.test',
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
      proof: { method: 'BANK_TRANSFER', reference: 'FICTIONAL-211-INITIAL' },
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
        name: 'Fictional upgraded hosting',
        slug: `command211-upgrade-${randomUUID()}`,
        publicVisible: true,
        status: 'ACTIVE',
        hostingPackageIdentifier: 'command211_business',
        prices: {
          create: {
            billingPeriod: 'MONTHLY',
            currency: 'BDT',
            amount: service.recurringAmount + 60_000n,
          },
        },
      },
      include: { prices: true },
    });
    await admin.context().addCookies((await staffApi.storageState()).cookies);
    await admin.goto(
      `/admin/customers/${buyer.customerId}/services/${service.id}`,
    );
    const upgrades = admin.getByRole('region', {
      name: 'Hosting plan changes',
    });
    await upgrades.getByRole('button', { name: 'Offer an upgrade' }).click();
    const offer = admin.getByRole('dialog', {
      name: 'Offer a hosting upgrade',
    });
    await offer
      .getByLabel('Target plan and price')
      .selectOption(target.prices[0]!.id);
    await offer
      .getByLabel('Review reason')
      .fill(
        'Fictional package, capacity and retained add-ons verified on the fake node.',
      );
    await offer.getByRole('checkbox').check();
    await offer.getByRole('button', { name: 'Create upgrade quote' }).click();
    await expect(offer).not.toBeVisible();
    await expect(upgrades).toContainText(target.name);
    const request = await e2ePrisma.serviceUpgrade.findFirstOrThrow({
      where: { serviceId: service.id },
    });
    await customerContext.addCookies((await buyerApi.storageState()).cookies);
    const customer = await customerContext.newPage();
    await customer.goto(`/portal/services/${service.id}`);
    const customerUpgrades = customer.getByRole('region', {
      name: 'Hosting plan changes',
    });
    await customerUpgrades
      .getByRole('button', { name: 'Review and accept upgrade' })
      .click();
    const acceptance = customer.getByRole('dialog', {
      name: 'Confirm hosting upgrade action',
    });
    await expect(
      acceptance.getByRole('button', { name: 'Confirm upgrade action' }),
    ).toBeDisabled();
    await acceptance.getByRole('checkbox').check();
    await acceptance
      .getByRole('button', { name: 'Confirm upgrade action' })
      .click();
    await expect(
      customerUpgrades.getByRole('link', { name: /View upgrade invoice/ }),
    ).toBeVisible();
    const accepted = await e2ePrisma.serviceUpgrade.findUniqueOrThrow({
      where: { id: request.id },
      include: { invoice: true },
    });
    const replay = await mutation(
      buyerApi,
      'POST',
      `/services/${service.id}/upgrades/${request.id}/accept`,
      { acknowledged: true },
    );
    expect(
      apiSuccessResponseSchema(hostingUpgradeSchema).parse(await replay.json())
        .data.invoiceId,
    ).toBe(accepted.invoiceId);
    await mutation(
      buyerApi,
      'POST',
      `/services/${service.id}/upgrades/${request.id}/approve`,
      { acknowledged: true },
      403,
    );
    await mutation(
      staffApi,
      'POST',
      `/services/${service.id}/upgrades/${request.id}/approve`,
      { acknowledged: true },
      409,
    );
    expect(
      await e2ePrisma.hostingPanelOperation.count({
        where: { serviceId: service.id, type: 'CHANGE_PACKAGE' },
      }),
    ).toBe(0);
    // A renewal cycle beyond this unpaid upgrade's deadline must neither bill
    // the old plan again nor treat the optional upgrade as overdue hosting.
    const heldRenewal = await createRenewalInvoice(service.id);
    expect(heldRenewal.id).toBe(accepted.invoiceId);
    expect(
      await e2ePrisma.invoice.findUniqueOrThrow({
        where: { id: accepted.invoiceId! },
      }),
    ).toMatchObject({ status: 'UNPAID' });
    expect(
      await e2ePrisma.outboxEvent.count({
        where: {
          aggregateId: service.id,
          eventType: 'HOSTING_SUSPENSION_REQUESTED',
        },
      }),
    ).toBe(0);
    await mutation(staffApi, 'POST', '/payments/manual/admin', {
      invoiceId: accepted.invoiceId!,
      amount: accepted.invoice!.balanceDue.toString(),
      submissionKey: randomUUID(),
      proof: { method: 'BANK_TRANSFER', reference: 'FICTIONAL-211-UPGRADE' },
    });
    await admin.reload();
    await upgrades
      .getByRole('button', { name: 'Approve paid upgrade' })
      .click();
    const approval = admin.getByRole('dialog', {
      name: 'Confirm hosting upgrade action',
    });
    await approval.getByRole('checkbox').check();
    await approval
      .getByRole('button', { name: 'Confirm upgrade action' })
      .click();
    await expect(upgrades).toContainText(
      'The hosting package and recorded plan are updated.',
    );
    // Completion must refresh the surrounding current service facts too.
    await expect(
      admin.locator('dd').filter({ hasText: /^Fictional upgraded hosting$/ }),
    ).toBeVisible();
    await expect(
      admin.locator('dd').filter({ hasText: /^BDT 1,800\.00$/ }),
    ).toBeVisible();
    await admin.screenshot({
      path: info.outputPath('hosting-upgrade-completed.png'),
      fullPage: true,
    });
    const final = await e2ePrisma.service.findUniqueOrThrow({
      where: { id: service.id },
    });
    expect(final).toMatchObject({
      status: 'ACTIVE',
      productId: target.id,
      currentPackageIdentifier: target.hostingPackageIdentifier,
      provisioningSnapshot: service.provisioningSnapshot,
      recurringAmount: target.prices[0]!.amount,
      nextDueAt: service.nextDueAt,
    });
    await mutation(
      staffApi,
      'POST',
      `/services/${service.id}/upgrades/${request.id}/approve`,
      { acknowledged: true },
    );
    expect(
      await e2ePrisma.hostingPanelOperation.count({
        where: { serviceId: service.id, type: 'CHANGE_PACKAGE' },
      }),
    ).toBe(1);
    expect(
      await e2ePrisma.invoice.count({
        where: { submissionKey: `hosting-upgrade:${request.id}` },
      }),
    ).toBe(1);
    expect(
      await e2ePrisma.orderItem.findUniqueOrThrow({
        where: { id: order.items[0]!.id },
      }),
    ).toMatchObject({ productId: E2E_PRODUCT.id });
    const renewal = await createRenewalInvoice(service.id);
    expect(renewal.total).toBe(target.prices[0]!.amount);
    expect(
      await e2ePrisma.invoice.findUniqueOrThrow({ where: { id: initial.id } }),
    ).toMatchObject({ total: initial.total, status: 'PAID' });
  } catch (error) {
    await info.attach('fictional-upgrade-state', {
      contentType: 'application/json',
      body: JSON.stringify(
        await e2ePrisma.serviceUpgrade.findMany({
          where: { service: { customerId: buyer.customerId } },
          select: {
            status: true,
            error: true,
            attempt: true,
            operation: {
              select: { status: true, errorCode: true, errorMessage: true },
            },
          },
        }),
      ),
    });
    throw error;
  } finally {
    await Promise.all([
      staffApi.dispose(),
      buyerApi.dispose(),
      customerContext.close(),
    ]);
  }
});

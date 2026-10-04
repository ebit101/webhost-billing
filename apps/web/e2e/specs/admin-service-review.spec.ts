import { expect, test } from '@playwright/test';
import { hash } from 'argon2';
import { createPrismaClient } from '@webhost-billing/database';
import { E2E_DATABASE_URL, E2E_SCHEMA } from '../environment';
import {
  E2E_ADMIN,
  E2E_HISTORY_CUSTOMER,
  E2E_PRODUCT,
  E2E_SERVER,
} from '../fixtures';

// This journey owns its fixed fictional connection; URL schema alone does not
// isolate unqualified SQL. Do not change the shared browser/database boundary.
const reviewDatabaseUrl = new URL(E2E_DATABASE_URL);
reviewDatabaseUrl.searchParams.set('options', '-csearch_path=command26_e2e');
const e2ePrisma = createPrismaClient(reviewDatabaseUrl.toString());

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.afterAll(async () => e2ePrisma.$disconnect());
const serviceId = '86000000-0000-4000-8000-000000000086';
const domain = 'command86-review.example.test';
test('administrator inspects service facts and customer without business mutations', async ({
  page,
}) => {
  const database = new URL(E2E_DATABASE_URL);
  if (
    E2E_SCHEMA !== 'command26_e2e' ||
    database.searchParams.get('schema') !== E2E_SCHEMA ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)
  )
    throw new Error(
      'Service review requires the dedicated loopback fictional schema.',
    );
  const schema = await e2ePrisma.$queryRawUnsafe<{ schema: string }[]>(
    'SELECT current_schema() AS schema',
  );
  if (schema[0]?.schema !== E2E_SCHEMA)
    throw new Error('Service review raw-SQL isolation is not verified.');
  // Independent fictional account preserves original lifecycle login limits.
  const email = 'command86-review-admin@example.test';
  await e2ePrisma.user.create({
    data: {
      id: '86000000-0000-4000-8000-000000000087',
      email,
      passwordHash: await hash(E2E_ADMIN.password, {
        type: 2,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      }),
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      adminProfile: {
        create: {
          displayName: 'Fictional Service Administrator',
          isSuperAdmin: true,
        },
      },
    },
  });
  await e2ePrisma.service.create({
    data: {
      id: serviceId,
      customerId: E2E_HISTORY_CUSTOMER.customerId,
      productId: E2E_PRODUCT.id,
      productPriceId: E2E_PRODUCT.priceId,
      serverId: E2E_SERVER.id,
      status: 'PROVISION_FAILED',
      domain,
      productNameSnapshot: 'Fictional historical service',
      productDescriptionSnapshot: '<b>Fictional description</b>',
      billingPeriod: 'MONTHLY',
      recurringAmount: 12000n,
      currency: 'BDT',
      startedAt: new Date('2026-10-03T20:00:00.000Z'),
      nextDueAt: new Date('2026-11-03T20:00:00.000Z'),
      provisioningFailureReason: '<b>Fictional provisioning failure</b>',
    },
  });
  await page.goto('/admin');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Business overview', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeHidden();
  const before = await snapshot();
  const writes: string[] = [];
  const detailReads: string[] = [];
  const panelRequests: { path: string; method: string }[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      writes.push(path);
    if (path === `/services/${serviceId}`) detailReads.push(path);
    if (path.startsWith('/hosting-panel/'))
      panelRequests.push({ path, method: request.method() });
  });
  await page.goto(
    `/admin/services?customerId=${E2E_HISTORY_CUSTOMER.customerId}`,
  );
  const trigger = page.getByRole('button', {
    name: `Review ${domain}`,
    exact: true,
  });
  const review = page.getByRole('region', {
    name: 'Service review',
    exact: true,
  });
  await expect(trigger).toBeVisible();
  // The existing sibling panel workspace reads stored operation history on mount;
  // that GET is not a provider call and must not be removed by this command.
  await expect(
    page.getByRole('heading', { name: 'Account tools', exact: true }),
  ).toBeVisible();
  const initialHistoryReads = panelRequests.length;
  expect(detailReads).toEqual([]);
  await expect(review).toHaveCount(0);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(
    review.getByRole('heading', { name: 'Service review', exact: true }),
  ).toBeFocused();
  await expect(
    review.getByRole('heading', { name: domain, exact: true }),
  ).toBeVisible();
  expect(detailReads.length).toBeGreaterThan(0);
  await expect(review).toContainText('PROVISION FAILED');
  await expect(review).toContainText('<b>Fictional provisioning failure</b>');
  await expect(review).toContainText('BDT 120.00');
  await expect(review).toContainText('4 Oct 2026, 02:00');
  await expect(review).toContainText('Dates shown in Asia/Dhaka');
  await expect(review).toContainText(
    'current profile, not a historical invoice snapshot',
  );
  await expect(review.locator('b, script, form, input')).toHaveCount(0);
  await expect(review.getByRole('link')).toHaveCount(1);
  const customer = review.getByRole('link', { name: 'View customer' });
  await expect(customer).toHaveAttribute(
    'href',
    `/admin/customers/${E2E_HISTORY_CUSTOMER.customerId}`,
  );
  expect(panelRequests).toHaveLength(initialHistoryReads);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await review.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await customer.click();
  await expect(
    page.getByRole('heading', { name: 'History Customer', exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(trigger).toBeVisible();
  if (!(await review.isVisible())) await trigger.click();
  await expect(
    review.getByRole('heading', { name: domain, exact: true }),
  ).toBeVisible();
  await review.getByRole('button', { name: 'Close service review' }).focus();
  await page.keyboard.press('Enter');
  await expect(review).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    review.getByRole('heading', { name: domain, exact: true }),
  ).toBeVisible();
  await review.getByRole('button', { name: 'Close service review' }).click();
  expect(writes).toEqual([]);
  expect(
    panelRequests.every(
      ({ path, method }) =>
        path === '/hosting-panel/operations' && method === 'GET',
    ),
  ).toBe(true);
  expect(await snapshot()).toEqual(before);
});

async function snapshot() {
  return {
    services: await e2ePrisma.service.findMany({ orderBy: { id: 'asc' } }),
    operations: await e2ePrisma.hostingPanelOperation.findMany({
      orderBy: { id: 'asc' },
    }),
    invoices: await e2ePrisma.invoice.findMany({ orderBy: { id: 'asc' } }),
    payments: await e2ePrisma.payment.findMany({ orderBy: { id: 'asc' } }),
    counts: await Promise.all([
      e2ePrisma.order.count(),
      e2ePrisma.invoiceItem.count(),
      e2ePrisma.paymentEvent.count(),
      e2ePrisma.activityLog.count(),
      e2ePrisma.outboxEvent.count(),
      e2ePrisma.setting.count(),
    ]),
  };
}

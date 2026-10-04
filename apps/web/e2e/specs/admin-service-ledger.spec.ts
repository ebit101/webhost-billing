import { expect, test } from '@playwright/test';
import { hash } from 'argon2';
import { createPrismaClient } from '@webhost-billing/database';
import { E2E_DATABASE_URL, E2E_SCHEMA } from '../environment';
import { E2E_ADMIN, E2E_HISTORY_CUSTOMER, E2E_PRODUCT } from '../fixtures';

// This journey owns its fixed fictional connection; URL schema alone does not
// isolate unqualified SQL. Do not change the shared browser/database boundary.
const reviewDatabaseUrl = new URL(E2E_DATABASE_URL);
reviewDatabaseUrl.searchParams.set('options', '-csearch_path=command26_e2e');
const e2ePrisma = createPrismaClient(reviewDatabaseUrl.toString());

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.afterAll(async () => e2ePrisma.$disconnect());
const serviceId = '87000000-0000-4000-8000-000000000000';
const domain = 'command87-ledger-0000.example.test';
test('administrator finds older services with URL filters and pagination without business mutations', async ({
  page,
}) => {
  const database = new URL(E2E_DATABASE_URL);
  if (
    E2E_SCHEMA !== 'command26_e2e' ||
    database.searchParams.get('schema') !== E2E_SCHEMA ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)
  )
    throw new Error(
      'Service inventory requires dedicated fictional loopback isolation.',
    );
  const schema = await e2ePrisma.$queryRawUnsafe<{ schema: string }[]>(
    'SELECT current_schema() AS schema',
  );
  if (schema[0]?.schema !== E2E_SCHEMA)
    throw new Error('Service inventory raw-SQL isolation is not verified.');
  await e2ePrisma.user.count();
  const email = 'command87-ledger-admin@example.test';
  await e2ePrisma.user.create({
    data: {
      id: '87000000-0000-4000-8000-000000000999',
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
          displayName: 'Fictional Inventory Administrator',
          isSuperAdmin: true,
        },
      },
    },
  });
  // Dedicated disabled fake server: history fixtures must not consume capacity
  // from the original lifecycle journey's active server.
  const server = await e2ePrisma.server.create({
    data: {
      id: '87000000-0000-4000-8000-000000000998',
      name: 'Command87 Historical Fake Server',
      hostname: 'command87-server.example.test',
      adapterKey: 'fake-panel',
      status: 'DISABLED',
      maxAccounts: 300,
    },
  });
  await e2ePrisma.service.createMany({
    data: Array.from({ length: 140 }, (_, index) => ({
      id: `87000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      customerId: E2E_HISTORY_CUSTOMER.customerId,
      productId: E2E_PRODUCT.id,
      productPriceId: E2E_PRODUCT.priceId,
      serverId: server.id,
      status: 'PROVISION_FAILED',
      domain: `command87-ledger-${String(index).padStart(4, '0')}.example.test`,
      productNameSnapshot: 'Command87 Historical Plan',
      productDescriptionSnapshot: 'Fictional older inventory record',
      externalAccountId: `command87-account-${index}`,
      billingPeriod: 'MONTHLY',
      recurringAmount: 12000n,
      currency: 'BDT',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      nextDueAt: new Date('2026-02-01T00:00:00.000Z'),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, Math.floor(index / 2))),
      provisioningFailureReason: 'Fictional retained application failure',
    })),
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
  const details: string[] = [];
  const panelRequests: { path: string; method: string }[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      writes.push(path);
    if (path === `/services/${serviceId}`) details.push(path);
    if (path.startsWith('/hosting-panel/'))
      panelRequests.push({ path, method: request.method() });
  });
  const scoped = `/admin/services?customerId=${E2E_HISTORY_CUSTOMER.customerId}`;
  await page.goto(scoped);
  const inventory = page.getByRole('region', {
    name: 'Hosting service inventory',
    exact: true,
  });
  const review = page.getByRole('region', {
    name: 'Service review',
    exact: true,
  });
  const trigger = inventory.getByRole('button', {
    name: `Review ${domain}`,
    exact: true,
  });
  await expect(inventory).toContainText('140 matching services');
  await expect(inventory).toContainText('Page 1 of 7');
  await expect(trigger).toHaveCount(0);
  expect(details).toEqual([]);
  await expect(
    page.getByRole('heading', { name: 'Account tools', exact: true }),
  ).toBeVisible();
  await page.getByLabel('WHM username').fill('unfinished-fictional-user');
  await page.getByLabel('Services per page').selectOption('100');
  await expect(inventory).toContainText('Page 1 of 2');
  await inventory.getByRole('button', { name: 'Next page' }).focus();
  await page.keyboard.press('Enter');
  await expect(inventory).toContainText('101–140');
  await expect(trigger).toBeVisible();
  await expect(
    inventory.getByRole('heading', { name: 'Service inventory', exact: true }),
  ).toBeFocused();
  await page.goBack();
  await expect(inventory).toContainText('Page 1 of 2');
  await expect(trigger).toHaveCount(0);
  await page.goForward();
  await expect(trigger).toBeVisible();
  await expect(page.getByLabel('WHM username')).toHaveValue(
    'unfinished-fictional-user',
  );
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(
    review.getByRole('heading', { name: domain, exact: true }),
  ).toBeVisible();
  await expect(
    review.getByRole('heading', { name: 'Service review', exact: true }),
  ).toBeFocused();
  await page.getByLabel('Service status').selectOption('PROVISION_FAILED');
  await expect(review).toHaveCount(0);
  await expect(inventory).toContainText('Page 1 of 2');
  await page
    .getByRole('searchbox', { name: 'Search services' })
    .fill('command87-account-0');
  await inventory.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(inventory).toContainText('1 matching services');
  await expect(trigger).toBeVisible();
  await expect(page).toHaveURL(/status=PROVISION_FAILED/);
  await expect(page).toHaveURL(/customerId=/);
  await page.reload();
  await expect(inventory).toContainText('1 matching services');
  await expect(
    inventory.getByRole('searchbox', { name: 'Search services' }),
  ).toHaveValue('command87-account-0');
  await page.setViewportSize({ width: 375, height: 812 });
  const filters = inventory.getByRole('form', { name: 'Service filters' });
  expect(
    await filters.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await trigger.click();
  await expect(
    review.getByRole('link', { name: 'View customer' }),
  ).toHaveAttribute(
    'href',
    `/admin/customers/${E2E_HISTORY_CUSTOMER.customerId}`,
  );
  await review.getByRole('link', { name: 'View customer' }).click();
  await expect(
    page.getByRole('heading', { name: 'History Customer', exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(inventory).toContainText('1 matching services');
  await inventory
    .getByRole('button', { name: 'Clear inventory filters' })
    .click();
  await expect(review).toHaveCount(0);
  await expect(inventory).toContainText('140 matching services');
  await expect(page).toHaveURL(/customerId=/);
  await expect(
    inventory.getByRole('searchbox', { name: 'Search services' }),
  ).toHaveValue('');
  await inventory.getByRole('button', { name: 'Clear customer scope' }).click();
  await expect(inventory).toContainText(
    'All customers (unfiltered customer scope).',
  );
  await expect(page).not.toHaveURL(/customerId=/);
  await page.goto(scoped + '&page=99');
  await expect(
    inventory.getByRole('heading', {
      name: 'This service page is out of range',
    }),
  ).toBeVisible();
  await inventory.getByRole('button', { name: 'Return to first page' }).click();
  await expect(inventory).toContainText('Page 1 of 7');
  await page.goto(scoped + '&page=0');
  await expect(
    inventory.getByRole('heading', { name: 'Invalid service filters' }),
  ).toBeVisible();
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
    audits: await e2ePrisma.activityLog.findMany({ orderBy: { id: 'asc' } }),
    outbox: await e2ePrisma.outboxEvent.findMany({ orderBy: { id: 'asc' } }),
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

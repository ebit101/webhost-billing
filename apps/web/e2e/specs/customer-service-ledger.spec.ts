import { expect, test } from '@playwright/test';
import { hash } from 'argon2';
import { createPrismaClient } from '@webhost-billing/database';
import { E2E_DATABASE_URL, E2E_SCHEMA } from '../environment';
import { assertBrowserDatabaseScope } from '../database-scope';
import { E2E_ADMIN, E2E_PRODUCT } from '../fixtures';

const databaseUrl = new URL(E2E_DATABASE_URL);
const prisma = createPrismaClient(databaseUrl.toString());
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.afterAll(async () => prisma.$disconnect());
const customerId = '90000000-0000-4000-8000-000000000998';
const serviceId = '90000000-0000-4000-8000-000000000000';
const domain = 'command90-service-0000.example.test';

test('customer searches and pages older owned services without business mutations', async ({
  page,
}) => {
  if (
    !/^command26_e2e_[a-f0-9]{32}$/.test(E2E_SCHEMA) ||
    databaseUrl.searchParams.get('schema') !== E2E_SCHEMA ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(databaseUrl.hostname)
  )
    throw new Error(
      'Service inventory requires dedicated fictional loopback isolation.',
    );
  await assertBrowserDatabaseScope(prisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const raw = await prisma.$queryRawUnsafe<{ schema: string }[]>(
    'SELECT current_schema() AS schema',
  );
  if (raw[0]?.schema !== E2E_SCHEMA)
    throw new Error('Service inventory raw-SQL isolation is not verified.');
  await prisma.user.count();
  const email = 'command90-history@example.test';
  const passwordHash = await hash(E2E_ADMIN.password, {
    type: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const otherCustomerId = '90000000-0000-4000-8000-000000000997';
  for (const [id, accountEmail] of [
    [customerId, email],
    [otherCustomerId, 'command90-other@example.test'],
  ]) {
    await prisma.user.create({
      data: {
        email: accountEmail,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            id,
            customerNumber: id === customerId ? 'CMD90-HISTORY' : 'CMD90-OTHER',
            firstName: 'Service',
            lastName: 'History',
            status: 'ACTIVE',
            addressLine1: '90 Fictional Avenue',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
  }
  // Disabled dedicated fake server keeps history outside original lifecycle capacity.
  const server = await prisma.server.create({
    data: {
      id: '90000000-0000-4000-8000-000000000996',
      name: 'Command90 Historical Fake Server',
      hostname: 'command90-server.example.test',
      adapterKey: 'fake-panel',
      status: 'DISABLED',
      maxAccounts: 300,
    },
  });
  await prisma.service.createMany({
    data: Array.from({ length: 143 }, (_, index) => ({
      id: '90000000-0000-4000-8000-' + String(index).padStart(12, '0'),
      customerId: index < 140 ? customerId : otherCustomerId,
      productId: E2E_PRODUCT.id,
      productPriceId: E2E_PRODUCT.priceId,
      serverId: server.id,
      status: index % 2 === 0 ? 'CANCELLED' : 'PROVISION_FAILED',
      domain:
        index === 2
          ? null
          : 'command90-service-' +
            String(index).padStart(4, '0') +
            '.example.test',
      productNameSnapshot: 'Command90 Historical Plan',
      productDescriptionSnapshot: 'Fictional retained application service',
      externalAccountId: 'command90-account-' + index,
      billingPeriod: 'MONTHLY',
      currency: 'BDT',
      recurringAmount: 25000n,
      startedAt: new Date('2026-03-01T00:00:00Z'),
      nextDueAt: new Date('2026-04-01T00:00:00Z'),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, Math.floor(index / 2))),
      cancellationReason:
        index % 2 === 0 ? 'Fictional history cancellation' : null,
      cancelledAt: index % 2 === 0 ? new Date('2026-03-02T00:00:00Z') : null,
      provisioningFailureReason:
        index % 2 ? 'Fictional retained application failure' : null,
    })),
  });
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome, Service', exact: true }),
  ).toBeVisible();
  const before = await snapshot();
  const writes: string[] = [];
  const reads: URL[] = [];
  const details: string[] = [];
  const panelRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      writes.push(url.pathname);
    if (url.pathname === '/services/my') reads.push(url);
    else if (url.pathname.startsWith('/services/')) details.push(url.pathname);
    if (url.pathname.startsWith('/hosting-panel/'))
      panelRequests.push(url.pathname);
  });
  await page.goto(
    '/portal/services?customerId=' +
      otherCustomerId +
      '&serverId=' +
      server.id +
      '&next=https://example.test',
  );
  const ledger = page.getByRole('region', {
    name: 'Your service inventory',
    exact: true,
  });
  const older = ledger
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: domain, exact: true }) });
  await expect(ledger).toContainText('140 matching services');
  await expect(ledger).toContainText('Page 1 of 7');
  await expect(older).toHaveCount(0);
  await ledger.getByLabel('Services per page').selectOption('100');
  await expect(ledger).toContainText('Page 1 of 2');
  await ledger.getByRole('button', { name: 'Next page' }).focus();
  await page.keyboard.press('Enter');
  await expect(ledger).toContainText('101–140');
  await expect(older).toBeVisible();
  await expect(
    ledger.getByRole('heading', { name: 'Service inventory', exact: true }),
  ).toBeFocused();
  await expect(ledger).toContainText('Domain unavailable');
  await expect(ledger).toContainText('Pending setup');
  expect(details).toEqual([]);
  await page.goBack();
  await expect(ledger).toContainText('Page 1 of 2');
  await expect(older).toHaveCount(0);
  await page.goForward();
  await expect(older).toBeVisible();
  await page.reload();
  await expect(older).toBeVisible();
  await expect(ledger).toContainText('Page 2 of 2');
  await ledger.getByLabel('Service status').selectOption('CANCELLED');
  await expect(ledger).toContainText('70 matching services');
  await expect(ledger).toContainText('Page 1 of 1');
  await ledger
    .getByLabel('Search services')
    .fill('COMMAND90-SERVICE-0000.EXAMPLE.TEST');
  await ledger.getByLabel('Search services').press('Enter');
  await expect(ledger).toContainText('1 matching services');
  await expect(older).toBeVisible();
  await expect(ledger).toContainText('BDT 250.00');
  await expect(ledger.getByRole('link')).toHaveCount(1);
  await expect(older).toHaveAttribute('href', '/portal/services/' + serviceId);
  await page.reload();
  await expect(ledger).toContainText('1 matching services');
  await expect(ledger.getByLabel('Search services')).toHaveValue(
    'COMMAND90-SERVICE-0000.EXAMPLE.TEST',
  );
  await page.goBack();
  await expect(ledger).toContainText('70 matching services');
  await page.goForward();
  await expect(ledger).toContainText('1 matching services');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await ledger
      .getByRole('form', { name: 'Customer service filters' })
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await expect(ledger.getByLabel('Search services')).toBeVisible();
  await ledger.getByRole('button', { name: 'Clear service filters' }).focus();
  await page.keyboard.press('Enter');
  await expect(ledger).toContainText('140 matching services');
  await expect(ledger).toContainText('Page 1 of 7');
  await expect(page).not.toHaveURL(/customerId=|serverId=|next=/);
  await ledger.getByLabel('Search services').fill('COMMAND90 HISTORICAL');
  await ledger.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(ledger).toContainText('140 matching services');
  await ledger.getByLabel('Search services').fill('not-found-command90');
  await ledger.getByLabel('Search services').press('Enter');
  await expect(
    ledger.getByRole('heading', { name: 'No matching services' }),
  ).toBeVisible();
  await page.goto('/portal/services?search=command90&page=99');
  await expect(
    ledger.getByRole('heading', { name: 'This service page is out of range' }),
  ).toBeVisible();
  await ledger.getByRole('button', { name: 'Return to first page' }).click();
  await expect(ledger).toContainText('Page 1 of 7');
  await ledger.getByLabel('Search services').fill(email.toUpperCase());
  await ledger.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(ledger).toContainText('140 matching services');
  await ledger.getByLabel('Search services').fill('COMMAND90-ACCOUNT-0');
  await ledger.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(ledger).toContainText('1 matching services');
  await expect(older).toBeVisible();
  expect(details).toEqual([]);
  await older.click();
  await expect(page).toHaveURL('/portal/services/' + serviceId);
  await expect(
    page.getByRole('heading', { name: domain, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: '← Back to services' }),
  ).toHaveAttribute('href', '/portal/services');
  // The unchanged detail effect runs twice under the existing dev Strict Mode.
  // Neither read occurs until the deliberate click, and both target that service.
  expect(details).toEqual(['/services/' + serviceId, '/services/' + serviceId]);
  expect(panelRequests).toEqual([]);
  await page.getByRole('link', { name: '← Back to services' }).click();
  await expect(ledger).toContainText('140 matching services');
  const requestCount = reads.length;
  await page.goto('/portal/services?page=0');
  await expect(
    ledger.getByRole('heading', { name: 'Invalid service filters' }),
  ).toBeVisible();
  expect(reads.length).toBe(requestCount);
  expect(
    reads.every((url) =>
      [...url.searchParams.keys()].every((key) =>
        ['search', 'status', 'page', 'pageSize'].includes(key),
      ),
    ),
  ).toBe(true);
  expect(panelRequests).toEqual([]);
  expect(writes).toEqual([]);
  expect(await snapshot()).toEqual(before);
});
async function snapshot() {
  return {
    orders: await prisma.order.findMany({ orderBy: { id: 'asc' } }),
    items: await prisma.orderItem.findMany({ orderBy: { id: 'asc' } }),
    invoices: await prisma.invoice.findMany({ orderBy: { id: 'asc' } }),
    invoiceItems: await prisma.invoiceItem.findMany({ orderBy: { id: 'asc' } }),
    payments: await prisma.payment.findMany({ orderBy: { id: 'asc' } }),
    paymentEvents: await prisma.paymentEvent.findMany({
      orderBy: { id: 'asc' },
    }),
    services: await prisma.service.findMany({ orderBy: { id: 'asc' } }),
    operations: await prisma.hostingPanelOperation.findMany({
      orderBy: { id: 'asc' },
    }),
    audits: await prisma.activityLog.findMany({ orderBy: { id: 'asc' } }),
    outbox: await prisma.outboxEvent.findMany({ orderBy: { id: 'asc' } }),
  };
}

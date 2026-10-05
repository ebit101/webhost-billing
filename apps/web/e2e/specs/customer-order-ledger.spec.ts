import { expect, test } from '@playwright/test';
import { hash } from 'argon2';
import { createPrismaClient } from '@webhost-billing/database';
import { E2E_DATABASE_URL, E2E_SCHEMA } from '../environment';
import { E2E_ADMIN, E2E_PRODUCT } from '../fixtures';

const databaseUrl = new URL(E2E_DATABASE_URL);
databaseUrl.searchParams.set('options', '-csearch_path=command26_e2e');
const prisma = createPrismaClient(databaseUrl.toString());
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.afterAll(async () => prisma.$disconnect());
const customerId = '89000000-0000-4000-8000-000000000998';
const orderNumber = 'ORD-CMD89-0000';

test('customer searches and pages older owned orders without business mutations', async ({
  page,
}) => {
  if (
    E2E_SCHEMA !== 'command26_e2e' ||
    databaseUrl.searchParams.get('schema') !== E2E_SCHEMA ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(databaseUrl.hostname)
  )
    throw new Error(
      'Order ledger requires dedicated fictional loopback isolation.',
    );
  const raw = await prisma.$queryRawUnsafe<{ schema: string }[]>(
    'SELECT current_schema() AS schema',
  );
  if (raw[0]?.schema !== E2E_SCHEMA)
    throw new Error('Order ledger raw-SQL isolation is not verified.');
  await prisma.user.count();
  const email = 'command89-history@example.test';
  const passwordHash = await hash(E2E_ADMIN.password, {
    type: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const otherCustomerId = '89000000-0000-4000-8000-000000000997';
  for (const [id, accountEmail] of [
    [customerId, email],
    [otherCustomerId, 'command89-other@example.test'],
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
            customerNumber: id === customerId ? 'CMD89-HISTORY' : 'CMD89-OTHER',
            firstName: 'Order',
            lastName: 'History',
            status: 'ACTIVE',
            addressLine1: '89 Fictional Avenue',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
  }
  const template = await prisma.invoice.findFirstOrThrow();
  for (let index = 0; index < 143; index++) {
    const id = `89000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    await prisma.order.create({
      data: {
        id,
        customerId: index < 140 ? customerId : otherCustomerId,
        orderNumber: `ORD-CMD89-${String(index).padStart(4, '0')}`,
        submissionKey: `command89-browser-${index}`,
        status: index % 2 === 0 ? 'CANCELLED' : 'REJECTED',
        currency: 'BDT',
        subtotal: 24000n,
        setupTotal: 1000n,
        total: 25000n,
        customerEmailSnapshot: 'command89-historical@example.test',
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, Math.floor(index / 2))),
        placedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 140 - index)),
        items: {
          create: [0, 1].map((position) => ({
            productId: E2E_PRODUCT.id,
            productPriceId: E2E_PRODUCT.priceId,
            productNameSnapshot: `Command89 Historical Plan ${position + 1}`,
            descriptionSnapshot: 'Fictional historical order item',
            billingPeriod: 'MONTHLY',
            currency: 'BDT',
            unitAmount: 12000n,
            setupFee: 500n,
            lineTotal: 12500n,
            requestedDomain: `command89-item-${position}-${index}.example.test`,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, position)),
          })),
        },
        invoices: {
          create: {
            id: `89000000-0000-4000-8001-${String(index).padStart(12, '0')}`,
            customerId: index < 140 ? customerId : otherCustomerId,
            invoiceNumber: `INV-CMD89-${index}`,
            submissionKey: `command89-browser-invoice-${index}`,
            status: 'CANCELLED',
            currency: 'BDT',
            subtotal: 25000n,
            total: 25000n,
            balanceDue: 25000n,
            customerNameSnapshot: 'Order History',
            customerEmailSnapshot: 'command89-historical@example.test',
            customerAddressSnapshot: template.customerAddressSnapshot!,
            businessIdentitySnapshot: template.businessIdentitySnapshot!,
            dueAt: new Date('2026-02-01T00:00:00Z'),
            items: {
              create: {
                linePosition: 1,
                descriptionSnapshot: 'Fictional historical hosting',
                currency: 'BDT',
                unitAmount: 25000n,
                lineTotal: 25000n,
              },
            },
          },
        },
      },
    });
  }
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome, Order', exact: true }),
  ).toBeVisible();
  const before = await snapshot();
  const writes: string[] = [];
  const reads: URL[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      writes.push(url.pathname);
    if (url.pathname === '/orders/my') reads.push(url);
  });
  await page.goto(
    '/portal/orders?customerId=' +
      otherCustomerId +
      '&next=https://example.test',
  );
  const ledger = page.getByRole('region', {
    name: 'Your order history',
    exact: true,
  });
  const older = ledger.getByText(orderNumber, { exact: true });
  await expect(ledger).toContainText('140 matching orders');
  await expect(ledger).toContainText('Page 1 of 7');
  await expect(older).toHaveCount(0);
  await ledger.getByLabel('Orders per page').selectOption('100');
  await expect(ledger).toContainText('Page 1 of 2');
  await ledger.getByRole('button', { name: 'Next page' }).focus();
  await page.keyboard.press('Enter');
  await expect(ledger).toContainText('101–140');
  await expect(older).toBeVisible();
  await expect(
    ledger.getByRole('heading', { name: 'Order history', exact: true }),
  ).toBeFocused();
  await expect(ledger).toContainText('First item shown · 1 additional items');
  await page.goBack();
  await expect(ledger).toContainText('Page 1 of 2');
  await expect(older).toHaveCount(0);
  await page.goForward();
  await expect(older).toBeVisible();
  await page.reload();
  await expect(older).toBeVisible();
  await expect(ledger).toContainText('Page 2 of 2');
  await ledger.getByLabel('Order status').selectOption('CANCELLED');
  await expect(ledger).toContainText('70 matching orders');
  await expect(ledger).toContainText('Page 1 of 1');
  await ledger
    .getByLabel('Search orders')
    .fill('COMMAND89-ITEM-1-0.EXAMPLE.TEST');
  await ledger.getByLabel('Search orders').press('Enter');
  await expect(ledger).toContainText('1 matching orders');
  await expect(older).toBeVisible();
  await expect(ledger).toContainText('INV-CMD89-0');
  await expect(ledger).toContainText('BDT 250.00');
  await expect(ledger.getByRole('link')).toHaveCount(0);
  await page.reload();
  await expect(ledger).toContainText('1 matching orders');
  await expect(ledger.getByLabel('Search orders')).toHaveValue(
    'COMMAND89-ITEM-1-0.EXAMPLE.TEST',
  );
  await page.goBack();
  await expect(ledger).toContainText('70 matching orders');
  await page.goForward();
  await expect(ledger).toContainText('1 matching orders');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await ledger
      .getByRole('form', { name: 'Customer order filters' })
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await expect(ledger.getByLabel('Search orders')).toBeVisible();
  await ledger.getByRole('button', { name: 'Clear order filters' }).focus();
  await page.keyboard.press('Enter');
  await expect(ledger).toContainText('140 matching orders');
  await expect(ledger).toContainText('Page 1 of 7');
  await expect(page).not.toHaveURL(/customerId=|next=/);
  await ledger.getByLabel('Search orders').fill('COMMAND89-HISTORICAL');
  await ledger.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(ledger).toContainText('140 matching orders');
  await ledger.getByLabel('Search orders').fill('not-found-command89');
  await ledger.getByLabel('Search orders').press('Enter');
  await expect(
    ledger.getByRole('heading', { name: 'No matching orders' }),
  ).toBeVisible();
  await page.goto('/portal/orders?search=ORD-CMD89&page=99');
  await expect(
    ledger.getByRole('heading', { name: 'This order page is out of range' }),
  ).toBeVisible();
  await ledger.getByRole('button', { name: 'Return to first page' }).click();
  await expect(ledger).toContainText('Page 1 of 7');
  const requestCount = reads.length;
  await page.goto('/portal/orders?page=0');
  await expect(
    ledger.getByRole('heading', { name: 'Invalid order filters' }),
  ).toBeVisible();
  expect(reads.length).toBe(requestCount);
  expect(
    reads.every((url) =>
      [...url.searchParams.keys()].every((key) =>
        ['search', 'status', 'page', 'pageSize'].includes(key),
      ),
    ),
  ).toBe(true);
  await expect(
    page.getByRole('link', { name: 'New order', exact: true }),
  ).toHaveAttribute('href', '/portal/checkout');
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

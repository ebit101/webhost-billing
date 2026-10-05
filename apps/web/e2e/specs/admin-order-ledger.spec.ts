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
const customerId = '88000000-0000-4000-8000-000000000998';
const oldestId = '88000000-0000-4000-8000-000000000000';
const invoiceId = '88000000-0000-4000-8001-000000000000';
const orderNumber = 'ORD-CMD88-0000';

test('administrator finds older orders and reviews all items without business mutations', async ({
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
  const email = 'command88-ledger-admin@example.test';
  const passwordHash = await hash(E2E_ADMIN.password, {
    type: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      adminProfile: {
        create: {
          displayName: 'Fictional Order Ledger Administrator',
          isSuperAdmin: true,
        },
      },
    },
  });
  await prisma.user.create({
    data: {
      email: 'command88-current@example.test',
      passwordHash,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      customer: {
        create: {
          id: customerId,
          customerNumber: 'CMD88-HISTORY',
          firstName: 'Order',
          lastName: 'History',
          status: 'ACTIVE',
          addressLine1: '88 Fictional Avenue',
          city: 'Dhaka',
          countryCode: 'BD',
        },
      },
    },
  });
  const template = await prisma.invoice.findFirstOrThrow();
  for (let index = 0; index < 140; index++) {
    const id = `88000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    await prisma.order.create({
      data: {
        id,
        customerId,
        orderNumber: `ORD-CMD88-${String(index).padStart(4, '0')}`,
        submissionKey: `command88-browser-${index}`,
        status: index % 2 === 0 ? 'CANCELLED' : 'REJECTED',
        currency: 'BDT',
        subtotal: 24000n,
        setupTotal: 1000n,
        total: 25000n,
        customerEmailSnapshot: 'command88-historical@example.test',
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, Math.floor(index / 2))),
        placedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 140 - index)),
        items: {
          create: [0, 1].map((position) => ({
            productId: E2E_PRODUCT.id,
            productPriceId: E2E_PRODUCT.priceId,
            productNameSnapshot: `Command88 Historical Plan ${position + 1}`,
            descriptionSnapshot: 'Fictional historical order item',
            billingPeriod: 'MONTHLY',
            currency: 'BDT',
            unitAmount: 12000n,
            setupFee: 500n,
            lineTotal: 12500n,
            requestedDomain: `command88-item-${position}-${index}.example.test`,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, position)),
          })),
        },
        invoices: {
          create: {
            id: `88000000-0000-4000-8001-${String(index).padStart(12, '0')}`,
            customerId,
            invoiceNumber: `INV-CMD88-${index}`,
            submissionKey: `command88-browser-invoice-${index}`,
            status: 'CANCELLED',
            currency: 'BDT',
            subtotal: 25000n,
            total: 25000n,
            balanceDue: 25000n,
            customerNameSnapshot: 'Order History',
            customerEmailSnapshot: 'command88-historical@example.test',
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
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      writes.push(path);
    if (path === `/orders/${oldestId}`) details.push(path);
  });
  const scoped = `/admin/orders?customerId=${customerId}`;
  await page.goto(scoped);
  const ledger = page.getByRole('region', {
    name: 'Hosting order ledger',
    exact: true,
  });
  const review = page.getByRole('region', {
    name: 'Order review',
    exact: true,
  });
  const trigger = ledger.getByRole('button', {
    name: `Review order ${orderNumber}`,
    exact: true,
  });
  await expect(ledger).toContainText('140 matching orders');
  await expect(ledger).toContainText('Page 1 of 7');
  await expect(trigger).toHaveCount(0);
  expect(details).toEqual([]);
  const creationCustomer = page.getByRole('combobox', { name: /^Customer\b/ });
  const creationPrice = page.getByRole('combobox', { name: /^Price\b/ });
  await expect(creationCustomer).toHaveCount(1);
  await expect(creationPrice).toHaveCount(1);
  await creationCustomer.selectOption(customerId);
  await page
    .getByRole('combobox', { name: /^Product\b/ })
    .selectOption(E2E_PRODUCT.id);
  await creationPrice.selectOption(E2E_PRODUCT.priceId);
  await page
    .getByLabel('Requested domain', { exact: true })
    .fill('unfinished-command88.example.test');
  await page
    .getByLabel('Internal note', { exact: true })
    .fill('Retain fictional draft');
  await ledger.getByLabel('Orders per page').selectOption('100');
  await expect(ledger).toContainText('Page 1 of 2');
  await ledger.getByRole('button', { name: 'Next page' }).focus();
  await page.keyboard.press('Enter');
  await expect(ledger).toContainText('101–140');
  await expect(trigger).toBeVisible();
  await expect(
    ledger.getByRole('heading', { name: 'Order ledger', exact: true }),
  ).toBeFocused();
  await page.goBack();
  await expect(ledger).toContainText('Page 1 of 2');
  await expect(trigger).toHaveCount(0);
  await page.goForward();
  await expect(trigger).toBeVisible();
  await expect(
    page.getByLabel('Requested domain', { exact: true }),
  ).toHaveValue('unfinished-command88.example.test');
  await expect(creationPrice).toHaveValue(E2E_PRODUCT.priceId);
  await expect(creationCustomer).toHaveValue(customerId);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(
    review.getByRole('heading', { name: orderNumber, exact: true }),
  ).toBeVisible();
  await expect(
    review.getByRole('heading', { name: 'Order review', exact: true }),
  ).toBeFocused();
  for (const index of [1, 2]) {
    const item = review.getByRole('article', { name: `Order item ${index}` });
    await expect(item).toContainText(`Command88 Historical Plan ${index}`);
    await expect(item).toContainText(
      `command88-item-${index - 1}-0.example.test`,
    );
  }
  await expect(review).toContainText('Dates shown in Asia/Dhaka');
  await expect(review).toContainText('command88-historical@example.test');
  await ledger.getByLabel('Order status').selectOption('CANCELLED');
  await expect(review).toHaveCount(0);
  await expect(ledger).toContainText('70 matching orders');
  await expect(ledger).toContainText('Page 1 of 1');
  await ledger
    .getByLabel('Search orders')
    .fill('COMMAND88-ITEM-1-0.EXAMPLE.TEST');
  await ledger.getByLabel('Search orders').press('Enter');
  await expect(ledger).toContainText('1 matching orders');
  await page.reload();
  await expect(ledger).toContainText('1 matching orders');
  await expect(ledger.getByLabel('Search orders')).toHaveValue(
    'COMMAND88-ITEM-1-0.EXAMPLE.TEST',
  );
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await ledger
      .getByRole('form', { name: 'Order filters' })
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await trigger.click();
  await expect(
    review.getByRole('heading', { name: orderNumber, exact: true }),
  ).toBeVisible();
  await review.getByRole('button', { name: 'Close order review' }).focus();
  await page.keyboard.press('Enter');
  await expect(review).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    review.getByRole('link', { name: 'View customer' }),
  ).toHaveAttribute('href', `/admin/customers/${customerId}`);
  await review.getByRole('link', { name: 'View customer' }).click();
  await expect(
    page.getByRole('heading', { name: 'Order History', exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(ledger).toContainText('1 matching orders');
  await trigger.click();
  await expect(
    review.getByRole('link', { name: 'View invoice' }),
  ).toHaveAttribute('href', `/admin/invoices/${invoiceId}`);
  await review.getByRole('link', { name: 'View invoice' }).click();
  await expect(
    page.getByRole('heading', { name: 'INV-CMD88-0', exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(ledger).toContainText('1 matching orders');
  await ledger.getByRole('button', { name: 'Clear ledger filters' }).click();
  await expect(ledger).toContainText('140 matching orders');
  await expect(page).toHaveURL(/customerId=/);
  await ledger.getByRole('button', { name: 'Clear customer scope' }).click();
  await expect(ledger).toContainText(
    'All customers (unfiltered customer scope).',
  );
  await expect(page).not.toHaveURL(/customerId=/);
  await page.goto(scoped + '&page=99');
  await expect(
    ledger.getByRole('heading', { name: 'This order page is out of range' }),
  ).toBeVisible();
  await ledger.getByRole('button', { name: 'Return to first page' }).click();
  await expect(ledger).toContainText('Page 1 of 7');
  await page.goto(scoped + '&page=0');
  await expect(
    ledger.getByRole('heading', { name: 'Invalid order filters' }),
  ).toBeVisible();
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

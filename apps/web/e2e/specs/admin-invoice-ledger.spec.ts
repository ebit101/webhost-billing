import { expect, test } from '@playwright/test';
import { hash } from 'argon2';
import { e2ePrisma } from '../database';
import { E2E_DATABASE_URL, E2E_SCHEMA } from '../environment';
import {
  E2E_ADMIN,
  E2E_HISTORY_CUSTOMER,
  E2E_HEALTHY_CUSTOMER,
} from '../fixtures';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.afterAll(async () => e2ePrisma.$disconnect());

test('administrator searches older invoices with URL context without business mutations', async ({
  page,
}) => {
  const database = new URL(E2E_DATABASE_URL);
  if (
    E2E_SCHEMA !== 'command26_e2e' ||
    database.searchParams.get('schema') !== E2E_SCHEMA ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)
  )
    throw new Error(
      'Invoice ledger evidence requires the dedicated loopback fictional schema.',
    );
  // The original lifecycle uses four logins and payment review uses the fifth.
  // Isolate this new journey rather than increase the account's five-attempt limit.
  const ledgerEmail = 'command85-ledger-admin@example.test';
  await e2ePrisma.user.create({
    data: {
      id: '85000000-0000-4000-8000-000000000085',
      email: ledgerEmail,
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
          displayName: 'Fictional Ledger Administrator',
          isSuperAdmin: true,
        },
      },
    },
  });
  await page.goto('/admin');
  await page.getByLabel('Email address').fill(ledgerEmail);
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
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      writes.push(path);
    if (/^\/invoices\/[0-9a-f-]{36}(?:\/pdf)?$/.test(path))
      detailReads.push(path);
  });
  const ledger = page.getByRole('region', {
    name: 'Administrator invoice ledger',
  });
  const customerId = E2E_HISTORY_CUSTOMER.customerId;
  await page.goto(
    `/admin/invoices?customerId=${customerId}&page=6&pageSize=20`,
  );
  await expect(ledger).toContainText(
    '105 matching invoices · 101–105 · Page 6 of 6',
  );
  const oldest = ledger.getByRole('link', {
    name: E2E_HISTORY_CUSTOMER.oldestInvoiceNumber,
  });
  await expect(oldest).toHaveAttribute(
    'href',
    `/admin/invoices/${E2E_HISTORY_CUSTOMER.oldestInvoiceId}`,
  );
  expect(detailReads).toEqual([]);
  await page.getByLabel('Description 1').fill('Unsaved fictional draft');
  await page.getByLabel('Business name').fill('Unsaved fictional identity');
  await ledger.getByRole('button', { name: 'Previous page' }).click();
  await expect(ledger).toContainText('Page 5 of 6');
  await expect(page.getByLabel('Description 1')).toHaveValue(
    'Unsaved fictional draft',
  );
  await expect(page.getByLabel('Business name')).toHaveValue(
    'Unsaved fictional identity',
  );
  await page.goBack();
  await expect(ledger).toContainText('Page 6 of 6');
  await expect(page.getByLabel('Description 1')).toHaveValue(
    'Unsaved fictional draft',
  );
  await ledger.getByLabel('Search invoices').fill('Historical hosting');
  await expect(ledger).toContainText('Applied search: none');
  await ledger.getByLabel('Search invoices').press('Enter');
  await expect(ledger).toContainText(
    '105 matching invoices · 1–20 · Page 1 of 6',
  );
  await ledger.getByLabel('Invoice status').selectOption('UNPAID');
  await expect(ledger).toContainText(
    '53 matching invoices · 1–20 · Page 1 of 3',
  );
  const combined = new URL(page.url()).searchParams;
  expect(combined.get('customerId')).toBe(customerId);
  expect(combined.get('status')).toBe('UNPAID');
  expect(combined.get('search')).toBe('Historical hosting');
  expect(combined.get('page')).toBe('1');
  await page.goBack();
  await expect(ledger).toContainText('105 matching invoices');
  await expect(ledger.getByLabel('Invoice status')).toHaveValue('');
  await page.goForward();
  await expect(ledger).toContainText('53 matching invoices');
  await expect(ledger.getByLabel('Invoice status')).toHaveValue('UNPAID');
  await page.reload();
  await expect(ledger).toContainText('53 matching invoices');
  await expect(ledger.getByLabel('Search invoices')).toHaveValue(
    'Historical hosting',
  );
  await ledger.getByLabel('Invoices per page').selectOption('100');
  await expect(ledger).toContainText(
    '53 matching invoices · 1–53 · Page 1 of 1',
  );
  await page.setViewportSize({ width: 375, height: 812 });
  const filters = ledger.getByRole('form', { name: 'Invoice filters' });
  expect(
    await filters.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  const clear = ledger.getByRole('button', { name: 'Clear ledger filters' });
  await clear.focus();
  await page.keyboard.press('Enter');
  await expect(ledger).toContainText(
    '105 matching invoices · 1–20 · Page 1 of 6',
  );
  expect(new URL(page.url()).searchParams.get('customerId')).toBe(customerId);
  await expect(
    page.getByRole('link', { name: 'Clear customer filter' }),
  ).toHaveAttribute('href', '/admin/invoices?page=1&pageSize=20');
  await ledger.getByRole('button', { name: 'Clear customer scope' }).click();
  await expect(ledger).toContainText('106 matching invoices');
  await expect(ledger).toContainText(
    'All customers (unfiltered customer scope)',
  );
  expect(new URL(page.url()).searchParams.has('customerId')).toBe(false);
  await expect(
    ledger.getByRole('link', { name: E2E_HEALTHY_CUSTOMER.invoiceNumber }),
  ).toBeVisible();
  await page.goBack();
  await expect(ledger).toContainText('105 matching invoices');
  await ledger
    .getByLabel('Search invoices')
    .fill(E2E_HISTORY_CUSTOMER.oldestInvoiceNumber);
  await ledger.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(ledger).toContainText('1 matching invoices · 1–1 · Page 1 of 1');
  expect(detailReads).toEqual([]);
  await oldest.click();
  await expect(
    page.getByRole('heading', {
      name: E2E_HISTORY_CUSTOMER.oldestInvoiceNumber,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/admin/invoices/${E2E_HISTORY_CUSTOMER.oldestInvoiceId}$`),
  );
  await page.goBack();
  await expect(ledger).toContainText('1 matching invoices');
  expect(writes).toEqual([]);
  expect(await snapshot()).toEqual(before);
});

async function snapshot() {
  return {
    invoices: await e2ePrisma.invoice.findMany({ orderBy: { id: 'asc' } }),
    payments: await e2ePrisma.payment.findMany({ orderBy: { id: 'asc' } }),
    counts: await Promise.all([
      e2ePrisma.order.count(),
      e2ePrisma.invoice.count(),
      e2ePrisma.invoiceItem.count(),
      e2ePrisma.payment.count(),
      e2ePrisma.paymentEvent.count(),
      e2ePrisma.service.count(),
      e2ePrisma.hostingPanelOperation.count(),
      e2ePrisma.outboxEvent.count(),
      e2ePrisma.activityLog.count(),
      e2ePrisma.setting.count(),
    ]),
  };
}

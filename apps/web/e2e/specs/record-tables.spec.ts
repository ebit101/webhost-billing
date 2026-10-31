import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expectRecordPageFits } from '../assert-record-layout';
import { expect, test } from '@playwright/test';
import { parseApiEnvironment } from '@webhost-billing/config';
import { CpanelCredentialCipher } from '../../../api/dist/modules/hosting-panels/cpanel-credential-cipher';
import { TotpService } from '../../../api/dist/modules/auth/services/totp.service';
import { e2ePrisma } from '../database';
import { assertBrowserDatabaseScope } from '../database-scope';
import {
  E2E_DATABASE_URL,
  E2E_SCHEMA,
  E2E_WEB_ORIGIN,
  e2eApiEnvironment,
} from '../environment';
import { E2E_PRODUCT, E2E_SERVER } from '../fixtures';

// Session material belongs only to the owned fictional database/browser context.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.afterAll(async () => e2ePrisma.$disconnect());

test('record lists use tables, retain drafts and isolate nested dialogs on desktop and mobile', async ({
  page,
  context,
}) => {
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  for (const flag of [
    'BKASH_ENABLED',
    'SSLCOMMERZ_ENABLED',
    'RESELLBIZ_LIVE_ENABLED',
  ])
    expect(e2eApiEnvironment[flag]).toBe('false');
  const now = new Date();
  const totp = new TotpService(
    parseApiEnvironment({ ...e2eApiEnvironment, PORT: '3201' }),
  );
  const admin = await e2ePrisma.user.create({
    data: {
      email: 'command134-record-admin@example.test',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: now,
      adminProfile: {
        create: {
          displayName: 'Fictional records administrator',
          staffRole: 'FULL_ADMINISTRATOR',
        },
      },
      adminTotpCredential: {
        create: {
          secretCiphertext: totp.encryptSecret(totp.generateSecret()),
          keyVersion: 'mfa-v1',
          createdAt: now,
          enabledAt: now,
        },
      },
    },
  });
  const token = randomBytes(32).toString('hex');
  await e2ePrisma.authSession.create({
    data: {
      userId: admin.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      createdAt: now,
      expiresAt: new Date(Date.now() + 3600000),
      twoFactorVerifiedAt: now,
    },
  });
  await context.addCookies([
    {
      name: 'webhost_session',
      value: token,
      url: E2E_WEB_ORIGIN,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  let customerId = '';
  let customerUserId = '';
  for (let index = 1; index <= 25; index++) {
    const number = String(index).padStart(2, '0');
    const user = await e2ePrisma.user.create({
      data: {
        email: 'command134-client-' + number + '@example.test',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerifiedAt: now,
        customer: {
          create: {
            customerNumber: 'C134-' + number,
            firstName: 'Fictional',
            lastName: 'Client ' + number,
            companyName: 'Command 134 sample company ' + number,
            addressLine1: '134 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
    customerId = user.customer!.id;
    customerUserId = user.id;
  }
  const whmId = randomUUID();
  const whmCipher = new CpanelCredentialCipher(
    parseApiEnvironment({ ...e2eApiEnvironment, PORT: '3201' }),
  );
  await e2ePrisma.server.create({
    data: {
      id: whmId,
      apiUsername: 'fictional',
      credentialsCiphertext: whmCipher.encrypt(
        whmId,
        'Command134-fictional-token-only-123456',
      ),
      credentialKeyVersion: whmCipher.keyVersion,
      name: 'Command 134 disabled WHM',
      hostname: 'command134-whm.example.test',
      status: 'DISABLED',
      adapterKey: 'cpanel-whm',
    },
  });
  await e2ePrisma.service.create({
    data: {
      customerId,
      productId: E2E_PRODUCT.id,
      productPriceId: E2E_PRODUCT.priceId,
      serverId: E2E_SERVER.id,
      status: 'PENDING',
      domain: 'command134.example.test',
      productNameSnapshot: 'Fictional table plan',
      billingPeriod: 'MONTHLY',
      recurringAmount: 12000n,
      currency: 'BDT',
      startedAt: now,
      nextDueAt: new Date(Date.now() + 30 * 86400000),
    },
  });
  await e2ePrisma.ticket.create({
    data: {
      ticketNumber: 'TKT-C134-' + randomUUID().slice(0, 8),
      customerId,
      subject: 'Fictional tabular support request',
      lastReplyAt: now,
      messages: {
        create: {
          authorUserId: customerUserId,
          kind: 'CUSTOMER',
          body: 'Fictional initial support message for the table preview.',
        },
      },
      status: 'OPEN',
      priority: 'NORMAL',
    },
  });
  const snapshot = () =>
    Promise.all([
      e2ePrisma.order.count(),
      e2ePrisma.invoice.count(),
      e2ePrisma.payment.count(),
      e2ePrisma.service.count(),
      e2ePrisma.hostingPanelOperation.count(),
      e2ePrisma.activityLog.count(),
    ]);
  const before = await snapshot();
  const writes: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      writes.push(new URL(request.url()).pathname);
  });
  const output = resolve('../../release-artifacts/command134-record-tables');
  await mkdir(output, { recursive: true });
  await page.goto('/admin/customers');
  await page.getByLabel('Search customers').fill('Command 134 sample');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(
    page.getByText('25 records found', { exact: false }),
  ).toBeVisible();
  const table = page.getByRole('table', { name: 'Customers', exact: true });
  for (const column of [
    'Number',
    'First name',
    'Last name',
    'Company name',
    'Email address',
    'Created',
    'Status',
  ])
    await expect(
      table.getByRole('columnheader', { name: column, exact: true }),
    ).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByText('Showing 21 to 25', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(20);
  for (const width of [1920, 1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await expectRecordPageFits(page, 'records-' + width);
    const accessibility = await new AxeBuilder({ page })
      .include('main')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      document
        .querySelectorAll<HTMLElement>('main [role="group"][tabindex="0"]')
        .forEach((element) => {
          element.scrollLeft = 0;
        });
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
    await page.screenshot({
      path: resolve(output, 'customers-' + width + '.png'),
      fullPage: true,
      animations: 'disabled',
    });
  }
  const create = page.getByRole('button', {
    name: 'Add customer',
    exact: true,
  });
  await create.click();
  const dialog = page.getByRole('dialog', {
    name: 'Create customer',
    exact: true,
  });
  await dialog
    .getByLabel('Email', { exact: true })
    .fill('unsaved@example.test');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(create).toBeFocused();
  await create.click();
  await expect(dialog.getByLabel('Email', { exact: true })).toHaveValue(
    'unsaved@example.test',
  );
  await page.keyboard.press('Escape');
  for (const [path, caption] of [
    ['/admin/products', 'Ungrouped products'],
    ['/admin/invoices', 'Administrator invoice ledger'],
    ['/admin/services', 'Hosting service inventory'],
    ['/admin/servers', 'WHM servers'],
    ['/admin/domains', 'Domain inventory'],
    ['/admin/support', 'Filtered support tickets'],
    ['/admin/staff', 'Administrator accounts'],
    ['/admin/settings/registrars', 'Registrar connections'],
    ['/admin/domain-pricing', ''],
  ]) {
    await page.goto(path!);
    await expect(
      caption
        ? page.getByRole('table', { name: caption, exact: true })
        : page.getByRole('table'),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expectRecordPageFits(page, path!.replaceAll('/', '-'));
  }
  await page.goto('/admin/products');
  await page
    .getByRole('button', { name: 'Manage groups', exact: true })
    .click();
  const groups = page.getByRole('dialog', {
    name: 'Product groups',
    exact: true,
  });
  await groups
    .getByRole('button', { name: 'Create group', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Create group', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(groups).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(await snapshot()).toEqual(before);
});

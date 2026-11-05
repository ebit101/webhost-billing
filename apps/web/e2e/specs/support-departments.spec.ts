import { createHash, randomBytes } from 'node:crypto';
import { parseApiEnvironment } from '@webhost-billing/config';
import { TotpService } from '../../../api/dist/modules/auth/services/totp.service';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { e2ePrisma } from '../database';
import { assertBrowserDatabaseScope } from '../database-scope';
import {
  E2E_API_ORIGIN,
  E2E_DATABASE_URL,
  E2E_SCHEMA,
  E2E_WEB_ORIGIN,
  e2eApiEnvironment,
} from '../environment';
import { E2E_HEALTHY_CUSTOMER } from '../fixtures';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.afterAll(async () => e2ePrisma.$disconnect());

test('customer chooses a department and full administrator routes the retained conversation', async ({
  page,
  browser,
}) => {
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) =>
    console.error('Fictional browser page error:', error.message),
  );
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const now = new Date();
  const totp = new TotpService(
    parseApiEnvironment({ ...e2eApiEnvironment, PORT: '3201' }),
  );
  const administrator = await e2ePrisma.user.create({
    data: {
      email: 'command216-admin@example.test',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: now,
      adminProfile: {
        create: {
          displayName: 'Fictional department administrator',
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
      userId: administrator.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      createdAt: now,
      expiresAt: new Date(Date.now() + 3600000),
      twoFactorVerifiedAt: now,
    },
  });
  await page.context().addCookies([
    {
      name: 'webhost_session',
      value: token,
      url: E2E_WEB_ORIGIN,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const setupResponse = page.waitForResponse(
    (response) => response.url().endsWith('/tickets/setup-options'),
    { timeout: 30000 },
  );
  await page.goto('/admin/support');
  const response = await setupResponse;
  expect(response.status()).toBe(200);
  expect(
    ((await response.json()) as { data: { canManageDepartments: boolean } })
      .data.canManageDepartments,
  ).toBe(true);
  await expect(
    page.getByRole('heading', { name: 'Support queue', exact: true }),
  ).toBeVisible();
  await page.getByText('Manage departments', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Add department', exact: true })
    .click();
  await page
    .getByLabel('Department name', { exact: true })
    .fill('Fictional migration support');
  await page.getByLabel('Restrict staff access to selected members').check();
  await page
    .getByLabel('Support reason', { exact: true })
    .fill('Fictional department acceptance');
  await page
    .getByRole('button', { name: 'Save department', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Department saved.');
  const department = await e2ePrisma.supportDepartment.findUniqueOrThrow({
    where: { name: 'Fictional migration support' },
  });
  expect(department.restricted).toBe(true);

  const customerContext = await browser.newContext({ baseURL: E2E_WEB_ORIGIN });
  try {
    const customerPage = await customerContext.newPage();
    customerPage.setDefaultTimeout(20000);
    await login(
      customerPage,
      E2E_HEALTHY_CUSTOMER.email,
      E2E_HEALTHY_CUSTOMER.password,
      '/portal',
    );
    await customerPage.goto('/portal/support');
    await customerPage
      .getByRole('button', { name: 'Open ticket', exact: true })
      .click();
    const createDialog = customerPage.getByRole('dialog');
    await createDialog
      .getByRole('combobox', { name: 'Department', exact: true })
      .selectOption(department.id);
    await createDialog
      .getByLabel('Subject', { exact: true })
      .fill('Fictional department browser request');
    await createDialog
      .getByLabel('What can we help with?')
      .fill('Please review this fictional request.');
    await createDialog
      .getByRole('button', { name: 'Open support ticket', exact: true })
      .click();
    await expect(customerPage.getByRole('dialog')).toContainText(
      'Department: Fictional migration support',
    );
    const ticket = await e2ePrisma.ticket.findFirstOrThrow({
      where: {
        subject: 'Fictional department browser request',
        customerId: E2E_HEALTHY_CUSTOMER.customerId,
      },
      include: { messages: true },
    });
    expect(ticket.departmentId).toBe(department.id);

    await page.reload();
    await page
      .getByRole('table', { name: 'Filtered support tickets' })
      .getByRole('button', { name: /Fictional department browser request/ })
      .click();
    const dialog = page.getByRole('dialog');
    const billing = await e2ePrisma.supportDepartment.findUniqueOrThrow({
      where: { name: 'Billing' },
    });
    await dialog
      .getByRole('combobox', { name: 'Department', exact: true })
      .selectOption(billing.id);
    await dialog
      .getByLabel('Reason for department change')
      .fill('Fictional billing handoff');
    await dialog
      .getByRole('button', { name: 'Save ticket controls', exact: true })
      .click();
    await expect(dialog).toContainText('Department: Billing');
    const routed = await e2ePrisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: { messages: true },
    });
    expect(routed.messages).toEqual(ticket.messages);
    expect(routed.customerId).toBe(ticket.customerId);
    expect(
      await e2ePrisma.activityLog.count({
        where: { entityId: ticket.id, action: 'TICKET_UPDATED_BY_ADMIN' },
      }),
    ).toBe(1);

    await customerPage.reload();
    await customerPage
      .getByRole('button', { name: ticket.ticketNumber, exact: true })
      .click();
    await expect(customerPage.getByRole('dialog')).toContainText(
      'Department: Billing',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      dialog.getByRole('combobox', { name: 'Department', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const directory = resolve('test-results/command216');
    await mkdir(directory, { recursive: true });
    await page.screenshot({
      path: resolve(directory, 'support-departments.png'),
    });
  } finally {
    await customerContext.close();
  }
});

async function login(
  page: Page,
  email: string,
  password: string,
  destination: '/admin' | '/portal',
) {
  await page.goto(destination === '/admin' ? '/admin' : '/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect
    .poll(async () =>
      (await page.context().cookies(E2E_API_ORIGIN)).some(
        (cookie) =>
          cookie.name === 'webhost_session' ||
          cookie.name === '__Host-webhost_session',
      ),
    )
    .toBe(true);
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeHidden();
}

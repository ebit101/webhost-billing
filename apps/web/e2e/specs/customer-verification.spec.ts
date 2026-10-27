import { expect, test } from '@playwright/test';
import { hash } from 'argon2';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { e2ePrisma } from '../database';
import { assertBrowserDatabaseScope } from '../database-scope';
import { E2E_DATABASE_URL, E2E_SCHEMA } from '../environment';
import { E2E_ADMIN } from '../fixtures';
import { expectRecordPageFits } from '../assert-record-layout';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.afterAll(async () => e2ePrisma.$disconnect());

test('administrator queues verification deliberately and the server preserves cooldown after reload', async ({
  page,
}) => {
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const passwordHash = await hash(E2E_ADMIN.password, {
    type: 2,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const email = 'command135-admin@example.test';
  await e2ePrisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      adminProfile: {
        create: {
          displayName: 'Fictional verification administrator',
          isSuperAdmin: true,
        },
      },
    },
  });
  const user = await e2ePrisma.user.create({
    data: {
      email: 'command135-customer@example.test',
      passwordHash,
      role: 'CUSTOMER',
      status: 'PENDING_VERIFICATION',
      customer: {
        create: {
          customerNumber: 'C135-FICTIONAL',
          firstName: 'Fictional',
          lastName: 'Verification customer',
          addressLine1: '135 Test Road',
          city: 'Dhaka',
          countryCode: 'BD',
        },
      },
    },
    include: { customer: true },
  });
  const customerId = user.customer!.id;
  let resends = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().endsWith('/resend-verification')
    )
      resends++;
  });
  await page.goto('/admin');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Business overview', exact: true }),
  ).toBeVisible();
  await page.goto(`/admin/customers/${customerId}`);
  const action = page.getByRole('button', {
    name: 'Resend verification email',
    exact: true,
  });
  await action.click();
  const confirmation = page.getByRole('alertdialog', {
    name: 'Resend verification email?',
  });
  await expect(confirmation).toContainText(user.email);
  await confirmation
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  expect(resends).toBe(0);
  await action.click();
  const response = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/resend-verification'),
  );
  await confirmation
    .getByRole('button', { name: 'Queue verification email', exact: true })
    .click();
  expect((await response).status()).toBe(202);
  await expect(page.getByRole('status')).toContainText(
    'Verification email queued.',
  );
  await expect(
    page.getByText('Verification pending', { exact: true }),
  ).toBeVisible();
  await expect(action).toBeDisabled();
  expect(
    await e2ePrisma.emailVerificationToken.count({
      where: { userId: user.id },
    }),
  ).toBe(1);
  expect(
    await e2ePrisma.outboxEvent.count({
      where: {
        aggregateId: user.id,
        eventType: 'AUTH_EMAIL_VERIFICATION_REQUESTED',
      },
    }),
  ).toBe(1);
  expect(
    (await e2ePrisma.user.findUniqueOrThrow({ where: { id: user.id } }))
      .emailVerifiedAt,
  ).toBeNull();
  const evidence = resolve(
    process.cwd(),
    '../../release-artifacts/command135-verification',
  );
  await mkdir(evidence, { recursive: true });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await expectRecordPageFits(page, `verification-${width}`);
    await page.screenshot({
      path: resolve(evidence, `verification-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.reload();
  await action.click();
  await confirmation
    .getByRole('button', { name: 'Queue verification email', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Wait one minute',
  );
  expect(resends).toBe(2);
  expect(
    await e2ePrisma.emailVerificationToken.count({
      where: { userId: user.id },
    }),
  ).toBe(1);
});

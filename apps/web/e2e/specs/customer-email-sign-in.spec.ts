import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { e2ePrisma } from '../database';
import { assertBrowserDatabaseScope } from '../database-scope';
import {
  E2E_DATABASE_URL,
  E2E_SCHEMA,
  e2eApiEnvironment,
} from '../environment';
import { E2E_HEALTHY_CUSTOMER } from '../fixtures';

test.afterAll(async () => e2ePrisma.$disconnect());

test('customer receives an email sign-in code and can withdraw marketing consent', async ({
  page,
}, info) => {
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const { passwordHash } = await e2ePrisma.user.findUniqueOrThrow({
    where: { id: E2E_HEALTHY_CUSTOMER.userId },
    select: { passwordHash: true },
  });
  const customer = await e2ePrisma.user.create({
    data: {
      email: 'command189-customer@example.test',
      passwordHash,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      customer: {
        create: {
          customerNumber: 'C189-FICTIONAL',
          firstName: 'Fictional',
          lastName: 'Email customer',
          addressLine1: '189 Test Road',
          city: 'Dhaka',
          countryCode: 'BD',
        },
      },
    },
  });
  const mailDirectory = info.outputPath('mail-preview');
  const worker = spawn(process.execPath, [resolve('../worker/dist/main.js')], {
    env: {
      ...e2eApiEnvironment,
      EMAIL_PREVIEW_DIRECTORY: mailDirectory,
      EMAIL_TRANSPORT: 'preview',
      NOTIFICATION_DELIVERY_MODE: 'disabled',
      WHATSAPP_LIVE_ENABLED: 'false',
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  const workerClosed = once(worker, 'close');
  // Observe startup errors even if a browser assertion fails first.
  void workerClosed.catch(() => undefined);
  const readPreviews = new Set<string>();
  async function deliveredCode(count: number) {
    await expect
      .poll(
        () =>
          e2ePrisma.emailLog.count({
            where: {
              recipientEmail: customer.email,
              templateKey: 'customer-email-code',
              status: 'SENT',
              provider: 'preview',
            },
          }),
        { timeout: 25_000 },
      )
      .toBe(count);
    const files = (await readdir(mailDirectory)).filter(
      (file) => file.endsWith('.eml') && !readPreviews.has(file),
    );
    for (const filename of files) {
      const message = (
        await readFile(join(mailDirectory, filename), 'utf8')
      ).replace(/=\r?\n/g, '');
      if (
        !message.includes(`To: ${customer.email}`) ||
        !message.includes('Subject: Your sign-in code')
      )
        continue;
      const code = /sign-in code is (\d{6})\./.exec(message)?.[1];
      if (code) {
        readPreviews.add(filename);
        return code;
      }
    }
    throw new Error(
      'The local preview did not contain a six-digit sign-in code for the fictional customer.',
    );
  }

  async function passwordSignIn() {
    const form = page
      .locator('form:visible')
      .filter({ has: page.locator('fieldset:not([disabled])') })
      .filter({
        has: page.getByRole('button', { name: 'Sign in', exact: true }),
      });
    await expect(form).toHaveCount(1);
    await expect(
      form.getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeEnabled();
    await form
      .getByLabel('Email address', { exact: true })
      .fill(customer.email);
    await form
      .getByLabel('Password', { exact: true })
      .fill(E2E_HEALTHY_CUSTOMER.password);
    await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  const consent = page.getByRole('checkbox', {
    name: 'I agree to receive marketing emails',
  });
  const emailFactor = page.getByRole('checkbox', {
    name: 'Require an email code when signing in',
  });
  const codeField = page.getByLabel('Authentication code');
  const verify = page.getByRole('button', { name: 'Verify and sign in' });

  try {
    await page.goto('/login');
    await passwordSignIn();
    await expect(page).toHaveURL(/\/portal$/);
    await page.goto('/portal/profile');
    await expect(consent).not.toBeChecked();
    await expect(emailFactor).not.toBeChecked();
    await consent.check();
    await page
      .getByRole('button', { name: 'Save marketing preference' })
      .click();
    await expect(page.getByText('Marketing preference saved.')).toBeVisible();
    await page.reload();
    await expect(consent).toBeChecked();
    await consent.uncheck();
    await page
      .getByRole('button', { name: 'Save marketing preference' })
      .click();
    await expect(page.getByText('Marketing preference saved.')).toBeVisible();
    await page.reload();
    await expect(consent).not.toBeChecked();
    expect(
      await e2ePrisma.customerSecurityPreference.findUniqueOrThrow({
        where: { userId: customer.id },
      }),
    ).toMatchObject({ marketingConsent: false });

    await emailFactor.check();
    await page
      .getByLabel('Current password for verification settings')
      .fill(E2E_HEALTHY_CUSTOMER.password);
    await page
      .getByRole('button', { name: 'Save verification setting' })
      .click();
    await expect(
      page.getByText('Email verification preference saved.'),
    ).toBeVisible();
    await page.context().clearCookies();
    await page.goto('/login');

    await passwordSignIn();
    await expect(codeField).toBeVisible();
    expect(
      (await page.context().cookies()).some(
        ({ name }) => name === 'webhost_session',
      ),
    ).toBe(false);
    const expiredCode = await deliveredCode(1);
    const challenge = await e2ePrisma.customerEmailChallenge.findFirstOrThrow({
      where: { userId: customer.id, usedAt: null },
    });
    expect(challenge.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      4 * 60_000,
    );
    expect(challenge.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      5 * 60_000,
    );
    await e2ePrisma.customerEmailChallenge.update({
      where: { id: challenge.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await codeField.fill(expiredCode);
    await verify.click();
    await expect(
      page.getByText(/the two-factor challenge or code is invalid or expired/i),
    ).toBeVisible();
    expect(
      (await page.context().cookies()).some(
        ({ name }) => name === 'webhost_session',
      ),
    ).toBe(false);

    await page.getByRole('button', { name: 'Use a different account' }).click();
    await passwordSignIn();
    await expect(codeField).toBeVisible();
    await codeField.fill(await deliveredCode(2));
    await verify.click();
    await expect(page).toHaveURL(/\/portal$/);
    await page.goto('/portal/profile');
    await expect(emailFactor).toBeChecked();
    await expect(consent).not.toBeChecked();
  } finally {
    worker.kill();
    await workerClosed;
  }
});

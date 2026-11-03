import { expect, test, type Page } from '@playwright/test';
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
import { E2E_ADMIN, E2E_PRODUCT, E2E_SERVER } from '../fixtures';

test.afterAll(async () => e2ePrisma.$disconnect());

test('customer cancellation delivers confirmation, suspends on schedule and recovers a blocked immediate job', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240_000);
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const { passwordHash } = await e2ePrisma.user.findUniqueOrThrow({
    where: { id: E2E_ADMIN.userId },
    select: { passwordHash: true },
  });
  const customer = await e2ePrisma.customer.create({
    data: {
      customerNumber: 'C193-FICTIONAL',
      firstName: 'Fictional',
      lastName: 'Cancellation',
      addressLine1: '193 Test Road',
      city: 'Dhaka',
      countryCode: 'BD',
      user: {
        create: {
          email: 'command193-customer@example.test',
          passwordHash,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      },
    },
    include: { user: true },
  });
  const admin = await e2ePrisma.user.create({
    data: {
      email: 'command193-admin@example.test',
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      adminProfile: {
        create: { displayName: 'Fictional cancellation administrator' },
      },
    },
  });
  const due = new Date(Date.now() + 7 * 86_400_000);
  const createService = (label: string) =>
    e2ePrisma.service.create({
      data: {
        customerId: customer.id,
        productId: E2E_PRODUCT.id,
        productPriceId: E2E_PRODUCT.priceId,
        serverId: E2E_SERVER.id,
        status: 'ACTIVE',
        domain: `command193-${label}.example.test`,
        productNameSnapshot: `Fictional ${label} hosting`,
        controlPanelUsername: `c193${label}`,
        externalAccountId: `c193-${label}`,
        billingPeriod: 'MONTHLY',
        currency: 'BDT',
        recurringAmount: 120_000n,
        startedAt: new Date(Date.now() - 86_400_000),
        activatedAt: new Date(Date.now() - 86_400_000),
        nextDueAt: due,
      },
    });
  const scheduled = await createService('scheduled');
  const immediate = await createService('immediate');
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const output = info.outputPath('mail-preview');
  const submit = async (id: string, timing: 'END_OF_PERIOD' | 'IMMEDIATE') => {
    await page.goto(`/portal/services/${id}`);
    await page.getByRole('button', { name: 'Request cancellation' }).click();
    const dialog = page.getByRole('dialog', { name: 'Request cancellation' });
    await expect(dialog.getByLabel('Cancellation timing')).toHaveValue(
      'END_OF_PERIOD',
    );
    await dialog.getByLabel('Cancellation timing').selectOption(timing);
    await dialog
      .getByLabel('Reason (optional)')
      .fill('Fictional cancellation rehearsal');
    await dialog
      .getByRole('button', { name: 'Submit cancellation request' })
      .click();
    await expect(
      page.getByText('Cancellation request submitted.'),
    ).toBeVisible();
  };

  try {
    await signIn(page, '/login', customer.user.email);
    await expect(page).toHaveURL(/\/portal$/);
    await submit(immediate.id, 'END_OF_PERIOD');
    await page.getByRole('button', { name: 'Withdraw request' }).click();
    await expect(
      page.getByText('Cancellation request withdrawn.', { exact: true }),
    ).toBeVisible();
    await submit(scheduled.id, 'END_OF_PERIOD');
    await expect(page.getByText(/Cancellation scheduled for/)).toBeVisible();
    await submit(immediate.id, 'IMMEDIATE');
    await expect(
      page.getByText('Immediate cancellation pending administrator review.'),
    ).toBeVisible();

    await signIn(adminPage, '/admin', admin.email);
    await expect(
      adminPage.getByRole('heading', { name: 'Business overview' }),
    ).toBeVisible();
    await adminPage.goto('/admin/services');
    await adminPage
      .getByRole('button', { name: 'Review immediate request' })
      .click();
    await adminPage
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Approve cancellation' })
      .click();
    await expect(
      adminPage.getByText(
        'Immediate cancellation approved. Hosting suspension queued.',
      ),
    ).toBeVisible();

    const overdue = new Date(Date.now() - 6 * 60_000);
    const scheduledRequest =
      await e2ePrisma.hostingCancellationRequest.findFirstOrThrow({
        where: { serviceId: scheduled.id, status: 'OPEN' },
      });
    const immediateRequest =
      await e2ePrisma.hostingCancellationRequest.findFirstOrThrow({
        where: { serviceId: immediate.id, status: 'OPEN' },
      });
    expect(scheduledRequest.effectiveAt).toEqual(due);
    expect(immediateRequest.approvedAt).toBeInstanceOf(Date);
    const immediateEvent = await e2ePrisma.outboxEvent.findUniqueOrThrow({
      where: { idempotencyKey: `hosting-cancellation:${immediateRequest.id}` },
    });
    const blocker = await e2ePrisma.hostingPanelOperation.create({
      data: {
        serviceId: immediate.id,
        serverId: E2E_SERVER.id,
        requestedByUserId: admin.id,
        type: 'GET_ACCOUNT',
        adapterKey: 'fake-panel',
        idempotencyKey: 'command193-fictional-blocker',
        requestFingerprint: 'f'.repeat(64),
      },
    });
    await e2ePrisma.$transaction([
      e2ePrisma.service.update({
        where: { id: scheduled.id },
        data: { nextDueAt: overdue },
      }),
      e2ePrisma.hostingCancellationRequest.update({
        where: { id: scheduledRequest.id },
        data: { effectiveAt: overdue },
      }),
      e2ePrisma.hostingCancellationRequest.update({
        where: { id: immediateRequest.id },
        data: { approvedAt: overdue },
      }),
      e2ePrisma.outboxEvent.update({
        where: {
          idempotencyKey: `hosting-cancellation:${scheduledRequest.id}`,
        },
        data: { availableAt: overdue },
      }),
    ]);
    const worker = spawn(
      process.execPath,
      [resolve('../worker/dist/main.js')],
      {
        env: {
          ...e2eApiEnvironment,
          EMAIL_TRANSPORT: 'preview',
          EMAIL_PREVIEW_DIRECTORY: output,
          NOTIFICATION_DELIVERY_MODE: 'disabled',
          WHATSAPP_LIVE_ENABLED: 'false',
        },
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    const closed = once(worker, 'close');
    void closed.catch(() => undefined);
    try {
      await expect
        .poll(
          () =>
            e2ePrisma.emailLog.count({
              where: {
                recipientEmail: customer.user.email,
                templateKey: 'hosting-cancellation-requested',
                status: 'SENT',
                provider: 'preview',
              },
            }),
          { timeout: 30_000 },
        )
        .toBe(3);
      const previews = await Promise.all(
        (await readdir(output))
          .filter((name) => name.endsWith('.eml'))
          .map((name) => readFile(join(output, name), 'utf8')),
      );
      expect(
        previews.some(
          (message) =>
            message.includes(`To: ${customer.user.email}`) &&
            message.includes('Subject: Hosting cancellation request received'),
        ),
      ).toBe(true);
      await expect
        .poll(
          async () =>
            (
              await e2ePrisma.service.findUniqueOrThrow({
                where: { id: scheduled.id },
              })
            ).status,
        )
        .toBe('SUSPENDED');
      await adminPage.goto('/admin/automation');
      const failed = adminPage
        .getByRole('row')
        .filter({ hasText: immediateEvent.id })
        .filter({ hasText: 'HOSTING_OPERATION_IN_PROGRESS' });
      const retry = failed.getByRole('button', { name: 'Retry temporary job' });
      await expect(retry).toBeVisible({ timeout: 25_000 });
      expect(
        (
          await e2ePrisma.service.findUniqueOrThrow({
            where: { id: immediate.id },
          })
        ).status,
      ).toBe('ACTIVE');
      expect(
        await e2ePrisma.hostingPanelOperation.count({
          where: { serviceId: immediate.id, type: 'SUSPEND_ACCOUNT' },
        }),
      ).toBe(0);
      // Resolve the fictional competing operation before using the real retry control.
      await e2ePrisma.hostingPanelOperation.update({
        where: { id: blocker.id },
        data: { status: 'SUCCEEDED', completedAt: new Date() },
      });
      await retry.click();
      await expect
        .poll(
          async () =>
            (
              await e2ePrisma.hostingCancellationRequest.findUniqueOrThrow({
                where: { id: immediateRequest.id },
              })
            ).status,
          { timeout: 25_000 },
        )
        .toBe('COMPLETED');
      expect(
        await e2ePrisma.hostingPanelOperation.count({
          where: {
            serviceId: immediate.id,
            type: 'SUSPEND_ACCOUNT',
            status: 'SUCCEEDED',
          },
        }),
      ).toBe(1);
      expect(
        await e2ePrisma.activityLog.count({
          where: { actorUserId: admin.id, action: 'BACKGROUND_JOB_RETRIED' },
        }),
      ).toBe(1);
      await page.reload();
      await expect(
        page.getByText('Hosting cancellation completed.'),
      ).toBeVisible();
    } finally {
      worker.kill();
      await closed;
    }
  } finally {
    await adminContext.close();
  }
});

async function signIn(page: Page, path: string, email: string) {
  await page.goto(path);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

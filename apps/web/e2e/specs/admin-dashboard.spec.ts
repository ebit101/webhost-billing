import { expect, test } from '@playwright/test';
import { hash } from 'argon2';
import { createPrismaClient } from '@webhost-billing/database';
import {
  dashboardResponseSchema,
  formatCalendarDate,
} from '@webhost-billing/shared';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertBrowserDatabaseScope } from '../database-scope';
import { E2E_DATABASE_URL, E2E_SCHEMA, E2E_API_ORIGIN } from '../environment';
import { E2E_ADMIN } from '../fixtures';
import { expectRecordPageFits } from '../assert-record-layout';

test.use({ locale: 'en-US', timezoneId: 'America/Los_Angeles' });

test('dashboard uses business-week dates, compact navigation and reachable summary links', async ({
  page,
}) => {
  const prisma = createPrismaClient(E2E_DATABASE_URL);
  try {
    await assertBrowserDatabaseScope(prisma, E2E_DATABASE_URL, E2E_SCHEMA);
    const email = 'command163-dashboard-admin@example.test';
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hash(E2E_ADMIN.password, {
          type: 2,
          memoryCost: 19456,
          timeCost: 2,
          parallelism: 1,
        }),
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        adminProfile: {
          create: {
            displayName: 'Fictional Dashboard Administrator',
            isSuperAdmin: true,
          },
        },
      },
    });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/admin');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
    const loaded = page.waitForResponse(
      (response) =>
        response.url() === `${E2E_API_ORIGIN}/dashboard` && response.ok(),
    );
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const result = dashboardResponseSchema.parse(
      (await (await loaded).json()).data,
    );
    expect(
      (Date.parse(result.period.to) - Date.parse(result.period.from)) /
        86400000,
    ).toBe(6);
    await expect(page.getByLabel('From', { exact: true })).toHaveValue(
      formatCalendarDate(result.period.from),
    );
    await expect(page.getByLabel('To', { exact: true })).toHaveValue(
      formatCalendarDate(result.period.to),
    );
    await expect(page.getByText(/^Updated \d{2}\/\d{2}\/\d{4},/)).toBeVisible();
    const summary = page.getByRole('region', { name: 'Business summary' });
    await expect(summary.getByRole('link')).toHaveCount(8);
    const nav = page.getByRole('navigation', {
      name: 'Administrator navigation',
    });
    const first = await nav
      .getByRole('link', { name: 'Dashboard', exact: true })
      .boundingBox();
    expect(first!.height).toBeLessThanOrEqual(36);
    await expectRecordPageFits(page, 'command163-dashboard-desktop');
    const output = resolve('../../release-artifacts/command163-dashboard');
    await mkdir(output, { recursive: true });
    await page.screenshot({
      path: resolve(output, 'desktop.png'),
      fullPage: true,
    });

    await page.getByLabel('From', { exact: true }).fill('31/02/2026');
    await page.getByRole('button', { name: 'Apply period' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Enter valid dates' }),
    ).toContainText('dd/mm/yyyy');
    await page
      .getByLabel('From', { exact: true })
      .fill(formatCalendarDate(result.period.from));
    const refreshed = page.waitForResponse(
      (response) => response.url().includes('/dashboard?') && response.ok(),
    );
    await page.getByRole('button', { name: 'Apply period' }).click();
    await refreshed;
    const active = summary.getByRole('link', { name: /^Active services/ });
    await active.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/admin\/services\?status=ACTIVE$/);
    await expect(
      page.getByRole('combobox', { name: 'Service status', exact: true }),
    ).toHaveValue('ACTIVE');
    await page.goto('/admin');
    await page.getByRole('link', { name: /^Overdue balance/ }).click();
    await expect(page).toHaveURL(/\/admin\/invoices\?status=OVERDUE$/);
    await expect(
      page.getByRole('combobox', { name: 'Invoice status', exact: true }),
    ).toHaveValue('OVERDUE');
    await page.goto('/admin');
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(
      page.getByRole('link', { name: /^Collected revenue/ }),
    ).toBeVisible();
    await expectRecordPageFits(page, 'command163-dashboard-mobile');
    await page.screenshot({
      path: resolve(output, 'mobile.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const mobile = await nav
      .getByRole('link', { name: 'Dashboard', exact: true })
      .boundingBox();
    expect(mobile!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Open navigation' }),
    ).toBeFocused();
  } finally {
    await prisma.$disconnect();
  }
});

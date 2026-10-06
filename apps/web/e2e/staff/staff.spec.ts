import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

for (const width of [375, 1440])
  test(`administrator screen at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 1000 });
    await context.addCookies([
      {
        name: 'webhost_session',
        value: 'fictional-full',
        url: 'http://127.0.0.1:3300',
      },
    ]);
    const writes: string[] = [];
    page.on('request', (request) => {
      if (!['GET', 'HEAD'].includes(request.method()))
        writes.push(request.method());
    });
    await page.goto('/admin/staff');
    await expect(
      page.getByRole('heading', { name: 'Administrators', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'support@example.test' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Send invitation', exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const own = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'owner@example.test' }),
    });
    await expect(
      own.getByRole('button', { name: 'Save access' }),
    ).toBeDisabled();
    const firstInput = page
      .getByRole('textbox', { name: 'Display name' })
      .first();
    await firstInput.focus();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('textbox', { name: 'Email', exact: true }),
    ).toBeFocused();
    expect(writes).toEqual([]);
    const directory = resolve('../../release-artifacts/staff-preview');
    await mkdir(directory, { recursive: true });
    await page.screenshot({
      path: resolve(directory, `staff-${width}.png`),
      fullPage: true,
    });
  });

test('billing and support navigation and direct-route checks', async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: 'webhost_session',
      value: 'fictional-billing',
      url: 'http://127.0.0.1:3300',
    },
  ]);
  await page.goto('/admin/staff');
  await expect(page).toHaveURL(/\/admin\/invoices$/);
  const navigation = page.getByRole('navigation', {
    name: 'Administrator navigation',
  });
  await expect(
    navigation.getByRole('link', { name: /^Invoices/ }),
  ).toBeVisible();
  await expect(
    navigation.getByRole('link', { name: 'Settings', exact: true }),
  ).toHaveCount(0);
  await expect(
    navigation.getByRole('link', { name: 'Administrators', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Save business identity' }),
  ).toHaveCount(0);
  await page.goto('/admin/payments');
  await expect(
    page.getByRole('button', { name: 'Record verified payment' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Review billing policy in settings' }),
  ).toHaveCount(0);
  await context.clearCookies();
  await context.addCookies([
    {
      name: 'webhost_session',
      value: 'fictional-support',
      url: 'http://127.0.0.1:3300',
    },
  ]);
  await page.goto('/admin/payments');
  await expect(page).toHaveURL(/\/admin\/support$/);
  await expect(
    page.getByRole('heading', { name: 'Support queue', exact: true }),
  ).toBeVisible();
  await expect(
    navigation.getByRole('link', { name: 'Payments', exact: true }),
  ).toHaveCount(0);
});

test('unenrolled operator is directed to account security', async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: 'webhost_session',
      value: 'fictional-billing-unenrolled',
      url: 'http://127.0.0.1:3300',
    },
  ]);
  await page.goto('/admin/invoices');
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.getByRole('heading', { name: 'Two-factor authentication' }),
  ).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { E2E_ADMIN } from '../fixtures';

test('administrator groups hosting plans and retains membership after reload on desktop and mobile', async ({
  page,
}) => {
  await page.goto('/admin');
  await page.getByLabel('Email address').fill(E2E_ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Business overview', exact: true }),
  ).toBeVisible();
  await page.goto('/admin/products');
  await page.getByRole('button', { name: 'Manage groups' }).click();
  const create = page.getByRole('form', { name: 'Create product group' });
  await create.getByLabel('Group name').fill('Fictional shared hosting');
  await create.getByLabel('Group order').fill('20');
  await create
    .getByRole('button', { name: 'Create group', exact: true })
    .click();
  await expect(
    page.getByRole('form', { name: 'Edit Fictional shared hosting' }),
  ).toBeVisible();
  await create.getByLabel('Group name').fill('Fictional business hosting');
  await create.getByLabel('Group order').fill('10');
  await create
    .getByRole('button', { name: 'Create group', exact: true })
    .click();
  await expect(
    page.getByRole('form', { name: 'Edit Fictional business hosting' }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: /^Product group/ })
    .selectOption({ label: 'Fictional shared hosting' });
  const productName = await page
    .getByLabel('Name', { exact: true })
    .inputValue();
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByRole('status')).toHaveText('Product details saved.');
  await expect(
    page
      .getByRole('region', { name: 'Fictional shared hosting', exact: true })
      .getByRole('button', { name: new RegExp(productName) }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: /^Product group/ }),
  ).toHaveValue(
    (await page
      .getByRole('option', { name: 'Fictional shared hosting', exact: true })
      .getAttribute('value')) ?? '',
  );
  const groups = page.locator('section[aria-label^="Fictional"]');
  await expect(groups).toHaveCount(2);
  expect(
    await groups.evaluateAll((items) =>
      items.map((item) => item.getAttribute('aria-label')),
    ),
  ).toEqual(['Fictional business hosting', 'Fictional shared hosting']);
  const output = resolve('../../release-artifacts/product-groups');
  await mkdir(output, { recursive: true });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: resolve(output, `product-groups-${width}.png`),
      animations: 'disabled',
      fullPage: true,
    });
  }
  await page.getByRole('combobox', { name: /^Product group/ }).selectOption('');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByRole('status')).toHaveText('Product details saved.');
  await expect(
    page
      .getByRole('region', { name: 'Ungrouped', exact: true })
      .getByRole('button', { name: new RegExp(productName) }),
  ).toBeVisible();
});

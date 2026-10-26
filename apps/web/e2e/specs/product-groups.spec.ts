import { expectRecordPageFits } from '../assert-record-layout';
import { expect, test } from '@playwright/test';
import { hash } from 'argon2';
import { createPrismaClient } from '@webhost-billing/database';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertBrowserDatabaseScope } from '../database-scope';
import { E2E_DATABASE_URL, E2E_SCHEMA } from '../environment';
import { E2E_ADMIN } from '../fixtures';

const prisma = createPrismaClient(E2E_DATABASE_URL);
test.afterAll(async () => prisma.$disconnect());

test('administrator groups hosting plans and retains membership after reload on desktop and mobile', async ({
  page,
}) => {
  await assertBrowserDatabaseScope(prisma, E2E_DATABASE_URL, E2E_SCHEMA);
  // A separate fictional identity preserves the shared lifecycle login budget.
  const email = 'command133-catalogue-admin@example.test';
  await prisma.user.create({
    data: {
      email,
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
          displayName: 'Fictional Catalogue Administrator',
          isSuperAdmin: true,
        },
      },
    },
  });
  await page.goto('/admin');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Business overview', exact: true }),
  ).toBeVisible();
  await page.goto('/admin/products');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Manage groups' }).click();
  const manager = page.getByRole('dialog', {
    name: 'Product groups',
    exact: true,
  });
  for (const [name, order] of [
    ['Fictional shared hosting', '20'],
    ['Fictional business hosting', '10'],
  ]) {
    await manager
      .getByRole('button', { name: 'Create group', exact: true })
      .click();
    const create = page.getByRole('form', { name: 'Create product group' });
    await create.getByLabel('Group name').fill(name!);
    await create.getByLabel('Group order').fill(order!);
    await create
      .getByRole('button', { name: 'Create group', exact: true })
      .click();
    await expect(create.getByLabel('Group name')).toHaveValue('');
    await page
      .getByRole('dialog', { name: 'Create group', exact: true })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await expect(
      manager.getByRole('button', { name: 'Edit ' + name, exact: true }),
    ).toBeVisible();
  }
  expect(
    await manager.locator('tbody tr td:first-child').allTextContents(),
  ).toEqual(['Fictional business hosting', 'Fictional shared hosting']);
  await manager.getByRole('button', { name: 'Close', exact: true }).click();
  const first = page
    .getByRole('table', { name: 'Ungrouped products', exact: true })
    .getByRole('button')
    .first();
  const productName = (await first.textContent())!.trim();
  await first.click();
  const editor = page.getByRole('dialog', { name: productName, exact: true });
  await editor
    .getByRole('combobox', { name: /^Product group/ })
    .selectOption({ label: 'Fictional shared hosting' });
  await editor.getByRole('button', { name: 'Save details' }).click();
  await expect(editor).toContainText('Product details saved.');
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page
      .getByRole('table', {
        name: 'Fictional shared hosting products',
        exact: true,
      })
      .getByRole('button', { name: productName, exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: productName, exact: true }).click();
  await expect(
    editor.getByRole('combobox', { name: /^Product group/ }),
  ).toHaveValue(
    (await editor
      .getByRole('option', { name: 'Fictional shared hosting', exact: true })
      .getAttribute('value')) ?? '',
  );
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  const output = resolve('../../release-artifacts/product-groups');
  await mkdir(output, { recursive: true });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await expectRecordPageFits(page, 'records-' + width);
    await page.screenshot({
      path: resolve(output, 'product-groups-' + width + '.png'),
      animations: 'disabled',
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: productName, exact: true }).click();
  await editor
    .getByRole('combobox', { name: /^Product group/ })
    .selectOption('');
  await editor.getByRole('button', { name: 'Save details' }).click();
  await expect(editor).toContainText('Product details saved.');
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page
      .getByRole('table', { name: 'Ungrouped products', exact: true })
      .getByRole('button', { name: productName, exact: true }),
  ).toBeVisible();
});

import { expect, test } from '@playwright/test';

for (const width of [1440, 375]) {
  test(`account settings stay compact and security forms disclose at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const mutations: string[] = [];
    await page.route('**/auth/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() !== 'GET') {
        mutations.push(path);
        await route.abort();
        return;
      }
      const data =
        path === '/auth/me'
          ? {
              userId: '10000000-0000-4000-8000-000000000001',
              adminProfileId: '10000000-0000-4000-8000-000000000002',
              role: 'ADMIN',
              staffRole: 'FULL_ADMINISTRATOR',
              twoFactorEnabled: true,
              email: 'admin@example.test',
              displayName: 'Fictional Administrator',
            }
          : path === '/auth/two-factor'
            ? { enabled: true, recoveryCodesRemaining: 10 }
            : null;
      await route.fulfill({
        status: data ? 200 : 404,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': 'http://127.0.0.1:3187',
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ success: Boolean(data), data }),
      });
    });
    await page.goto('/account');
    await expect(page.getByText('Fictional Administrator')).toBeVisible();
    await expect(
      page.getByText('Enabled · 10 recovery codes remain'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Generate new recovery codes' }),
    ).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Disable and sign out' }),
    ).toBeHidden();
    const bounds = await page
      .getByRole('region', { name: 'Sessions' })
      .boundingBox();
    if (width === 1440) expect(bounds!.y + bounds!.height).toBeLessThan(720);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.getByText('Replace recovery codes', { exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Generate new recovery codes' }),
    ).toBeVisible();
    await expect(
      page.locator('details[open] input[name="password"]'),
    ).toBeVisible();
    await page.getByText('Replace recovery codes', { exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Generate new recovery codes' }),
    ).toBeHidden();
    expect(mutations).toEqual([]);
    await page.screenshot({
      path: `../../release-artifacts/command138-account-${width}.png`,
      fullPage: true,
    });
  });
}

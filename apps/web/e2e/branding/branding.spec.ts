import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

const name = process.env.BRANDING_EXPECTED_NAME ?? 'Webhost Billing';
if (name !== 'Webhost Billing' && name !== 'Speed Host') {
  throw new Error('Branding checks support only generic or Speed Host builds.');
}
const speedHost = name === 'Speed Host';
const output = resolve(
  __dirname,
  '../../../../release-artifacts/branding-preview',
);

for (const width of [320, 375, 1440]) {
  for (const route of ['/', '/forgot-password']) {
    test(`${name}: ${route} at ${width}px`, async ({ page, context }) => {
      // These anonymous pages need no API, accounts or provider authority.
      let unsafeRequests = 0;
      await context.route('**/*', async (request) => {
        const url = new URL(request.request().url());
        if (
          url.origin !== 'http://127.0.0.1:3187' ||
          request.request().method() !== 'GET'
        ) {
          unsafeRequests++;
          await request.abort();
        } else await request.continue();
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await expect(page).toHaveTitle(new RegExp(` · ${name}$`));
      const home = page
        .getByRole('link', { name: `${name} home`, exact: true })
        .first();
      await expect(home).toBeVisible();
      await expect(home).toHaveAttribute('href', '/');
      if (route === '/')
        await expect(
          page.getByText(`Why ${name}`, { exact: true }),
        ).toBeVisible();
      if (speedHost) {
        const logos = page.getByRole('img', { name, exact: true });
        await expect(logos.first()).toHaveAttribute(
          'src',
          '/branding/speed-host-logo.png',
        );
        await expect
          .poll(() =>
            logos
              .first()
              .evaluate(
                (image) =>
                  image instanceof HTMLImageElement &&
                  image.complete &&
                  image.naturalWidth === 285 &&
                  image.naturalHeight === 63,
              ),
          )
          .toBe(true);
        if (route === '/') {
          await expect(
            page.getByRole('link', {
              name: 'info@speedhost.com.bd',
              exact: true,
            }),
          ).toHaveAttribute('href', 'mailto:info@speedhost.com.bd');
          await expect(
            page.getByText(
              '© 2026 Speed Host. Fictional demonstration content.',
            ),
          ).toBeVisible();
        }
      } else {
        await expect(
          page.getByRole('img', { name: 'Speed Host', exact: true }),
        ).toHaveCount(0);
        if (route === '/')
          await expect(
            page.getByText(
              '© 2026 Webhost Billing. Fictional demonstration content.',
            ),
          ).toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const box = await home.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      if (width < 768 && route === '/') {
        await page
          .getByRole('button', { name: 'Open navigation', exact: true })
          .click();
        await expect(
          page.getByRole('navigation', { name: 'Mobile public navigation' }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
      }
      await home.focus();
      await expect(home).toBeFocused();
      expect(unsafeRequests).toBe(0);
      expect(
        await page
          .locator('body *')
          .evaluateAll((elements) =>
            elements.some(
              (element) =>
                getComputedStyle(element).textTransform === 'uppercase',
            ),
          ),
      ).toBe(false);
      mkdirSync(output, { recursive: true });
      await page.screenshot({
        path: resolve(
          output,
          `${speedHost ? 'speed-host' : 'generic'}-${route === '/' ? 'home' : 'auth'}-${width}.png`,
        ),
        fullPage: true,
      });
    });
  }
}

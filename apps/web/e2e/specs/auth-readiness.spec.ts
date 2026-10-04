import { expect, test, type Page, type Route } from '@playwright/test';
import { e2ePrisma } from '../database';
import { E2E_API_ORIGIN, E2E_WEB_ORIGIN } from '../environment';
import { E2E_PRODUCT } from '../fixtures';

// Do not retain credentials, intercepted bodies or traces even on test failure.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.afterAll(async () => e2ePrisma.$disconnect());

const selection = `productId=${E2E_PRODUCT.id}&priceId=${E2E_PRODUCT.priceId}`;
const password = 'Fictional-Readiness-83!';
const email = 'readiness83@example.test';
const csrf = 'x'.repeat(96);
const challengeToken = 'fictional-command83-mfa-challenge-token';
const resetToken = 'fictional-command83-reset-token';
const routes: {
  name: string;
  path: string;
  button: string;
  endpoint: string;
  fields: Record<string, string>;
}[] = [
  {
    name: 'customer login',
    path: `/login?${selection}`,
    button: 'Sign in',
    endpoint: '/auth/login',
    fields: { email, password },
  },
  {
    name: 'administrator login',
    path: '/admin',
    button: 'Sign in',
    endpoint: '/auth/login',
    fields: { email, password },
  },
  {
    name: 'registration',
    path: `/register?${selection}`,
    button: 'Create customer account',
    endpoint: '/auth/register',
    fields: {
      firstName: 'Readiness',
      lastName: 'Fiction',
      email,
      password,
      addressLine1: '83 Fictional Road',
      city: 'Dhaka',
      countryCode: 'BD',
    },
  },
  {
    name: 'reset request',
    path: '/forgot-password',
    button: 'Request reset instructions',
    endpoint: '/auth/password-reset/request',
    fields: { email },
  },
  {
    name: 'reset confirmation',
    path: `/reset-password?token=${resetToken}`,
    button: 'Change password',
    endpoint: '/auth/password-reset/confirm',
    fields: { password },
  },
];

for (const scenario of routes) {
  test(`${scenario.name}: JavaScript disabled cannot submit credentials`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL: E2E_WEB_ORIGIN,
    });
    try {
      const page = await context.newPage();
      const observation = observe(page);
      const before = await recordCounts();
      await page.goto(scenario.path);
      await expect(page.locator('noscript p:visible')).toHaveText(
        'Enable JavaScript and reload this page to use this secure form.',
      );
      await assertBlocked(page, scenario.button, scenario.fields);
      expect(observation.documents).toBe(1);
      expect(observation.authRequests).toBe(0);
      expect(observation.mutations).toBe(0);
      expect(observation.leakedFormFields).toBe(false);
      expect(await recordCounts()).toEqual(before);
      await expect(page).toHaveURL(`${E2E_WEB_ORIGIN}${scenario.path}`);
    } finally {
      await context.close();
    }
  });

  test(`${scenario.name}: withheld scripts guard submission, release restores CSRF POST`, async ({
    page,
  }) => {
    const observation = observe(page);
    const before = await recordCounts();
    let releaseScripts: () => void = () => {};
    const scriptGate = new Promise<void>((resolve) => {
      releaseScripts = resolve;
    });
    let heldScripts = 0;
    let released = false;
    const holdScripts = async (route: Route) => {
      if (!released) {
        heldScripts++;
        await scriptGate;
      }
      await route.continue();
    };
    await page.route('**/_next/**/*.js*', holdScripts);
    // Mock only this isolated page's auth calls. No login attempts, password
    // resets or registration writes reach the API or consume its rate limits.
    const posts: { path: string; valid: boolean }[] = [];
    await page.route(`${E2E_API_ORIGIN}/auth/**`, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const headers = {
        'Access-Control-Allow-Origin': E2E_WEB_ORIGIN,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      };
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      if (path === '/auth/csrf') {
        await route.fulfill({
          headers: {
            ...headers,
            'Set-Cookie':
              'command83_csrf=fictional; HttpOnly; SameSite=Lax; Path=/',
          },
          json: { success: true, data: { csrfToken: csrf } },
        });
        return;
      }
      const expected: Record<string, string> =
        path === '/auth/login/two-factor'
          ? { challengeToken, code: '123456' }
          : { ...scenario.fields };
      if (path === '/auth/password-reset/confirm') expected.token = resetToken;
      const body: unknown = request.postDataJSON();
      const valid =
        request.method() === 'POST' &&
        request.headers()['x-csrf-token'] === csrf &&
        (request.headers().cookie ?? '').includes('command83_csrf=') &&
        sameBody(body, expected) &&
        (path === scenario.endpoint || path === '/auth/login/two-factor');
      posts.push({ path, valid });
      if (path === '/auth/login/two-factor') {
        await route.fulfill({
          status: 401,
          headers,
          json: {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Fictional MFA retry required.',
            },
          },
        });
      } else {
        await route.fulfill({
          headers,
          json: {
            success: true,
            data:
              path === '/auth/login'
                ? {
                    requiresTwoFactor: true,
                    challengeToken,
                    expiresAt: '2026-10-04T12:00:00.000Z',
                  }
                : { message: 'Fictional auth request accepted.' },
          },
        });
      }
    });
    try {
      await page.goto(scenario.path, { waitUntil: 'commit' });
      await expect(page.locator('form fieldset')).toBeVisible();
      await expect.poll(() => heldScripts).toBeGreaterThan(0);
      await assertBlocked(page, scenario.button, scenario.fields);
      expect(observation.documents).toBe(1);
      expect(observation.authRequests).toBe(0);
      expect(observation.mutations).toBe(0);
      expect(observation.leakedFormFields).toBe(false);
      expect(posts).toEqual([]);
      expect(await recordCounts()).toEqual(before);
      await expect(page).toHaveURL(`${E2E_WEB_ORIGIN}${scenario.path}`);

      released = true;
      releaseScripts();
      await expect(page.locator('form fieldset')).not.toHaveAttribute(
        'disabled',
        '',
      );
      await expect(
        page.getByRole('button', { name: scenario.button, exact: true }),
      ).toBeEnabled();
      for (const [name, value] of Object.entries(scenario.fields)) {
        await page.locator(`input[name="${name}"]`).fill(value);
      }
      // Normal implicit submission after hydration must use the existing handler.
      await page.locator('form input').last().press('Enter');
      if (scenario.endpoint === '/auth/login') {
        await expect(page.getByLabel('Authentication code')).toBeVisible();
        await expect(page.locator('form')).toHaveAttribute('method', 'post');
        await page.getByLabel('Authentication code').fill('123456');
        await page.getByLabel('Authentication code').press('Enter');
        await expect(page.locator('form').getByRole('alert')).toHaveText(
          'Fictional MFA retry required.',
        );
        await expect(
          page.getByRole('button', { name: 'Verify and sign in' }),
        ).toBeEnabled();
        expect(posts).toEqual([
          { path: scenario.endpoint, valid: true },
          { path: '/auth/login/two-factor', valid: true },
        ]);
      } else {
        await expect(page.getByRole('status')).toHaveText(
          'Fictional auth request accepted.',
        );
        expect(posts).toEqual([{ path: scenario.endpoint, valid: true }]);
        if (scenario.endpoint === '/auth/register') {
          await expect(
            page.getByRole('link', {
              name: 'sign in to continue your selected plan',
            }),
          ).toHaveAttribute('href', `/login?${selection}`);
        }
      }
      expect(observation.documents).toBe(1);
      expect(observation.leakedFormFields).toBe(false);
      expect(await recordCounts()).toEqual(before);
      await expect(page).toHaveURL(`${E2E_WEB_ORIGIN}${scenario.path}`);
    } finally {
      released = true;
      releaseScripts();
      await page.unroute('**/_next/**/*.js*', holdScripts);
    }
  });
}

async function assertBlocked(
  page: Page,
  button: string,
  fields: Record<string, string>,
) {
  await expect(page.locator('form')).toHaveAttribute('method', 'post');
  await expect(page.locator('form fieldset')).toHaveAttribute('disabled', '');
  await expect(page.locator('form [role="status"]')).toContainText(
    'JavaScript is required',
  );
  for (const input of await page.locator('form input').all())
    await expect(input).toBeDisabled();
  const submit = page.locator('form button[type="submit"]');
  await expect(submit).toHaveText(button);
  await expect(submit).toBeDisabled();
  // Model autofilled values through public DOM APIs. The guard must exclude
  // named fields, not just disable the button. No private framework state.
  const successfulFields = await page
    .locator('form')
    .evaluate((form: HTMLFormElement, values) => {
      for (const input of form.querySelectorAll('input'))
        input.value = values[input.name] ?? '';
      return Array.from(new FormData(form).keys());
    }, fields);
  expect(successfulFields).toEqual([]);
  // Test native disabled click semantics without Playwright's enabled auto-wait.
  // With no scripts the streamed form may also be hidden behind the loading
  // shell, where a physical click cannot reach it at all.
  await submit.evaluate((element: HTMLButtonElement) => element.click());
  await page.keyboard.press('Enter');
  // A DOM round trip bounds the attempted inputs; no sleep or network-idle wait.
  expect(
    await page
      .locator('form')
      .evaluate((form: HTMLFormElement) =>
        Array.from(new FormData(form).keys()),
      ),
  ).toEqual([]);
  await expect(submit).toBeDisabled();
}

function observe(page: Page) {
  const result = {
    documents: 0,
    authRequests: 0,
    mutations: 0,
    leakedFormFields: false,
  };
  const formFields = new Set([
    'email',
    'password',
    'firstName',
    'lastName',
    'companyName',
    'addressLine1',
    'city',
    'countryCode',
    'code',
    'challengeToken',
  ]);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.isNavigationRequest() && request.resourceType() === 'document')
      result.documents++;
    if (url.origin === E2E_API_ORIGIN && url.pathname.startsWith('/auth/'))
      result.authRequests++;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      result.mutations++;
    // Only form-field keys; existing reset token and product/price links are allowed.
    if (Array.from(url.searchParams.keys()).some((key) => formFields.has(key)))
      result.leakedFormFields = true;
  });
  return result;
}

function sameBody(body: unknown, expected: Record<string, string>): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return false;
  const values = body as Record<string, unknown>;
  return (
    Object.keys(values).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => values[key] === value)
  );
}

async function recordCounts() {
  return Promise.all([
    e2ePrisma.user.count(),
    e2ePrisma.customer.count(),
    e2ePrisma.authSession.count(),
    e2ePrisma.adminLoginChallenge.count(),
    e2ePrisma.adminTotpCredential.count(),
    e2ePrisma.adminRecoveryCode.count(),
    e2ePrisma.passwordResetToken.count(),
    e2ePrisma.emailVerificationToken.count(),
    e2ePrisma.order.count(),
    e2ePrisma.invoice.count(),
    e2ePrisma.payment.count(),
    e2ePrisma.paymentEvent.count(),
    e2ePrisma.service.count(),
    e2ePrisma.hostingPanelOperation.count(),
    e2ePrisma.emailLog.count(),
    e2ePrisma.activityLog.count(),
    e2ePrisma.outboxEvent.count(),
  ]);
}

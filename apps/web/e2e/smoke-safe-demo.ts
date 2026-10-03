import { chromium, type BrowserContext, type Page } from '@playwright/test';

const demoOrigin = 'http://localhost:3100';
const routes = ['/hosting', '/portal', '/admin'] as const;
type SmokeRoute = (typeof routes)[number];

interface SmokeCheck {
  passed: boolean;
  route: SmokeRoute;
}

async function main(): Promise<void> {
  const adminPassword = requiredSecret('DEMO_ADMIN_PASSWORD');
  const customerPassword = requiredSecret('DEMO_CUSTOMER_PASSWORD');
  if (process.env.DEMO_PUBLIC_ORIGIN !== demoOrigin) {
    writeResult(routes.map((route) => ({ passed: false, route })));
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const checks: SmokeCheck[] = [];
  try {
    checks.push(
      await runCheck(browser.newContext(), '/hosting', async (page) => {
        await page.goto(`${demoOrigin}/hosting`, {
          waitUntil: 'domcontentloaded',
        });
        await page
          .getByRole('heading', {
            name: 'Clear hosting plans with room to grow.',
          })
          .waitFor();
        await page.getByRole('heading', { name: 'Starter Hosting' }).waitFor();
        const monthlyButton = page.getByRole('button', { name: 'Monthly' });
        await page
          .getByRole('link', { name: 'Choose Starter Hosting' })
          .waitFor();
        if ((await monthlyButton.getAttribute('aria-pressed')) !== 'true') {
          throw new Error(
            'The available monthly catalogue view was not active.',
          );
        }
      }),
    );
    checks.push(
      await runCheck(browser.newContext(), '/portal', async (page) => {
        await signIn(
          page,
          'customer@example.test',
          customerPassword,
          '/portal',
        );
        await page
          .getByRole('heading', { name: 'Welcome, Fictional' })
          .waitFor();
        await page
          .getByRole('heading', { name: "You're all caught up" })
          .waitFor();
        await page
          .getByRole('heading', { name: 'customer-site.example.test' })
          .waitFor();
      }),
    );
    checks.push(
      await runCheck(browser.newContext(), '/admin', async (page) => {
        await signIn(page, 'admin@example.test', adminPassword, '/admin');
        await page
          .getByRole('heading', { name: 'Business overview' })
          .waitFor();
        await page.getByText('Collected revenue', { exact: true }).waitFor();
        await page.getByText('Active services', { exact: true }).waitFor();
      }),
    );
  } finally {
    await browser.close();
  }

  writeResult(checks);
}

async function runCheck(
  contextPromise: Promise<BrowserContext>,
  route: SmokeRoute,
  action: (page: Page) => Promise<void>,
): Promise<SmokeCheck> {
  const context = await contextPromise;
  try {
    await blockNonDemoRequests(context);
    await action(await context.newPage());
    return { passed: true, route };
  } catch {
    return { passed: false, route };
  } finally {
    await context.close();
  }
}

async function blockNonDemoRequests(context: BrowserContext): Promise<void> {
  await context.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (
      requestUrl.origin === demoOrigin ||
      requestUrl.protocol === 'data:' ||
      requestUrl.protocol === 'blob:'
    ) {
      await route.continue();
      return;
    }
    await route.abort('blockedbyclient');
  });
}

async function signIn(
  page: Page,
  email: 'admin@example.test' | 'customer@example.test',
  password: string,
  destination: '/admin' | '/portal',
): Promise<void> {
  await page.goto(`${demoOrigin}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${demoOrigin}${destination}`);
}

function requiredSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error('Generated fictional credentials are unavailable.');
  return value;
}

function writeResult(checks: SmokeCheck[]): void {
  process.stdout.write(`${JSON.stringify({ checks, version: 1 })}\n`);
  if (checks.some((check) => !check.passed)) process.exitCode = 1;
}

void main().catch(() => {
  writeResult(routes.map((route) => ({ passed: false, route })));
});

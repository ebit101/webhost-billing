import AxeBuilder from '@axe-core/playwright';
import { chromium, type Browser, type Page } from '@playwright/test';

const demoOrigin = 'http://localhost:3100';
const wcagTags: string[] = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
];
const maximumReportedRulesPerRoute = 8;

type AuditRoute = '/hosting' | '/login' | '/portal' | '/admin';

interface RouteResult {
  route: AuditRoute;
  ruleIds: string[];
}

class SafeAuditError extends Error {
  constructor(
    readonly route: AuditRoute | 'keyboard',
    readonly reason:
      | 'accessibility engine did not complete'
      | 'fixed demo origin is not configured'
      | 'generated fictional credentials are unavailable'
      | 'responsive navigation did not close'
      | 'responsive navigation did not open'
      | 'responsive navigation did not receive keyboard focus'
      | 'skip link assertion failed'
      | 'page did not become ready',
  ) {
    super('The safe-demo accessibility audit could not complete.');
  }
}

async function main(): Promise<void> {
  requireFixedDemoOrigin();
  const adminPassword = requiredSecret('DEMO_ADMIN_PASSWORD');
  const customerPassword = requiredSecret('DEMO_CUSTOMER_PASSWORD');
  const browser = await chromium.launch({ headless: true });

  try {
    const results: RouteResult[] = [];
    results.push(await auditPublicCatalogue(browser));
    results.push(await auditLogin(browser));
    results.push(
      await auditAuthenticatedRoute(
        browser,
        'customer@example.test',
        customerPassword,
        '/portal',
        'Welcome, Fictional',
        'Recent services',
      ),
    );
    results.push(
      await auditAuthenticatedRoute(
        browser,
        'admin@example.test',
        adminPassword,
        '/admin',
        'Business overview',
        'Collected revenue',
      ),
    );
    await assertKeyboardPaths(browser);
    process.stdout.write(formatReport(results));
    if (results.some((result) => result.ruleIds.length > 0)) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

async function auditPublicCatalogue(browser: Browser): Promise<RouteResult> {
  return withPage(browser, '/hosting', async (page) => {
    await page.goto(`${demoOrigin}/hosting`, { waitUntil: 'domcontentloaded' });
    await page
      .getByRole('heading', { name: 'Clear hosting plans with room to grow.' })
      .waitFor();
    await page.getByRole('heading', { name: 'Starter Hosting' }).waitFor();
    const monthlyButton = page.getByRole('button', { name: 'Monthly' });
    await page.getByRole('link', { name: 'Choose Starter Hosting' }).waitFor();
    if ((await monthlyButton.getAttribute('aria-pressed')) !== 'true') {
      throw new SafeAuditError('/hosting', 'page did not become ready');
    }
    return analyze(page, '/hosting');
  });
}

async function auditLogin(browser: Browser): Promise<RouteResult> {
  return withPage(browser, '/login', async (page) => {
    await page.goto(`${demoOrigin}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Customer sign in' }).waitFor();
    await page.getByLabel('Email address').waitFor();
    await page.getByLabel('Password').waitFor();
    await page.getByRole('button', { name: 'Sign in' }).waitFor();
    return analyze(page, '/login');
  });
}

async function auditAuthenticatedRoute(
  browser: Browser,
  email: 'admin@example.test' | 'customer@example.test',
  password: string,
  route: '/admin' | '/portal',
  heading: string,
  readyText: string,
): Promise<RouteResult> {
  return withPage(browser, route, async (page) => {
    await signIn(page, email, password, route);
    await page.getByRole('heading', { name: heading }).waitFor();
    await page.getByText(readyText, { exact: true }).waitFor();
    return analyze(page, route);
  });
}

async function analyze(page: Page, route: AuditRoute): Promise<RouteResult> {
  try {
    const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    const ruleIds = results.violations
      .filter(
        (violation) =>
          violation.impact === 'serious' || violation.impact === 'critical',
      )
      .map((violation) => violation.id)
      .sort();
    return { route, ruleIds };
  } catch {
    throw new SafeAuditError(route, 'accessibility engine did not complete');
  }
}

async function assertKeyboardPaths(browser: Browser): Promise<void> {
  const desktopContext = await browser.newContext({
    colorScheme: 'light',
    viewport: { width: 1440, height: 960 },
  });
  try {
    const page = await desktopContext.newPage();
    await page.goto(`${demoOrigin}/hosting`, { waitUntil: 'domcontentloaded' });
    await page
      .getByRole('heading', { name: 'Clear hosting plans with room to grow.' })
      .waitFor();
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Skip to main content' });
    if (
      !(await skipLink.evaluate(
        (element) => element === document.activeElement,
      ))
    ) {
      throw new SafeAuditError('keyboard', 'skip link assertion failed');
    }
    await page.keyboard.press('Enter');
    await page.waitForURL(`${demoOrigin}/hosting#main-content`);
    await page.locator('#main-content').waitFor();
  } catch (error) {
    if (error instanceof SafeAuditError) throw error;
    throw new SafeAuditError('keyboard', 'skip link assertion failed');
  } finally {
    await desktopContext.close();
  }

  const mobileContext = await browser.newContext({
    colorScheme: 'light',
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await mobileContext.newPage();
    await page.goto(`${demoOrigin}/hosting`, { waitUntil: 'domcontentloaded' });
    await page
      .getByRole('heading', { name: 'Clear hosting plans with room to grow.' })
      .waitFor();
    await page.getByRole('heading', { name: 'Starter Hosting' }).waitFor();
    const menuButton = page.locator(
      'button[aria-controls="public-mobile-navigation"]',
    );
    if ((await menuButton.getAttribute('aria-expanded')) !== 'false') {
      throw new SafeAuditError(
        'keyboard',
        'responsive navigation did not open',
      );
    }
    await menuButton.focus();
    await page.keyboard.press('Enter');
    await page
      .getByRole('navigation', { name: 'Mobile public navigation' })
      .waitFor();
    if ((await menuButton.getAttribute('aria-expanded')) !== 'true') {
      throw new SafeAuditError(
        'keyboard',
        'responsive navigation did not open',
      );
    }
    await page.keyboard.press('Tab');
    const focusIsInsideNavigation = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('#public-mobile-navigation')),
    );
    if (!focusIsInsideNavigation) {
      throw new SafeAuditError(
        'keyboard',
        'responsive navigation did not receive keyboard focus',
      );
    }
    await page.keyboard.press('Escape');
    if ((await menuButton.getAttribute('aria-expanded')) !== 'false') {
      throw new SafeAuditError(
        'keyboard',
        'responsive navigation did not close',
      );
    }
  } catch (error) {
    if (error instanceof SafeAuditError) throw error;
    throw new SafeAuditError('keyboard', 'responsive navigation did not open');
  } finally {
    await mobileContext.close();
  }
}

async function withPage<T>(
  browser: Browser,
  route: AuditRoute,
  action: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({
    colorScheme: 'light',
    viewport: { width: 1440, height: 960 },
  });
  try {
    return await action(await context.newPage());
  } catch (error) {
    if (error instanceof SafeAuditError) throw error;
    throw new SafeAuditError(route, 'page did not become ready');
  } finally {
    await context.close();
  }
}

async function signIn(
  page: Page,
  email: string,
  password: string,
  destination: '/admin' | '/portal',
): Promise<void> {
  await page.goto(`${demoOrigin}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${demoOrigin}${destination}`);
}

function formatReport(results: RouteResult[]): string {
  const lines = [
    'Safe-demo accessibility smoke audit',
    'Scope: serious/critical automated WCAG A/AA findings only; no browser artifacts are retained.',
    '',
  ];
  for (const result of results) {
    if (result.ruleIds.length === 0) {
      lines.push(`PASS ${result.route}`);
      continue;
    }
    const visibleRuleIds = result.ruleIds.slice(
      0,
      maximumReportedRulesPerRoute,
    );
    const hiddenCount = result.ruleIds.length - visibleRuleIds.length;
    lines.push(
      `FAIL ${result.route}: ${visibleRuleIds.join(', ')}${hiddenCount > 0 ? ` (+${hiddenCount} more)` : ''}`,
    );
  }
  lines.push('PASS keyboard: skip link and responsive public navigation');
  lines.push('');
  const failingRouteCount = results.filter(
    (result) => result.ruleIds.length > 0,
  ).length;
  lines.push(
    failingRouteCount === 0
      ? 'RESULT Passed 4 routes. This smoke audit is not accessibility certification.'
      : `RESULT Failed ${failingRouteCount} route${failingRouteCount === 1 ? '' : 's'}. Output is limited to routes and rule IDs.`,
  );
  return `${lines.join('\n')}\n`;
}

function requireFixedDemoOrigin(): void {
  if (process.env.DEMO_PUBLIC_ORIGIN !== demoOrigin) {
    throw new SafeAuditError('/hosting', 'fixed demo origin is not configured');
  }
}

function requiredSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new SafeAuditError(
      '/login',
      'generated fictional credentials are unavailable',
    );
  }
  return value;
}

void main().catch((error: unknown) => {
  const route = error instanceof SafeAuditError ? error.route : 'keyboard';
  const reason =
    error instanceof SafeAuditError
      ? error.reason
      : 'responsive navigation did not open';
  process.stderr.write(
    `FAIL ${route}: ${reason}.\nRESULT Failed. No credentials, raw browser errors, or browser artifacts were printed.\n`,
  );
  process.exitCode = 1;
});

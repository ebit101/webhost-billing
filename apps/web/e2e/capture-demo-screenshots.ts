import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseUrl = process.env.DEMO_PUBLIC_ORIGIN ?? 'http://localhost:3100';
const adminPassword = required('DEMO_ADMIN_PASSWORD');
const customerPassword = required('DEMO_CUSTOMER_PASSWORD');
const outputDirectory = resolve(process.cwd(), '../../docs/assets/demo');

async function main(): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    await capturePublicCatalog(
      browser,
      { width: 1440, height: 960 },
      'hosting-catalog.png',
    );
    await capturePublicCatalog(
      browser,
      { width: 390, height: 844 },
      'hosting-catalog-mobile.png',
      true,
    );
    await captureWorkspace(
      browser,
      'admin@example.test',
      adminPassword,
      '/admin',
      'Business overview',
      'Collected revenue',
      'admin-dashboard.png',
    );
    await captureWorkspace(
      browser,
      'customer@example.test',
      customerPassword,
      '/portal',
      'Welcome, Fictional',
      'Recent services',
      'customer-portal.png',
    );
  } finally {
    await browser.close();
  }
}

async function capturePublicCatalog(
  browser: Browser,
  viewport: { width: number; height: number },
  filename: string,
  mobile = false,
): Promise<void> {
  const context = await browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 1,
    hasTouch: mobile,
    isMobile: mobile,
    viewport,
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/hosting`, { waitUntil: 'networkidle' });
  await page
    .getByRole('heading', { name: 'Clear hosting plans with room to grow.' })
    .waitFor();
  await page.getByRole('heading', { name: 'Starter Hosting' }).waitFor();
  const monthlyButton = page.getByRole('button', { name: 'Monthly' });
  await monthlyButton.click();
  const primaryAction = page.getByRole('link', {
    name: 'Choose Starter Hosting',
  });
  await primaryAction.waitFor();
  if ((await monthlyButton.getAttribute('aria-pressed')) !== 'true') {
    throw new Error('Monthly catalogue pricing did not become active');
  }
  const path = resolve(outputDirectory, filename);
  if (mobile) {
    const actionBounds = await primaryAction.boundingBox();
    if (!actionBounds) {
      throw new Error('Mobile catalogue action is not visible');
    }
    await page.setViewportSize({
      width: viewport.width,
      height: Math.ceil(actionBounds.y + actionBounds.height + 32),
    });
    await page.screenshot({ path, animations: 'disabled', caret: 'hide' });
  } else {
    await page.screenshot({
      path,
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    });
  }
  await context.close();
}

async function captureWorkspace(
  browser: Browser,
  email: string,
  password: string,
  destination: string,
  heading: string,
  readyText: string,
  filename: string,
): Promise<void> {
  const context = await browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 1,
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();
  await signIn(page, email, password, destination);
  await page.getByRole('heading', { name: heading }).waitFor();
  await page.getByText(readyText, { exact: true }).waitFor();
  await page.screenshot({
    path: resolve(outputDirectory, filename),
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
  });
  await context.close();
}

async function signIn(
  page: Page,
  email: string,
  password: string,
  destination: string,
): Promise<void> {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${baseUrl}${destination}`);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

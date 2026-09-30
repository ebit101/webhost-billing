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
    await capturePublicCatalog(browser);
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
      'Good morning, Amina',
      'Your services',
      'customer-portal.png',
    );
  } finally {
    await browser.close();
  }
}

async function capturePublicCatalog(browser: Browser): Promise<void> {
  const context = await browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 1,
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/hosting`, { waitUntil: 'networkidle' });
  await page
    .getByRole('heading', { name: 'Clear hosting plans with room to grow.' })
    .waitFor();
  await page.getByRole('heading', { name: 'Starter Hosting' }).waitFor();
  await page.getByRole('button', { name: 'Monthly' }).click();
  await page.screenshot({
    path: resolve(outputDirectory, 'hosting-catalog.png'),
    fullPage: true,
  });
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

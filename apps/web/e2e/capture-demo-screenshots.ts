import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import screenshotContractJson from '../../../scripts/demo/demo-screenshot-contract.json' with { type: 'json' };

type ScreenshotAsset = {
  id: string;
  filename: string;
  width: number;
  captureViewportHeight: number;
};

type ScreenshotContract = {
  assetDirectory: string;
  assets: ScreenshotAsset[];
};

const screenshotContract = screenshotContractJson as ScreenshotContract;
const baseUrl = process.env.DEMO_PUBLIC_ORIGIN ?? 'http://localhost:3100';
const adminPassword = required('DEMO_ADMIN_PASSWORD');
const customerPassword = required('DEMO_CUSTOMER_PASSWORD');
const outputDirectory = resolve(
  process.cwd(),
  '../..',
  screenshotContract.assetDirectory,
);

async function main(): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    await capturePublicCatalog(browser, screenshotAsset('hosting-catalog'));
    await capturePublicCatalog(
      browser,
      screenshotAsset('hosting-catalog-mobile'),
      true,
    );
    await captureWorkspace(
      browser,
      screenshotAsset('admin-dashboard'),
      'admin@example.test',
      adminPassword,
      '/admin',
      'Business overview',
      'Collected revenue',
    );
    await captureWorkspace(
      browser,
      screenshotAsset('customer-portal'),
      'customer@example.test',
      customerPassword,
      '/portal',
      'Welcome, Fictional',
      'Recent services',
    );
  } finally {
    await browser.close();
  }
}

async function capturePublicCatalog(
  browser: Browser,
  asset: ScreenshotAsset,
  mobile = false,
): Promise<void> {
  const viewport = {
    width: asset.width,
    height: asset.captureViewportHeight,
  };
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
  const primaryAction = page.getByRole('link', {
    name: 'Choose Starter Hosting',
  });
  await primaryAction.waitFor();
  if ((await monthlyButton.getAttribute('aria-pressed')) !== 'true') {
    throw new Error('Available monthly catalogue pricing was not active');
  }
  const path = resolve(outputDirectory, asset.filename);
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
  asset: ScreenshotAsset,
  email: string,
  password: string,
  destination: string,
  heading: string,
  readyText: string,
): Promise<void> {
  const context = await browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 1,
    viewport: {
      width: asset.width,
      height: asset.captureViewportHeight,
    },
  });
  const page = await context.newPage();
  await signIn(page, email, password, destination);
  await page.getByRole('heading', { name: heading }).waitFor();
  await page.getByText(readyText, { exact: true }).waitFor();
  await page.screenshot({
    path: resolve(outputDirectory, asset.filename),
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
  });
  await context.close();
}

function screenshotAsset(id: string): ScreenshotAsset {
  const asset = screenshotContract.assets.find(
    (candidate) => candidate.id === id,
  );
  if (!asset) throw new Error(`Screenshot contract entry ${id} is required`);
  return asset;
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

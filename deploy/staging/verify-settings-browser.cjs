'use strict';

const { chromium } = require('@playwright/test');

const baseUrl = process.argv[2];
if (!baseUrl || !URL.canParse(baseUrl)) {
  throw new Error('A valid staging base URL is required');
}

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function main() {
  const password = await readStandardInput();
  if (password.length < 20) {
    throw new Error('Protected administrator credential input failed');
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const events = [];
    page.on('console', (message) => {
      if (message.type() === 'error') events.push(`console:${message.text()}`);
    });
    page.on('pageerror', (error) => {
      events.push(`pageerror:${error.message}`);
    });
    page.on('requestfailed', (request) => {
      if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
      events.push(
        `requestfailed:${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText ?? ''}`,
      );
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        events.push(
          `response:${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`,
        );
      }
    });

    await page.goto(new URL('/admin', baseUrl).href, {
      waitUntil: 'networkidle',
    });
    await page.getByLabel('Email address').fill('admin@example.test');
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page
      .getByRole('heading', { name: 'Business overview' })
      .waitFor({ state: 'visible' });
    await page.goto(new URL('/admin/settings', baseUrl).href, {
      waitUntil: 'networkidle',
    });

    const errorBoundary = await page
      .getByRole('heading', { name: 'Something went wrong' })
      .count();
    const settingsHeading = await page
      .getByRole('heading', { name: 'Business settings and secrets' })
      .count();
    if (errorBoundary !== 0 || settingsHeading !== 1 || events.length !== 0) {
      for (const event of events.slice(0, 20)) console.error(event);
      throw new Error(
        `Settings browser check failed (heading=${settingsHeading}, boundary=${errorBoundary}, errors=${events.length})`,
      );
    }
    console.log(`Settings browser route: PASS (${baseUrl})`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Browser check failed',
  );
  process.exitCode = 1;
});

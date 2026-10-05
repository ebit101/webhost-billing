import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/branding',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: 'line',
  outputDir: './test-results/branding',
  use: {
    baseURL: 'http://127.0.0.1:3187',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  webServer: {
    command: 'pnpm exec next start --hostname 127.0.0.1 --port 3187',
    url: 'http://127.0.0.1:3187/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

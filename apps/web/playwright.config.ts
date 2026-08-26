import { defineConfig, devices } from '@playwright/test';
import {
  E2E_API_ORIGIN,
  E2E_WEB_ORIGIN,
  e2eApiEnvironment,
  e2eWebEnvironment,
} from './e2e/environment';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  outputDir: './test-results',
  reporter: [['line'], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_WEB_ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @webhost-billing/api start',
      cwd: '../..',
      env: e2eApiEnvironment,
      url: `${E2E_API_ORIGIN}/auth/csrf`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        'pnpm --filter @webhost-billing/web exec next dev --hostname 127.0.0.1 --port 3200',
      cwd: '../..',
      env: e2eWebEnvironment,
      url: `${E2E_WEB_ORIGIN}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});

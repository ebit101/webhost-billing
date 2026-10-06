import { defineConfig, devices } from '@playwright/test';

// UI-only fixture server: real authorization and transactions are tested separately
// by the isolated Nest/PostgreSQL staff e2e suite, not by this mock.
export default defineConfig({
  testDir: './e2e/staff',
  testMatch: '*.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 12_000 },
  outputDir: './test-results/staff',
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3300',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/staff/fixture-api.mjs',
      url: 'http://127.0.0.1:3301/auth/csrf',
      reuseExistingServer: false,
    },
    {
      command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3300',
      url: 'http://127.0.0.1:3300/login',
      reuseExistingServer: false,
      env: {
        NEXT_DIST_DIR: '.next-e2e',
        INTERNAL_API_URL: 'http://127.0.0.1:3301',
        NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3301',
        NEXT_PUBLIC_WEB_ORIGIN: 'http://127.0.0.1:3300',
      },
      timeout: 120_000,
    },
  ],
});

import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: [
      '.next/**',
      'coverage/**',
      'dist/**',
      'e2e/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
});

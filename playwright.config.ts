import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    ...devices['iPhone 13'],
    baseURL: 'http://127.0.0.1:3001',
    browserName: 'chromium',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3001',
    env: {
      ENABLE_QUICK_ADD: 'true',
      NEXT_PUBLIC_ENABLE_QUICK_ADD: 'true',
      NEXT_PUBLIC_OPERATOR_TEST_BYPASS: 'true',
      OPERATOR_EMAILS: 'bob@example.com',
      OPERATOR_TEST_BYPASS: 'true',
    },
    reuseExistingServer: !process.env.CI,
    url: 'http://127.0.0.1:3001',
  },
});

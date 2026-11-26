import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/test/e2e',
  timeout: 30000,
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5179',
    trace: 'on-first-retry',
    channel: 'chrome',
  },
  webServer: {
    command: 'npm run dev -- --port 5179',
    url: 'http://localhost:5179',
    reuseExistingServer: false,
  },
});

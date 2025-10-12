import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 60000,
  use: {
    headless: true,
    ignoreHTTPSErrors: true,
    viewport: { width: 1200, height: 2000 }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 7'] } }
  ]
});

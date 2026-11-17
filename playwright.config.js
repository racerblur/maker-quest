import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  workers: 1,
  use: { baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:4173', headless: true,
    ignoreHTTPSErrors: process.env.TEST_IGNORE_HTTPS_ERRORS === 'true',
    viewport: { width: 390, height: 844 } },
  webServer: process.env.TEST_BASE_URL ? undefined : {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory dist',
    port: 4173, reuseExistingServer: false
  }
});

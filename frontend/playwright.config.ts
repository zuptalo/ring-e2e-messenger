import { defineConfig, devices } from '@playwright/test';

// e2e runs against the PRODUCTION build served by `vite preview` (closest to
// what the Go binary embeds). localhost is a secure context, so the service
// worker registers. Two projects: Chromium for manifest/SW-control/install
// assertions; WebKit (iOS device profile) for the coached A2HS + iOS
// version-gate paths. Per-test iOS user agents are overridden where a specific
// iOS version (e.g. <16.4) is required.
const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit-ios',
      use: { ...devices['iPhone 13'] }, // WebKit engine + iOS UA + mobile viewport
    },
  ],
  webServer: {
    command: 'pnpm run build && pnpm run preview -- --port ' + PORT,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

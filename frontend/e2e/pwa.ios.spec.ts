import { test, expect } from '@playwright/test';

// US2 (and US3) — iOS-specific paths. Runs only under the WebKit (iOS device)
// project; the iPhone profile supplies an iOS Safari user agent.
test.skip(({ browserName }) => browserName !== 'webkit', 'iOS (WebKit) coaching paths');

test.describe('Coached install-first onboarding — iOS (US2)', () => {
  test('non-standalone iOS shows the coached Add-to-Home-Screen steps', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('install-coach')).toBeVisible();
    await expect(page.getByTestId('ios-steps')).toContainText(/Add to Home Screen/i);
    // Install-first: the app shell is not exposed pre-install.
    await expect(page.getByTestId('app-shell')).toHaveCount(0);
  });

  test('standalone launch goes straight to the app shell (coaching suppressed)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    });
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await expect(page.getByTestId('app-shell')).toContainText('skeleton OK');
    await expect(page.getByTestId('install-coach')).toHaveCount(0);
  });
});

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

const UA_IOS_CHROME_164 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/110.0.0.0 Mobile/15E148 Safari/604.1';

test.describe('Coached install-first onboarding — iOS Chrome (US2)', () => {
  test.use({ userAgent: UA_IOS_CHROME_164 });

  test('iOS Chrome shows coached steps (not InstallUnavailable)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('install-coach')).toBeVisible();
    await expect(page.getByTestId('install-unavailable')).toHaveCount(0);
    await expect(page.getByTestId('ios-steps')).toContainText(/Share/i);
    await expect(page.getByTestId('app-shell')).toHaveCount(0);
  });
});

const UA_IOS_163 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const UA_IOS_164 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1';

test.describe('iOS push-capability version gate — iOS <16.4 (US3)', () => {
  test.use({ userAgent: UA_IOS_163 });

  test('iOS 16.3 shows the version gate alongside the install coach', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('install-coach')).toBeVisible();
    await expect(page.getByTestId('ios-version-gate')).toBeVisible();
    await expect(page.getByTestId('ios-version-gate')).toContainText(/16\.4/);
  });
});

test.describe('iOS push-capability version gate — iOS ≥16.4 (US3)', () => {
  test.use({ userAgent: UA_IOS_164 });

  test('iOS 16.4 shows the coach but no version gate', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('install-coach')).toBeVisible();
    await expect(page.getByTestId('ios-version-gate')).toHaveCount(0);
  });
});

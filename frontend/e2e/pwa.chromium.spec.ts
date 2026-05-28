import { test, expect } from '@playwright/test';

// US1 — installable, SW-controlled, offline-capable shell. Chromium-only
// (service-worker control + manifest are exercised here; the iOS coaching
// paths live in pwa.ios.spec.ts under the WebKit project).
test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium-only PWA checks');

test.describe('PWA app shell (US1)', () => {
  test('serves a standalone web app manifest at /manifest.webmanifest', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    const manifest = await res.json();
    expect(manifest.name).toBe('Ring');
    expect(manifest.display).toBe('standalone');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test('registers a service worker that controls the page after reload', async ({ page }) => {
    await page.goto('/');
    // Wait for an active SW registration, then reload — clientsClaim means the
    // reloaded page is controlled.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
      timeout: 20_000,
    });
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
    expect(controlled).toBe(true);
  });

  test('app shell renders offline after first load', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
      timeout: 20_000,
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('body')).toContainText('Ring');
    await context.setOffline(false);
  });
});

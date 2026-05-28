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

test.describe('Coached install-first onboarding — Chromium (US2)', () => {
  test('non-iOS browser with no install prompt shows the InstallUnavailable notice', async ({
    page,
  }) => {
    // Desktop Chrome, non-standalone, no captured beforeinstallprompt → the
    // app must not dead-end on a coach it cannot honor (FR-011, SC-007).
    await page.goto('/');
    await expect(page.getByTestId('install-unavailable')).toBeVisible();
    await expect(page.getByTestId('install-unavailable')).toContainText(
      /supported mobile browser/i,
    );
    // Install-first: the app shell is not exposed pre-install.
    await expect(page.getByTestId('app-shell')).toHaveCount(0);
  });

  test('a captured beforeinstallprompt renders a native Install button that calls prompt()', async ({
    page,
  }) => {
    await page.goto('/');
    // The InstallUnavailable notice proves hydration ran and the
    // beforeinstallprompt listener is attached; now synthesize the event.
    await expect(page.getByTestId('install-unavailable')).toBeVisible();
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt') as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: string; platform: string }>;
      };
      e.prompt = () => {
        (window as unknown as { __promptCalled?: boolean }).__promptCalled = true;
        return Promise.resolve();
      };
      e.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
      window.dispatchEvent(e);
    });
    const installBtn = page.getByTestId('install-native');
    await expect(installBtn).toBeVisible();
    await installBtn.click();
    await page.waitForFunction(
      () => (window as unknown as { __promptCalled?: boolean }).__promptCalled === true,
    );
  });
});

test.describe('Generated icon + iOS splash assets (SC-009)', () => {
  test('the manifest advertises the full icon set including a maskable icon', async ({
    request,
  }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    const sizes: string[] = manifest.icons.map((i: { sizes: string }) => i.sizes);
    // The minimal-2023 set: 64, 192, 512 + a 512 maskable — all from icon.svg.
    expect(sizes).toEqual(expect.arrayContaining(['64x64', '192x192', '512x512']));
    const maskable = manifest.icons.filter((i: { purpose?: string }) =>
      i.purpose?.includes('maskable'),
    );
    expect(maskable.length).toBeGreaterThan(0);
    // Every advertised icon must actually be served from the embed root.
    for (const icon of manifest.icons as { src: string }[]) {
      const res = await request.get(new URL(icon.src, 'http://localhost/').pathname);
      expect(res.status(), `icon ${icon.src}`).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
    }
  });

  test('the apple-touch-icon and iOS apple-touch-startup-image splash set are served', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect(touchIcon).toBeTruthy();
    expect((await request.get(touchIcon!)).status()).toBe(200);

    // The generated iOS launch-image set (portrait + landscape per device size).
    const splashHrefs = await page
      .locator('link[rel="apple-touch-startup-image"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
    expect(splashHrefs.length).toBeGreaterThan(10);
    // Spot-check that the referenced PNGs resolve (filenames must match the build).
    for (const href of [splashHrefs[0], splashHrefs[splashHrefs.length - 1]]) {
      const res = await request.get(href);
      expect(res.status(), `splash ${href}`).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
    }
  });
});

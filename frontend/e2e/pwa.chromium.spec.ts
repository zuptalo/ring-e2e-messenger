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
  test('a Chromium browser with no install prompt is treated as already installed', async ({
    page,
  }) => {
    // Desktop Chrome/Edge, non-standalone, no captured beforeinstallprompt:
    // Chromium suppresses the event once installed, so after the grace window the
    // app concludes it is already installed and points at the OS launcher rather
    // than dead-ending on a coach it cannot honor (FR-011, SC-007).
    await page.goto('/');
    await expect(page.getByTestId('install-installed')).toBeVisible();
    await expect(page.getByTestId('install-installed')).toContainText(/installed/i);
    // Install-first: the app shell is not exposed in a browser tab.
    await expect(page.getByTestId('app-shell')).toHaveCount(0);
  });

  test('a captured beforeinstallprompt renders a native Install button that calls prompt()', async ({
    page,
  }) => {
    await page.goto('/');
    // The installed-state view proves hydration ran and the beforeinstallprompt
    // listener is attached; now synthesize the event to drive the native prompt.
    await expect(page.getByTestId('install-installed')).toBeVisible();
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

const UA_DESKTOP_FIREFOX =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0';

test.describe('Install fallback on a non-installable browser — Firefox UA (US2)', () => {
  test.use({ userAgent: UA_DESKTOP_FIREFOX });

  test('a non-Chromium desktop browser shows the install fallback notice', async ({ page }) => {
    // No beforeinstallprompt and not Chromium ⇒ Ring genuinely cannot install
    // here (FR-011, SC-007): show guidance toward a supported browser, not the
    // "already installed" state and not a dead-end coach.
    await page.goto('/');
    await expect(page.getByTestId('install-unavailable')).toBeVisible();
    await expect(page.getByTestId('install-unavailable')).toContainText(/Chrome or Edge/i);
    await expect(page.getByTestId('install-installed')).toHaveCount(0);
    await expect(page.getByTestId('app-shell')).toHaveCount(0);
  });
});

test.describe('Generated icon + iOS splash assets (SC-009)', () => {
  test('the manifest advertises the full icon set including a maskable icon', async ({
    request,
  }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    const sizes: string[] = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['256x256', '180x180', '192x192', '512x512']));
    // Chrome/Edge iOS share previews use manifest icons — largest full-bleed first.
    expect(manifest.icons[0].src).toBe('ring-share-256.png');
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
    expect((await request.get('/apple-touch-icon.png')).status()).toBe(200);
    expect((await request.get('/favicon.png')).status()).toBe(200);
    expect((await request.get('/ring-share-256.png')).status()).toBe(200);
    const touchIcon = page.locator('link[rel="apple-touch-icon"]').first();
    const href = await touchIcon.getAttribute('href');
    expect(href).toBeTruthy();
    expect((await request.get(href!.split('?')[0])).status()).toBe(200);

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

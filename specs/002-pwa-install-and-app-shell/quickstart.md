# Quickstart — PWA Install & App Shell (002)

**Audience**: A developer on the 001 skeleton who wants to build the PWA, install it on a phone, and run the test suites. Assumes the 001 prerequisites (`git`, `docker`, `make`, `go 1.26`, `node 22`, `pnpm 9`) plus the dev TLS trust step.

## 1. Install dependencies & the source icon (1 min)

```bash
cd frontend
pnpm add -D vite-plugin-pwa @vite-pwa/assets-generator @playwright/test
pnpm exec playwright install --with-deps chromium webkit
# Source icon (single source of truth for all icons + iOS splash):
mkdir -p static/icons
curl -fsSL https://raw.githubusercontent.com/zuptalo/ring/refs/heads/main/frontend/public/icons/icon.svg \
  -o static/icons/icon.svg
```

## 2. Generate icons + iOS splash from the SVG

```bash
cd frontend
pnpm exec pwa-assets-generator        # reads pwa-assets.config.ts → emits icon set + apple splash images
```

## 3. Build and preview the PWA locally (HTTP, fast loop)

```bash
cd frontend
RING_VERSION=dev RING_COMMIT=dev pnpm run build
pnpm exec vite preview --port 4173
# Open http://localhost:4173 — localhost is a secure context, so the service worker registers.
```

What to look for:
- DevTools → Application → **Manifest**: name "Ring", `display: standalone`, icons incl. maskable.
- DevTools → Application → **Service Workers**: registered + "activated and is running"; reload → the page is **controlled**.
- In a normal (non-standalone) tab you see the **coached install flow**, not the app shell (install-first).

## 4. Install on a real phone (the real test — via the full stack)

```bash
# from repo root, with the dev stack + TLS trust from 001:
make up            # builds the image (now embedding manifest/SW/icons) and runs the stack
# On a phone on the same network, browse to https://ring.localtest.me/
```

- **iOS Safari (≥16.4)**: follow the coached Share → "Add to Home Screen" steps → launch from the home screen → the app shell renders standalone → notification permission is requested once.
- **iOS Safari (<16.4)**: the version-gate warning explains push will degrade to foreground polling; install still works, no notification prompt.
- **Android Chrome**: the native install prompt is offered via the coach's Install button.

## 5. Run the tests

```bash
# Unit (capability/version parsing):
( cd frontend && pnpm test )

# Playwright e2e (Chromium: manifest + SW control + install prompt; WebKit/iOS-UA: coaching + version gate):
( cd frontend && pnpm exec playwright test )

# Go serving contract (production binary serves manifest + SW from embed.FS, 001 routes intact):
( cd backend && go test -tags=integration ./test/integration/... )
```

## 6. Verify the serving contract by hand (optional)

```bash
# Against the running stack:
curl -ksI https://ring.localtest.me/manifest.webmanifest | grep -i content-type
#   → content-type: application/manifest+json
curl -ksI https://ring.localtest.me/sw.js | grep -i content-type
#   → content-type: text/javascript
curl -ks  https://ring.localtest.me/healthz   # → {"status":"ok"} (001 contract unchanged)
```

## 7. Notes & limitations

- **Service workers require a secure context.** `localhost` and the Caddy-TLS `ring.localtest.me` both qualify; plain-HTTP non-localhost origins will not register a SW.
- **Real iOS Safari** behavior (true install gesture, splash, web push gating) is verified manually on a device per §4 — the automated WebKit/iOS-UA Playwright run approximates the rendering paths but is not a real iOS device.
- Actual **push delivery** is not in this feature; the notification-permission grant captured here is consumed by feature 005.

# Quickstart — PWA Install & App Shell (002)

**Audience**: A developer on the 001 skeleton who wants to build the PWA, install it on a phone, and run the test suites. Assumes the 001 prerequisites (`git`, `docker`, `make`, `go 1.26`, `node 22`, `pnpm 9`) plus the dev TLS trust step.

## 1. Install dependencies (1 min)

```bash
cd frontend
pnpm install                                   # vite-plugin-pwa, @vite-pwa/sveltekit,
                                               # @vite-pwa/assets-generator + Playwright are
                                               # already pinned in package.json
pnpm exec playwright install --with-deps chromium webkit
```

> The single source icon ships in the repo at `frontend/static/icons/icon.svg`, and the full
> icon set generated from it is committed under `frontend/static/icons/` (see §2) — a fresh
> checkout needs no download. (WebKit fails to install on macOS &lt;13; that is expected — see §5.)

## 2. (Re)generate icons from the SVG — only when `icon.svg` changes

The icon set is committed in `static/icons/`, so you normally skip this. Regenerate only after
editing `static/icons/icon.svg`:

```bash
cd frontend
pnpm run icons:generate     # pwa-assets-generator → static/icons/, then sync-icons.mjs mirrors the
                            # three web-root convention names (apple-touch-icon.png, favicon.png,
                            # ring-share-256.png). Everything else is referenced as /icons/….
```

There is **no native iOS splash image set**: the manifest `background_color` paints the launch
background and the in-app `#ring-shield` overlay (logo) fades in over it, so generation emits
icons only — no `apple-splash-*` images.

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

## 4. Install on a real device (the real test — via the full stack)

```bash
# from repo root, with TLS trust from 001 (`make trust`):
make image         # build the production image (embeds manifest/SW/icons)
make up            # run the full stack from that prebuilt image
# On a device on the same network, browse to https://ring.localtest.me/
```

- **iOS Safari (≥16.4)**: follow the coached Share → "Add to Home Screen" steps → launch from the home screen → the branded launch splash (logo over the brand background) fades in, then the app shell renders standalone → a one-time, **gesture-driven** "Enable notifications" prompt appears.
- **iOS Safari (<16.4)**: the version-gate warning explains push will degrade to foreground polling; install still works, and no notification prompt is shown.
- **Android Chrome**: the native install prompt is offered via the coach's **Install** button.
- **Desktop Chrome/Edge**: the coach offers a native **Install** button (`beforeinstallprompt`); installing reparents the tab and flips to the app shell with no reload. Opening the app in a normal tab instead shows an "already installed — use your launcher" notice. Desktop **Safari/Firefox** (no `beforeinstallprompt`) get a "use a supported browser" fallback. For a TLS desktop loop without a phone, use `make dev-remote-prod`.

## 5. Run the tests

```bash
# Unit (capability/version parsing):
( cd frontend && pnpm test )

# Playwright e2e (Chromium: manifest + SW control + install prompt; WebKit/iOS-UA: coaching + version gate):
( cd frontend && pnpm exec playwright test )
# WebKit cannot run on macOS <13, so locally you can only run the Chromium project
# (`--project=chromium`); the Linux CI runner is the authoritative gate for the
# webkit-ios project (both engines run green there).

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
- **Real iOS Safari** behavior (true install gesture, the in-app launch splash, web push gating) is verified manually on a device per §4 — the automated WebKit/iOS-UA Playwright run approximates the rendering paths but is not a real iOS device, and (per §5) runs only on the Linux CI host.
- Actual **push delivery** is not in this feature; the notification-permission grant captured here is consumed by feature 005.
- **Release**: this feature is purely additive (new static assets + client onboarding; no change to the 001 HTTP contracts), so per plan §IV the next release is a **MINOR** bump — `v0.2.0`. The manifest and service-worker URLs are now contract surfaces the integration test pins; future breaking changes to them require a MAJOR bump. No tag exists yet — cut `v0.2.0` when releasing.

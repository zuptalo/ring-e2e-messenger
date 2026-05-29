# Contract — Install-First Onboarding UI (002)

The client UI contract: given the **Device Capability Profile** (`data-model.md` §1) and **Onboarding State** (§2), exactly one top-level view renders. This is the testable surface for the Playwright e2e suite. It is install-first: normal app functionality is reachable only in standalone mode.

## Top-level view selection

Evaluated on every launch, in order:

| # | Condition | View rendered | Notes |
|---|---|---|---|
| 1 | `isStandalone === true` | **App shell** (the real app) | The only path to normal functionality. A branded shield (`#ring-shield` in `app.html`, logo + version) covers the shell from first paint on each standalone launch (~2.5–3.5 s, then fades out) — covering pre-hydration avoids a flash of app content — and re-covers instantly on `blur`/`visibilitychange:hidden` so the iOS app-switcher snapshot does not reveal content (best-effort). On the first standalone launch, run the onboarding-final step (permission/skip). |
| 2 | `!isStandalone` AND (`platform === 'ios'` OR `installPromptAvailable`) | **InstallCoach** | Any iOS browser → the same manual Share → "Add to Home Screen" steps (Add-to-Home-Screen lives behind the Share control on all iOS browsers). `installPromptAvailable` → native install button that calls the captured `beforeinstallprompt`. |
| 3 | `!isStandalone` AND `isChromium` AND no prompt (after a short grace window) | **Installed** notice | UA heuristic: a Chromium browser (Chrome/Edge/…) suppresses `beforeinstallprompt` once the PWA is installed, so absence of the prompt while not standalone implies it is already installed. "Ring is installed — open it from your dock, apps, or home screen, or use your browser's Open-in-app button." Browsers expose no API to launch an installed PWA from a tab, so no in-page launch button — the address-bar Open-in-app affordance is the supported launcher. |
| 4 | `!isStandalone` AND not installable (no prompt, not iOS, not Chromium) | **Open-or-install** notice | Safari/Firefox never fire `beforeinstallprompt`, so they cannot be distinguished as installed: "Already installed Ring? Open it from your dock or apps… Otherwise install it with Chrome or Edge, or add it to your Home Screen on iOS." No dead-end coaching (FR-011). |

The grace window (≈1.2 s) before view 3 settles avoids briefly mislabelling a not-yet-installed Chromium as installed: a fresh installable Chromium fires `beforeinstallprompt` shortly after load → view 2 (native). During the grace window a Chromium with no prompt yet renders the view-4 notice.

Additionally, **independent of views 2–4**: if `platform === 'ios' && !pushCapable` (iOS <16.4), the **IOSVersionGate** warning is shown (composed with the InstallCoach view) — push will degrade to foreground polling.

## InstallCoach variants

| Variant | Trigger | Behavior |
|---|---|---|
| iOS manual | `platform === 'ios'` (no `beforeinstallprompt`) | Step-by-step Share → "Add to Home Screen" → Add (identical wording on all iOS browsers; Share control shown with an icon in the coach). Static, illustrative; cannot programmatically install on iOS. |
| Native prompt | `installPromptAvailable` | Renders an "Install" button; click → `prompt()` on the captured event → on `accepted`, the next standalone launch reaches the app shell. |

## Onboarding-final step (first standalone launch only)

| Condition | Action |
|---|---|
| `pushCapable && notificationPermission === 'default'` | Show a one-time "Enable notifications" card in the app shell. The user's **tap** calls `Notification.requestPermission()` and persists the result (`granted`/`denied`); a dismissed prompt stays `default` (a later tap may ask again). "Not now" sets `skipped`. |
| `!pushCapable && notificationPermission === 'default'` | Set `notificationPermission = 'skipped'`; do **not** prompt. |
| `notificationPermission ∈ {granted, denied, skipped}` | No-op (never re-prompt; the card is not shown). |

The permission request MUST originate from a **user gesture** (the tap), never an automatic on-load call: iOS Safari standalone rejects a gesture-less request, and Chrome downgrades it to a silent quiet-UI chip. `install.completed` is logged once on the first standalone launch (guarded by `standaloneOnboarded`).

Notification permission MUST NOT be requested in any pre-install view (views 2–4) — only in the standalone app shell, and only when `pushCapable` (FR-006, SC-004).

## Observability (structured client events)

Each view/action emits one structured JSON log record (stable `event`, `outcome`):
`coach.shown`, `versiongate.shown`, `install.completed`, `install.detected` (`installed`), `install.unavailable` (platform), `notif.permission` (`granted|denied|skipped`), `storage.persist` (`granted|denied|unsupported`).

## Playwright assertions (map to acceptance scenarios)

- **Chromium**: `/manifest.webmanifest` fetches 200; after load+reload `navigator.serviceWorker.controller` is non-null (US1); with a stubbed `beforeinstallprompt`, view 2 renders the native install button (US2); with no prompt, the view-3 installed notice renders after the grace window (US2).
- **Chromium + Firefox UA**: view 4 (open-or-install fallback) renders; not the installed notice (FR-011).
- **WebKit + iOS UA (≥16.4), non-standalone**: view 2 renders the iOS manual steps; no notification prompt occurs (US2); no version gate (US3).
- **WebKit + iOS UA (<16.4), non-standalone**: IOSVersionGate warning renders (US3).
- **Standalone emulation** (display-mode standalone): app shell renders, coaching suppressed (US2 scenario 4).

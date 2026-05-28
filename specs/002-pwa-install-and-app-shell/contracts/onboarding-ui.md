# Contract — Install-First Onboarding UI (002)

The client UI contract: given the **Device Capability Profile** (`data-model.md` §1) and **Onboarding State** (§2), exactly one top-level view renders. This is the testable surface for the Playwright e2e suite. It is install-first: normal app functionality is reachable only in standalone mode.

## Top-level view selection

Evaluated on every launch, in order:

| # | Condition | View rendered | Notes |
|---|---|---|---|
| 1 | `isStandalone === true` | **App shell** (the real app) | The only path to normal functionality. On the first standalone launch, run the onboarding-final step (permission/skip). |
| 2 | `!isStandalone` AND (`isIOSSafari` OR `installPromptAvailable`) | **InstallCoach** | iOS Safari → manual Share → "Add to Home Screen" steps. `installPromptAvailable` → native install button that calls the captured `beforeinstallprompt`. |
| 3 | `!isStandalone` AND not installable (no prompt, not iOS Safari) | **InstallUnavailable** notice | "Install Ring on a supported mobile browser." No dead-end coaching (FR-011). |

Additionally, **independent of view 2/3**: if `isIOSSafari && !pushCapable` (iOS <16.4), the **IOSVersionGate** warning is shown (composed with the InstallCoach view) — push will degrade to foreground polling.

## InstallCoach variants

| Variant | Trigger | Behavior |
|---|---|---|
| iOS manual | `isIOSSafari` (no `beforeinstallprompt`) | Step-by-step: tap Share → scroll → "Add to Home Screen" → Add. Static, illustrative; cannot programmatically install on iOS. |
| Native prompt | `installPromptAvailable` | Renders an "Install" button; click → `prompt()` on the captured event → on `accepted`, the next standalone launch reaches the app shell. |

## Onboarding-final step (first standalone launch only)

| Condition | Action |
|---|---|
| `pushCapable && notificationPermission === 'default'` | Call `Notification.requestPermission()`, persist result (`granted`/`denied`). |
| `!pushCapable && notificationPermission === 'default'` | Set `notificationPermission = 'skipped'`; do **not** prompt. |
| `notificationPermission ∈ {granted, denied, skipped}` | No-op (never re-prompt). |

Notification permission MUST NOT be requested in any pre-install view (views 2/3) — only in the standalone app shell, and only when `pushCapable` (FR-006, SC-004).

## Observability (structured client events)

Each view/action emits one structured JSON log record (stable `event`, `outcome`):
`coach.shown`, `versiongate.shown`, `install.completed`, `notif.permission` (`granted|denied|skipped`), `storage.persist` (`granted|denied|unsupported`).

## Playwright assertions (map to acceptance scenarios)

- **Chromium**: `/manifest.webmanifest` fetches 200; after load+reload `navigator.serviceWorker.controller` is non-null (US1); with a stubbed `beforeinstallprompt`, view 2 renders the native install button (US2).
- **WebKit + iOS UA (≥16.4), non-standalone**: view 2 renders the iOS manual steps; no notification prompt occurs (US2); no version gate (US3).
- **WebKit + iOS UA (<16.4), non-standalone**: IOSVersionGate warning renders (US3).
- **Standalone emulation** (display-mode standalone): app shell renders, coaching suppressed (US2 scenario 4).

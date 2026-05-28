---

description: "Task list for feature 002 — PWA Install & App Shell"
---

# Tasks: PWA Install & App Shell

**Input**: Design documents from `/specs/002-pwa-install-and-app-shell/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED — the spec mandates a frontend integration test (FR-015) and the constitution mandates Test-First (Principle I). Test tasks are written first and observed failing before implementation.

**Organization**: Grouped by the three user stories from spec.md so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description with file path`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish have no story label)

## Path Conventions

Web app, two trees from feature 001: `frontend/` (SvelteKit/Vite) and `backend/` (Go). This feature is frontend-only except one backend MIME registration. Build output is embedded into the Go binary via the existing `//go:embed all:dist`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add PWA + test tooling and the source icon.

- [X] T001 Add dev dependencies to `frontend/package.json` (`vite-plugin-pwa`, `@vite-pwa/assets-generator`, `@playwright/test`) via `pnpm add -D`, then `pnpm exec playwright install --with-deps chromium webkit`. Commit `frontend/pnpm-lock.yaml`.
- [X] T002 [P] Fetch the source icon to `frontend/static/icons/icon.svg` from `https://raw.githubusercontent.com/zuptalo/ring/refs/heads/main/frontend/public/icons/icon.svg` (single source for all icons + iOS splash).
- [X] T003 Create `frontend/pwa-assets.config.ts` (`@vite-pwa/assets-generator` preset: PWA icon set incl. maskable + Apple touch icon + iOS launch/splash image set from `static/icons/icon.svg`) and run `pnpm exec pwa-assets-generator` to emit the assets.
- [X] T004 [P] Create `frontend/playwright.config.ts` with two projects — `chromium` and `webkit` (the latter configured per-test with an iOS user agent) — and a `webServer` that runs `vite preview` against the production build. Add a `test:e2e` script to `frontend/package.json`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared client modules used by US2/US3 (capability detection, onboarding state, structured logging).

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [X] T005 [P] Write `frontend/src/lib/pwa/capability.test.ts` (Vitest, MUST FAIL first) covering the Device Capability Profile rules from `data-model.md` §1: iOS-Safari detection (incl. iPadOS desktop-mode `Macintosh`+`maxTouchPoints>1`), iOS version parse, the **16.4 push boundary**, `isStandalone`, and unparseable-version → `pushCapable=false` (fail-safe).
- [X] T006 Implement `frontend/src/lib/pwa/capability.ts` (`getCapabilityProfile()` returning the typed profile) until T005 passes.
- [X] T007 [P] Implement `frontend/src/lib/pwa/onboarding.ts` — Onboarding State persisted in `localStorage` per `data-model.md` §2 (`schemaVersion`, `firstLaunchAt`, `persistRequested`, `persistGranted`, `notificationPermission`), with load/save, defaults, `schemaVersion` migration-reset, and the never-re-prompt invariants. (Behavior of `persist()`/permission requests is wired in US2/US3.)
- [X] T008 [P] Implement `frontend/src/lib/pwa/log.ts` — minimal client structured logger emitting JSON records (`{event, outcome, ...}`) to the console for the onboarding events listed in `contracts/onboarding-ui.md` (console sink; backend ingestion deferred to feature 009).

**Checkpoint**: Shared modules ready; user stories can proceed.

---

## Phase 3: User Story 1 — Installable, fast-loading app shell (Priority: P1) 🎯 MVP

**Goal**: A manifest at `/manifest.webmanifest`, a service worker registered on first load that controls the page and precaches the shell, and an installable PWA whose shell loads offline.

**Independent Test**: Load the app; manifest fetches 200 with the right content type; the SW registers and controls the page after reload; a reload with the network disabled renders the shell; the binary serves the assets from `embed.FS` and the 001 routes are intact.

### Tests for User Story 1 ⚠️ (write first, observe failing)

- [X] T009 [US1] Write `frontend/e2e/pwa.chromium.spec.ts` (Playwright Chromium, MUST FAIL) — `GET /manifest.webmanifest` → 200 and parses; after load + reload `navigator.serviceWorker.controller` is non-null; an offline reload still renders the shell (SC-002).
- [X] T010 [P] [US1] Write `backend/test/integration/pwa_assets_test.go` (build tag `integration`, MUST FAIL) reusing the 001 testcontainers harness to boot the real binary, asserting per `contracts/static-assets.md`: `/manifest.webmanifest` → 200 + `application/manifest+json` (body satisfies `contracts/manifest.schema.json`); `/sw.js` → 200 + a JavaScript content type; and the regression guard that `/healthz` → 200 and `/ws` → 426.

### Implementation for User Story 1

- [X] T011 [US1] Configure `VitePWA({...})` in `frontend/vite.config.ts` — `generateSW`, `registerType: 'autoUpdate'`, manifest fields satisfying `contracts/manifest.schema.json` (name/short_name "Ring", `display: standalone`, scope/start_url `/`, theme/background colors, generated icons incl. maskable), and `globPatterns` precaching the prerendered shell + `_app/` assets.
- [X] T012 [US1] Register the service worker on first load via the plugin's `registerSW` from `frontend/src/routes/+layout.ts`, keeping `prerender = true`.
- [X] T013 [US1] Inject the manifest `<link>`, `theme-color` meta, `apple-touch-icon`, and the generated iOS `apple-touch-startup-image` `<link>` set into `frontend/src/app.html`.
- [X] T014 [US1] Add `mime.AddExtensionType(".webmanifest", "application/manifest+json")` in `backend/internal/web/embed.go` before the file server is constructed (so the embedded manifest is served with the correct content type).
- [X] T015 [US1] Verify the build→embed staging carries the new assets: `make frontend-embed` (and the `Dockerfile` copy) place the generated manifest/SW/icons/splash into `backend/internal/web/dist/`; adjust `globPatterns`/paths if any asset is missed.

**Checkpoint**: US1 fully functional — installable, SW-controlled, offline-capable shell served from the single image.

---

## Phase 4: User Story 2 — Coached, install-first A2HS onboarding (Priority: P2)

**Goal**: Until standalone, the app shows only the coached install flow (iOS manual steps vs native prompt); after install, notification permission is requested only on push-capable platforms.

**Independent Test**: Simulated iOS UA (non-standalone) renders the iOS manual A2HS steps and never prompts for notifications pre-install; a captured `beforeinstallprompt` renders the native Install button; standalone emulation renders the app shell with coaching suppressed.

### Tests for User Story 2 ⚠️ (write first, observe failing)

- [X] T016 [US2] Write `frontend/e2e/pwa.ios.spec.ts` (Playwright WebKit + injected iOS UA, MUST FAIL) — non-standalone iOS renders `InstallCoach` manual steps; no notification prompt occurs pre-install; `display-mode: standalone` emulation renders the app shell and suppresses coaching (US2 scenarios 1, 4, 5).
- [X] T017 [P] [US2] Extend `frontend/e2e/pwa.chromium.spec.ts` (MUST FAIL) — (a) with a stubbed `beforeinstallprompt`, the coach renders a native Install button that invokes `prompt()` (US2 scenario 2); (b) with NO `beforeinstallprompt` and a non-iOS UA, the **InstallUnavailable** "install on a supported mobile browser" notice renders, not a dead-end coach (FR-011, SC-007).

### Implementation for User Story 2

- [X] T018 [P] [US2] Implement `frontend/src/lib/components/InstallCoach.svelte` with two variants: iOS manual Share → "Add to Home Screen" steps, and a native Install button driven by a captured `beforeinstallprompt`.
- [X] T019 [US2] Implement install-first gating in `frontend/src/routes/+page.svelte` using `capability.ts`: `isStandalone` → app shell; else `InstallCoach`; non-installable (no prompt, not iOS Safari) → an "install on a supported mobile browser" notice (FR-011, `contracts/onboarding-ui.md` view table). Emit `coach.shown`.
- [X] T020 [US2] Capture `beforeinstallprompt` (prevent default, store the event) in `frontend/src/routes/+layout.ts` and expose `installPromptAvailable` + a `promptInstall()` to `InstallCoach`.
- [X] T021 [US2] Implement the post-install notification-permission step (in `onboarding.ts`, invoked from `+page.svelte` on first standalone launch): if `pushCapable && permission==='default'` call `Notification.requestPermission()`; else set `'skipped'`; never prompt pre-install or on push-incapable platforms (FR-006). Emit `install.completed` + `notif.permission`.

**Checkpoint**: US1 + US2 both work independently; the app is install-gated with correct permission timing.

---

## Phase 5: User Story 3 — iOS capability gating & durable storage (Priority: P3)

**Goal**: First launch requests persistent storage; iOS <16.4 sees a push-degradation warning.

**Independent Test**: iOS <16.4 UA renders the version-gate warning; iOS ≥16.4 / non-iOS does not; `navigator.storage.persist()` is called once on first launch and the app continues whether granted or denied.

### Tests for User Story 3 ⚠️ (write first, observe failing)

- [X] T022 [US3] Extend `frontend/e2e/pwa.ios.spec.ts` (MUST FAIL) — iOS <16.4 UA renders `IOSVersionGate`; iOS ≥16.4 and non-iOS do not (SC-003).
- [X] T023 [P] [US3] Add a test (Vitest against `onboarding.ts` with a mocked `navigator.storage`, MUST FAIL) asserting `persist()` is attempted exactly once on first launch, recorded in Onboarding State, and the app proceeds when denied/unsupported (SC-006).

### Implementation for User Story 3

- [X] T024 [P] [US3] Implement `frontend/src/lib/components/IOSVersionGate.svelte` — clear warning that push is unavailable on iOS <16.4 and will degrade to foreground polling.
- [X] T025 [US3] Render `IOSVersionGate` in the pre-install flow when `isIOSSafari && !pushCapable` (composed with `InstallCoach` in `frontend/src/routes/+page.svelte`). Emit `versiongate.shown`.
- [X] T026 [US3] Implement the first-launch `navigator.storage.persist()` call in `onboarding.ts` (guarded by `persistRequested`; feature-detect; record `persistGranted`; emit `storage.persist`).

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T027 [P] Add a Playwright e2e step/job to `.github/workflows/ci.yml` (install Chromium+WebKit, build the frontend, run `pnpm exec playwright test`); upload the Playwright report as an artifact on failure.
- [X] T028 [P] Add an optional `test-e2e` target to the root `Makefile` (`cd frontend && pnpm exec playwright test`); do not alter the constitution-mandated targets.
- [X] T029 Verify SC-009: the icon set (all required sizes incl. maskable) and the iOS splash image set are generated from the single `icon.svg` and present in `frontend/build/` after `pnpm run build` (assert in the build/e2e).
- [X] T030 [P] Run the Playwright e2e suite 10× locally to confirm zero-flake (deterministic CI); record the outcome in the PR description.
- [ ] T031 Manual device verification per `quickstart.md` §4: install on a real iOS Safari device (≥16.4 and, if available, <16.4) and an Android Chrome device; confirm the coached install, standalone launch, splash, and (≥16.4) the post-install permission prompt. Record outcomes (SC-001) in the PR description.
- [X] T032 [P] Final docs pass: reconcile `quickstart.md` with the shipped config; confirm the next release is tagged MINOR (`v0.2.0`) per plan §IV.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies. T002 is `[P]`; T003 depends on T002 (needs the source SVG); T001/T004 independent.
- **Foundational (Phase 2)**: depends on Setup. T005→T006 sequential (test then impl); T007/T008 are `[P]`. BLOCKS all user stories.
- **User Stories (Phase 3–5)**: depend on Foundational.
  - US1 (P1) is the MVP and has no dependency on US2/US3.
  - US2 (P2) builds on US1 (there must be an installable shell to gate) and uses the foundational `capability.ts`/`onboarding.ts`.
  - US3 (P3) uses foundational modules; independent of US2 (version-gate + persist are orthogonal to the install prompt), though both render in the pre-install flow.
- **Polish (Phase 6)**: depends on the desired stories being complete.

### Within Each User Story

- Tests written and observed FAILING before implementation (Constitution Principle I): US1 T009/T010 before T011–T015; US2 T016/T017 before T018–T021; US3 T022/T023 before T024–T026.
- US1: tests → vite-plugin-pwa config (T011) → SW registration (T012) → app.html tags (T013) → backend MIME (T014) → embed staging (T015).

### Parallel Opportunities

- **Phase 1**: T002 ∥ T004 (T003 after T002; T001 first as others assume deps installed).
- **Phase 2**: T005, T007, T008 are `[P]`; T006 after T005.
- **Phase 3 (US1)**: T009 ∥ T010 (different stacks); implementation T011–T015 mostly sequential (T011→T012; T013/T014 ∥ after T011).
- **Phase 4 (US2)**: T016 ∥ T017; T018 ∥ then T019/T020/T021 (T019 depends on T018+T020).
- **Phase 5 (US3)**: T022 ∥ T023; T024 ∥ then T025; T026 independent.
- **Phase 6**: T027/T028/T030/T032 are `[P]`; T029 after a build; T031 is manual.

### Cross-Story Independence

US1 ships as a standalone MVP (an installable, offline shell) even if US2/US3 never land. US2 (install-first gating + permission timing) and US3 (version gate + durable storage) each add value on top of US1 and are independently testable via simulated user agents.

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & VALIDATE** (installable, SW-controlled, offline shell; serving contract green) → demo.

### Incremental Delivery

US1 (installable shell) → US2 (install-first coaching + permission timing) → US3 (version gate + persistent storage) → Polish (CI e2e, device verification). Each increment is independently testable and does not break the previous.

---

## Notes

- `[P]` = different files, no incomplete-task dependency. `[Story]` maps to spec.md user stories.
- Verify each test FAILS before implementing (pre-implementation gate, constitution §Workflow #2).
- Commit after each task or logical group with the `Authorship:`/`AI-Tool:` trailers (constitution §B).
- Frontend-only except T014 (backend MIME) and T010/T027 (Go serving test + CI). No DB schema change.
- Real iOS-device behavior (T031) is a manual gate; Playwright WebKit/iOS-UA approximates the rendering paths only.

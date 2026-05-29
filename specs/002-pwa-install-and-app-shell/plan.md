# Implementation Plan: PWA Install & App Shell

**Branch**: `002-pwa-install-and-app-shell` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-pwa-install-and-app-shell/spec.md`

## Summary

Turn the embedded SvelteKit shell from feature 001 into an installable, install-first PWA. Add `vite-plugin-pwa` (Workbox) to emit a web app manifest at `/manifest.webmanifest` and a service worker that precaches the app shell and is registered on first load, so the shell loads instantly and offline. Generate the full icon set and iOS launch ("splash") images from the single source SVG via `@vite-pwa/assets-generator`. The app is **install-first**: until it is launched in standalone (installed) mode it renders only a coached Add-to-Home-Screen flow — iOS Safari gets the manual Share → "Add to Home Screen" steps, browsers exposing `beforeinstallprompt` get the native prompt. After install, on push-capable platforms only (iOS ≥16.4 or web-push browsers), onboarding requests notification permission as its final step; iOS <16.4 instead sees a version-gate warning that push degrades to foreground polling. On first launch the app calls `navigator.storage.persist()`. The backend is unchanged except for serving the new embedded assets with correct MIME types. Tests: Playwright e2e (WebKit with iOS-UA emulation for the iOS coaching + version-gate paths; Chromium for service-worker control + native install) plus an extension to the feature-001 Go integration test asserting the production binary serves `/manifest.webmanifest` and the service worker with correct content types from `embed.FS`.

## Technical Context

**Language/Version**: Frontend TypeScript 5 on Node 22 LTS (SvelteKit/Vite toolchain). Backend Go 1.26 — unchanged except a one-line MIME registration so the embedded file server returns the correct content type for `.webmanifest`.

**Primary Dependencies**:
- Frontend (new): `vite-plugin-pwa` (wraps Workbox for manifest + service-worker generation and registration), `@vite-pwa/assets-generator` (generates icon set + iOS splash images from the source SVG), `@playwright/test` (e2e).
- Frontend (existing, from 001): SvelteKit, `@sveltejs/adapter-static`, Vite, Vitest, ESLint, Prettier, `svelte-check`, TypeScript.
- Backend: existing `net/http` + `embed` (from 001). Only addition: `mime.AddExtensionType(".webmanifest", "application/manifest+json")` in `internal/web` so the file server labels the manifest correctly. No new Go modules.

**Storage**: No database change (no new tables; the binary still only `Ping`s Postgres). Client-side only: `localStorage` for **Onboarding State**, and the Workbox-managed **Cache Storage** for the precached shell. `navigator.storage.persist()` requests durability for both.

**Testing**:
- Playwright e2e (`frontend/e2e/`): Chromium project asserts manifest fetchable at `/manifest.webmanifest`, the service worker registers and `controls` the page, and the `beforeinstallprompt`-driven install affordance renders; WebKit project with an iOS user-agent + `standalone` overrides asserts the iOS coached A2HS steps and the iOS <16.4 version-gate render. Runs against the production build served by `vite preview`.
- Go integration test: extend `backend/test/integration/` (reusing the 001 testcontainers harness that boots the real binary against Postgres) to assert the binary serves `/manifest.webmanifest` (content type `application/manifest+json`) and the service-worker script (a JavaScript content type) from `embed.FS` — the real production serving path.
- Vitest unit: capability detection (iOS Safari recognition, iOS version parse incl. the 16.4 boundary, standalone detection, push-capability derivation).

**Target Platform**: Mobile browsers. iOS Safari 16.4+ (installable + web-push-capable once installed) and iOS <16.4 (installable, push degraded → warning); Chromium-based mobile browsers (native install prompt). The installed standalone PWA is the runtime; non-installable browsers (incl. desktop) receive an "install on a supported mobile browser" notice.

**Project Type**: Web application, **frontend-only feature** — all behavior lives in `frontend/`; the backend change is limited to a MIME registration in service of asset serving.

**Performance Goals**: Cached shell renders offline and on repeat visits within 2s (SC-002). Coached install reachable in ≤4 guided steps (SC-001). Playwright e2e is deterministic (no flake) in CI.

**Constraints**:
- Install-first: no normal functionality is exposed until standalone mode (FR-016, SC-008).
- Manifest MUST be served at `/manifest.webmanifest`; assets MUST ship inside the single embedded distribution — no new runtime service (FR-013/014, §Distribution).
- Notification permission only post-install and only on push-capable platforms (FR-006); never on iOS <16.4.
- Icons + iOS splash images derive from the single source SVG (FR-001/017).
- Offline behavior defined: cached shell (incl. the pre-install coaching) loads with no network (§Offline tolerance).
- The `/`, `/healthz`, `/api/*`, `/ws` contracts from 001 are unchanged (FR-013).

**Scale/Scope**: A small set of Svelte components (install-gate root, A2HS coach with iOS vs prompt variants, iOS version-gate banner), one capability-detection lib, one client structured-logger util, `vite-plugin-pwa` + assets config, and the test suites. No domain entities, no DB, no API. Estimate: ~400–600 LOC frontend + config, ~5 LOC backend.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Core Principles

| # | Principle | Compliance | Evidence |
|---|---|---|---|
| I | Test-First Development | ✅ | Playwright e2e (manifest/SW-control/iOS-coaching), the Go serving-contract assertions, and Vitest capability-detection unit tests are authored first and observed failing before the SW/manifest/components exist. Pre-implementation gate enforced per user story in `tasks.md`. |
| II | Integration Testing Discipline | ✅ | The new contract boundary is the *served PWA assets*: the Go integration test exercises the real production path (binary serving `embed.FS` over HTTP) for `/manifest.webmanifest` + the service worker; Playwright exercises the real client contract (SW takes control, coached flow renders) in a real browser engine. No mocking of the system under test. |
| III | Observability & Structured Logging | ✅ (with deferral) | Per §III, user-visible client actions emit structured records. A minimal client logger emits JSON records (stable event name + outcome) for the onboarding actions: `coach.shown`, `install.completed`, `notif.permission` (granted/denied/skipped), `storage.persist` (granted/denied), `versiongate.shown`. Records go to the console now; a backend ingestion endpoint is deferred to feature 009 (observability-and-error-reporting) — building the pipeline now would violate §V. See Complexity note. |
| IV | Semantic Versioning & Breaking-Change Discipline | ✅ | Purely additive (new static assets + client onboarding); no change to the 001 HTTP contracts → MINOR bump (e.g., `v0.2.0`). The manifest and service-worker URLs become new contract surfaces whose shape future MAJOR changes must respect; the integration test pins them. |
| V | Simplicity & YAGNI | ✅ | `vite-plugin-pwa` + `@vite-pwa/assets-generator` are the standard tools and are *less* complex than hand-writing a Workbox service worker, a manifest, and 20+ cropped icons/splash images. Install gating is one root-level conditional on display-mode. No new runtime service, no DB, no API. The client logger is the smallest §III-compliant surface (console sink, no pipeline). |

### Platform Constraints (constitution §Platform Constraints)

| Constraint | Compliance | Evidence |
|---|---|---|
| Shared contracts as source of truth | N/A | No cross-platform IDL in this feature; the manifest/SW are single-source artifacts generated by the build. |
| Mobile compatibility window | N/A | No native mobile app yet; the PWA *is* the mobile client this feature introduces. |
| No silent platform divergence | ✅ | Web vs iOS divergence (iOS manual coaching, iOS <16.4 push degradation) is documented in the spec and covered by the Playwright WebKit/iOS-UA platform tests. |
| Offline tolerance | ✅ | The service worker precaches the shell (incl. the pre-install coaching view); it renders with no network after first load. First-visit-offline shows a clear loading/error state, not a blank screen (Edge Cases). |
| Backend language: Go (latest stable, CI tests pinned release) | ✅ | No backend logic added; the single MIME registration is stdlib Go. `go.mod` still pins `go 1.26`. |
| HTTP stack: `net/http` stdlib | ✅ | Serving is the existing `http.FileServer` over `embed.FS`; no framework, no new routes beyond the static asset paths the file server already covers. |
| Database: PostgreSQL latest stable, real DB in tests | ✅ | No schema change. The Go integration test still boots against real `postgres:17` via testcontainers (the binary requires a DB to start), satisfying §Database even though this feature adds no tables. |
| Distribution: single self-contained image with `embed.FS` | ✅ | Generated manifest/SW/icons/splash land in `frontend/build/` → copied to `backend/internal/web/dist/` → embedded by the existing `//go:embed all:dist`. No additional runtime service. |
| Self-host story: `docker compose up -d` | ✅ | Unchanged; the new assets ride inside the same image. |

### Branching, Commits, Pre-Commit, and Dev Environment (constitution §A–F)

| Sub-section | Compliance | Evidence |
|---|---|---|
| §A — Branch policy | ✅ | Branch `002-pwa-install-and-app-shell` matches the planned-range regex; `main` is protected (pre-push hook enforces both). |
| §B — Authorship trailers | ✅ | All commits on this branch carry `Authorship:` + `AI-Tool:` trailers (`commit-msg` hook validates). |
| §C — Pre-commit gates | ✅ | Existing `.husky/pre-commit` runs frontend `lint-staged` + Vitest-changed + `tsc --noEmit` and the backend gates. Playwright e2e is too heavy for pre-commit → runs in CI only (documented in research R7). |
| §D — Makefile contract | ✅ | No mandated target removed. An optional `test-e2e` convenience target may be added; the mandated set is untouched. |
| §E — Local dev env | ✅ | Unchanged; Caddy still fronts `${RING_FQDN}`. PWA install on `ring.localtest.me` works under Caddy's internal-CA HTTPS (service workers require a secure context, which the dev TLS already provides). |
| §F — ROADMAP.md as living artifact | ✅ | Row 002 is driven by the `speckit-roadmap-mark-*-done` hooks; this command flips the Plan column on completion. |

**Verdict**: No violations. The client-logger-without-ingestion is the minimal §III-compliant surface with ingestion explicitly deferred to feature 009; Complexity Tracking is otherwise empty by design.

## Project Structure

### Documentation (this feature)

```text
specs/002-pwa-install-and-app-shell/
├── plan.md              # This file
├── research.md          # Phase 0 output (decisions + rationale)
├── data-model.md        # Phase 1 output (client-side entities: capability profile, onboarding state, manifest)
├── quickstart.md        # Phase 1 output (build + install + test the PWA locally)
├── contracts/           # Phase 1 output
│   ├── static-assets.md         # served PWA asset paths + content types (manifest, SW, icons, splash)
│   ├── manifest.schema.json     # JSON Schema the generated manifest must satisfy
│   └── onboarding-ui.md         # install-first gating + coached-A2HS UI state contract
├── checklists/          # /speckit-checklist output (requirements.md already present)
├── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
└── spec.md              # input
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── routes/
│   │   ├── +layout.ts              # prerender = true (unchanged); registers SW + first-launch init
│   │   └── +page.svelte            # install-gate root: standalone → app shell; else → coached flow
│   ├── lib/
│   │   ├── pwa/
│   │   │   ├── capability.ts       # Device Capability Profile: iOS-Safari + version parse, standalone, push-capable
│   │   │   ├── capability.test.ts  # Vitest: UA parsing incl. iOS 16.4 boundary
│   │   │   ├── onboarding.ts       # Onboarding State (localStorage); permission + persist orchestration
│   │   │   └── log.ts              # minimal client structured logger (JSON events, console sink)
│   │   └── components/
│   │       ├── InstallCoach.svelte # iOS manual steps vs beforeinstallprompt native button
│   │       └── IOSVersionGate.svelte # iOS <16.4 push-degradation warning
│   ├── app.html                    # add manifest <link> + iOS splash/meta tags (generated)
│   └── lib/version.ts              # (unchanged from 001)
├── static/
│   └── icons/
│       └── icon.svg                # source icon fetched from the provided URL (input to assets-generator)
├── pwa-assets.config.ts            # @vite-pwa/assets-generator: sizes + iOS splash from icon.svg
├── vite.config.ts                  # add VitePWA({...}) plugin config (generateSW, manifest, registerType)
├── e2e/
│   ├── pwa.chromium.spec.ts        # manifest fetch, SW control, native install prompt
│   └── pwa.ios.spec.ts             # iOS-UA: coached A2HS steps + iOS <16.4 version gate
├── playwright.config.ts            # Chromium + WebKit(iOS-UA) projects; webServer: vite preview
├── tests/                          # (existing Vitest unit tests from 001)
└── package.json                    # + vite-plugin-pwa, @vite-pwa/assets-generator, @playwright/test, scripts

backend/
└── internal/web/
    ├── embed.go                    # + mime.AddExtensionType(".webmanifest", "application/manifest+json")
    └── dist/                       # now also contains manifest/SW/icons/splash after the frontend build
└── test/integration/
    └── pwa_assets_test.go          # (or extend skeleton_test.go) assert binary serves manifest + SW w/ content types

.github/workflows/
└── ci.yml                          # + Playwright e2e step (install browsers, build, vite preview, run e2e)

# Untouched by this feature:
# Makefile, Dockerfile, Caddyfile, docker-compose*.yml, .env.example, .husky/*,
# backend/cmd, backend/internal/{server,db,version}, ROADMAP.md (driven by hooks)
```

**Structure Decision**: This is a frontend-only feature layered on the 001 two-tree structure. All new code lives under `frontend/` (a `lib/pwa/` module for capability/onboarding/logging, two presentational components, the PWA + assets-generator config, and a new `e2e/` Playwright suite). The build pipeline is unchanged in shape: `vite build` now also emits the manifest, service worker, icons, and splash images into `frontend/build/`, which the existing Docker/`make` step copies into `backend/internal/web/dist/` for the existing `//go:embed all:dist` — so the single-image distribution constraint holds with zero new runtime services. The only backend touch is a stdlib MIME registration so the embedded file server returns `application/manifest+json` for the manifest.

## Complexity Tracking

> No constitution violations requiring justification. One deliberate, documented deferral noted below for traceability.

| Item | Decision | Rationale |
|------|----------|-----------|
| Client structured logging without an ingestion endpoint | Emit JSON onboarding-event records to the console now; defer backend ingestion to feature 009 | Constitution §III requires client actions to emit structured logs (so this is required, not speculative); building the ingestion pipeline now would violate §V (no concrete consumer until 009). Console sink is the smallest compliant surface. |

# Feature Specification: PWA Install & App Shell

**Feature Branch**: `002-pwa-install-and-app-shell`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "Build the PWA shell and Add-to-Home-Screen onboarding. Add vite-plugin-pwa with Workbox, a web app manifest, a generated service worker registered on first page load, and a coached A2HS flow that detects iOS Safari (or other browsers if it actually matters) and walks the user through the install gesture before requesting notification permission. On first launch, call navigator.storage.persist(). Render an iOS version gate UI that warns users on iOS <16.4 that push will degrade to foreground-poll. Frontend integration test (Playwright + a real iOS Safari driver where feasible, headless Chromium elsewhere): load the app, assert manifest is served at /manifest.webmanifest, assert the service worker controls the page after registration, assert the iOS detection + coached A2HS path renders on a simulated iOS UA. No backend changes other than serving the new static assets via embed.FS."

## Clarifications

### Session 2026-05-28

- Q: When should Ring request the OS notification-permission prompt during onboarding? → A: After the install step, but only on push-capable platforms (iOS ≥16.4 or browsers that support web push); skip the prompt where push is unavailable.
- Q: Can a first-time visitor dismiss the A2HS coaching and keep using Ring in the browser? → A: No — install-first. Normal app usage is gated until the app is installed and launched in standalone mode.
- Q: Are production app icons available, or should 002 ship placeholders? → A: A source icon SVG is provided (`frontend/public/icons/icon.svg`); generate all required icon sizes from it. (The launch splash is an in-app overlay, not a generated native iOS splash image set — see FR-017.)
- Q: After a visitor dismisses the install coaching, when may it re-surface? → A: Moot under install-first — the coached install flow persists until the app is installed; there is no dismiss-and-use-in-browser path.

## User Scenarios & Testing *(mandatory)*

Ring is a mobile-first, install-first messenger — installable on any browser that supports it, including desktop Chrome/Edge. Before any messaging feature lands, the app must behave like a real installed app: launchable from the home screen (or dock), loading instantly (even offline), and guiding people — especially on iOS, where browsers offer no automatic install button — through getting it installed. This feature is the onboarding front door.

### User Story 1 - Installable, fast-loading app shell (Priority: P1)

A person opens Ring in their mobile browser for the first time. The app presents itself as installable (the browser recognizes it as a Progressive Web App), and the app shell is cached so that on every later visit — and even with no network — the interface loads immediately instead of showing a blank page or browser error.

**Why this priority**: This is the foundation of the entire PWA experience. Without an installable, shell-cached app there is nothing to add to a home screen and no offline resilience — every later story and feature builds on this. It is independently valuable: a reliably-loading installable shell is a usable MVP on its own.

**Independent Test**: Load the app in a mobile browser; confirm the manifest is served at the documented path, the service worker registers and takes control of the page, the browser treats the app as installable, and a second visit (including with the network disabled) renders the shell without a network round-trip.

**Acceptance Scenarios**:

1. **Given** a first-time visitor on a supported mobile browser, **When** the app finishes loading, **Then** a web app manifest describing a standalone mobile app is available and a service worker has registered and taken control of the page.
2. **Given** a returning visitor who has loaded the app once, **When** they open the app again with the network disabled, **Then** the app shell renders from cache without requiring a network connection.
3. **Given** the app is launched after being installed to the home screen, **When** it opens, **Then** it runs in standalone mode (no browser chrome).

---

### User Story 2 - Coached Add-to-Home-Screen onboarding (Priority: P2)

Ring is install-first: until the app is installed and launched from the home screen (standalone mode), a first-time visitor is shown only the coached Add-to-Home-Screen flow — normal app functionality is gated behind installation. The coaching gives clear, platform-correct instructions: on iOS Safari — which has no install prompt — the exact Share → "Add to Home Screen" gesture; on browsers that expose a native install prompt, the app triggers that prompt instead. After the install step, the app requests notification permission only on push-capable platforms (it does not prompt where push is unavailable, e.g. iOS <16.4).

**Why this priority**: The install gesture is the single biggest drop-off point for PWAs, especially on iOS where it is hidden and non-obvious. Coaching it directly drives the install-first product goal. It depends on US1 (there must be an installable shell to coach toward) but is independently testable as an onboarding UI.

**Independent Test**: Simulate an iOS Safari user agent and confirm the iOS-specific coached A2HS instructions render; simulate a browser that fires a native install prompt and confirm the app triggers it; confirm no notification-permission request is made before the install step.

**Acceptance Scenarios**:

1. **Given** a first-time visitor on iOS Safari who has not installed the app, **When** the app launches, **Then** a coached overlay shows the iOS Share → "Add to Home Screen" steps.
2. **Given** a first-time visitor on a browser that offers a native install prompt, **When** the app launches and the visitor proceeds, **Then** the app triggers the browser's native install prompt rather than the manual iOS instructions.
3. **Given** the install step has been completed on a push-capable platform (iOS ≥16.4 or a browser supporting web push), **When** onboarding continues, **Then** the app requests notification permission; on platforms where push is unavailable (e.g. iOS <16.4) it does not prompt.
4. **Given** a visitor who is already running the installed app in standalone mode, **When** the app launches, **Then** no A2HS coaching is shown and the app proceeds normally.
5. **Given** a first-time visitor in a browser tab (not yet installed), **When** they try to use the app without installing, **Then** the app does not expose normal functionality — the coached install flow persists until the app is launched in standalone mode.

---

### User Story 3 - iOS capability gating & durable storage (Priority: P3)

On first launch the app asks the browser to persist its storage so cached assets and (future) keys and messages are not silently evicted under storage pressure. Visitors on iOS versions older than 16.4 — where web push is unavailable — see a clear, one-time explanation that notifications will fall back to in-app/foreground checking, so they understand the limitation rather than wondering why notifications never arrive.

**Why this priority**: This sets correct expectations and protects data durability ahead of the messaging and push features, but the app is fully usable without it, so it is the lowest of the three priorities. It is independently testable via simulated user agents and storage APIs.

**Independent Test**: Simulate an iOS <16.4 user agent and confirm the push-degradation warning renders; simulate iOS ≥16.4 and a non-iOS browser and confirm it does not; confirm persistent storage is requested on first launch and the request outcome (granted/denied) is handled without breaking the app.

**Acceptance Scenarios**:

1. **Given** a first launch on any supported platform, **When** the app initializes, **Then** it requests persistent storage exactly once and continues normally regardless of whether the request is granted or denied.
2. **Given** a visitor on iOS older than 16.4, **When** the app launches, **Then** a clear warning explains that push notifications are unavailable and will degrade to foreground checking.
3. **Given** a visitor on iOS 16.4 or newer, or on a non-iOS browser, **When** the app launches, **Then** the push-degradation warning is not shown.

---

### Edge Cases

- **Already installed / standalone**: When the app is launched in standalone (installed) mode, A2HS coaching and install prompts MUST be suppressed. When the app is already installed but opened in a regular browser tab (no install prompt fires), the fallback notice MUST point the user to open the installed app rather than implying Ring cannot be installed.
- **Unsupported / non-installable browser**: When service workers or installation are not supported, the app MUST render a clear "install on a supported browser" message rather than a broken or dead-end coaching step. (Because usage is install-gated, such browsers cannot reach normal functionality — this is expected, not a failure.)
- **Install prompt unavailable but not iOS**: A browser that neither fires a native install prompt nor is iOS Safari MUST be handled gracefully (no misleading iOS instructions; fall back to a generic "use your browser menu to install" note or suppress coaching).
- **Notification permission denied or already decided**: If permission was previously granted or denied, the app MUST NOT re-prompt; a denial MUST NOT block onboarding completion.
- **Persistent storage denied**: A denied persistence request MUST be handled silently (the app keeps working; durability is best-effort).
- **Offline first visit**: If the very first visit happens with no network, the app cannot cache the shell yet; behavior MUST be a clear loading/error state, not a silent blank screen.
- **Persistent coaching until install**: Because usage is install-gated, the coached install flow is shown on every pre-install launch by design; it MUST remain clear and non-looping (one coherent flow, not repeated modal stacking).
- **iOS version undetectable**: If the iOS version cannot be determined, the app MUST choose the safe default (assume the degraded case and show the warning) rather than promising push that may not work.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST publish a web app manifest, served at `/manifest.webmanifest`, that declares Ring as an installable standalone mobile app (name, icons at the sizes required for home-screen install, standalone display mode, and theme/background colors). The icon set MUST be derived from the provided source icon (`frontend/public/icons/icon.svg`).
- **FR-002**: The app MUST register a service worker on first page load that takes control of the page and caches the app shell, so subsequent visits and offline launches render the shell without a network round-trip.
- **FR-003**: When the app is opened in a browser where it is not yet installed, the app MUST present a coached Add-to-Home-Screen flow with platform-appropriate guidance.
- **FR-004**: The app MUST detect iOS Safari and render iOS-specific A2HS instructions (the manual Share → "Add to Home Screen" gesture), because iOS provides no automatic install prompt.
- **FR-005**: For browsers that expose a native install prompt, the app MUST use that native prompt instead of manual instructions.
- **FR-006**: The app MUST request notification permission only after the install step AND only on push-capable platforms (iOS ≥16.4 or browsers supporting web push); on platforms where push is unavailable (e.g. iOS <16.4) it MUST NOT prompt for notification permission at all.
- **FR-007**: On first launch the app MUST request persistent storage, and MUST continue to function whether the request is granted or denied.
- **FR-008**: The app MUST detect the iOS major/minor version and, for iOS older than 16.4, display a clear warning that push notifications are unavailable and will fall back to foreground checking.
- **FR-009**: The app MUST NOT show the version-gate warning to visitors on iOS 16.4+ or on non-iOS platforms.
- **FR-010**: When the app is running in standalone (installed) mode, it MUST suppress A2HS coaching and install prompts.
- **FR-011**: On browsers that cannot install the app or lack service-worker support, the app MUST present a clear explanation that Ring must be installed on a supported browser, rather than a broken or dead-end coaching step.
- **FR-012**: The app MUST remember onboarding state locally (e.g., whether the install step was reached, whether notification permission has been decided) so it does not re-prompt for an already-decided permission. Because usage is gated on installation, the coached install flow is shown on every pre-install launch — there is no dismiss-and-use-in-browser path.
- **FR-013**: The feature MUST NOT change backend behavior beyond serving the new static PWA assets (manifest, service worker, icons) through the existing embedded file server; the `/healthz`, `/api/*`, and `/ws` contracts from feature 001 MUST remain unchanged.
- **FR-014**: The PWA static assets (manifest, service worker, icons) MUST be served from the same single embedded distribution as the rest of the frontend, with no additional runtime service.
- **FR-015**: The feature MUST include an automated frontend integration test that loads the app and verifies: the manifest is served at `/manifest.webmanifest`, the service worker controls the page after registration, and the iOS detection + coached A2HS path renders under a simulated iOS user agent.
- **FR-016**: Until the app is running in standalone (installed) mode, it MUST NOT expose normal application functionality; a pre-install session MUST present only the coached install flow (plus the iOS version-gate warning where applicable).
- **FR-017**: The build MUST generate, from the single source icon SVG, all icon sizes required for installability (including a maskable icon) and the iOS home-screen icon, and reference them from the manifest and/or document head. The launch ("splash") experience MUST be provided by an in-app overlay (logo + version) over the manifest `background_color`; a native iOS `apple-touch-startup-image` set is NOT used (it cannot carry the version and conflicts visually with the in-app splash).
- **FR-018**: Each user-visible onboarding action (coaching shown, install completed, notification-permission decided/skipped, persistent-storage requested, version-gate shown) MUST emit a structured log record carrying a stable event name and outcome (per constitution Principle III). Backend ingestion of these records is out of scope for this feature (→ feature 009).

### Key Entities *(include if feature involves data)*

- **Device Capability Profile**: A client-side, derived view of the current environment — platform family, whether it is iOS Safari, detected iOS version, whether web push is available, and whether the app is running standalone (installed). Drives which onboarding and gating UI is shown. Not persisted server-side.
- **Onboarding State**: Client-local record of the visitor's progress through onboarding — whether the install step was reached and whether notification permission has been decided. Used to avoid re-prompting for an already-decided permission. (Under install-first there is no "coaching dismissed" state — the coached flow persists until the app is installed.)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor on a supported mobile browser can reach an installed, home-screen-launchable app by following the coached flow in no more than 4 guided steps.
- **SC-002**: After the first successful load, the app shell renders on repeat visits and with the network fully disabled, within 2 seconds, with no blank screen or browser error page.
- **SC-003**: 100% of iOS Safari visitors on iOS older than 16.4 see the push-degradation warning, and 0% of visitors on iOS 16.4+ or non-iOS platforms see it (no false warnings).
- **SC-004**: Notification permission is requested in 0 cases before the install step, and in 0 cases on push-incapable platforms (e.g. iOS <16.4).
- **SC-005**: The coached A2HS path renders correctly for the iOS Safari case and the native-install-prompt case, verified by automated tests using simulated user agents on every change.
- **SC-006**: Persistent storage is requested on 100% of first launches, and the app remains fully functional in 100% of cases where the request is denied.
- **SC-007**: On browsers that cannot install Ring, a clear "install on a supported browser" message is shown in 100% of cases, with no broken or dead-end onboarding step.
- **SC-008**: A pre-install (browser-tab) session exposes normal app functionality in 0 cases — usage is reached only after the app is launched in standalone mode.
- **SC-009**: The app icons (all required sizes, including maskable) are generated from the single source SVG and present at every required size, verified in the build/tests. The launch splash is the in-app `#ring-shield` overlay over the manifest `background_color` (no native `apple-touch-startup-image` set).

## Assumptions

- **Install scope**: Ring is mobile-first but installable anywhere the browser supports it — iOS Safari (manual A2HS coaching) and any Chromium browser that fires a native install prompt (Android **and** desktop Chrome/Edge). Browsers with no install path (e.g. desktop Safari/Firefox) receive a clear "install on a supported browser" message rather than a usable in-browser app — usage is still gated on installation.
- **"Other browsers if it actually matters"** resolves to: browsers that fire a native install prompt are handled via that prompt; only iOS Safari needs bespoke manual coaching. No other per-browser bespoke flows are built.
- **Install-first gating**: Normal app functionality is gated behind installation — until launched in standalone mode the app shows only the coached install flow. There is no dismissible in-browser usage path (per 2026-05-28 clarification).
- **Notification permission scope**: This feature owns only the *timing and platform-gating* of the notification-permission request (after install, push-capable platforms only). Actual push registration and delivery are out of scope and belong to the later web-push feature (ROADMAP 005).
- **Foreground-poll fallback scope**: This feature only *warns* iOS <16.4 users about the degradation. The actual foreground-poll mechanism is implemented with the messaging/push features, not here.
- **Source icon provided**: A single source icon SVG (`frontend/public/icons/icon.svg`) is the input; all install icon sizes (incl. maskable) and the iOS home-screen icon are generated from it during the build. The launch splash is an in-app overlay, not a generated native iOS splash image set.
- **iOS 16.4 is the push threshold**: 16.4 is the first iOS version supporting web push for home-screen PWAs; it is treated as the cut-off for the degradation warning.
- **Build/test tooling** (recorded for planning, not a user requirement): the PWA shell and service worker are expected to be produced by the SvelteKit/Vite toolchain with `vite-plugin-pwa` + Workbox, and the frontend integration test by Playwright (real iOS Safari driver where feasible, headless Chromium otherwise). These remain implementation choices for the plan phase.
- **Builds on feature 001**: The embedded single-image distribution, the static file server, and the existing route contracts from feature 001 are reused unchanged.

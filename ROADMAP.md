# Ring — Roadmap

Stages: ⬜ pending · 🟡 in-progress · ✅ done · ⛔ blocked

This is the living artifact mandated by Constitution §F. Each row corresponds
to a planned feature spec (001–099). Stage columns flip from ⬜ to ✅ automatically
as each `/speckit-<phase>` command completes, via the `after_<phase>` hooks in
`.specify/extensions.yml` invoking the `speckit.roadmap.mark-<stage>-done`
commands from the `roadmap` extension.

The **Spec Context Seed** for each row (below the table) is the verbatim text to
feed `/speckit-specify` when starting that spec.

## Planned Features (001–099)

| ID  | Title                              | Specify | Clarify | Plan | Tasks | Analyze | T→I | Implement |
| --- | ---------------------------------- | :-----: | :-----: | :--: | :---: | :-----: | :-: | :-------: |
| 001 | repo-skeleton-end-to-end-hello     |   ✅    |   ✅    |  ✅  |  ✅   |   ✅    | ✅  |    🟡     |
| 002 | pwa-install-and-app-shell          |   ⬜    |   ⬜    |  ⬜  |  ⬜   |   ⬜    | ⬜  |    ⬜     |
| 003 | auth-and-identity-bootstrap        |   ⬜    |   ⬜    |  ⬜  |  ⬜   |   ⬜    | ⬜  |    ⬜     |
| 004 | one-to-one-encrypted-messaging     |   ⬜    |   ⬜    |  ⬜  |  ⬜   |   ⬜    | ⬜  |    ⬜     |
| 005 | web-push-notifications             |   ⬜    |   ⬜    |  ⬜  |  ⬜   |   ⬜    | ⬜  |    ⬜     |
| 006 | small-group-chat                   |   ⬜    |   ⬜    |  ⬜  |  ⬜   |   ⬜    | ⬜  |    ⬜     |
| 007 | contact-discovery                  |   ⬜    |   ⬜    |  ⬜  |  ⬜   |   ⬜    | ⬜  |    ⬜     |
| 008 | message-history-and-archival       |   ⬜    |   ⬜    |  ⬜  |  ⬜   |   ⬜    | ⬜  |    ⬜     |
| 009 | observability-and-error-reporting  |   ⬜    |   ⬜    |  ⬜  |  ⬜   |   ⬜    | ⬜  |    ⬜     |
| 010 | admin-and-ops                      |   ⬜    |   ⬜    |  ⬜  |  ⬜   |   ⬜    | ⬜  |    ⬜     |

## Ad-hoc Features (101–199)

| ID  | Title                              | Notes |
| --- | ---------------------------------- | ----- |
| 101 | constitution-v1-1-0 (governance)   | Constitution amendment v1.0.0 → v1.1.0. Merged. |
| 102 | infra-bootstrap (tooling)          | One-time infra: Husky hooks, compose stack, Caddyfile, Makefile, roadmap extension, --range flag, ROADMAP.md. |
| 103 | release-engineering                | Release pipeline: multi-arch GHCR images on push-to-main (`:sha-<short>`) + tag push `vX.Y.Z` (`:vX.Y.Z` + `:X.Y` + `:X` + `:latest`), OCI labels, prod pins via `RING_IMAGE_TAG`. Targeted to land right after 001 merges. |

## Hot Fixes (201–299)

_(none yet)_

---

## Spec Context Seeds

### 001 — repo-skeleton-end-to-end-hello

> Establish the project skeleton end-to-end. Build a Go 1.26 backend using
> `net/http` stdlib routing (Go 1.22+ ServeMux pattern), and a SvelteKit SPA
> built with `adapter-static`. Embed the compiled SvelteKit `build/` output
> via `embed.FS` so the Go binary serves the compiled frontend at `/` and
> reserves `/api/*` and `/ws` for backend handlers. PostgreSQL 17 runs in the
> same `docker-compose` stack with a healthcheck-gated dependency. A Caddy
> reverse proxy in the compose stack terminates TLS for a configurable FQDN
> (default `ring.localtest.me`, with Caddy's internal CA in dev; Let's Encrypt
> via ACME in prod). Provide the Makefile contract per the constitution
> (Sub-section D). CI runs `golangci-lint`, `govulncheck`, ESLint, Prettier
> check, `tsc --noEmit`, `go test ./...`, and `pnpm test` on every PR. Include
> one passing integration test that spins up the binary against a
> `testcontainers-go`-managed Postgres and asserts: (a) `GET /` returns the
> embedded SvelteKit shell; (b) `GET /healthz` returns 200 with a successful
> DB ping; (c) the Caddyfile-fronted FQDN serves the same content over TLS.
> No business logic in this spec — only the slice that proves the full stack
> runs end-to-end. The Constitution Check section of plan.md MUST verify all
> five principles (Test-First, Integration Testing, Observability, SemVer,
> Simplicity/YAGNI) plus the Platform Constraints additions.

### 002 — pwa-install-and-app-shell

> Build the PWA shell and Add-to-Home-Screen onboarding. Add `vite-plugin-pwa`
> with Workbox, a web app manifest, a generated service worker registered on
> first page load, and a coached A2HS flow that detects iOS Safari and walks
> the user through the install gesture before requesting notification
> permission. On first launch, call `navigator.storage.persist()`. Render an
> iOS version gate UI that warns users on iOS <16.4 that push will degrade
> to foreground-poll. Frontend integration test (Playwright + a real iOS
> Safari driver where feasible, headless Chromium elsewhere): load the app,
> assert manifest is served at `/manifest.webmanifest`, assert the service
> worker controls the page after registration, assert the iOS detection +
> coached A2HS path renders on a simulated iOS UA. No backend changes other
> than serving the new static assets via `embed.FS`.

### 003 — auth-and-identity-bootstrap

> User registration via email magic link, session/JWT issuance, and libsignal
> identity-key publishing. New Postgres tables: `users`, `identity_keys`,
> `prekeys`. New backend endpoints: `POST /api/auth/request` (issue magic
> link), `GET /api/auth/callback` (verify token, create session), `POST
> /api/keys/publish` (upload identity key + signed prekey + one-time
> prekeys), `GET /api/keys/{user}` (fetch peer's prekey bundle for X3DH).
> Frontend: registration flow, libsignal `IdentityKeyStore` wired to RxDB
> for at-rest encryption of session keys. Integration tests (testcontainers
> + Playwright): full register → publish → fetch flow; rejects forged tokens;
> rate-limits per-IP magic-link requests.

### 004 — one-to-one-encrypted-messaging

> WebSocket transport on the backend (`coder/websocket`), RxDB replication
> on the frontend, encrypted envelope storage in Postgres
> (`message_envelopes`: id, recipient_user_id, ciphertext, created_at,
> delivered_at). MessageDispatch fans out to connected sockets and persists
> for offline recipients. Offline queue in RxDB on the client flushes on
> `visibilitychange → visible`. Integration test: two headless browsers
> exchange encrypted messages, one initially offline; both browsers' RxDB
> stores end with the same plaintext after sync.

### 005 — web-push-notifications

> Server-side VAPID via `SherClockHolmes/webpush-go`. Endpoints: `POST
> /api/push/subscribe` (store push subscription per session), `DELETE
> /api/push/subscribe`. New table: `push_subscriptions`. PushDispatch sends
> wake-pings to offline recipients of new envelopes; payload carries only
> an opaque envelope ID. Frontend service-worker push handler fetches the
> envelope via `SyncTransport` and surfaces a notification. Integration
> test: subscribe; trigger a delivery; assert push received with the
> opaque envelope ID; assert the SW fetch path retrieves the ciphertext.

### 006 — small-group-chat

> libsignal Sender Keys for groups ≤20 members. New tables: `groups`,
> `group_members`, `group_sender_keys`. Endpoints to create a group, add
> members, remove members, rotate Sender Keys on membership change.
> Frontend: group chat UI, automatic key rotation on remove. Integration
> test: 3-member group; member 3 sends; members 1 and 2 receive and decrypt;
> remove member 2; member 1 sends; member 2 cannot decrypt the next message.

### 007 — contact-discovery

> Endpoint to look up a user by handle (e.g., username or email hash) and
> fetch their prekey bundle for X3DH. Per-IP rate limiting (token bucket).
> Integration test: discover an existing user; rate-limit kicks in at
> threshold; non-existent users return 404 not 200-with-empty.

### 008 — message-history-and-archival

> Cursor-based pagination on `GET /api/messages?before=<cursor>&limit=N`.
> Server-side archival policy: messages older than 30 days move to an
> `archived_envelopes` table with separate retention. Client cache cap of
> ~40 MB enforced via RxDB cleanup. Integration test: seed 1000 messages,
> paginate forward and backward, assert no duplicates and no gaps.

### 009 — observability-and-error-reporting

> Backend: `slog` JSON handler wired in `main`, request correlation IDs in
> middleware, `/metrics` Prometheus exposition. Frontend: structured
> `logger` facade emitting JSON to console + Sentry (with plaintext
> redaction; never log message bodies). Service worker logs forwarded via
> `postMessage` to the page. Integration test: assert correlation ID
> threads through a request from frontend log → backend log → DB query log.

### 010 — admin-and-ops

> Admin endpoints (separate token scope): list users, suspend a user,
> reset a user's keys. Global rate limits on auth + discovery. Abuse
> mitigation: block-list email domains, throttle on repeated 4xx. Integration
> test: admin token can suspend; suspended user's WebSocket is forcibly
> closed and reconnect is rejected; non-admin token cannot reach
> `/api/admin/*`.

### 103 — release-engineering (ad-hoc)

> Establish the release pipeline so a production host can pin to an
> immutable container image and upgrade by bumping one value. Publish
> multi-arch (linux/amd64 + linux/arm64) images to
> `ghcr.io/zuptalo/ring-e2ee-messenger` from two new GitHub Actions
> workflows: `publish-main.yml` triggers on push-to-main and pushes
> `:sha-<short>` (immutable, every commit); `release.yml` triggers on tag
> push `vX.Y.Z` and pushes `:vX.Y.Z` (immutable) plus moving pointers
> `:X.Y`, `:X`, and `:latest`. Both use `docker/build-push-action` with
> `docker/setup-buildx-action` + `docker/setup-qemu-action`. The
> `release.yml` job also runs `gh release create --generate-notes` to
> produce a Release with auto-generated notes grouped from PR titles
> (relies on the squash-merge convention so PR titles ARE the commit
> subjects). Bake OCI labels onto every image:
> `org.opencontainers.image.source` (repo URL),
> `org.opencontainers.image.revision` (commit SHA),
> `org.opencontainers.image.version` (`git describe` output),
> `org.opencontainers.image.created` (RFC3339 timestamp). Update
> `docker-compose.prod.yml` to read `RING_IMAGE_TAG` from `.env` and
> pull `ghcr.io/.../ring:${RING_IMAGE_TAG}`; production hosts MUST pin
> to an exact `:vX.Y.Z` tag, never `:latest`. Add `make release
> VERSION=vX.Y.Z` Makefile target that runs `git tag -s -m` then
> `git push --tags`. SemVer per constitution; pre-1.0 minors may carry
> breaking changes. Out of scope: `release-please` or other
> automated-version-bump tooling (defer until cadence justifies it),
> SBOM generation, image signing with cosign. Neither workflow becomes
> a required PR status check — they trigger on push-to-main and
> tag-push, not on PR open. Integration tests: cut a test tag
> `v0.0.0-test`, observe the release workflow pushes the expected
> ghcr.io tags, observe the GitHub Release is created with notes, then
> delete the test tag and release before merging.

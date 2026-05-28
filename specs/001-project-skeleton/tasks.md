---
description: "Task list for 001-project-skeleton"
---

# Tasks: Project Skeleton — End-to-End Hello

**Input**: Design documents from `/specs/001-project-skeleton/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/http-routes.md`, `contracts/healthz.schema.json`, `quickstart.md`

**Tests**: REQUIRED. Constitution Principle I (Test-First Development) plus plan.md Constitution Check (row I) make tests non-optional for this feature. The FR-007 integration test is authored before handlers and observed failing before each user story is implemented.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: `[US1]`, `[US2]`, `[US3]` — applied only to user-story-phase tasks (not Setup, Foundational, or Polish)
- Each task includes the exact file path it touches

## Path Conventions

Repository root is `/Users/kamran/Desktop/ring`. Two source trees per `plan.md`:

- `backend/` — Go 1.26 module
- `frontend/` — SvelteKit + TypeScript

Shared infrastructure (`Makefile`, `Dockerfile`, `Caddyfile`, `docker-compose*.yml`, `.husky/*`, `.env.example`) already exists from feature-102 bootstrap and is **not** recreated by this feature — only adjusted where called out.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bring the `backend/` and `frontend/` source trees into existence so subsequent phases have somewhere to put files. Each task here unblocks the corresponding tree's tooling.

- [X] T001 [P] Create `backend/` directory tree per `plan.md` (mkdir: `backend/cmd/ring`, `backend/internal/{server,web,db,version}`, `backend/internal/web/dist`, `backend/migrations`, `backend/test/integration`) and add `.gitkeep` files in `backend/internal/web/dist/.gitkeep` and `backend/migrations/.gitkeep`.

- [X] T002 Initialize Go module at `backend/go.mod` with `module github.com/zuptalo/ring-e2ee-messenger/backend` and `go 1.26`. Add dependencies via `go get`: `github.com/jackc/pgx/v5/pgxpool`, `github.com/testcontainers/testcontainers-go`, `github.com/testcontainers/testcontainers-go/modules/postgres`. Commit `backend/go.sum`.

- [X] T003 [P] Initialize SvelteKit project at `frontend/` using the official `create-svelte` skeleton template with TypeScript, ESLint, Prettier, Vitest, and `@sveltejs/adapter-static`. Result: `frontend/package.json`, `frontend/pnpm-lock.yaml`, `frontend/svelte.config.js`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/src/`, `frontend/static/`. Pin `pnpm` via `corepack` (`packageManager` field in `frontend/package.json`).

- [X] T004 [P] Add `frontend/.gitignore` entries for `.svelte-kit/`, `build/`, `node_modules/` (verify they are not already covered by the repo-root `.gitignore`; add only what is missing).

- [X] T005 Update Dockerfile at repo root (`Dockerfile`) to accept `ARG RING_VERSION` and `ARG RING_COMMIT`, propagate them to the frontend stage as `ENV VITE_RING_VERSION=$RING_VERSION` / `ENV VITE_RING_COMMIT=$RING_COMMIT`, and to the backend stage `RUN go build` line as `-ldflags="-s -w -X github.com/zuptalo/ring-e2ee-messenger/backend/internal/version.Version=$RING_VERSION -X github.com/zuptalo/ring-e2ee-messenger/backend/internal/version.Commit=$RING_COMMIT"`. Provide sensible defaults (`dev` / `unknown`) so `docker build` works without args.

- [X] T006 Update `Makefile` `build` and `image` targets to compute `RING_VERSION` (e.g., `git describe --tags --dirty --always 2>/dev/null || echo dev`) and `RING_COMMIT` (`git rev-parse HEAD 2>/dev/null || echo unknown`), then pass both to the host `go build -ldflags` invocation and the `docker build --build-arg` invocation. Add a `version` make target that echoes the resolved values for debugging.

**Checkpoint**: `backend/` and `frontend/` directory trees exist with module/package roots initialized. `make install` succeeds end-to-end. No application code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared configuration files that every user story phase consumes — linter configs, version-injection plumbing, dev-loop configs. These MUST land before US1/US2/US3 implementation because the pre-commit hooks, the Vitest runner, and the embed compile-time wiring all reference them.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T007 [P] Create `backend/internal/version/version.go` exporting `var Version = "dev"` and `var Commit = "unknown"`. These are intentionally `var` (not `const`) so `-ldflags -X` can overwrite them. Add a passing unit test `backend/internal/version/version_test.go` that asserts both variables are non-empty (defensive against future `const` regressions).

- [X] T008 [P] Create `backend/.air.toml` configuring live reload: build cmd `go build -o ./tmp/ring ./cmd/ring`, run cmd `./tmp/ring serve`, watch `**/*.go`, exclude `internal/web/dist/`, `tmp/`, `test/integration/`.

- [X] T009 [P] Create `backend/.golangci.yml` enabling per `research.md` R14: `errcheck`, `govet`, `staticcheck`, `unused`, `gofumpt`, `gosec`, `revive`, `bodyclose`, `errorlint`, `gocritic`, `gosimple`, `ineffassign`, `prealloc`, `unparam`. Disable: `gocyclo`, `nestif`. Set `run.timeout: 5m`.

- [X] T010 [P] Configure ESLint flat config at `frontend/eslint.config.js` with `eslint-plugin-svelte`, `@typescript-eslint`, and `eslint-config-prettier`. Add `frontend/.prettierrc` per `research.md` R15: `{ "useTabs": false, "tabWidth": 2, "singleQuote": true, "trailingComma": "all", "printWidth": 100, "plugins": ["prettier-plugin-svelte"] }`. Add `lint` and `test` scripts to `frontend/package.json`.

- [X] T011 [P] Configure `frontend/svelte.config.js` to use `@sveltejs/adapter-static` with `pages: 'build'`, `assets: 'build'`, `fallback: undefined`, `strict: true`. Confirm `frontend/src/routes/+layout.ts` exports `export const prerender = true;`.

- [X] T012 [P] Configure `frontend/vite.config.ts` to define `import.meta.env.VITE_RING_VERSION` and `VITE_RING_COMMIT` from `process.env.RING_VERSION` / `process.env.RING_COMMIT` (fall back to `'dev'` / `'unknown'`). Add `lib/version.ts` exporting `VERSION` and `COMMIT` constants read from `import.meta.env`.

- [X] T013 Add `lint-staged` config to `frontend/package.json` (or `frontend/.lintstagedrc.json`) that runs ESLint on staged `.ts`/`.svelte` and Prettier `--write` on staged `.ts`/`.svelte`/`.json`/`.md`. The repo-root `.husky/pre-commit` already calls `pnpm exec lint-staged` — this provides the config it expects.

**Checkpoint**: All linters, formatters, and version-injection wiring are configured. `make lint` runs to completion (with no actual code yet, lint is a no-op success). Pre-commit hooks fire correctly on staged changes.

---

## Phase 3: User Story 1 — Developer brings the full stack up locally with TLS (Priority: P1) 🎯 MVP

**Goal**: Ship the end-to-end vertical slice: a single Go binary that serves the embedded SvelteKit shell at `/`, responds at `/healthz`, reserves `/api/*` and `/ws`, and stays up if Postgres becomes unreachable post-boot. The integration test in FR-007 is the proof.

**Independent Test**: From a clean working tree, run `make image && make up && make trust && curl https://ring.localtest.me/` → returns HTML containing `Ring`, the version, the SHA, and `skeleton OK`; `curl https://ring.localtest.me/healthz` → `{"status":"ok"}`; `curl -I https://ring.localtest.me/ws` → `426`; `curl https://ring.localtest.me/api/anything` → `{"error":"not_found"}` (NOT the SPA HTML). Then `go test -tags=integration ./backend/test/integration/...` passes from a fresh clone with no manual setup.

### Tests for User Story 1 (Test-First — write before implementation) ⚠️

> **NOTE**: These tests MUST be authored first and observed FAILING before the corresponding handlers in T021–T027 are implemented. Constitution Principle I.

- [X] T014 [P] [US1] Write the integration test `backend/test/integration/skeleton_test.go` behind `//go:build integration` per `research.md` R6: (a) launch `postgres:17` via `testcontainers-go/modules/postgres`, (b) build the production binary with `go build -ldflags "-X .../internal/version.Version=test-v0.0.0-integration -X .../internal/version.Commit=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"` (use a full 40-char hex SHA literal to align with the contract in `contracts/http-routes.md`), (c) start it bound to a random localhost port with `DATABASE_URL` from step (a), (d) launch `caddy:2` as a generic testcontainer with a rendered Caddyfile pointing at the host port via `host-gateway`, mapping container :443 to a random host port, (e) extract Caddy's internal root cert via `CopyFileFromContainer` on `/data/caddy/pki/authorities/local/root.crt` and trust it in the test `http.Client`. Assertions: `GET http://127.0.0.1:<go-port>/` body contains `skeleton OK`, `test-v0.0.0-integration`, and the full 40-char SHA literal; `GET http://127.0.0.1:<go-port>/healthz` → 200 + body `{"status":"ok"}`; `GET https://ring.localtest.me:<caddy-port>/` body matches direct; `GET /ws` → 426 both via direct port AND via Caddy; `GET /api/nonexistent` → 404 with `Content-Type: application/json` and body matching `/"error":"not_found"/`. Run the test and confirm it FAILS (handlers absent).

- [X] T015 [P] [US1] Write unit tests in `backend/internal/server/server_test.go` using `httptest` (no Postgres): (a) `/healthz` returns 200 + `{"status":"ok"}` when injected `healthChecker` reports healthy; (b) returns 503 + `{"status":"unhealthy"}` when unhealthy; (c) `/api/anything` returns 404 + `{"error":"not_found"}` regardless of method; (d) `/ws` returns 426 with empty body when no `Upgrade` header; (e) `GET /` returns 200 + HTML containing `skeleton OK` from a stub `embed.FS`; (f) `GET /api/foo` does NOT fall through to the SPA file server. Run; confirm tests are RED — either as compile failure (handler symbols not yet declared) or as assertion failure once stubs exist. Both states satisfy the Principle I red-before-green gate.

- [X] T016 [P] [US1] Write unit tests in `backend/internal/db/pool_test.go` for the reconnect-backoff state machine without a real Postgres: inject a fake `pinger` whose result is scripted (`ok, err, err, err, ok`); assert the backoff schedule is `1s, 2s, 4s` and the `healthy` atomic transitions `true → false → true`; assert structured warning logs are emitted on each retry. Use `slog`'s `slog.NewTextHandler` with a `bytes.Buffer` to capture logs. Run; confirm FAIL.

- [X] T017 [P] [US1] Write the Vitest smoke test at `frontend/tests/smoke.test.ts` asserting `frontend/src/lib/version.ts` reads `import.meta.env.VITE_RING_VERSION` and exposes a non-empty string (fallback `'dev'` when env is unset). Run `pnpm test`; confirm FAIL (file does not exist yet).

### Implementation for User Story 1

- [X] T018 [US1] Implement the SvelteKit web shell:
  - `frontend/src/app.html` — bare HTML scaffold with `%sveltekit.head%` and `%sveltekit.body%`.
  - `frontend/src/routes/+layout.ts` — `export const prerender = true;` (confirms T011).
  - `frontend/src/routes/+page.svelte` — renders four lines in initial HTML: `Ring`, `{VERSION}`, `{COMMIT}`, `skeleton OK`. Imports `VERSION` and `COMMIT` from `$lib/version.ts`. NO `fetch`/`onMount`/API calls.
  - `frontend/src/lib/version.ts` — created in T012; verify exports.
  - Verify `frontend/tests/smoke.test.ts` now PASSES.

- [X] T019 [US1] Build the frontend AND stage it for embedding: `cd frontend && pnpm install && RING_VERSION=v0.1.0 RING_COMMIT=$(git rev-parse HEAD) pnpm run build`. Confirm `frontend/build/index.html` contains the four marker strings. Then copy the build output into the embed root: `rm -rf ../backend/internal/web/dist && mkdir -p ../backend/internal/web/dist && cp -R build/. ../backend/internal/web/dist/`. (This explicit staging step is what makes T020's embed unit test, T028's integration test, and the production `Dockerfile` all read the same artifact. Optionally codify this in a `Makefile` target — e.g., `frontend-embed` — invoked by both `make build` and `make image`; this is not required, but recommended if the copy step starts appearing in more places.)

- [X] T020 [US1] Create `backend/internal/web/embed.go` with `//go:embed all:dist` declaring `var Files embed.FS` and a helper `func FS() http.FileSystem` returning `http.FS(...)` rooted at `dist`. Add the small unit test `backend/internal/web/embed_test.go` that asserts `dist/index.html` is readable through `Files.Open` and contains `skeleton OK`. **Prerequisite**: T019 must have copied `frontend/build/*` into `backend/internal/web/dist/` — otherwise this test fails for the wrong reason (missing files, not an embed bug).

- [X] T021 [P] [US1] Implement `backend/internal/db/pool.go` per `data-model.md` and `research.md` R3: `type Pool struct { pool *pgxpool.Pool; healthy atomic.Bool; lastError atomic.Value }`; constructor `NewPool(ctx, dsn) (*Pool, error)` that creates `pgxpool.New` and performs an initial `Ping` (returns error on initial-boot failure per FR-002); `func (p *Pool) Healthy() bool { return p.healthy.Load() }`; `func (p *Pool) StartHealthLoop(ctx, logger *slog.Logger)` goroutine pinging every 5s, with exponential backoff `1s,2s,4s,8s,16s,30s` on failures, structured warn logs on each retry (event `db.reconnect_attempt`), info log on recovery (`db.reconnected`). Make T016 unit tests PASS by extracting an interface `pinger` from `pgxpool.Pool.Ping` so the test can substitute a fake.

- [X] T022 [P] [US1] Implement `backend/internal/server/middleware.go`: a `RequestLogger(next http.Handler, logger *slog.Logger) http.Handler` that generates a UUIDv4 correlation ID (16 bytes from `crypto/rand`), records `start := time.Now()`, calls `next.ServeHTTP` against a `statusRecorder` wrapper, and emits one `slog.Info` with event `http.request` and fields `method`, `path`, `status`, `duration_ms`, `correlation_id`, `outcome` (`ok` if status < 500, else `error`).

- [X] T023 [P] [US1] Implement `backend/internal/server/healthz.go`: `func Healthz(checker interface{ Healthy() bool }) http.HandlerFunc` that returns `200 {"status":"ok"}` or `503 {"status":"unhealthy"}`, sets `Content-Type: application/json`, `Cache-Control: no-store`. Body MUST match the JSON contract exactly (no extra fields). Make T015 (a)+(b) PASS.

- [X] T024 [P] [US1] Implement `backend/internal/server/api.go`: `func APIFallback() http.HandlerFunc` registered under `/api/` that returns `404 {"error":"not_found"}` with `Content-Type: application/json` for any method/path. Add `func APIDegraded(checker) http.HandlerFunc` returning `503 {"error":"service_degraded"}` when `!checker.Healthy()` — wire this in T026 as a wrapper around the `/api/` mux when DB is unhealthy. Make T015 (c) PASS.

- [X] T025 [P] [US1] Implement `backend/internal/server/ws.go`: `func WS() http.HandlerFunc` registered at `/ws` that returns `426 Upgrade Required` with empty body for any request whose `Connection`/`Upgrade` headers do not request a WebSocket upgrade. (Upgrade handling is Feature 004's problem; this feature only reserves the namespace.) Make T015 (d) PASS.

- [X] T026 [US1] Implement `backend/internal/server/server.go`: `func New(deps Deps) *http.ServeMux` where `Deps` carries `DB *db.Pool`, `Logger *slog.Logger`, `Files http.FileSystem`. Register handlers per `contracts/http-routes.md`:
  - `mux.HandleFunc("GET /healthz", Healthz(deps.DB))`
  - `mux.Handle("/api/", APIDegraded(deps.DB, APIFallback()))` (degraded check wraps fallback)
  - `mux.HandleFunc("/ws", WS())`
  - `mux.Handle("/", spaHandler(deps.Files))` where `spaHandler` is `http.FileServer(deps.Files)` wrapped with a guard that returns 404+JSON if the path starts with `/api/` or equals `/ws` (defense in depth per contract precedence note). Wrap the whole mux with `RequestLogger`. Make T015 (e)+(f) PASS.

- [X] T027 [US1] Implement `backend/cmd/ring/main.go` with a `serve` subcommand (per `Dockerfile` `ENTRYPOINT ["/ring", "serve"]`): parse env (`DATABASE_URL`, `LISTEN_ADDR=:8080`, `LOG_LEVEL=info`), initialize `slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: parsedLevel})`, build `db.NewPool` (exit non-zero on initial ping failure), start `pool.StartHealthLoop`, call `server.New(...)`, log startup line including `Version` + `Commit`, then `http.ListenAndServe`. Trap SIGINT/SIGTERM and shut down gracefully via `http.Server.Shutdown` with a 10s timeout.

- [X] T028 [US1] Run the frontend build, copy `frontend/build/*` → `backend/internal/web/dist/`, then run the integration test from T014: `cd backend && go test -tags=integration ./test/integration/...`. The test MUST now PASS — this is the FR-007 acceptance gate for User Story 1. If it fails, fix the implementation (NOT the test) and re-run.

**Checkpoint**: User Story 1 is fully functional. `make image && make up && make trust` produces a working stack on `https://ring.localtest.me/`. The integration test passes from a clean state. The MVP can be demoed.

---

## Phase 4: User Story 2 — Every pull request is gated by automated quality checks (Priority: P2)

**Goal**: A GitHub Actions workflow that runs on every PR and gates merging on `golangci-lint`, `govulncheck`, `go test ./...`, the integration test, `pnpm exec eslint`, `pnpm exec prettier --check`, `pnpm exec svelte-check`, `tsc --noEmit`, and `pnpm test`. A deliberately broken PR is blocked; a clean PR shows all checks green.

**Independent Test**: Open a draft PR introducing (i) a Go vet violation, (ii) a Prettier drift in a `.svelte` file, (iii) a deliberately failing Vitest test — and observe three corresponding red checks. Then push fixes and observe all checks turn green. The merge button is disabled until all required checks pass.

### Tests for User Story 2 (Test-First) ⚠️

- [X] T029 [P] [US2] Add `frontend/tests/lint-meta.test.ts` (Vitest) that asserts the project's ESLint flat config can be loaded by `eslint` programmatically without errors — this guards against config-file regressions slipping past `pnpm exec eslint --print-config` in CI. Run; confirm it PASSES once T010 is done (sanity check, not a fail-first test).

### Implementation for User Story 2

- [X] T030 [US2] Create `.github/workflows/ci.yml` per `research.md` R7 with three jobs:
  - **`backend`** matrix on `go-version: ['1.26', '1.25']`, runs `golangci-lint run ./...`, `govulncheck ./...`, `go test ./...` (without the `integration` tag), all inside `backend/`. Cache `go mod` deps.
  - **`frontend`** runs `pnpm install --frozen-lockfile`, `pnpm exec eslint .`, `pnpm exec prettier --check .`, `pnpm exec svelte-check --tsconfig ./tsconfig.json`, `pnpm exec tsc --noEmit`, `pnpm test`. Cache pnpm store.
  - **`integration`** runs on `ubuntu-latest` (Docker daemon present), builds the frontend, copies the output into `backend/internal/web/dist/`, then runs `cd backend && go test -tags=integration ./test/integration/...`. Cache go mod deps.

  All three jobs trigger on `pull_request` and on `push` to `main`. Mark the workflow `required` via repo branch-protection settings (out of band; documented in `quickstart.md`).

- [ ] T031 [P] [US2] Create a new test file `backend/internal/server/routing_test.go` (NOT modifications to T015's `server_test.go`) that exercises every pattern in `contracts/http-routes.md` end-to-end via `httptest.NewServer(server.New(deps))` — full request lifecycle through the mux, not isolated handler tests. Guards against future refactors silently regressing the routing precedence claims in the contract (US2 robustness, not US1 functionality).

- [ ] T032 [US2] Add `.github/workflows/ci.yml` step to upload `backend/test/integration/` failures (test logs + container logs from testcontainers' `WithLogger`) as a workflow artifact on failure only. This is the diagnostic loop CI gates need to be useful when tests fail in CI but not locally (SC-003 zero-flake claim depends on actionable failure logs).

- [ ] T033 [US2] Verify pre-commit hooks against this branch: run `git commit --allow-empty -m "$(printf 'test: pre-commit dry run\n\nAuthorship: AI Assisted\nAI-Tool: Claude')"` and confirm `.husky/pre-commit` exercises both `frontend/` and `backend/` gates (now that both trees exist post-Phase 3). Then `git reset --soft HEAD~1` to discard. This is a smoke check, not a code change — record the observed output in PR description.

**Checkpoint**: PRs are gated. Quality regressions are caught at PR time. The integration test is part of the gate, not an offline artifact.

---

## Phase 5: User Story 3 — Operator deploys the stack to a fresh host (Priority: P3)

**Goal**: On a fresh production host with DNS + ports 80/443 reachable, `make up` brings the stack up behind an automatically issued public TLS cert within 60 seconds of the start command returning. The app does not start until Postgres reports healthy on initial boot.

**Independent Test**: Provision a clean cloud VM, point DNS at it, follow `quickstart.md` §7. From a remote client, `curl https://<your-fqdn>/healthz` returns `{"status":"ok"}` with a publicly trusted certificate within 60 seconds (SC-004).

### Tests for User Story 3 ⚠️

- [ ] T034 [US3] Add a CI smoke test in `.github/workflows/ci.yml` (extend the `integration` job, or add a fourth `compose-smoke` job) that runs `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`, waits up to 60s for `curl --fail http://127.0.0.1:8080/healthz` (executed via `docker compose exec app wget -qO- http://127.0.0.1:8080/healthz`, since the `nonroot` distroless base lacks `curl`) to succeed, then asserts the app's logs contain a startup line bearing the injected `Version` and `Commit`. Set `RING_FQDN=ring.localtest.me` (Caddy auto-selects its internal CA because that name resolves to 127.0.0.1, so no ACME attempt is made — same mechanism the local dev loop relies on). Do NOT use names like `localhost.localdomain` that fall outside Caddy's auto-internal-CA rules (`.localhost`, `.local`, `.home.arpa`, `.internal`, or loopback-resolving) — those trigger an ACME attempt that will fail in CI. The TLS-fronted path through Caddy is exercised by T014's integration test, not here; this job's job is the compose-bring-up + healthcheck-gating proof.

### Implementation for User Story 3

- [ ] T035 [US3] Verify and (if needed) adjust `docker-compose.prod.yml`'s `app` service to use `depends_on: db: condition: service_healthy` (already present per current file — confirm not regressed). `RING_VERSION` and `RING_COMMIT` are injected at **build time** by `make image` via Docker `--build-arg` → `-ldflags` (T005/T006) — they do NOT need to be propagated through the compose runtime env. Do not add them to the `app` service env block.

- [ ] T036 [US3] Confirm `Caddyfile` requests an ACME cert for any non-`*.localtest.me` / non-`localhost` FQDN by default (Caddy's built-in behavior — no config change needed). Add a comment near `tls` directive (or its absence) documenting this for operators reading the file. NO behavior change.

- [ ] T037 [US3] Update `quickstart.md` §7 to include the explicit health-check curl loop a remote operator can run from their laptop (`for i in $(seq 1 12); do curl -sf https://$RING_FQDN/healthz && break; sleep 5; done`) demonstrating the SC-004 60-second SLA. Add a troubleshooting note: "If this loop times out, run `docker compose logs proxy` on the host — ACME failures are logged there."

**Checkpoint**: User Story 3 is verified. An operator following `quickstart.md` §7 reaches a working public deployment with publicly trusted TLS within 60 seconds.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Tighten the seams across all three stories. None of these block the MVP, but together they ensure the skeleton is a credible baseline that future features can extend without regression.

- [ ] T038 [P] Run the integration test 10 consecutive times locally (`for i in $(seq 1 10); do cd backend && go test -tags=integration ./test/integration/... || break; done`) to validate SC-003 (zero-flake). Record outcome in the PR description.

- [ ] T039 [P] Add `CONTRIBUTING.md` at repo root (or update `CLAUDE.md`) with a one-paragraph "running the test suites" recap pointing at `quickstart.md` §6 — single source-of-truth principle, no duplication.

- [ ] T040 [P] Add `backend/cmd/ring/main_test.go` covering the env-parsing happy path (no DB connection) so `go test ./...` exercises every package in the backend tree (avoids "no test files" warnings, keeps coverage report meaningful).

- [ ] T041 Verify the four spec marker strings (`Ring`, `v0.1.0` or current version, the 40-char SHA, `skeleton OK`) appear in the rendered `frontend/build/index.html` AND in the embedded copy at `backend/internal/web/dist/index.html`, by `grep -l "skeleton OK"` on both files. This is the FR-013 manual gate.

- [ ] T042 Validate `quickstart.md` §1–§4 end-to-end on the working tree: `git clone` simulation (use a fresh checkout in `/tmp`), `cp .env.example .env`, `make trust`, `make image && make up`, browser-visit `https://ring.localtest.me/`. Time the elapsed minutes from `cp` to browser-loaded — confirm SC-001 (<10 minutes). Record in PR description.

- [ ] T043 [P] Verify FR-004 (Makefile contract) explicitly: run `make help` and assert the output lists every constitution-mandated target (`dev`, `up`, `down`, `build`, `image`, `test`, `lint`, `migrate`, `logs`, `clean`, `trust`). Then dry-run each target with the stack in the expected state (DB+proxy up for the runtime targets, code present for the build/test/lint targets) and confirm none short-circuit to no-op. Record outcomes in PR description. This is the only gate against a silent regression that removes or no-ops a required target.

- [ ] T044 [P] Verify SC-005 (frontend and backend originate from the same build) by extending the T014 integration-test assertion set: after fetching `GET /` and parsing the embedded `VERSION` and `COMMIT` strings from the HTML, separately query a backend-introspection surface that exposes the binary's `version.Version` and `version.Commit` — recommended: add a `Server: ring/<version>+<short-sha>` HTTP response header in the request-logger middleware (T022) and assert it matches the HTML-embedded values byte-for-byte. (The header form deliberately avoids creating a new `/api/version` endpoint, which would expand the contract surface for no concrete user.)

- [ ] T045 [P] Verify FR-011 (.env.example completeness): grep every `os.Getenv(` call in `backend/` and every `import.meta.env.` access in `frontend/`, build the union set of variable names, and confirm each appears as a key in `.env.example`. Variables consumed only by Docker `--build-arg` (`RING_VERSION`, `RING_COMMIT`) are exempt — they are documented in `Dockerfile` ARG declarations, not `.env`. Record the audit result in PR description.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately. T001/T003/T004 are parallelizable; T002 depends on T001; T005/T006 depend on T002 + T003.
- **Foundational (Phase 2)**: Depends on Setup completion. BLOCKS all user-story phases. Most tasks are `[P]` (different files), so the phase parallelizes well.
- **User Stories (Phase 3+)**: All depend on Foundational completion.
  - US1 (P1) is the MVP and ships first.
  - US2 (P2) depends on US1 because CI needs real code+tests to gate.
  - US3 (P3) depends on US1 for the binary and US2 for the CI smoke (T034 extends a US2-introduced workflow).
- **Polish (Phase 6)**: Depends on all three stories complete.

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational. No dependencies on US2/US3.
- **US2 (P2)**: Depends on US1 (CI gate exercises code that doesn't exist before US1).
- **US3 (P3)**: Depends on US1 (binary must exist) and US2 (extends the CI workflow file introduced by T030).

### Within Each User Story

- **Tests MUST be written and observed FAILING before implementation** (Constitution Principle I). For US1: T014–T017 before T018–T028. For US2: T029 lands alongside T030. For US3: T034 alongside T035–T037.
- Models → services → endpoints does not strictly apply (no domain model in this feature); within US1 the order is:
  - Foundational config (Phase 2) → frontend shell (T018–T019) → embed wiring (T020) → backend internals (T021–T026 in any order, all `[P]`) → entrypoint + integration (T027 → T028).
- Story complete before moving to next priority.

### Parallel Opportunities

- **Phase 1**: T001/T003/T004 in parallel; T005/T006 after T002 + T003.
- **Phase 2**: T007–T013 are all `[P]` across distinct files — run them all in parallel.
- **Phase 3 (US1)**:
  - Test authoring: T014/T015/T016/T017 are `[P]` across distinct files — write them in parallel.
  - Implementation: T021/T022/T023/T024/T025 are `[P]` across distinct files — implement in parallel after T018–T020.
- **Phase 4 (US2)**: T029/T031 are `[P]`; T030/T032 touch the same workflow file and must be sequential.
- **Phase 5 (US3)**: T035/T036/T037 are independent; can run in any order after T034.
- **Phase 6**: T038/T039/T040/T043/T045 are `[P]` (different files / different verification surfaces); T041 depends on US1 build artifacts; T042 depends on the entire stack working; T044 depends on T022 + T014 (the request-logger middleware and the integration test) — implement T044 by amending T014's assertions and T022's middleware, then re-run the integration test.

### Cross-Story Independence

US1 ships even if US2 and US3 never land — the MVP runs locally without CI or a production host. US2 ships even if US3 never lands — quality gates work on PRs regardless of production-deploy story. US3 stands on top of US1+US2 by design (it is the third priority, not an isolated slice).

---

## Parallel Example: User Story 1 Test Authoring

```bash
# Launch all four failing tests in parallel (different files, no dependencies):
Task: "Author integration test backend/test/integration/skeleton_test.go (T014)"
Task: "Author unit tests backend/internal/server/server_test.go (T015)"
Task: "Author unit tests backend/internal/db/pool_test.go (T016)"
Task: "Author Vitest smoke test frontend/tests/smoke.test.ts (T017)"

# Confirm all four FAIL before any implementation begins.
```

## Parallel Example: User Story 1 Backend Implementation

```bash
# After T018–T020 (frontend + embed), launch all five backend internals in parallel:
Task: "Implement backend/internal/db/pool.go (T021)"
Task: "Implement backend/internal/server/middleware.go (T022)"
Task: "Implement backend/internal/server/healthz.go (T023)"
Task: "Implement backend/internal/server/api.go (T024)"
Task: "Implement backend/internal/server/ws.go (T025)"

# Then sequentially: T026 (server.New assembly) → T027 (main.go) → T028 (integration test green).
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (~6 tasks; T001–T006).
2. Complete Phase 2: Foundational (~7 tasks; T007–T013). CRITICAL — blocks everything below.
3. Complete Phase 3: User Story 1 (~15 tasks; T014–T028). Tests first, then implementation, then green integration test.
4. **STOP and VALIDATE**: Run `make image && make up && make trust`, visit `https://ring.localtest.me/`, observe the four marker strings. Run the integration test 10 times.
5. The MVP is shippable. US2 and US3 can land in follow-up PRs or this same PR.

### Incremental Delivery

1. Setup + Foundational → directories and configs exist.
2. US1 → MVP. End-to-end stack runs locally with TLS. Demo-able.
3. US2 → CI gates land. PRs now have automated quality enforcement.
4. US3 → production deploy is proven. SC-004 verified.
5. Polish → SC-001/SC-003/SC-005 are explicitly measured and recorded.

### Single-Developer Strategy

Given this is a skeleton feature and one developer is implementing it end-to-end, the recommended ordering is the sequential strategy above (one phase at a time, in priority order). The `[P]` markers identify safe-to-parallelize work within a phase — useful for multi-agent task execution but not required for single-developer flow.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks.
- `[Story]` label = which user story this task belongs to (US1, US2, US3); Setup/Foundational/Polish phases have no story label.
- Each user story is independently testable per its **Independent Test** definition.
- Tests are authored first and observed failing — this is the FR-007 / Principle I gate, not an optional discipline.
- Commit after each task or logical group; do NOT batch all of US1 into one commit.
- Stop at the US1 checkpoint to validate MVP independently before proceeding to US2/US3.
- Avoid: vague tasks, same-file conflicts in parallel batches, cross-story dependencies that break independent shipping.

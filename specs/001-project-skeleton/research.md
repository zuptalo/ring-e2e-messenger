# Phase 0 — Research

**Feature**: 001-project-skeleton

**Date**: 2026-05-27

This document records every research decision made to resolve the Technical Context for `plan.md`. The Technical Context starts with zero `NEEDS CLARIFICATION` because all five spec clarifications have been encoded into FRs; the items here are technology choices that the spec deliberately leaves to the plan ("CI provider details are an implementation choice", "the integration test uses a real persistence engine via ephemeral container", etc.).

---

## R1. Backend HTTP router

- **Decision**: Use a single `*http.ServeMux` from Go 1.22+, registering reserved-namespace patterns (`/api/`, `/ws`, `/healthz`) explicitly and a catch-all `GET /` that falls through to the embedded SvelteKit `http.FileServer`.
- **Rationale**: Constitution §HTTP stack mandates `net/http` stdlib (Go 1.22+ ServeMux pattern). Go 1.22's pattern matching supports method prefixes (`GET /healthz`) and longest-prefix wins, which is exactly the precedence we need to reserve `/api/` and `/ws` ahead of the SPA catch-all without manual ordering. Avoids any third-party framework (which would require a constitution amendment).
- **Alternatives considered**:
  - `chi`/`gin`/`echo`: rejected — constitution amendment required, adds dependency without solving a concrete need.
  - Pre-1.22 mux with manual prefix routing: rejected — ServeMux pattern routing is already available on Go 1.26.

---

## R2. PostgreSQL driver and connection pool

- **Decision**: `github.com/jackc/pgx/v5/pgxpool`, with a thin wrapper exposing `Ping(ctx) error` and a background reconnect goroutine.
- **Rationale**: `pgx` is the de-facto Go Postgres client, supports context-aware operations natively, ships its own pool (no `database/sql` indirection needed), and is the only widely-used driver compatible with PostgreSQL 17 features we will need from Feature 003 onward (LISTEN/NOTIFY, COPY, JSONB scan). `database/sql` + `lib/pq` is unmaintained.
- **Alternatives considered**:
  - `database/sql` + `lib/pq`: rejected — `lib/pq` is in maintenance-only mode and lacks ctx support in places.
  - `database/sql` + `pgx`'s stdlib adapter: rejected — adds a layer for no benefit since we have no `database/sql` consumers.

---

## R3. Post-boot DB-loss resilience (FR-012)

- **Decision**: `db.Pool` owns an atomic `lastPingOK bool` plus a goroutine that pings every N seconds using exponential backoff capped at 30s when failing. `/healthz` reads the atomic flag (does not block on a fresh ping). `/api/*` and `/ws` handlers check the flag and return a generic `{"error":"service_degraded"}` 503 when false. The web shell at `/` is served unconditionally by the `embed.FS` file server.
- **Rationale**: Reading an atomic in the hot path avoids serializing every request behind a DB ping; the background loop bounds detection latency to the ping interval. Exponential backoff (1s → 2s → 4s → … → 30s) is the spec's exact requirement (FR-012). Generic error body satisfies "does not disclose the underlying error".
- **Alternatives considered**:
  - Ping on every `/healthz` request: rejected — couples request latency to DB round-trip and creates a request-amplification DoS vector via `/healthz`.
  - Crash-loop on DB loss: rejected — FR-012 explicitly forbids it.

---

## R4. Frontend framework + adapter

- **Decision**: SvelteKit with `@sveltejs/adapter-static`, `prerender = true` on the root layout, no client-side router needed for the skeleton.
- **Rationale**: Constitution locks SvelteKit (the user's locked stack memory confirms this is non-negotiable). `adapter-static` emits a fully pre-rendered HTML payload at build time, which is mandatory for FR-013 ("the marker, version, and SHA MUST be present in the initial HTML payload" and "MUST NOT rely on JavaScript execution for its content"). Server-side adapters would still require Node at runtime, breaking the single-binary §Distribution constraint.
- **Alternatives considered**:
  - `adapter-node`: rejected — adds a Node runtime to the deliverable.
  - SvelteKit SSR with Go reverse-proxying: rejected — two runtimes, contradicts §Distribution.

---

## R5. Build-time injection of version + commit SHA

- **Decision**:
  - **Backend**: `internal/version.Version` and `internal/version.Commit` declared as `var` (not `const`), set via `go build -ldflags="-X .../internal/version.Version=$VERSION -X .../internal/version.Commit=$SHA"`. The existing `Dockerfile` is updated in tasks.md to pass these.
  - **Frontend**: Vite `define` block in `vite.config.ts` exposes `import.meta.env.VITE_RING_VERSION` and `VITE_RING_COMMIT`, sourced from `process.env.RING_VERSION` / `process.env.RING_COMMIT` at build time. The Svelte page renders them into the prerendered HTML so they are present in the initial payload.
- **Rationale**: `-ldflags -X` is the canonical Go pattern, requires no codegen step, and works under `go test` too (defaulting to `dev`/`unknown` when unset). Vite's `define` substitution happens at build, so prerendered HTML contains the literal values — no runtime lookup needed (FR-013).
- **Alternatives considered**:
  - `runtime/debug.ReadBuildInfo()` for the Go side: viable, but only fills the commit (not a human-meaningful semver), and is awkward to expose to Vite. Use it as a fallback when `-ldflags` is not passed.
  - Generated `version.go`: rejected — pre-build codegen step for two literals is over-engineering.

---

## R6. Integration test orchestration

- **Decision**: One Go test in `backend/test/integration/skeleton_test.go` using `testcontainers-go` to:
  1. Launch `postgres:17` via `testcontainers-go/modules/postgres` and harvest the connection string.
  2. Build the production binary in a `TestMain` setup (or `go build -o tmp ./cmd/ring` from the test) with `-ldflags` injecting a stable test version + SHA.
  3. Start the binary as an `exec.Cmd` bound to a random localhost port, with `DATABASE_URL` pointing at the testcontainer.
  4. Launch `caddy:2` via testcontainers-go generic container with a rendered Caddyfile whose `RING_UPSTREAM` is `host.docker.internal:<random-port>` (via `extra_hosts: host-gateway`), and `RING_FQDN` set to `ring.localtest.me`. Caddy auto-selects its internal CA for this site because `ring.localtest.me` resolves to `127.0.0.1` and Caddy's auto-HTTPS chooses the internal CA for loopback-resolving names (no explicit `tls internal` directive is required in the Caddyfile, and indeed the repo's `Caddyfile` does not include one). Map container 443 to a random host port.
  5. Trust Caddy's internal CA cert in the test process by extracting it via `caddy print-root-cert` and adding it to an `http.Client`'s `tls.Config.RootCAs`.
  6. Assert all four FR-007 conditions, both direct and via Caddy.
- **Rationale**: Keeps the test fully hermetic and Go-native; no docker-compose dependency in tests; testcontainers-go cleans up automatically and supports Apple Silicon + Linux CI runners. Trusting the internal CA in the test process avoids `InsecureSkipVerify`, which would mask TLS regressions the test is supposed to catch.
- **Alternatives considered**:
  - `docker compose up` from the test using `compose-go`: rejected — couples the test to repo-relative compose files and to the host's compose plugin version; harder to parallelize.
  - In-process `httptest.Server` + skip Caddy: rejected — leaves FR-007 (c) and (d) untested, which are the two reverse-proxy claims the spec demands.
  - `InsecureSkipVerify` on the test HTTP client: rejected — defeats the purpose of asserting a TLS-fronted FQDN.

---

## R7. CI provider and matrix

- **Decision**: GitHub Actions. Single workflow at `.github/workflows/ci.yml` with three jobs:
  - `backend` (Go 1.26) running `golangci-lint`, `govulncheck`, `go test ./...` (excluding the `integration` build tag) — fast.
  - `frontend` running pnpm install, `pnpm exec eslint`, `pnpm exec prettier --check`, `pnpm exec svelte-check` + `tsc --noEmit`, `pnpm test`.
  - `integration` running `go test -tags=integration ./test/integration/...` on `ubuntu-latest` (which has Docker available for testcontainers).
- **Rationale**: The repo lives on GitHub (`zuptalo/ring-e2ee-messenger` per memory); Actions is the lowest-friction provider with built-in Docker support for testcontainers. The `backend` job tests the `go.mod`-pinned release per the constitution's backend-language rule. Splitting integration into its own job keeps the fast feedback loop fast on lint/unit failures.
- **Alternatives considered**:
  - GitLab CI / CircleCI / Buildkite: rejected — would require provisioning a runner outside GitHub for no current benefit.
  - Single job with all gates serialized: rejected — slower feedback, harder to read failure logs.

---

## R8. Test segregation via build tags

- **Decision**: Integration tests sit behind a `//go:build integration` tag. Unit tests run by default (`go test ./...`); integration runs only when explicitly requested (`go test -tags=integration ./test/integration/...`).
- **Rationale**: Avoids Docker daemon dependency for the pre-commit fast loop (`go test -short ./...` in `.husky/pre-commit`) and for the contributor's everyday `make test`. CI's dedicated `integration` job opts in explicitly.
- **Alternatives considered**:
  - `t.Skip()` based on env var: rejected — slower (the test binary still compiles and starts), and easier to forget.

---

## R9. Logging implementation

- **Decision**: Use `log/slog` (stdlib) with `slog.NewJSONHandler(os.Stderr, ...)` initialized in `main`. A middleware wraps every handler with a `slog.Logger` carrying a generated correlation ID (UUIDv4 via `crypto/rand`-backed implementation) and logs one entry per request with stable event name `http.request`, fields `method`, `path`, `status`, `duration_ms`, `correlation_id`, and `outcome` (`ok` or `error`). The DB reconnect loop logs at `WARN` with event `db.reconnect_attempt`, fields `attempt`, `backoff_ms`, `error`.
- **Rationale**: `log/slog` is stdlib (no dependency), the JSON handler satisfies Principle III, and the event-name/correlation-id pattern matches the constitution's structured-log requirements. UUID via `crypto/rand` avoids pulling in `google/uuid` for a 16-byte primitive.
- **Alternatives considered**:
  - `uber-go/zap` or `rs/zerolog`: rejected — stdlib `log/slog` is sufficient for the skeleton; introducing either would need a YAGNI justification we don't have.

---

## R10. Migration tooling placeholder

- **Decision**: Include `backend/migrations/` with a single `.gitkeep` and document `make migrate` in `quickstart.md`. The dependency `github.com/pressly/goose/v3` is **not** added to `go.mod` in this feature — `make migrate` invokes the `goose` CLI directly (installed via `go install github.com/pressly/goose/v3/cmd/goose@latest`).
- **Rationale**: Constitution §V (YAGNI) — no migrations exist in this feature so importing the goose library into the Go module yields zero benefit and introduces transitive dependencies into `govulncheck` scans. The CLI dependency surface lives in the contributor's `$GOBIN`, not in the deliverable image.
- **Alternatives considered**:
  - Import goose as a library now and embed migration files: rejected — premature; revisit when Feature 003 adds the first migration.

---

## R11. Frontend test runner

- **Decision**: Vitest with one placeholder unit test (`tests/smoke.test.ts`) asserting `version.ts` reads `VITE_RING_VERSION` correctly. Playwright is **not** introduced in this feature.
- **Rationale**: Spec requires `pnpm test` to be a gated CI check; that requires at least one test to exist. Vitest is SvelteKit's recommended unit-test runner and is already in the SvelteKit project template. Playwright (browser-driven) is needed from Feature 002 onward when the PWA shell arrives; deferring keeps this feature minimal.
- **Alternatives considered**:
  - Skip frontend tests entirely until Feature 002: rejected — leaves `pnpm test` undefined, contradicting FR-006.
  - Add Playwright now: rejected — YAGNI; no UI behavior to test yet.

---

## R12. Caddy internal CA trust in the integration test

- **Decision**: After Caddy is up, the test execs `caddy trust --check` is not portable, so instead the test reads the root cert from `/data/caddy/pki/authorities/local/root.crt` inside the container via testcontainers-go's `CopyFileFromContainer`, parses it with `x509.ParseCertificate`, and installs it into an `x509.CertPool` used as the test `http.Client`'s `Transport.TLSClientConfig.RootCAs`.
- **Rationale**: This is the canonical Caddy path for the internal CA root; it works without any host-level trust changes (no `make trust` needed inside CI) and lets the test client perform real TLS verification against `ring.localtest.me`. The hostname `ring.localtest.me` resolves to `127.0.0.1` via the public localtest.me service, which causes Caddy's auto-HTTPS to select its internal CA (loopback-resolving names skip ACME automatically — no `tls internal` directive needed in the Caddyfile). From inside a CI runner the test reaches Caddy at the random mapped host port via `https://ring.localtest.me:<port>`.
- **Alternatives considered**:
  - `InsecureSkipVerify`: rejected (see R6).
  - Have the test run `make trust` against the host: rejected — modifies the host trust store (CI runner side-effect, not portable to dev laptops running the test).

---

## R13. `.air.toml` for live reload

- **Decision**: Add `backend/.air.toml` that watches `backend/**/*.go`, rebuilds `./cmd/ring serve`, ignores `internal/web/dist/` (populated by the frontend dev server, not the Go watcher).
- **Rationale**: `make dev` already references `air -c .air.toml`; the file must exist for that target to work. Ignoring `dist/` prevents rebuild storms when Vite emits a new bundle.
- **Alternatives considered**:
  - `reflex` or `entr`: rejected — `air` is the Go-community default and is already referenced by `make dev`.

---

## R14. `golangci-lint` configuration

- **Decision**: `backend/.golangci.yml` enabling: `errcheck`, `govet`, `staticcheck`, `unused`, `gofumpt`, `gosec`, `revive`, `bodyclose`, `errorlint`, `gocritic`, `gosimple`, `ineffassign`, `prealloc`, `unparam`. Disable: `gocyclo` and `nestif` (handlers will be small enough not to matter; re-enable in Feature 003 if needed).
- **Rationale**: The pre-commit hook runs `golangci-lint run --new-from-rev HEAD --fix`; without a config file it falls back to the v2 default set, which is sparse. The enabled set matches typical Go production projects and reuses linters that already gate the pre-commit hook (`gosec`, `gofumpt`).
- **Alternatives considered**:
  - Default config: rejected — silent baseline; team would not catch e.g. `bodyclose` or `gosec` issues.

---

## R15. ESLint + Prettier configuration

- **Decision**: ESLint flat config (`eslint.config.js`) with `eslint-plugin-svelte`, `@typescript-eslint`, and Prettier integration via `eslint-config-prettier`. Prettier config (`.prettierrc`) with `{ "useTabs": false, "tabWidth": 2, "singleQuote": true, "trailingComma": "all", "printWidth": 100, "plugins": ["prettier-plugin-svelte"] }`.
- **Rationale**: Matches the SvelteKit project default template; pre-commit hook already calls `pnpm exec lint-staged` which expects these configs.
- **Alternatives considered**:
  - Biome instead of ESLint+Prettier: rejected — diverges from SvelteKit's official template, would need a constitution-level conversation.

---

## Open items

None. All Technical Context fields are resolved.

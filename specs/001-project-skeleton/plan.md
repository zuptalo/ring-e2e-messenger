# Implementation Plan: Project Skeleton — End-to-End Hello

**Branch**: `001-project-skeleton` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-project-skeleton/spec.md`

## Summary

Ship the smallest end-to-end vertical slice that proves the full Ring stack composes: a Go 1.26 backend built on `net/http` stdlib routing serves a compiled SvelteKit SPA (pre-rendered via `adapter-static`) from a single `embed.FS`, with `/api/*` and `/ws` reserved as backend-only namespaces. A `/healthz` endpoint reports liveness gated on a real PostgreSQL 17 ping, and the application stays up (degraded) if Postgres becomes unreachable post-boot. The full stack — Go binary + Postgres + Caddy reverse proxy terminating TLS for a configurable FQDN — comes up with `docker compose up -d`. CI gates every PR on `golangci-lint`, `govulncheck`, ESLint, Prettier `--check`, `tsc --noEmit`, `go test ./...`, and `pnpm test`. One integration test boots the production binary against testcontainers-managed Postgres + Caddy and asserts (a) `/` returns the embedded shell with the literal `skeleton OK` marker, the version, and the build SHA in the initial HTML, (b) `/healthz` is 200, (c) the same content is reachable through Caddy at the configured FQDN over TLS, and (d) `/ws` returns HTTP 426 both directly and through Caddy.

## Technical Context

**Language/Version**: Backend Go 1.26 (CI tests the `go.mod`-pinned release per the constitution's backend-language rule). Frontend TypeScript 5 on Node 22 LTS (Vite/SvelteKit toolchain only; runtime is the Go binary).

**Primary Dependencies**:
- Backend: `net/http` (stdlib ServeMux, Go 1.22+ pattern routing), `embed`, `log/slog` (stdlib JSON handler), `github.com/jackc/pgx/v5/pgxpool` (Postgres driver + connection pool for `/healthz` ping and post-boot reconnect), `github.com/pressly/goose/v3` (migrations CLI — directory present, no migrations in this feature), `github.com/testcontainers/testcontainers-go` + `testcontainers-go/modules/postgres` (integration test).
- Frontend: SvelteKit (latest), `@sveltejs/adapter-static`, Vite, Vitest, ESLint, Prettier, `svelte-check`, `typescript`.
- Toolchain (host): pnpm 9 (managed by corepack), `air` (live-reload), `gofumpt`, `golangci-lint`, `govulncheck`, `goose`.

**Storage**: PostgreSQL 17 (sibling container in `docker-compose.yml`, `healthcheck` gated). The skeleton creates no tables; only a `Ping` is exercised by `/healthz`.

**Testing**: `go test ./...` for backend; integration test in `backend/test/integration/` uses `testcontainers-go` to launch Postgres 17 + Caddy 2 (generic container, rendered Caddyfile, dynamic host port mapping to the in-process Go server). Frontend uses Vitest with a single passing placeholder test so `pnpm test` is meaningful from day one. No mocks of Postgres or Caddy.

**Target Platform**: Linux/amd64 + linux/arm64 container (distroless static base; image built by the existing `Dockerfile`). Browser target for the SPA is modern evergreen + iOS Safari 16.4+ (offline-tolerance only matters from Feature 002 onward).

**Project Type**: Web application with two source trees (`backend/` Go module, `frontend/` SvelteKit project). At build time the SvelteKit static output is copied into the backend's `internal/web/dist/` and embedded into the Go binary — at runtime the deliverable is a single process.

**Performance Goals**: Skeleton-only. Hard target: integration test passes 10 consecutive CI runs with zero re-runs (SC-003).

**Constraints**:
- Single self-contained image (Constitution §Distribution).
- No mocking of Postgres in tests (Constitution Principle II + §Database).
- `/healthz` body MUST be `{"status":"ok"}` or `{"status":"unhealthy"}` — no diagnostic detail (FR-005).
- Initial HTML of `/` MUST contain `skeleton OK`, the version, and the commit SHA without JS execution (FR-013).
- Application stays up on post-boot DB loss; reconnect with exponential backoff (FR-012).
- `make trust` is the only required pre-flight step beyond `.env` + `docker compose up -d` (FR-008).

**Scale/Scope**: Skeleton — no users, no domain entities, no business logic. Backend code estimate: ~400 LOC excluding generated/embedded assets. Frontend: ~100 LOC (one prerendered page).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Core Principles

| # | Principle | Compliance | Evidence |
|---|---|---|---|
| I | Test-First Development | ✅ | The integration test in FR-007 is authored first, observed failing (no handlers, no embed), then handlers are added until it passes. `pre-implementation gate` (constitution §Workflow #2) is enforced per user story in `tasks.md`. |
| II | Integration Testing Discipline | ✅ | FR-007's integration test exercises the real contract boundary (HTTP via direct port + via Caddy/TLS) against a real PostgreSQL 17 via `testcontainers-go`. Spec explicitly forbids mocking the persistence engine. |
| III | Observability & Structured Logging | ✅ | Backend uses `log/slog` with the JSON handler from `main`. FR-010 requires structured request logs with a stable event name, correlation ID, and outcome. FR-012 requires structured warning logs on each DB-reconnect retry. |
| IV | Semantic Versioning & Breaking-Change Discipline | ✅ | First tagged release will be `v0.1.0` (pre-1.0 baseline — additive features bump MINOR, fixes bump PATCH). No public contracts exist yet, so there is nothing to break; the integration-test surface itself becomes the contract baseline future MAJOR changes must respect. Version string is injected into the Go binary and the SvelteKit shell via build-time `-ldflags` and Vite `define`. |
| V | Simplicity & YAGNI | ✅ | No HTTP framework (stdlib `net/http`), no ORM (`pgxpool.Ping` only), no template engine (SvelteKit prerenders to static HTML), no service-worker yet (deferred to Feature 002), no auth (deferred to Feature 003). The integration test runs a single binary against a single Postgres and a single Caddy — no orchestration layer. |

### Platform Constraints (constitution §Platform Constraints)

| Constraint | Compliance | Evidence |
|---|---|---|
| Shared contracts as source of truth | N/A (no cross-platform contract in skeleton) | First contract lands in Feature 003. |
| Mobile compatibility window | N/A (no mobile client yet) | Feature 002 introduces the PWA shell. |
| No silent platform divergence | ✅ | Only one client (the SvelteKit shell); no divergence possible. |
| Offline tolerance | ✅ | The web shell at `/` requires zero network after initial load; `/api/*` and `/ws` degrade with a generic "service degraded" envelope when DB is down (FR-012). |
| Backend language: Go (latest stable, CI tests pinned release) | ✅ | `go.mod` pins `go 1.26`; CI tests against 1.26. |
| HTTP stack: `net/http` stdlib (ServeMux pattern) | ✅ | Router is a single `*http.ServeMux` built in `internal/server`. No third-party framework. |
| Database: PostgreSQL latest stable (17), real DB in tests | ✅ | `postgres:17` in `docker-compose.yml`; `testcontainers-go/modules/postgres` in the integration test. |
| Distribution: single self-contained Docker image with `embed.FS` | ✅ | Existing `Dockerfile` is the multi-stage build; backend `internal/web` embeds `dist/` via `//go:embed`. |
| Self-host story: `docker compose up -d` on a fresh host with `.env` | ✅ | `make up` is the documented wrapper; `make trust` is the one-time dev TLS step. |

### Branching, Commits, Pre-Commit, and Dev Environment (constitution §A–F)

| Sub-section | Compliance | Evidence |
|---|---|---|
| §A — Branch policy | ✅ | Working branch is `001-project-skeleton` (matches `^(0\d{2}|1\d{2}|2\d{2})-[a-z0-9-]+$`); `main` is protected. Pre-push hook already enforces both. |
| §B — Authorship trailers | ✅ | All commits on this branch carry `Authorship:` + `AI-Tool:` trailers; `commit-msg` hook already validates. |
| §C — Pre-commit gates | ✅ | `.husky/pre-commit` already orchestrates frontend (`lint-staged`, Vitest changed, `tsc --noEmit`) and backend (`gofumpt`, `golangci-lint --new-from-rev HEAD`, `go test -short`, `govulncheck`) gates. This feature adds the actual `backend/` and `frontend/` trees the hook conditionally activates against. |
| §D — Makefile contract | ✅ | Existing `Makefile` already exposes `dev up down build image test lint migrate logs clean trust` (plus `fmt`, `install`, `seed`, `vapid-gen`). This feature ensures every target performs the real action implied (currently several short-circuit when `backend/` / `frontend/` are absent). |
| §E — Local dev env | ✅ | Caddy 2 in compose terminates TLS for `${RING_FQDN}` (default `ring.localtest.me`); `make trust` installs Caddy's internal CA. |
| §F — ROADMAP.md as living artifact | ✅ | `ROADMAP.md` row 001 is being driven by the `speckit-roadmap-mark-*-done` hooks; this command will flip the Plan column on completion. |

**Verdict**: No violations. Complexity Tracking section below is empty by design.

## Project Structure

### Documentation (this feature)

```text
specs/001-project-skeleton/
├── plan.md              # This file
├── research.md          # Phase 0 output (decisions + rationale)
├── data-model.md        # Phase 1 output (no domain entities — explains why)
├── quickstart.md        # Phase 1 output (clone → running stack in <10 min)
├── contracts/           # Phase 1 output (HTTP contracts for /, /healthz, /api/*, /ws)
│   ├── http-routes.md
│   └── healthz.schema.json
├── checklists/          # produced by /speckit-checklist runs (already present)
├── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
└── spec.md              # input
```

### Source Code (repository root)

```text
backend/
├── cmd/
│   └── ring/
│       └── main.go              # CLI entrypoint; `serve` subcommand wires slog → server → pgxpool
├── internal/
│   ├── server/
│   │   ├── server.go            # *http.ServeMux assembly; reserves /api/, /ws, /healthz; SPA fallback
│   │   ├── healthz.go           # GET /healthz — pgxpool.Ping with cached degraded state
│   │   ├── ws.go                # GET /ws — 426 Upgrade Required (no handshake yet)
│   │   ├── api.go               # /api/* fallback returning backend-shaped 404 JSON
│   │   ├── middleware.go        # slog request logger (correlation ID, event name, outcome)
│   │   └── server_test.go       # unit tests for handlers (httptest, no DB)
│   ├── web/
│   │   ├── embed.go             # //go:embed all:dist → http.FS for SPA assets
│   │   └── dist/                # populated by frontend build (gitignored except .gitkeep)
│   ├── db/
│   │   ├── pool.go              # pgxpool wrapper + Ping w/ exponential-backoff reconnect goroutine
│   │   └── pool_test.go         # unit test for backoff (no DB)
│   └── version/
│       └── version.go           # Version + Commit vars set via -ldflags at build time
├── migrations/
│   └── .gitkeep                 # goose dir; no migrations in this feature
├── test/
│   └── integration/
│       └── skeleton_test.go     # testcontainers Postgres + Caddy; asserts FR-007 (a)–(d)
├── go.mod
├── go.sum
├── .air.toml                    # live-reload config (referenced by `make dev`)
└── .golangci.yml                # linter config (lints enabled per pre-commit hook)

frontend/
├── src/
│   ├── routes/
│   │   ├── +layout.ts           # `export const prerender = true;` (force static)
│   │   └── +page.svelte         # renders "Ring", version, SHA, "skeleton OK"
│   ├── app.html                 # contains %sveltekit.head% + version/SHA from `import.meta.env`
│   └── lib/
│       └── version.ts           # reads VITE_RING_VERSION + VITE_RING_COMMIT at build time
├── static/
│   └── favicon.png
├── tests/
│   └── smoke.test.ts            # vitest placeholder asserting version.ts behavior
├── package.json
├── pnpm-lock.yaml
├── svelte.config.js             # adapter-static, fallback: undefined (no SPA fallback needed)
├── vite.config.ts               # injects VITE_RING_VERSION + VITE_RING_COMMIT from env
├── tsconfig.json
├── .eslintrc.cjs                # ESLint config matching pre-commit hook
└── .prettierrc                  # Prettier config matching pre-commit hook

.github/
└── workflows/
    └── ci.yml                   # Backend (Go 1.26): lint, vuln, test.
                                 # Frontend: lint, prettier --check, tsc --noEmit, vitest.
                                 # Integration: Docker-in-Docker for testcontainers.

# Untouched by this feature (already present from feature 102):
# Makefile, Dockerfile, Caddyfile, docker-compose*.yml, .env.example,
# .husky/*, package.json (root), .gitignore, ROADMAP.md, CLAUDE.md,
# .specify/**, .claude/**
```

**Structure Decision**: Two source trees (`backend/` + `frontend/`) chosen because the constitution mandates a Go backend and a SvelteKit frontend with different toolchains, linters, and test runners — colocating them under `src/` would force shared tsconfig/go.mod boundaries the constitution does not want. At runtime the deliverable collapses to a single binary: the SvelteKit static output is copied into `backend/internal/web/dist/` during the Docker build (see existing `Dockerfile` stage 2) and embedded via `//go:embed`. The two trees exist only at build time, which keeps Principle V honest (no orchestration layer) while satisfying the §Distribution constraint (single image).

## Complexity Tracking

> No constitution violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_ | — | — |

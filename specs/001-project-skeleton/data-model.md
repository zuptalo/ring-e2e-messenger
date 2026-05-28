# Phase 1 — Data Model

**Feature**: 001-project-skeleton

**Date**: 2026-05-27

## Domain entities

**None.** This feature establishes infrastructure only. The spec is explicit: "This feature establishes infrastructure only and introduces no domain entities. The first domain entity will be introduced in a later feature."

No tables, no rows, no schema migrations land in this feature. `backend/migrations/` exists as an empty directory (with `.gitkeep`) so `make migrate` has a target directory once Feature 003 introduces the first migration.

## Database access pattern (operational, not domain)

The skeleton's only interaction with PostgreSQL is a connection pool that supports a single operation: `Ping(ctx) error`. The pool is wrapped in `internal/db/Pool` with this conceptual shape:

| Field | Type | Purpose |
|---|---|---|
| `pool` | `*pgxpool.Pool` | underlying pgx connection pool |
| `healthy` | `atomic.Bool` | last observed ping outcome; read by `/healthz` and `/api/*` guards |
| `lastError` | `atomic.Value` (string) | last ping error message, for `WARN` log fields only — never returned to clients |

Lifecycle:

1. `main` builds the pool from `DATABASE_URL`. If the initial connect or first ping fails, `main` exits non-zero (this is the "initial boot" failure mode FR-002 covers via the Postgres healthcheck in compose).
2. After successful initial boot, a goroutine pings every 5s (configurable, but defaulted). On failure it sets `healthy=false`, emits `WARN db.reconnect_attempt`, and applies exponential backoff: 1s, 2s, 4s, 8s, 16s, then steady 30s.
3. On a successful ping after a failure, `healthy=true`, emit `INFO db.reconnected`, and reset the backoff to 5s steady polling.

The pool exposes **no SQL methods** in this feature. It does not need to: there is nothing to read or write.

## Configuration entities

Read from environment at startup; immutable for process lifetime.

| Env var | Type | Default | Source |
|---|---|---|---|
| `DATABASE_URL` | string | _(none — required)_ | `.env.example`, set by docker-compose |
| `LISTEN_ADDR` | string | `:8080` | `.env.example` |
| `LOG_LEVEL` | string (`debug`/`info`/`warn`/`error`) | `info` | `.env.example` |
| `PUBLIC_URL` | string | `https://ring.localtest.me` | `.env.example` (informational; not consumed by handlers in this feature) |

`RING_FQDN`, `RING_UPSTREAM`, `VAPID_*` are consumed by Caddy and future features, not by the Go binary in this feature.

## State transitions

There is exactly one state machine in the skeleton: the DB-health state.

```
                    ping succeeds
              ┌──────────────────────┐
              ↓                      │
        ┌──────────┐  ping fails ┌──────────┐
boot →  │ healthy  │ ──────────→ │unhealthy │
        └──────────┘             └──────────┘
                                  ↑       │
                                  └───────┘
                                  ping retry
                                  (exp. backoff)
```

`boot → healthy` requires the first ping to succeed (otherwise `main` exits non-zero). After that, the application stays alive indefinitely, oscillating between `healthy` and `unhealthy` based on background pings. The HTTP layer is up the entire time the process is alive.

# HTTP Contracts — Project Skeleton

**Feature**: 001-project-skeleton

The skeleton exposes exactly four HTTP surfaces. These contracts are the baseline that future features MUST preserve (Principle IV — any breaking change here is MAJOR).

All routes are reachable both directly on the Go listener (`http://localhost:<port>`) and through the Caddy reverse proxy at `https://${RING_FQDN}` with TLS termination.

---

## 1. `GET /` — Web shell

| Property | Value |
|---|---|
| Method | `GET` |
| Path | `/` (and any path not matching `/api/`, `/ws`, `/healthz`) |
| Auth | none (public) |
| Status | `200 OK` |
| `Content-Type` | `text/html; charset=utf-8` |
| Cache | `Cache-Control: no-cache` (skeleton; revisit when assets are fingerprinted) |

**Body**: The prerendered SvelteKit HTML output for the root route. The initial HTML payload MUST literally contain, without requiring JS execution:

- The string `Ring` (application name).
- The string `skeleton OK` (stable verification marker).
- The build version string injected via `VITE_RING_VERSION` (e.g., `v0.1.0`).
- The build commit SHA injected via `VITE_RING_COMMIT` (40-char hex or `unknown`).

**Negative requirements**:

- MUST NOT make any client-side `fetch()` calls.
- MUST NOT depend on JavaScript execution for the four strings above.
- MUST NOT serve the web shell for paths under `/api/`, `/ws`, or `/healthz` even if no handler is registered.

**Test assertion**: `response.status == 200 && body.contains("skeleton OK") && body.contains(commit_sha)`.

---

## 2. `GET /healthz` — Liveness + DB-connectivity probe

| Property | Value |
|---|---|
| Method | `GET` |
| Path | `/healthz` |
| Auth | none (public, unauthenticated per spec clarification 2026-05-27) |
| Status (healthy) | `200 OK` |
| Status (unhealthy) | `503 Service Unavailable` |
| `Content-Type` | `application/json` |
| Cache | `Cache-Control: no-store` |

**Body (healthy)**: exactly `{"status":"ok"}` (no trailing whitespace, no additional fields).

**Body (unhealthy)**: exactly `{"status":"unhealthy"}`.

**Semantics**: The handler reads `db.Pool.healthy` (atomic flag maintained by the background ping goroutine — see data-model.md). It MUST NOT perform a fresh ping per request.

**Negative requirements**:

- MUST NOT disclose: connection strings, hostnames, software versions, uptime, stack traces, or any other diagnostic detail.
- MUST be reachable without authentication over the public TLS endpoint.

**JSON schema**: see `healthz.schema.json`.

**Test assertion**: `response.status == 200 && body == '{"status":"ok"}\n'` (the `\n` is what Go's `json.Encoder` emits — accept with or without trailing newline).

---

## 3. `/api/*` — Backend-only reserved namespace

| Property | Value |
|---|---|
| Method | any |
| Path prefix | `/api/` |
| Status (unrouted in this feature) | `404 Not Found` |
| `Content-Type` | `application/json` |

**Body (unrouted)**: `{"error":"not_found"}`.

**Body (degraded — DB down post-boot)**: `503` with `{"error":"service_degraded"}`.

**Semantics**: Until Feature 003 introduces real `/api/*` handlers, every `/api/...` request returns the backend-shaped 404 above. It MUST NOT fall through to the SPA file server (which would return the HTML shell — a contract violation that would silently confuse API clients).

**Test assertion**: `GET /api/nonexistent → 404 && Content-Type: application/json && body matches /"error":"not_found"/`.

---

## 4. `GET /ws` — WebSocket namespace reservation

| Property | Value |
|---|---|
| Method | any non-upgrade |
| Path | `/ws` |
| Status (non-upgrade request) | `426 Upgrade Required` |
| Body | empty |

**Semantics**: A handler is registered at `/ws` that, for any request whose `Connection`/`Upgrade` headers do not request a WebSocket upgrade, returns `426 Upgrade Required` with an empty body. No diagnostic detail is included. A real WebSocket handshake is out of scope for this feature (Feature 004 implements it).

**Negative requirements**:

- MUST NOT return the SPA HTML shell.
- MUST NOT return a 404 (the namespace IS reserved; it just isn't fully implemented yet).
- MUST be reachable both directly on the listener and via Caddy under TLS.

**Test assertion**: `GET https://${RING_FQDN}/ws → 426 && len(body) == 0` AND `GET http://localhost:<port>/ws → 426 && len(body) == 0`.

---

## Routing precedence (informative)

Go 1.22+ `http.ServeMux` resolves longest-pattern-wins, so registration order in `internal/server/server.go` does not matter. However, the explicit registrations MUST be:

```
mux.HandleFunc("GET /healthz", healthz)
mux.HandleFunc("/api/", api)        // covers any method
mux.HandleFunc("/ws", ws)
mux.Handle("/", spa)                // SPA file server — must be the only catch-all
```

This ordering yields the precedence: exact `/healthz` > `/api/` prefix > exact `/ws` > catch-all `/`. The SPA file server MUST refuse to serve any path that starts with `/api/` or equals `/ws` even though it would never be reached in practice — defense in depth against future refactors that accidentally re-order handlers.

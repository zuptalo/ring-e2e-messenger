# Quickstart — Project Skeleton

**Feature**: 001-project-skeleton

**Audience**: A new contributor on a clean macOS or Linux machine with `git`, `docker`, `make`, `go 1.26`, `node 22`, and `pnpm 9` installed.

**Goal (SC-001)**: From `git clone` to seeing `Ring · skeleton OK` rendered over browser-trusted HTTPS in **under 10 minutes**.

---

## 1. Clone and configure (1 minute)

```bash
git clone https://github.com/zuptalo/ring-e2ee-messenger.git ring
cd ring
cp .env.example .env
```

No edits to `.env` are required for local dev — the defaults target `ring.localtest.me` which resolves to `127.0.0.1` via the public `localtest.me` service. Edit `RING_FQDN` only if you want a custom local hostname (in which case make it resolve to `127.0.0.1` yourself).

> **If `ring.localtest.me` does not resolve** (`curl: (6) Could not resolve host`): your network's DNS server is likely stripping the `127.0.0.1` answer as DNS-rebinding protection — common on home routers, Pi-hole, and corporate resolvers. Bypass DNS with a hosts entry:
>
> ```bash
> echo "127.0.0.1 ring.localtest.me" | sudo tee -a /etc/hosts
> ```
>
> This is the most reliable option regardless of network; the `localtest.me` public service is a convenience, not a requirement.

---

## 2. One-time TLS trust step (1 minute, first machine only)

```bash
make trust
```

This boots Caddy and installs its internal-CA root into your system trust store. You will be prompted for `sudo` (macOS Keychain) or your user password (Linux `update-ca-certificates`). Re-running is idempotent.

**Skipping this step** leaves the browser warning on `https://ring.localtest.me`. Curl users can also skip and pass `--cacert` against the cert exported under `caddy_data/`.

---

## 3. Bring up the stack (2 minutes first time, ~10s thereafter)

For a contributor iterating on Go and Svelte with live reload:

```bash
make dev                                    # starts Postgres + Caddy in compose
# then in two terminals:
( cd backend && air -c .air.toml )          # Go server with live reload on :8080
( cd frontend && pnpm install && pnpm run dev )   # Vite HMR on :5173
```

For a one-shot smoke test of the production build (single image, no live reload):

```bash
make image && make up
```

`make up` runs `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` which adds the built `ring:latest` `app` service and re-points Caddy at it.

---

## 4. Verify (30 seconds)

Open `https://ring.localtest.me/` in a browser. You should see:

```
Ring
v0.1.0
<40-char commit SHA>
skeleton OK
```

The page should load without any TLS warning and without any failing network requests in the DevTools Network panel (no `fetch` calls are made; the four strings are all in the initial HTML).

From the command line:

```bash
# Direct to the Go process (HTTP)
curl -s http://localhost:8080/healthz                  # → {"status":"ok"}
curl -sI http://localhost:8080/ws | head -1            # → HTTP/1.1 426 Upgrade Required

# Through Caddy (HTTPS, browser-trusted after `make trust`)
curl -s https://ring.localtest.me/healthz              # → {"status":"ok"}
curl -sI https://ring.localtest.me/ws | head -1        # → HTTP/2 426

# /api/* is reserved — must return JSON 404, NOT the SPA
curl -s https://ring.localtest.me/api/anything         # → {"error":"not_found"}
```

If any of those fail, `make logs` shows the Caddy and Postgres tails; `docker compose ps` shows their status.

---

## 5. Tear down

```bash
make down                   # stops compose stack
make clean                  # removes bin/ and frontend/build/ (keeps volumes)
docker compose down -v      # ALSO drops the postgres volume (destructive)
```

---

## 6. Run the test suites

```bash
make test                   # backend + frontend unit tests; no Docker needed
make lint                   # golangci-lint + govulncheck + ESLint + Prettier + tsc

# Integration test (boots production binary + testcontainers Postgres + Caddy)
( cd backend && go test -tags=integration ./test/integration/... )
```

The integration test does not depend on `make dev`/`make up` being active — it manages its own ephemeral Postgres and Caddy containers and cleans them up. Requires a running Docker daemon.

---

## 7. Production deploy on a fresh host (5 minutes)

On a host with a public DNS A record pointing at it and ports 80/443 open:

```bash
git clone https://github.com/zuptalo/ring-e2ee-messenger.git ring
cd ring
cp .env.example .env
$EDITOR .env                # set RING_FQDN to your real domain AND set
                            # CADDY_GLOBAL_OPTIONS= (empty) so Caddy ACMEs a
                            # publicly trusted cert instead of its internal CA
make image
make up
```

Caddy will request an ACME certificate for your FQDN on first request. Within ~60 seconds (SC-004), `curl https://<your-fqdn>/healthz` MUST return `{"status":"ok"}` with a publicly trusted certificate. Verify it from a remote client (your laptop, not the host) with this poll loop, which demonstrates the 60-second SLA from the moment `make up` returns:

```bash
export RING_FQDN=your.domain          # the FQDN you set in .env
for i in $(seq 1 12); do curl -sf https://$RING_FQDN/healthz && break; sleep 5; done
```

**Troubleshooting**: If this loop times out, run `docker compose logs proxy` on the host — ACME failures are logged there. The usual causes are DNS not yet propagated, ports 80/443 unreachable from the internet, or `CADDY_GLOBAL_OPTIONS` still set to `local_certs` (which keeps Caddy on its internal CA and skips ACME entirely).

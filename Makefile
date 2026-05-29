# Ring — developer-facing entry points. Constitution §D (Makefile Contract).
# Every recurring command lives here so the surface is uniform and discoverable.
.DEFAULT_GOAL := help
.PHONY: help dev dev-pwa dev-remote dev-remote-prod up down build image test test-e2e lint migrate seed logs clean trust install fmt vapid-gen version frontend-embed

RING_FQDN ?= ring.localtest.me
DATABASE_URL ?= postgres://ring:ring@localhost:5432/ring?sslmode=disable

# Remote live-dev through a home reverse proxy (make dev-remote / dev-remote-prod).
RING_REMOTE_HOST ?= ring-home.zuptalo.com
RING_DEV_PORT ?= 5173
RING_PREVIEW_PORT ?= 4173
# Best-effort LAN IP of this laptop (the address your proxy forwards to).
LAN_IP := $(shell ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $$1}' || echo '<laptop-LAN-IP>')

# Build-time version stamping (T005/T006). `?=` so callers can override.
RING_VERSION ?= $(shell git describe --tags --dirty --always 2>/dev/null || echo dev)
RING_COMMIT  ?= $(shell git rev-parse HEAD 2>/dev/null || echo unknown)
RING_LDFLAGS := -s -w -X github.com/zuptalo/ring-e2ee-messenger/backend/internal/version.Version=$(RING_VERSION) -X github.com/zuptalo/ring-e2ee-messenger/backend/internal/version.Commit=$(RING_COMMIT)

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install root tooling (Husky) + frontend deps if present
	npm install
	@if [ -f frontend/package.json ]; then (cd frontend && pnpm install); fi
	@if [ -f backend/go.mod ]; then (cd backend && go mod download); fi

dev: ## Start db + proxy in compose; run Go (air) and SvelteKit (vite) on host
	RING_FQDN=$(RING_FQDN) docker compose up -d db proxy
	@echo ""
	@echo "DB and proxy are running. In two terminals, run:"
	@echo "  (terminal 1) cd backend && air -c .air.toml      # Go + live reload"
	@echo "  (terminal 2) cd frontend && pnpm run dev         # Vite HMR"
	@echo "Then open https://$(RING_FQDN)/"

dev-pwa: ## Build the frontend and preview it with the PWA active (SW+manifest; no HMR)
	@if [ ! -f frontend/package.json ]; then echo "dev-pwa needs the frontend"; exit 1; fi
	cd frontend && RING_VERSION=$(RING_VERSION) RING_COMMIT=$(RING_COMMIT) pnpm run build
	@echo ""
	@echo "PWA preview (service worker + manifest active) → http://localhost:4173"
	@echo "localhost is a secure context, so the SW registers. Re-run after changes (preview has no hot reload)."
	cd frontend && pnpm run preview

dev-remote: ## Live-reload dev (HMR + live PWA) exposed via your reverse proxy at https://$(RING_REMOTE_HOST)
	@if [ ! -f frontend/package.json ]; then echo "dev-remote needs the frontend"; exit 1; fi
	@echo ""
	@echo "  Point your home reverse proxy:"
	@echo "    https://$(RING_REMOTE_HOST)   ->   http://$(LAN_IP):$(RING_DEV_PORT)   (HTTP upstream; enable websocket upgrade for HMR)"
	@echo ""
	@echo "  Then open https://$(RING_REMOTE_HOST)/  — edits hot-reload; the app is installable (manifest + dev SW live)."
	@echo "  Install-first: a browser tab shows the install coach; 'Add to Home Screen' / Install to reach the app shell."
	@echo ""
	cd frontend && RING_REMOTE_HOST=$(RING_REMOTE_HOST) RING_DEV_PORT=$(RING_DEV_PORT) \
		RING_VERSION=$(RING_VERSION) RING_COMMIT=$(RING_COMMIT) \
		pnpm exec vite dev

dev-remote-prod: ## Production-exact preview (real Workbox SW, no HMR) exposed via your reverse proxy
	@if [ ! -f frontend/package.json ]; then echo "dev-remote-prod needs the frontend"; exit 1; fi
	@echo ""
	@echo "  Point your home reverse proxy:"
	@echo "    https://$(RING_REMOTE_HOST)   ->   http://$(LAN_IP):$(RING_PREVIEW_PORT)"
	@echo ""
	@echo "  Building the production bundle (real precache service worker)…"
	cd frontend && RING_VERSION=$(RING_VERSION) RING_COMMIT=$(RING_COMMIT) pnpm run build
	@echo "  Serving the built bundle — re-run this target after changes (no hot reload)."
	cd frontend && RING_REMOTE_HOST=$(RING_REMOTE_HOST) RING_PREVIEW_PORT=$(RING_PREVIEW_PORT) pnpm exec vite preview

up: ## docker compose up -d (full stack, prebuilt image)
	RING_FQDN=$(RING_FQDN) docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

down: ## docker compose down
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down

frontend-embed: ## Build the frontend and stage it into backend/internal/web/dist for go:embed
	@if [ -d frontend ]; then \
		cd frontend && pnpm install --frozen-lockfile && \
		RING_VERSION=$(RING_VERSION) RING_COMMIT=$(RING_COMMIT) pnpm run build && \
		rm -rf ../backend/internal/web/dist && \
		mkdir -p ../backend/internal/web/dist && \
		cp -R build/. ../backend/internal/web/dist/ && \
		touch ../backend/internal/web/dist/.gitkeep; \
	fi

build: frontend-embed ## Build SvelteKit + Go binary on the host (no Docker)
	@if [ -d backend ]; then cd backend && CGO_ENABLED=0 go build -trimpath -ldflags="$(RING_LDFLAGS)" -o ../bin/ring ./cmd/ring; fi

image: ## Build single production Docker image (ring:latest)
	docker build --build-arg RING_VERSION=$(RING_VERSION) --build-arg RING_COMMIT=$(RING_COMMIT) -t ring:latest -t ring:$(RING_VERSION) .

version: ## Show resolved RING_VERSION/RING_COMMIT (debugging build stamps)
	@echo "RING_VERSION=$(RING_VERSION)"
	@echo "RING_COMMIT=$(RING_COMMIT)"

test: ## Run all tests (Go + frontend)
	@if [ -f backend/go.mod ]; then cd backend && go test ./...; fi
	@if [ -f frontend/package.json ]; then cd frontend && pnpm run test; fi

test-e2e: ## Run the Playwright e2e suite (Chromium + WebKit; builds + previews the prod bundle)
	@if [ ! -f frontend/package.json ]; then echo "test-e2e needs the frontend"; exit 1; fi
	cd frontend && pnpm exec playwright test

lint: ## Run all linters (Go + frontend)
	@if [ -f backend/go.mod ]; then cd backend && golangci-lint run ./... && govulncheck ./...; fi
	@if [ -f frontend/package.json ]; then cd frontend && pnpm run lint && pnpm exec tsc --noEmit; fi

fmt: ## Format Go + frontend code
	@if [ -f backend/go.mod ]; then cd backend && gofumpt -l -w .; fi
	@if [ -f frontend/package.json ]; then cd frontend && pnpm exec prettier --write .; fi

migrate: ## Apply Goose migrations against $$DATABASE_URL
	cd backend && goose -dir migrations postgres "$(DATABASE_URL)" up

seed: ## Seed dev data
	cd backend && go run ./cmd/seed

logs: ## Tail compose logs
	docker compose logs -f --tail=100

clean: ## Remove build artifacts (does not touch volumes)
	rm -rf bin frontend/build frontend/.svelte-kit

trust: ## One-time: install Caddy's internal-CA root into the host trust store
	@# --no-recreate so running `make trust` after `make up` does NOT tear down
	@# the prod proxy and recreate it with the dev upstream (which would 502).
	@RING_FQDN=$(RING_FQDN) docker compose up -d --no-recreate proxy
	@echo "Generating Caddy internal CA inside the proxy container..."
	@docker compose exec -T proxy caddy trust >/dev/null 2>&1 || true
	@docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt /tmp/ring-caddy-root.crt
	@if [ "$$(uname)" = "Darwin" ]; then \
		echo "Installing Caddy root into the macOS System Keychain — you'll be prompted for your sudo password..."; \
		sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /tmp/ring-caddy-root.crt; \
	else \
		echo "Installing Caddy root into /usr/local/share/ca-certificates — you'll be prompted for your sudo password..."; \
		sudo cp /tmp/ring-caddy-root.crt /usr/local/share/ca-certificates/ring-caddy-root.crt; \
		sudo update-ca-certificates; \
	fi
	@rm -f /tmp/ring-caddy-root.crt
	@echo "✓ Caddy internal CA trusted on host. Restart your browser to pick up the change."

vapid-gen: ## Generate a VAPID keypair for Web Push (writes to stdout)
	@if [ ! -f backend/go.mod ]; then echo "vapid-gen needs the backend (Feature 005+)"; exit 1; fi
	cd backend && go run ./cmd/vapid-gen

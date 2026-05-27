# Ring — developer-facing entry points. Constitution §D (Makefile Contract).
# Every recurring command lives here so the surface is uniform and discoverable.
.DEFAULT_GOAL := help
.PHONY: help dev up down build image test lint migrate seed logs clean trust install fmt vapid-gen version

RING_FQDN ?= ring.localtest.me
DATABASE_URL ?= postgres://ring:ring@localhost:5432/ring?sslmode=disable

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

up: ## docker compose up -d (full stack, prebuilt image)
	RING_FQDN=$(RING_FQDN) docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

down: ## docker compose down
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down

build: ## Build SvelteKit + Go binary on the host (no Docker)
	@if [ -d frontend ]; then cd frontend && pnpm install --frozen-lockfile && RING_VERSION=$(RING_VERSION) RING_COMMIT=$(RING_COMMIT) pnpm run build; fi
	@if [ -d backend ]; then cd backend && CGO_ENABLED=0 go build -trimpath -ldflags="$(RING_LDFLAGS)" -o ../bin/ring ./cmd/ring; fi

image: ## Build single production Docker image (ring:latest)
	docker build --build-arg RING_VERSION=$(RING_VERSION) --build-arg RING_COMMIT=$(RING_COMMIT) -t ring:latest -t ring:$(RING_VERSION) .

version: ## Show resolved RING_VERSION/RING_COMMIT (debugging build stamps)
	@echo "RING_VERSION=$(RING_VERSION)"
	@echo "RING_COMMIT=$(RING_COMMIT)"

test: ## Run all tests (Go + frontend)
	@if [ -f backend/go.mod ]; then cd backend && go test ./...; fi
	@if [ -f frontend/package.json ]; then cd frontend && pnpm run test; fi

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
	RING_FQDN=$(RING_FQDN) docker compose up -d proxy
	docker compose exec proxy caddy trust

vapid-gen: ## Generate a VAPID keypair for Web Push (writes to stdout)
	@if [ ! -f backend/go.mod ]; then echo "vapid-gen needs the backend (Feature 005+)"; exit 1; fi
	cd backend && go run ./cmd/vapid-gen

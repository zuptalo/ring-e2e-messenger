# Ring — single self-contained image (Go binary serves embedded SvelteKit build).
# Constitution §Platform Constraints (Distribution).
#
# Stage 1: build the SvelteKit frontend.
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm run build

# Stage 2: compile the Go binary, embedding the SvelteKit build output.
FROM golang:1.26-alpine AS backend-build
WORKDIR /src
RUN apk add --no-cache git ca-certificates
COPY backend/go.mod backend/go.sum* ./
RUN go mod download
COPY backend/ ./
# Place the SvelteKit build where internal/web/embed.go expects it.
COPY --from=frontend-build /app/frontend/build /src/internal/web/dist
RUN CGO_ENABLED=0 GOOS=linux \
    go build -tags netgo,osusergo -trimpath -ldflags="-s -w" \
    -o /out/ring ./cmd/ring

# Stage 3: minimal runtime.
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=backend-build /out/ring /ring
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/ring", "serve"]

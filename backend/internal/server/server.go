// Package server wires the HTTP surfaces declared in
// contracts/http-routes.md onto a single ServeMux and decorates it with the
// request-logging middleware.
package server

import (
	"log/slog"
	"net/http"
	"strings"
)

// Deps holds the runtime dependencies the server needs. Injected by main.
type Deps struct {
	DB           HealthChecker
	Logger       *slog.Logger
	Files        http.FileSystem
	ServerHeader string // e.g. "ring/v0.1.0+abcd1234"; empty disables the header
}

// New builds the HTTP handler tree per contracts/http-routes.md. The
// returned handler is a ServeMux wrapped with RequestLogger.
func New(deps Deps) http.Handler {
	mux := http.NewServeMux()

	// 1. Liveness + DB-connectivity probe (exact path).
	mux.HandleFunc("GET /healthz", Healthz(deps.DB))

	// 2. /api/* — degraded-guard wraps the fallback 404.
	mux.Handle("/api/", APIDegraded(deps.DB, APIFallback()))

	// 3. /ws — namespace reservation (426 until Feature 004).
	mux.HandleFunc("/ws", WS())

	// 4. Catch-all — SPA file server, with defense-in-depth refusal for any
	// /api/* or /ws path that somehow slipped past steps 2 and 3.
	mux.Handle("/", spaHandler(deps.Files))

	logger := deps.Logger
	if logger == nil {
		logger = slog.Default()
	}
	return RequestLogger(mux, logger, deps.ServerHeader)
}

// spaHandler serves the embedded SvelteKit shell from files. It rejects any
// /api/* or /ws path with the JSON 404 contract so misconfigured precedence
// never leaks the HTML shell to API clients.
func spaHandler(files http.FileSystem) http.Handler {
	if files == nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"error":"shell_unavailable"}`))
		})
	}
	fs := http.FileServer(files)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasPrefix(path, "/api/") || path == "/ws" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(apiNotFound))
			return
		}
		// SvelteKit prerendered output uses index.html for the root and
		// path/index.html (or path.html) for subroutes. http.FileServer
		// returns the right file for path = "/" automatically; for other
		// paths SvelteKit ensures the file exists at exactly that name.
		fs.ServeHTTP(w, r)
	})
}

package server

import "net/http"

const (
	apiNotFound        = `{"error":"not_found"}`
	apiServiceDegraded = `{"error":"service_degraded"}`
)

// APIFallback returns the JSON-shaped 404 for any unrouted /api/* request
// per contracts/http-routes.md §3. It MUST NOT fall through to the SPA file
// server.
func APIFallback() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(apiNotFound))
	}
}

// APIDegraded wraps an /api/* handler with a short-circuit that returns
// 503 + {"error":"service_degraded"} whenever the DB is unhealthy. This is
// the "API is degraded but the page still renders" mode in
// contracts/http-routes.md §3.
func APIDegraded(checker HealthChecker, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !checker.Healthy() {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(apiServiceDegraded))
			return
		}
		next.ServeHTTP(w, r)
	})
}

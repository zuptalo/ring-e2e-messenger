package server

import "net/http"

// HealthChecker is the narrow surface needed from db.Pool. Extracted so the
// server doesn't import the db package and so tests can inject a stub.
type HealthChecker interface {
	Healthy() bool
}

const (
	healthzOK        = `{"status":"ok"}`
	healthzUnhealthy = `{"status":"unhealthy"}`
)

// Healthz returns the JSON liveness+DB-connectivity probe per
// contracts/http-routes.md §2.
func Healthz(checker HealthChecker) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if checker.Healthy() {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(healthzOK))
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(healthzUnhealthy))
	}
}

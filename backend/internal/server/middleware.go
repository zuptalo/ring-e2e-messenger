package server

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"time"
)

// statusRecorder captures the response status code so RequestLogger can log
// it after the handler runs.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	return r.ResponseWriter.Write(b)
}

// newCorrelationID generates a 32-char hex ID from 16 random bytes. Used as
// the per-request correlation ID surfaced in slog fields and the Server
// response header.
func newCorrelationID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// rand.Read on Linux/macOS uses /dev/urandom; a failure means the OS
		// entropy source is unavailable, which is a hard failure. Falling back
		// to a deterministic value lets the request finish but flags the
		// problem in logs.
		return "00000000000000000000000000000000"
	}
	return hex.EncodeToString(b[:])
}

// RequestLogger wraps the next handler with one structured log entry per
// request: method, path, status, duration, correlation ID, outcome.
// It also stamps a `Server: ring/<version>+<short-sha>` header (SC-005)
// when serverHeader is non-empty.
func RequestLogger(next http.Handler, logger *slog.Logger, serverHeader string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		cid := newCorrelationID()
		if serverHeader != "" {
			w.Header().Set("Server", serverHeader)
		}
		w.Header().Set("X-Correlation-Id", cid)

		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)

		status := rec.status
		if status == 0 {
			status = http.StatusOK
		}
		outcome := "ok"
		if status >= 500 {
			outcome = "error"
		}
		logger.Info(
			"http.request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", status,
			"duration_ms", time.Since(start).Milliseconds(),
			"correlation_id", cid,
			"outcome", outcome,
		)
	})
}

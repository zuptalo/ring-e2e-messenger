package server_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/zuptalo/ring-e2ee-messenger/backend/internal/server"
)

// stubChecker implements the Healthy() interface for the server.
type stubChecker struct{ healthy bool }

func (s stubChecker) Healthy() bool { return s.healthy }

// stubFS returns a stub embed.FS-like filesystem containing only a minimal
// index.html with the four marker strings used by the contract.
func stubFS() http.FileSystem {
	return http.FS(fstest.MapFS{
		"index.html": &fstest.MapFile{
			Data: []byte(`<!doctype html><html><body>Ring v0.0.0-test deadbeef skeleton OK</body></html>`),
		},
	})
}

func newServer(t *testing.T, healthy bool) http.Handler {
	t.Helper()
	return server.New(server.Deps{
		DB:    stubChecker{healthy: healthy},
		Files: stubFS(),
	})
}

// (a) /healthz returns 200 + {"status":"ok"} when injected checker is healthy.
func TestHealthzHealthy(t *testing.T) {
	srv := httptest.NewServer(newServer(t, true))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status: got %d, want 200", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type: got %q, want application/json", ct)
	}
	body, _ := io.ReadAll(resp.Body)
	if strings.TrimSpace(string(body)) != `{"status":"ok"}` {
		t.Errorf("body: got %q, want {\"status\":\"ok\"}", body)
	}
}

// (b) /healthz returns 503 + {"status":"unhealthy"} when unhealthy.
func TestHealthzUnhealthy(t *testing.T) {
	srv := httptest.NewServer(newServer(t, false))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("status: got %d, want 503", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if strings.TrimSpace(string(body)) != `{"status":"unhealthy"}` {
		t.Errorf("body: got %q, want {\"status\":\"unhealthy\"}", body)
	}
}

// (c) /api/anything returns 404 + {"error":"not_found"} regardless of method.
func TestAPIFallback404(t *testing.T) {
	srv := httptest.NewServer(newServer(t, true))
	defer srv.Close()

	for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodDelete, http.MethodPut, http.MethodPatch} {
		t.Run(method, func(t *testing.T) {
			req, _ := http.NewRequest(method, srv.URL+"/api/whatever", nil)
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusNotFound {
				t.Errorf("status: got %d, want 404", resp.StatusCode)
			}
			if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
				t.Errorf("Content-Type: got %q, want application/json", ct)
			}
			body, _ := io.ReadAll(resp.Body)
			if !strings.Contains(string(body), `"error":"not_found"`) {
				t.Errorf(`body: got %q, want to contain "error":"not_found"`, body)
			}
		})
	}
}

// (c-degraded) /api/* returns 503 + {"error":"service_degraded"} when DB is unhealthy.
func TestAPIDegradedWhenDBDown(t *testing.T) {
	srv := httptest.NewServer(newServer(t, false))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/foo")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("status: got %d, want 503", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), `"error":"service_degraded"`) {
		t.Errorf(`body: got %q, want to contain "error":"service_degraded"`, body)
	}
}

// (d) /ws returns 426 with empty body when no Upgrade header.
func TestWS426(t *testing.T) {
	srv := httptest.NewServer(newServer(t, true))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/ws")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUpgradeRequired {
		t.Errorf("status: got %d, want 426", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if len(body) != 0 {
		t.Errorf("body: got %d bytes, want empty", len(body))
	}
}

// (e) GET / returns 200 + HTML containing 'skeleton OK' from a stub embed.FS.
func TestRootServesShell(t *testing.T) {
	srv := httptest.NewServer(newServer(t, true))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status: got %d, want 200", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "skeleton OK") {
		t.Errorf("body: got %q, want to contain 'skeleton OK'", body)
	}
}

// (f) GET /api/foo MUST NOT fall through to the SPA file server even if there's
// no explicit handler — defense-in-depth per contracts/http-routes.md precedence.
func TestAPIDoesNotFallThroughToSPA(t *testing.T) {
	srv := httptest.NewServer(newServer(t, true))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/foo")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if strings.Contains(string(body), "skeleton OK") {
		t.Errorf("/api/foo leaked SPA HTML (contains 'skeleton OK'): %q", body)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("/api/foo content-type: got %q, want application/json", ct)
	}
}

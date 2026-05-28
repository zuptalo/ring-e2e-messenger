package server_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestRoutingPrecedence drives every surface in contracts/http-routes.md
// through one live ServeMux (httptest.NewServer over server.New) and asserts
// the precedence claims in the contract's "Routing precedence" section:
// exact /healthz > /api/ prefix > exact /ws > catch-all /. server_test.go
// already covers each handler's behavior in isolation; this guards against a
// future refactor silently re-ordering the mux so the wrong handler wins.
func TestRoutingPrecedence(t *testing.T) {
	srv := httptest.NewServer(newServer(t, true))
	defer srv.Close()

	cases := []struct {
		name         string
		method       string
		path         string
		wantStatus   int
		wantCTPrefix string // "" to skip the Content-Type check
		bodyContains string // "" to skip
		bodyExcludes string // "" to skip
	}{
		{
			name:         "exact /healthz beats the catch-all SPA",
			path:         "/healthz",
			wantStatus:   http.StatusOK,
			wantCTPrefix: "application/json",
			bodyContains: `{"status":"ok"}`,
			bodyExcludes: "skeleton OK",
		},
		{
			name:         "/api/ prefix routes to the backend 404, not the SPA",
			path:         "/api/",
			wantStatus:   http.StatusNotFound,
			wantCTPrefix: "application/json",
			bodyContains: `"error":"not_found"`,
			bodyExcludes: "skeleton OK",
		},
		{
			name:         "deep /api path stays on the backend, never leaks HTML",
			path:         "/api/v1/users/42",
			wantStatus:   http.StatusNotFound,
			wantCTPrefix: "application/json",
			bodyContains: `"error":"not_found"`,
			bodyExcludes: "skeleton OK",
		},
		{
			name:         "POST /api/* — prefix matches any method",
			method:       http.MethodPost,
			path:         "/api/whatever",
			wantStatus:   http.StatusNotFound,
			wantCTPrefix: "application/json",
			bodyContains: `"error":"not_found"`,
		},
		{
			name:         "exact /ws returns 426 with empty body",
			path:         "/ws",
			wantStatus:   http.StatusUpgradeRequired,
			bodyExcludes: "skeleton OK",
		},
		{
			name:       "POST /ws — reservation matches any method",
			method:     http.MethodPost,
			path:       "/ws",
			wantStatus: http.StatusUpgradeRequired,
		},
		{
			name:         "catch-all serves the SPA shell at root",
			path:         "/",
			wantStatus:   http.StatusOK,
			wantCTPrefix: "text/html",
			bodyContains: "skeleton OK",
		},
		{
			// /ws is registered as an exact pattern, so a sibling path is NOT
			// the reserved namespace — it falls through to the SPA file server
			// (which 404s the missing file as text/plain, not the /ws 426 and
			// not the /api JSON).
			name:         "/wsx is not the reserved /ws",
			path:         "/wsx",
			wantStatus:   http.StatusNotFound,
			bodyExcludes: `"error":"not_found"`,
		},
		{
			// Likewise /healthz is exact: /healthzz is an ordinary SPA path,
			// not the liveness probe.
			name:         "/healthzz is not the liveness probe",
			path:         "/healthzz",
			wantStatus:   http.StatusNotFound,
			bodyExcludes: `{"status":"ok"}`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			method := tc.method
			if method == "" {
				method = http.MethodGet
			}
			req, err := http.NewRequest(method, srv.URL+tc.path, nil)
			if err != nil {
				t.Fatal(err)
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			body, _ := io.ReadAll(resp.Body)

			if resp.StatusCode != tc.wantStatus {
				t.Errorf("status: got %d, want %d", resp.StatusCode, tc.wantStatus)
			}
			if tc.wantCTPrefix != "" {
				if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, tc.wantCTPrefix) {
					t.Errorf("Content-Type: got %q, want prefix %q", ct, tc.wantCTPrefix)
				}
			}
			if tc.bodyContains != "" && !strings.Contains(string(body), tc.bodyContains) {
				t.Errorf("body: got %q, want to contain %q", body, tc.bodyContains)
			}
			if tc.bodyExcludes != "" && strings.Contains(string(body), tc.bodyExcludes) {
				t.Errorf("body: %q must not contain %q (wrong handler won)", body, tc.bodyExcludes)
			}
		})
	}
}

//go:build integration

// Package integration_test exercises the full Ring skeleton end-to-end:
// Postgres + the production Go binary + Caddy reverse proxy. This is the
// FR-007 acceptance gate for User Story 1; it is required, not optional.
package integration_test

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/moby/moby/api/types/container"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// Marker strings the binary is built with and the assertions look for. Using a
// full 40-char hex SHA literal aligns with contracts/http-routes.md.
const (
	testVersion = "test-v0.0.0-integration"
	testCommit  = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
)

func TestSkeletonEndToEnd(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()

	// 1. Launch postgres:17 via the testcontainers module.
	pg, err := tcpostgres.Run(
		ctx, "postgres:17",
		tcpostgres.WithDatabase("ring"),
		tcpostgres.WithUsername("ring"),
		tcpostgres.WithPassword("ring"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(2*time.Minute),
		),
	)
	if err != nil {
		t.Fatalf("postgres start: %v", err)
	}
	t.Cleanup(func() { _ = pg.Terminate(context.Background()) })

	dsn, err := pg.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("dsn: %v", err)
	}
	t.Logf("postgres DSN: %s", dsn)

	// 2. Build the production binary with marker ldflags.
	binaryPath := buildBinary(t)

	// 3. Start the binary against a random localhost port.
	goPort := pickFreePort(t)
	listenAddr := fmt.Sprintf("127.0.0.1:%d", goPort)

	cmd := exec.CommandContext(ctx, binaryPath, "serve")
	cmd.Env = append(
		os.Environ(),
		"DATABASE_URL="+dsn,
		"LISTEN_ADDR="+listenAddr,
		"LOG_LEVEL=debug",
	)
	cmd.Stdout = testWriter{t}
	cmd.Stderr = testWriter{t}
	if err := cmd.Start(); err != nil {
		t.Fatalf("binary start: %v", err)
	}
	t.Cleanup(func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
	})

	goBase := "http://" + listenAddr
	if !waitFor(2*time.Minute, func() bool {
		resp, err := http.Get(goBase + "/healthz")
		if err != nil {
			return false
		}
		_ = resp.Body.Close()
		return resp.StatusCode == http.StatusOK
	}) {
		t.Fatalf("binary did not become healthy at %s/healthz", goBase)
	}

	// 4. Launch caddy:2 fronting the binary. The Caddyfile points at
	// host.docker.internal so Caddy in the container reaches the Go binary
	// running on the host. host-gateway extra-host makes this portable to
	// Linux daemons (macOS provides host.docker.internal natively).
	caddyfile := fmt.Sprintf(`{
	auto_https disable_redirects
	local_certs
}
ring.localtest.me {
	tls internal
	reverse_proxy host.docker.internal:%d
}
`, goPort)

	caddyReq := testcontainers.ContainerRequest{
		Image:        "caddy:2",
		ExposedPorts: []string{"443/tcp"},
		Files: []testcontainers.ContainerFile{
			{
				Reader:            strings.NewReader(caddyfile),
				ContainerFilePath: "/etc/caddy/Caddyfile",
				FileMode:          0o644,
			},
		},
		WaitingFor: wait.ForListeningPort("443/tcp").WithStartupTimeout(time.Minute),
		HostConfigModifier: func(hc *container.HostConfig) {
			hc.ExtraHosts = []string{"host.docker.internal:host-gateway"}
		},
	}
	caddy, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: caddyReq,
		Started:          true,
	})
	if err != nil {
		t.Fatalf("caddy start: %v", err)
	}
	t.Cleanup(func() { _ = caddy.Terminate(context.Background()) })

	caddyMappedPort, err := caddy.MappedPort(ctx, "443/tcp")
	if err != nil {
		t.Fatalf("caddy mapped port: %v", err)
	}
	caddyBase := fmt.Sprintf("https://ring.localtest.me:%s", caddyMappedPort.Port())

	// 5. Extract Caddy's auto-generated local-CA root cert and trust it.
	// Caddy generates the cert on first TLS handshake, so we issue a probe to
	// trigger it, then retry CopyFileFromContainer until the file exists.
	{
		insecure := &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec // single probe to generate cert
			},
			Timeout: 10 * time.Second,
		}
		_, _ = insecure.Get(caddyBase + "/healthz")
	}

	var caddyRoot []byte
	if !waitFor(time.Minute, func() bool {
		rc, err := caddy.CopyFileFromContainer(ctx, "/data/caddy/pki/authorities/local/root.crt")
		if err != nil {
			return false
		}
		defer rc.Close()
		buf, err := io.ReadAll(rc)
		if err != nil || len(buf) == 0 {
			return false
		}
		caddyRoot = buf
		return true
	}) {
		t.Fatalf("could not extract caddy root cert from /data/caddy/pki/authorities/local/root.crt")
	}

	rootPool := x509.NewCertPool()
	if !rootPool.AppendCertsFromPEM(caddyRoot) {
		t.Fatalf("could not parse caddy root cert PEM (%d bytes)", len(caddyRoot))
	}
	tlsClient := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				RootCAs:    rootPool,
				MinVersion: tls.VersionTLS12,
			},
		},
		Timeout: 10 * time.Second,
	}

	// ----- Assertions --------------------------------------------------------

	t.Run("GET / via direct port contains marker strings", func(t *testing.T) {
		body, status, _ := mustGET(t, http.DefaultClient, goBase+"/")
		if status != http.StatusOK {
			t.Errorf("status: got %d, want 200", status)
		}
		for _, marker := range []string{"skeleton OK", testVersion, testCommit} {
			if !strings.Contains(body, marker) {
				t.Errorf("body missing marker %q; body (truncated): %.500s", marker, body)
			}
		}
	})

	t.Run("GET /healthz via direct port returns 200 + {status:ok}", func(t *testing.T) {
		body, status, hdr := mustGET(t, http.DefaultClient, goBase+"/healthz")
		if status != http.StatusOK {
			t.Errorf("status: got %d, want 200", status)
		}
		if ct := hdr.Get("Content-Type"); ct != "application/json" {
			t.Errorf("Content-Type: got %q, want application/json", ct)
		}
		if strings.TrimSpace(body) != `{"status":"ok"}` {
			t.Errorf("body: got %q, want {\"status\":\"ok\"}", body)
		}
	})

	t.Run("GET / via Caddy serves the same body", func(t *testing.T) {
		body, status, _ := mustGET(t, tlsClient, caddyBase+"/")
		if status != http.StatusOK {
			t.Errorf("status: got %d, want 200", status)
		}
		for _, marker := range []string{"skeleton OK", testVersion, testCommit} {
			if !strings.Contains(body, marker) {
				t.Errorf("caddy body missing marker %q", marker)
			}
		}
	})

	t.Run("GET /ws returns 426 with empty body — direct AND via Caddy", func(t *testing.T) {
		for _, c := range []struct {
			name   string
			client *http.Client
			url    string
		}{
			{"direct", http.DefaultClient, goBase + "/ws"},
			{"caddy", tlsClient, caddyBase + "/ws"},
		} {
			t.Run(c.name, func(t *testing.T) {
				body, status, _ := mustGET(t, c.client, c.url)
				if status != http.StatusUpgradeRequired {
					t.Errorf("status: got %d, want 426", status)
				}
				if len(body) != 0 {
					t.Errorf("body: got %d bytes, want empty", len(body))
				}
			})
		}
	})

	t.Run("GET /api/nonexistent returns 404 + JSON not_found", func(t *testing.T) {
		body, status, hdr := mustGET(t, http.DefaultClient, goBase+"/api/nonexistent")
		if status != http.StatusNotFound {
			t.Errorf("status: got %d, want 404", status)
		}
		if ct := hdr.Get("Content-Type"); ct != "application/json" {
			t.Errorf("Content-Type: got %q, want application/json", ct)
		}
		if !strings.Contains(body, `"error":"not_found"`) {
			t.Errorf(`body: got %q, want to contain "error":"not_found"`, body)
		}
	})
}

// ----- helpers ---------------------------------------------------------------

// buildBinary runs the same build pipeline production does — frontend build
// with the marker env vars, copy build/ into backend/internal/web/dist/,
// then go build with the matching ldflags so the embedded HTML and the
// binary agree on Version/Commit. Returns the path to the resulting
// executable.
//
// Side effect: rewrites backend/internal/web/dist/ on disk. This is the
// documented contract for T028 ("Run the frontend build, copy frontend/build/*
// → backend/internal/web/dist/, then run the integration test").
func buildBinary(t *testing.T) string {
	t.Helper()
	repoRoot := findRepoRoot(t)

	buildFrontend(t, repoRoot)
	stageEmbed(t, repoRoot)

	binDir := t.TempDir()
	binPath := filepath.Join(binDir, "ring")
	ldflags := fmt.Sprintf(
		"-X github.com/zuptalo/ring-e2ee-messenger/backend/internal/version.Version=%s "+
			"-X github.com/zuptalo/ring-e2ee-messenger/backend/internal/version.Commit=%s",
		testVersion, testCommit,
	)
	cmd := exec.Command(
		"go", "build",
		"-trimpath",
		"-ldflags", ldflags,
		"-o", binPath,
		"./cmd/ring",
	)
	cmd.Dir = filepath.Join(repoRoot, "backend")
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("go build: %v\n%s", err, out)
	}
	return binPath
}

// buildFrontend invokes the SvelteKit production build with the same marker
// env vars the Go binary will be stamped with.
func buildFrontend(t *testing.T, repoRoot string) {
	t.Helper()
	cmd := exec.Command("pnpm", "run", "build")
	cmd.Dir = filepath.Join(repoRoot, "frontend")
	cmd.Env = append(
		os.Environ(),
		"RING_VERSION="+testVersion,
		"RING_COMMIT="+testCommit,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("pnpm run build: %v\n%s", err, out)
	}
}

// stageEmbed wipes backend/internal/web/dist/ and copies frontend/build/*
// into it so go:embed picks up the freshly-built frontend.
func stageEmbed(t *testing.T, repoRoot string) {
	t.Helper()
	src := filepath.Join(repoRoot, "frontend", "build")
	dst := filepath.Join(repoRoot, "backend", "internal", "web", "dist")
	if err := os.RemoveAll(dst); err != nil {
		t.Fatalf("rm -rf %s: %v", dst, err)
	}
	if err := os.MkdirAll(dst, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", dst, err)
	}
	cmd := exec.Command("cp", "-R", src+string(filepath.Separator)+".", dst+string(filepath.Separator))
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("cp -R %s %s: %v\n%s", src, dst, err, out)
	}
	// Re-add the .gitkeep so the directory is committed even if dist is
	// .gitignored by future changes. (Currently it isn't.)
	_ = os.WriteFile(filepath.Join(dst, ".gitkeep"), nil, 0o644)
}

// findRepoRoot walks up from the working directory until it finds the repo
// root (the directory containing go.work or .git or the Makefile).
func findRepoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "Makefile")); err == nil {
			if _, err := os.Stat(filepath.Join(dir, "backend")); err == nil {
				return dir
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatalf("could not locate repo root from %s", dir)
		}
		dir = parent
	}
}

// pickFreePort returns a port that was free at the moment of the call. There's
// a TOCTOU window — acceptable for tests on a developer machine.
func pickFreePort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

// waitFor polls condition every 250ms up to timeout. Returns true if cond
// returned true at any point before timeout, false otherwise.
func waitFor(timeout time.Duration, cond func() bool) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return true
		}
		time.Sleep(250 * time.Millisecond)
	}
	return cond()
}

// mustGET issues a GET and returns body, status, headers; fatals on transport
// errors.
func mustGET(t *testing.T, c *http.Client, url string) (string, int, http.Header) {
	t.Helper()
	resp, err := c.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("GET %s body: %v", url, err)
	}
	return string(body), resp.StatusCode, resp.Header
}

// testWriter forwards bytes from the subprocess to t.Log so test failures
// include the binary's structured logs.
type testWriter struct{ t *testing.T }

func (w testWriter) Write(p []byte) (int, error) {
	w.t.Logf("[ring] %s", strings.TrimRight(string(p), "\n"))
	return len(p), nil
}

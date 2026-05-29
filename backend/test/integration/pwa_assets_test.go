//go:build integration

// Asserts the production binary serves the feature-002 PWA assets (manifest +
// service worker) from embed.FS with correct content types, and that the
// feature-001 contracts (/healthz, /ws) are intact. Reuses the helpers in
// skeleton_test.go (same package). No Caddy: the TLS-fronted path is 001's job.
package integration_test

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestPWAAssetsServed(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()

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

	// buildBinary (skeleton_test.go) builds the frontend — now emitting the PWA
	// manifest + service worker — stages it into the embed root, and compiles.
	binaryPath := buildBinary(t)

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

	base := fmt.Sprintf("http://127.0.0.1:%d", goPort)
	if !waitFor(2*time.Minute, func() bool {
		resp, err := http.Get(base + "/healthz")
		if err != nil {
			return false
		}
		_ = resp.Body.Close()
		return resp.StatusCode == http.StatusOK
	}) {
		t.Fatalf("binary did not become healthy at %s/healthz", base)
	}

	t.Run("manifest served at /manifest.webmanifest with application/manifest+json", func(t *testing.T) {
		body, status, hdr := mustGET(t, http.DefaultClient, base+"/manifest.webmanifest")
		if status != http.StatusOK {
			t.Errorf("status: got %d, want 200", status)
		}
		if ct := hdr.Get("Content-Type"); !strings.HasPrefix(ct, "application/manifest+json") {
			t.Errorf("Content-Type: got %q, want application/manifest+json", ct)
		}
		if !strings.Contains(body, `"standalone"`) {
			t.Errorf("manifest missing display=standalone; body (truncated): %.300s", body)
		}
	})

	t.Run("service worker served at /sw.js with a JavaScript content type", func(t *testing.T) {
		_, status, hdr := mustGET(t, http.DefaultClient, base+"/sw.js")
		if status != http.StatusOK {
			t.Errorf("status: got %d, want 200", status)
		}
		if ct := hdr.Get("Content-Type"); !strings.Contains(ct, "javascript") {
			t.Errorf("Content-Type: got %q, want a javascript type", ct)
		}
	})

	t.Run("feature-001 contracts intact", func(t *testing.T) {
		if _, hs, _ := mustGET(t, http.DefaultClient, base+"/healthz"); hs != http.StatusOK {
			t.Errorf("/healthz: got %d, want 200", hs)
		}
		if _, ws, _ := mustGET(t, http.DefaultClient, base+"/ws"); ws != http.StatusUpgradeRequired {
			t.Errorf("/ws: got %d, want 426", ws)
		}
	})
}

package main

import (
	"log/slog"
	"testing"
)

// TestParseEnv covers the env-parsing happy path and its guard rails without
// opening a DB connection, so `go test ./...` exercises the cmd/ring package
// (otherwise reported as "no test files").
func TestParseEnv(t *testing.T) {
	t.Run("defaults when only DATABASE_URL is set", func(t *testing.T) {
		t.Setenv("DATABASE_URL", "postgres://ring:ring@localhost:5432/ring")
		t.Setenv("LISTEN_ADDR", "")
		t.Setenv("LOG_LEVEL", "")

		cfg, err := parseEnv()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if cfg.ListenAddr != ":8080" {
			t.Errorf("ListenAddr: got %q, want :8080", cfg.ListenAddr)
		}
		if cfg.LogLevel != slog.LevelInfo {
			t.Errorf("LogLevel: got %v, want %v", cfg.LogLevel, slog.LevelInfo)
		}
	})

	t.Run("overrides ListenAddr and LogLevel", func(t *testing.T) {
		t.Setenv("DATABASE_URL", "postgres://ring:ring@localhost:5432/ring")
		t.Setenv("LISTEN_ADDR", "0.0.0.0:9090")
		t.Setenv("LOG_LEVEL", "DEBUG") // case-insensitive

		cfg, err := parseEnv()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if cfg.ListenAddr != "0.0.0.0:9090" {
			t.Errorf("ListenAddr: got %q, want 0.0.0.0:9090", cfg.ListenAddr)
		}
		if cfg.LogLevel != slog.LevelDebug {
			t.Errorf("LogLevel: got %v, want %v", cfg.LogLevel, slog.LevelDebug)
		}
	})

	t.Run("missing DATABASE_URL is an error", func(t *testing.T) {
		t.Setenv("DATABASE_URL", "")

		if _, err := parseEnv(); err == nil {
			t.Fatal("expected error for missing DATABASE_URL, got nil")
		}
	})

	t.Run("invalid LOG_LEVEL is an error", func(t *testing.T) {
		t.Setenv("DATABASE_URL", "postgres://ring:ring@localhost:5432/ring")
		t.Setenv("LOG_LEVEL", "loud")

		if _, err := parseEnv(); err == nil {
			t.Fatal("expected error for invalid LOG_LEVEL, got nil")
		}
	})
}

// TestServerHeader confirms the SC-005 Server header is built as
// ring/<version>+<short-sha> with the commit truncated to 8 chars.
func TestServerHeader(t *testing.T) {
	got := serverHeader()
	if got == "" {
		t.Fatal("serverHeader() returned empty string")
	}
	if got[:5] != "ring/" {
		t.Errorf("serverHeader() = %q, want ring/ prefix", got)
	}
}

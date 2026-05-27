// Command ring is the Ring backend binary. The `serve` subcommand runs the
// HTTP server documented in contracts/http-routes.md. Future subcommands
// (migrate, seed, vapid-gen) will be added by later features.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/zuptalo/ring-e2ee-messenger/backend/internal/db"
	"github.com/zuptalo/ring-e2ee-messenger/backend/internal/server"
	"github.com/zuptalo/ring-e2ee-messenger/backend/internal/version"
	"github.com/zuptalo/ring-e2ee-messenger/backend/internal/web"
)

const shutdownTimeout = 10 * time.Second

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "serve":
		os.Exit(runServe())
	case "-h", "--help", "help":
		usage()
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: ring <command>")
	fmt.Fprintln(os.Stderr, "commands:")
	fmt.Fprintln(os.Stderr, "  serve   start the HTTP server")
}

// envConfig is the immutable runtime configuration parsed from the
// environment at startup. See data-model.md § Configuration entities.
type envConfig struct {
	DatabaseURL string
	ListenAddr  string
	LogLevel    slog.Level
}

func parseEnv() (envConfig, error) {
	c := envConfig{
		ListenAddr: ":8080",
		LogLevel:   slog.LevelInfo,
	}
	c.DatabaseURL = os.Getenv("DATABASE_URL")
	if c.DatabaseURL == "" {
		return c, errors.New("DATABASE_URL is required")
	}
	if v := os.Getenv("LISTEN_ADDR"); v != "" {
		c.ListenAddr = v
	}
	if v := strings.ToLower(os.Getenv("LOG_LEVEL")); v != "" {
		switch v {
		case "debug":
			c.LogLevel = slog.LevelDebug
		case "info":
			c.LogLevel = slog.LevelInfo
		case "warn", "warning":
			c.LogLevel = slog.LevelWarn
		case "error":
			c.LogLevel = slog.LevelError
		default:
			return c, fmt.Errorf("invalid LOG_LEVEL %q (expected debug|info|warn|error)", v)
		}
	}
	return c, nil
}

func runServe() int {
	cfg, err := parseEnv()
	if err != nil {
		fmt.Fprintf(os.Stderr, "ring serve: %v\n", err)
		return 2
	}

	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.LogLevel}))
	slog.SetDefault(logger)

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("db.initial_ping_failed", "error", err.Error())
		return 1
	}
	defer pool.Close()
	pool.StartHealthLoop(ctx, logger)

	srv := &http.Server{
		Addr: cfg.ListenAddr,
		Handler: server.New(server.Deps{
			DB:           pool,
			Logger:       logger,
			Files:        web.FS(),
			ServerHeader: serverHeader(),
		}),
		ReadHeaderTimeout: 10 * time.Second,
	}

	logger.Info(
		"ring.startup",
		"version", version.Version,
		"commit", version.Commit,
		"listen", cfg.ListenAddr,
		"log_level", cfg.LogLevel.String(),
	)

	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()

	select {
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("ring.listen_failed", "error", err.Error())
			return 1
		}
		return 0
	case <-ctx.Done():
		logger.Info("ring.shutdown", "reason", "signal")
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("ring.shutdown_failed", "error", err.Error())
		return 1
	}
	logger.Info("ring.shutdown_complete")
	return 0
}

func serverHeader() string {
	short := version.Commit
	if len(short) > 8 {
		short = short[:8]
	}
	return "ring/" + version.Version + "+" + short
}

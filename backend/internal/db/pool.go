// Package db owns the PostgreSQL connection pool and its background
// reconnect-with-backoff state machine. See data-model.md for the state
// transitions; see research.md R3 for the timing decisions.
package db

import (
	"context"
	"errors"
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pinger is the narrow interface we need from a connection pool. Extracted so
// tests can substitute a fake; production wires it to *pgxpool.Pool.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Pool wraps pgxpool with an atomic health flag maintained by a background
// goroutine. Read by /healthz and the /api/* degraded guard.
type Pool struct {
	pool      *pgxpool.Pool
	pinger    Pinger
	healthy   atomic.Bool
	lastError atomic.Value // string

	// Test seams.
	sleep     func(time.Duration)
	onHealthy func(bool)
}

const initialPingTimeout = 5 * time.Second

// NewPool opens a pgxpool, performs the initial Ping (failing here exits main
// per FR-002), and returns a Pool ready for StartHealthLoop.
func NewPool(ctx context.Context, dsn string) (*Pool, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	pingCtx, cancel := context.WithTimeout(ctx, initialPingTimeout)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, err
	}
	p := &Pool{
		pool:   pool,
		pinger: pool,
		sleep:  time.Sleep,
	}
	p.healthy.Store(true)
	return p, nil
}

// NewPoolWithPinger constructs a Pool with injected pinger + sleep + healthy
// observer. Only the tests use this; production code uses NewPool.
func NewPoolWithPinger(pinger Pinger, sleep func(time.Duration), onHealthy func(bool)) *Pool {
	return &Pool{pinger: pinger, sleep: sleep, onHealthy: onHealthy}
}

// Healthy returns the most recent ping outcome. Cheap atomic read; safe for
// per-request use from /healthz and the /api/* degraded guard.
func (p *Pool) Healthy() bool { return p.healthy.Load() }

// Close releases the underlying pool. Safe to call on a NewPoolWithPinger-
// constructed Pool (no underlying pgxpool).
func (p *Pool) Close() {
	if p.pool != nil {
		p.pool.Close()
	}
}

func (p *Pool) setHealthy(v bool) {
	p.healthy.Store(v)
	if p.onHealthy != nil {
		p.onHealthy(v)
	}
}

// StartHealthLoop runs the reconnect-with-backoff goroutine. It exits when
// ctx is canceled.
func (p *Pool) StartHealthLoop(ctx context.Context, logger *slog.Logger) {
	go p.healthLoop(ctx, logger)
}

// failureBackoffs is the exponential-backoff schedule applied during an
// outage, indexed by the number of consecutive failures (1-based). After
// the schedule is exhausted the loop polls at steadyFailureInterval.
var failureBackoffs = []time.Duration{
	1 * time.Second,
	2 * time.Second,
	4 * time.Second,
	8 * time.Second,
	16 * time.Second,
}

const (
	steadyHealthyInterval = 5 * time.Second
	steadyFailureInterval = 30 * time.Second
)

func (p *Pool) healthLoop(ctx context.Context, logger *slog.Logger) {
	// Initial ping: drives the first transition. NewPool already pinged in
	// production; in tests NewPoolWithPinger leaves us at zero-value (false),
	// so we ping once here to set the starting state.
	if err := p.pinger.Ping(ctx); err == nil {
		p.setHealthy(true)
	} else {
		p.setHealthy(false)
		p.lastError.Store(err.Error())
		logger.Warn("db.reconnect_attempt", "error", err.Error(), "attempt", 1)
	}

	failureIdx := 0
	for {
		var wait time.Duration
		switch {
		case p.healthy.Load():
			wait = steadyHealthyInterval
		case failureIdx >= 1 && failureIdx <= len(failureBackoffs):
			wait = failureBackoffs[failureIdx-1]
		default:
			wait = steadyFailureInterval
		}

		p.sleep(wait)
		if ctx.Err() != nil {
			return
		}

		err := p.pinger.Ping(ctx)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return
			}
			p.setHealthy(false)
			p.lastError.Store(err.Error())
			failureIdx++
			logger.Warn("db.reconnect_attempt", "error", err.Error(), "attempt", failureIdx)
			continue
		}

		wasUnhealthy := !p.healthy.Load()
		p.setHealthy(true)
		if wasUnhealthy {
			logger.Info("db.reconnected", "after_failures", failureIdx)
		}
		failureIdx = 0
	}
}

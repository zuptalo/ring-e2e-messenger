package db_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/zuptalo/ring-e2ee-messenger/backend/internal/db"
)

// scriptedPinger returns errors from a scripted list, one per call.
type scriptedPinger struct {
	results []error
	idx     int
	calls   chan int
}

func (s *scriptedPinger) Ping(_ context.Context) error {
	defer func() { s.idx++ }()
	if s.idx >= len(s.results) {
		return errors.New("scriptedPinger: exhausted")
	}
	r := s.results[s.idx]
	if s.calls != nil {
		select {
		case s.calls <- s.idx:
		default:
		}
	}
	return r
}

// TestReconnectBackoffSchedule scripts ok,err,err,err,ok and asserts the
// observed sleep schedule is 1s, 2s, 4s — the exponential backoff during the
// outage — and that healthy transitions are true → false → true.
func TestReconnectBackoffSchedule(t *testing.T) {
	t.Parallel()

	pinger := &scriptedPinger{
		results: []error{nil, errors.New("conn lost"), errors.New("conn lost"), errors.New("conn lost"), nil},
		calls:   make(chan int, 16),
	}
	sleeps := make(chan time.Duration, 16)

	logBuf := &bytes.Buffer{}
	logger := slog.New(slog.NewTextHandler(logBuf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	healthyAfter := make(chan bool, 16)
	pool := db.NewPoolWithPinger(pinger, func(d time.Duration) { sleeps <- d }, func(h bool) { healthyAfter <- h })

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool.StartHealthLoop(ctx, logger)

	// Drive the loop forward one tick at a time. Each iteration of healthLoop
	// does a Ping, then sleeps for the next interval. We assert the durations.
	want := []time.Duration{
		5 * time.Second, // first interval after initial success
		1 * time.Second, // first failure backoff
		2 * time.Second, // second failure backoff
		4 * time.Second, // third failure backoff
		5 * time.Second, // back to steady after recovery
	}
	got := make([]time.Duration, 0, len(want))
	timeout := time.After(2 * time.Second)
	for len(got) < len(want) {
		select {
		case d := <-sleeps:
			got = append(got, d)
		case <-timeout:
			t.Fatalf("timed out collecting sleeps; got %v, want %v", got, want)
		}
	}

	for i, w := range want {
		if got[i] != w {
			t.Errorf("sleep[%d]: got %v, want %v", i, got[i], w)
		}
	}

	// Cancel so the goroutine doesn't keep pinging the exhausted scripted
	// pinger forever; then collect whatever healthy transitions occurred.
	cancel()
	transitions := drainBool(healthyAfter)

	// Lifecycle assertion: starts true (initial ok), goes false during the
	// outage, recovers to true after the recovery ping. We don't pin the
	// final element because the goroutine may have executed one extra ping
	// against the exhausted scripted pinger before observing the context
	// cancellation — that's a race we don't care to coordinate around.
	if len(transitions) < 3 {
		t.Fatalf("transitions: got %v, want at least true,false,…,true", transitions)
	}
	if transitions[0] != true {
		t.Errorf("transitions[0]: got %v, want true (initial ping ok)", transitions[0])
	}
	sawFalse := false
	sawTrueAfterFalse := false
	for _, v := range transitions[1:] {
		if !v {
			sawFalse = true
		} else if sawFalse {
			sawTrueAfterFalse = true
			break
		}
	}
	if !sawFalse {
		t.Errorf("transitions never went unhealthy: %v", transitions)
	}
	if !sawTrueAfterFalse {
		t.Errorf("transitions never recovered (no true after false): %v", transitions)
	}

	// Structured warn logs MUST be emitted on each failure.
	logs := logBuf.String()
	if !strings.Contains(logs, "db.reconnect_attempt") {
		t.Errorf("no db.reconnect_attempt log entry found; logs:\n%s", logs)
	}
	if !strings.Contains(logs, "db.reconnected") {
		t.Errorf("no db.reconnected log entry found; logs:\n%s", logs)
	}
}

func drainBool(ch <-chan bool) []bool {
	var out []bool
	timeout := time.After(50 * time.Millisecond)
	for {
		select {
		case v := <-ch:
			out = append(out, v)
		case <-timeout:
			return out
		}
	}
}

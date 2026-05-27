package version

import "testing"

func TestVersionAndCommitAreNonEmpty(t *testing.T) {
	if Version == "" {
		t.Error("Version must not be empty (defensive guard against const regression)")
	}
	if Commit == "" {
		t.Error("Commit must not be empty (defensive guard against const regression)")
	}
}

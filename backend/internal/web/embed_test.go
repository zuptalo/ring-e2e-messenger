package web_test

import (
	"io"
	"strings"
	"testing"

	"github.com/zuptalo/ring-e2ee-messenger/backend/internal/web"
)

// TestEmbedHasIndex asserts the embedded dist/index.html is reachable and
// contains the FR-013 marker string. Requires T019 to have copied the
// SvelteKit build into backend/internal/web/dist/.
func TestEmbedHasIndex(t *testing.T) {
	f, err := web.Files.Open("dist/index.html")
	if err != nil {
		t.Skipf("dist/index.html not embedded yet (run T019 first): %v", err)
	}
	defer f.Close()
	body, err := io.ReadAll(f)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), "skeleton OK") {
		t.Errorf("dist/index.html missing 'skeleton OK' marker; body (truncated): %.500s", body)
	}
}

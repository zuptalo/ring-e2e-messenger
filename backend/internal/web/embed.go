// Package web embeds the compiled SvelteKit frontend into the Go binary so
// the production image is a single self-contained artifact.
//
// The contents of dist/ are produced by `cd frontend && pnpm run build`,
// then copied into backend/internal/web/dist/ by the Dockerfile (Stage 1
// → Stage 2 via COPY --from) or by `make frontend-embed` for host builds.
package web

import (
	"embed"
	"io/fs"
	"net/http"
)

// Files is the embedded SvelteKit production build, rooted at dist/. The
// `all:` prefix ensures dotfiles (e.g. _app/) are included; without it
// underscored paths would be skipped.
//
//go:embed all:dist
var Files embed.FS

// FS returns the embedded filesystem rooted at dist/ so the server can hand
// it to http.FileServer without callers needing to know the embed prefix.
func FS() http.FileSystem {
	sub, err := fs.Sub(Files, "dist")
	if err != nil {
		// The dist/ path is hardcoded above; a failure here means the embed
		// directive itself is broken — fail loudly at startup.
		panic("web: dist subdirectory missing from embed.FS: " + err.Error())
	}
	return http.FS(sub)
}

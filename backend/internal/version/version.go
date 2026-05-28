// Package version exposes the build-time-stamped binary version and commit
// SHA. Values are overwritten via `-ldflags -X` at build time; the `var`
// (not `const`) declarations are intentional so the linker can rewrite them.
package version

// Version is the build-time-stamped semver tag (e.g. "v0.1.0").
// Defaults to "dev" when the binary is built without ldflags injection.
var Version = "dev"

// Commit is the build-time-stamped git commit SHA (40-char hex).
// Defaults to "unknown" when the binary is built without ldflags injection.
var Commit = "unknown"

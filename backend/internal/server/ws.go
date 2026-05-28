package server

import (
	"net/http"
	"strings"
)

// WS reserves the /ws namespace per contracts/http-routes.md §4. Any request
// that is not a WebSocket upgrade returns 426 with an empty body. Feature 004
// will replace this with a real upgrade handler.
func WS() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if isWebSocketUpgrade(r) {
			// Feature 004 will own the upgrade handshake. Until then we treat
			// it the same as any other non-upgrade — 426 — so clients learn
			// the namespace is reserved but not yet implemented.
			w.WriteHeader(http.StatusUpgradeRequired)
			return
		}
		w.WriteHeader(http.StatusUpgradeRequired)
	}
}

func isWebSocketUpgrade(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Upgrade"), "websocket") &&
		strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade")
}

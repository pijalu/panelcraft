// SPDX-License-Identifier: GPL-3.0-only
// Package server implements the embedded-SPA HTTP shell (SPEC FR-X serve, N6):
// strict CSP + security headers, SPA fallback to index.html, read-only /files/*.
// No write endpoints, ever (FR-X: "No write endpoints" + ground rule 5).
package server

import (
	"io/fs"
	"net/http"
	"path"
	"path/filepath"
	"strings"
)

// Options configures the SPA server.
type Options struct {
	// Assets is the SPA bundle root (index.html at its root). Callers pass
	// fs.Sub(web.Dist(), "dist") for the embedded bundle, os.DirFS(dir) for
	// dev mode, or fstest.MapFS in tests.
	Assets fs.FS

	// FilesDir (optional) mounts a directory read-only at /files/* (FR-X).
	FilesDir string
}

// CSP (N6 strict): no remote origins, no script eval, self-only everything.
// style-src allows 'unsafe-inline' — the SPA sets theme custom properties via
// inline style attributes; script-src stays strict 'self'.
const contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"

// New builds the root http.Handler.
func New(opts Options) (http.Handler, error) {
	mux := http.NewServeMux()

	if opts.FilesDir != "" {
		mux.Handle("GET /files/", filesHandler(opts.FilesDir))
	}
	if opts.Assets != nil {
		mux.Handle("GET /", spaHandler(opts.Assets))
	}

	return securityHeaders(mux), nil
}

// securityHeaders applies N6 headers to every response.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", contentSecurityPolicy)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

// spaHandler serves bundle assets; unknown extension-less paths fall back to
// index.html (client routing). Missing asset-looking paths (with extension)
// get a plain 404 — never HTML-with-200.
func spaHandler(assets fs.FS) http.Handler {
	fileServer := http.FileServerFS(assets)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upath := path.Clean("/" + r.URL.Path)
		name := strings.TrimPrefix(upath, "/")
		if name == "" {
			name = "index.html"
		}
		if _, err := fs.Stat(assets, name); err != nil {
			if strings.Contains(path.Base(name), ".") {
				// Looks like an asset request (has extension) → plain 404.
				http.NotFound(w, r)
				return
			}
			// SPA fallback: serve index.html for client-side routes.
			index, readErr := fs.ReadFile(assets, "index.html")
			if readErr != nil {
				http.Error(w, "bundle index.html missing", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-cache")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(index)
			return
		}
		switch {
		case name == "index.html":
			w.Header().Set("Cache-Control", "no-cache")
		case name == "manifest.webmanifest":
			// UX08-WP04: installability needs the manifest MIME the browser accepts
			// (the stdlib table has no .webmanifest entry) and revalidation so a new
			// manifest is picked up.
			w.Header().Set("Content-Type", "application/manifest+json")
			w.Header().Set("Cache-Control", "no-cache")
		case name == "sw.js":
			// The worker must never be cached hard: a stale copy would hide updates.
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
			w.Header().Set("Cache-Control", "no-cache")
		case strings.HasPrefix(name, "assets/"):
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		fileServer.ServeHTTP(w, r)
	})
}

// filesHandler mounts dir read-only at /files/* (FR-X): no listings, no
// writes, traversal guarded (N6). Registered under "GET /files/" only, so
// non-GET methods get 405 from the mux.
func filesHandler(dir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rel := strings.TrimPrefix(path.Clean(r.URL.Path), "/files")
		if rel == "" || rel == "/" || strings.HasSuffix(rel, "/") {
			http.Error(w, "directory listing disabled", http.StatusForbidden)
			return
		}
		if strings.Contains(rel, "..") {
			http.Error(w, "path traversal rejected", http.StatusBadRequest)
			return
		}
		http.ServeFile(w, r, filepath.Join(dir, filepath.FromSlash(strings.TrimPrefix(rel, "/"))))
	})
}

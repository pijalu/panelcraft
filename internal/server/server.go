// SPDX-License-Identifier: GPL-3.0-only
// Package server implements the embedded-SPA HTTP shell: strict security
// headers, SPA fallback, legacy read-only /files/*, and an opt-in workspace API.
package server

import (
	"html"
	"io/fs"
	"net/http"
	"path"
	"path/filepath"
	"strings"

	"github.com/pijalu/panelcraft/internal/storage"
)

// Options configures the SPA server.
type Options struct {
	// Assets is the SPA bundle root (index.html at its root). Callers pass
	// fs.Sub(web.Dist(), "dist") for the embedded bundle, os.DirFS(dir) for
	// dev mode, or fstest.MapFS in tests.
	Assets fs.FS

	// FilesDir (optional) mounts a directory read-only at /files/*.
	FilesDir string
	// Workspace enables the mutable workspace API when explicitly configured.
	Workspace storage.Store
	// StorageType is advertised in served HTML; empty selects browser storage.
	StorageType string
}

// CSP (N6 strict): no remote origins, no script eval, self-only everything.
// style-src allows 'unsafe-inline' — the SPA sets theme custom properties via
// inline style attributes; script-src stays strict 'self'.
const contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"

// New builds the root http.Handler.
func New(opts Options) (http.Handler, error) {
	mux := http.NewServeMux()

	mux.Handle("/api/v1/workspace", workspaceHandler(opts.Workspace))
	mux.Handle("/api/v1/workspace/history", historyCollectionHandler(opts.Workspace))
	mux.Handle(historyPath, historyItemHandler(opts.Workspace))
	if opts.FilesDir != "" {
		mux.Handle("GET /files/", filesHandler(opts.FilesDir))
	}
	if opts.Assets != nil {
		mux.Handle("/", spaHandler(opts.Assets, opts.StorageType))
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
func spaHandler(assets fs.FS, storageType string) http.Handler {
	fileServer := http.FileServerFS(assets)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		upath := path.Clean("/" + r.URL.Path)
		name := strings.TrimPrefix(upath, "/")
		if name == "" {
			name = "index.html"
		}
		if name == "index.html" {
			serveIndex(w, assets, storageType)
			return
		}
		if _, err := fs.Stat(assets, name); err != nil {
			if strings.Contains(path.Base(name), ".") {
				// Looks like an asset request (has extension) → plain 404.
				http.NotFound(w, r)
				return
			}
			// SPA fallback: serve index.html for client-side routes.
			serveIndex(w, assets, storageType)
			return
		}
		switch {
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

func serveIndex(w http.ResponseWriter, assets fs.FS, storageType string) {
	index, err := fs.ReadFile(assets, "index.html")
	if err != nil {
		http.Error(w, "bundle index.html missing", http.StatusInternalServerError)
		return
	}
	if storageType != "" {
		marker := `<meta name="panelcraft-storage" content="` + html.EscapeString(storageType) + `">`
		page := string(index)
		if strings.Contains(page, "</head>") {
			page = strings.Replace(page, "</head>", "    "+marker+"\n  </head>", 1)
		} else {
			page += marker
		}
		index = []byte(page)
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(index)
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

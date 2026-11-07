// SPDX-License-Identifier: GPL-3.0-only
package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

func testOptions(t *testing.T) Options {
	t.Helper()
	bundle := fstest.MapFS{
		"index.html":       {Data: []byte("<!doctype html><html><body>spa</body></html>")},
		"assets/app.js":    {Data: []byte("console.log('app')")},
		"assets/style.css": {Data: []byte("body{}")},
	}
	return Options{Assets: bundle}
}

func newTestServer(t *testing.T, opts Options) *httptest.Server {
	t.Helper()
	h, err := New(opts)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	ts := httptest.NewServer(h)
	t.Cleanup(ts.Close)
	return ts
}

func get(t *testing.T, url string) *http.Response {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	t.Cleanup(func() { _ = resp.Body.Close() })
	return resp
}

func TestSPARootServesIndex(t *testing.T) {
	ts := newTestServer(t, testOptions(t))
	resp := get(t, ts.URL+"/")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /: status = %d, want 200", resp.StatusCode)
	}
	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "text/html") {
		t.Fatalf("Content-Type = %q, want text/html", ct)
	}
}

func TestSecurityHeaders(t *testing.T) {
	ts := newTestServer(t, testOptions(t))
	resp := get(t, ts.URL+"/")
	want := map[string]string{
		"Content-Security-Policy": "",
		"X-Content-Type-Options":  "nosniff",
		"Referrer-Policy":         "no-referrer",
		"X-Frame-Options":         "DENY",
	}
	for h := range want {
		if resp.Header.Get(h) == "" {
			t.Errorf("missing security header %q", h)
		}
	}
	csp := resp.Header.Get("Content-Security-Policy")
	for _, bad := range []string{"unsafe-eval", "http:", "https:"} {
		if strings.Contains(csp, bad) {
			t.Errorf("CSP contains %q: too permissive", bad)
		}
	}
}

func TestSPAAssetServed(t *testing.T) {
	ts := newTestServer(t, testOptions(t))
	resp := get(t, ts.URL+"/assets/app.js")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET asset: status = %d, want 200", resp.StatusCode)
	}
	if cc := resp.Header.Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Errorf("asset Cache-Control = %q, want immutable", cc)
	}
}

func TestSPAFallbackUnknownRoute(t *testing.T) {
	ts := newTestServer(t, testOptions(t))
	resp := get(t, ts.URL+"/workspaces/abc/edit")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("fallback status = %d, want 200", resp.StatusCode)
	}
	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "text/html") {
		t.Fatalf("fallback Content-Type = %q, want text/html", ct)
	}
}

func TestSPAMissingAssetIs404(t *testing.T) {
	ts := newTestServer(t, testOptions(t))
	resp := get(t, ts.URL+"/assets/typo.js")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("missing asset status = %d, want 404 (no HTML-with-200)", resp.StatusCode)
	}
}

func TestFilesReadOnly(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("hi"), 0o644); err != nil {
		t.Fatal(err)
	}
	opts := testOptions(t)
	opts.FilesDir = dir
	ts := newTestServer(t, opts)

	resp := get(t, ts.URL+"/files/hello.txt")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /files/hello.txt: status = %d, want 200", resp.StatusCode)
	}
	buf := make([]byte, 8)
	n, _ := resp.Body.Read(buf)
	if string(buf[:n]) != "hi" {
		t.Fatalf("file body = %q, want %q", buf[:n], "hi")
	}
}

func TestFilesNoListingNoTraversal(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("hi"), 0o644); err != nil {
		t.Fatal(err)
	}
	opts := testOptions(t)
	opts.FilesDir = dir
	ts := newTestServer(t, opts)

	if resp := get(t, ts.URL+"/files/"); resp.StatusCode == http.StatusOK {
		t.Error("directory listing must be disabled (got 200)")
	}
	if resp := get(t, ts.URL+"/files/../server.go"); resp.StatusCode < 400 {
		t.Errorf("traversal /files/../server.go: status = %d, want >=400", resp.StatusCode)
	}
	if resp := get(t, ts.URL+"/files/%2e%2e%2fserver.go"); resp.StatusCode < 400 {
		t.Errorf("encoded traversal: status = %d, want >=400", resp.StatusCode)
	}
}

func TestFilesNoWriteEndpoints(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("hi"), 0o644); err != nil {
		t.Fatal(err)
	}
	opts := testOptions(t)
	opts.FilesDir = dir
	ts := newTestServer(t, opts)

	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodPatch} {
		req, err := http.NewRequest(method, ts.URL+"/files/hello.txt", strings.NewReader("x"))
		if err != nil {
			t.Fatal(err)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("%s: %v", method, err)
		}
		_ = resp.Body.Close()
		if resp.StatusCode != http.StatusMethodNotAllowed {
			t.Errorf("%s /files/hello.txt: status = %d, want 405", method, resp.StatusCode)
		}
	}
	// File must be unchanged (no write happened).
	data, err := os.ReadFile(filepath.Join(dir, "hello.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "hi" {
		t.Fatalf("file mutated by write attempt: %q", data)
	}
}

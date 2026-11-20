// SPDX-License-Identifier: GPL-3.0-only
package server

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pijalu/panelcraft/internal/storage"
)

func workspaceServer(t *testing.T, depth int) (*httptest.Server, string) {
	t.Helper()
	root := t.TempDir()
	store, err := storage.NewFilesystem(root, depth)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	opts := testOptions(t)
	opts.Workspace = store
	opts.StorageType = "filesystem"
	return newTestServer(t, opts), root
}

func workspaceRequest(t *testing.T, method, url, etag string, body []byte) *http.Response {
	t.Helper()
	req, err := http.NewRequest(method, url, bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-PanelCraft-Storage", "1")
	if etag != "" {
		req.Header.Set("If-Match", etag)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = resp.Body.Close() })
	return resp
}

func workspaceGet(t *testing.T, url string) (storage.Workspace, string) {
	t.Helper()
	resp := get(t, url+"/api/v1/workspace")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET workspace status = %d", resp.StatusCode)
	}
	if resp.Header.Get("Cache-Control") != "no-store" {
		t.Errorf("workspace Cache-Control = %q", resp.Header.Get("Cache-Control"))
	}
	var workspace storage.Workspace
	if err := json.NewDecoder(resp.Body).Decode(&workspace); err != nil {
		t.Fatal(err)
	}
	if resp.Header.Get("ETag") == "" {
		t.Fatal("missing workspace ETag")
	}
	return workspace, resp.Header.Get("ETag")
}

func TestWorkspaceAPIReadSaveReloadAndClear(t *testing.T) {
	ts, root := workspaceServer(t, -1)
	workspace, revision := workspaceGet(t, ts.URL)
	workspace.Tree.Children = []storage.Node{{Kind: "file", Name: "hello.pcd", Content: "pcd 1.0\n"}}
	body, err := json.Marshal(workspace)
	if err != nil {
		t.Fatal(err)
	}
	resp := workspaceRequest(t, http.MethodPut, ts.URL+"/api/v1/workspace", revision, body)
	if resp.StatusCode != http.StatusNoContent {
		data, _ := io.ReadAll(resp.Body)
		t.Fatalf("PUT workspace status = %d: %s", resp.StatusCode, data)
	}
	if resp.Header.Get("ETag") == "" || resp.Header.Get("ETag") == revision {
		t.Error("PUT did not return a new ETag")
	}
	data, err := os.ReadFile(filepath.Join(root, "hello.pcd"))
	if err != nil || string(data) != "pcd 1.0\n" {
		t.Fatalf("saved file = %q, %v", data, err)
	}

	_, revision = workspaceGet(t, ts.URL)
	resp = workspaceRequest(t, http.MethodDelete, ts.URL+"/api/v1/workspace", revision, nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("DELETE workspace status = %d", resp.StatusCode)
	}
	if _, err := os.Stat(filepath.Join(root, "hello.pcd")); !os.IsNotExist(err) {
		t.Errorf("hello.pcd survived clear: %v", err)
	}
}

func TestWorkspaceAPIPreconditionsAndConflicts(t *testing.T) {
	ts, _ := workspaceServer(t, -1)
	workspace, revision := workspaceGet(t, ts.URL)
	body, _ := json.Marshal(workspace)

	req, _ := http.NewRequest(http.MethodPut, ts.URL+"/api/v1/workspace", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-PanelCraft-Storage", "1")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusPreconditionRequired {
		t.Errorf("missing If-Match status = %d, want 428", resp.StatusCode)
	}

	resp = workspaceRequest(t, http.MethodPut, ts.URL+"/api/v1/workspace", `"stale"`, body)
	if resp.StatusCode != http.StatusConflict {
		t.Errorf("stale If-Match status = %d, want 409", resp.StatusCode)
	}

	req, _ = http.NewRequest(http.MethodPut, ts.URL+"/api/v1/workspace", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("If-Match", revision)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("missing mutation header status = %d, want 403", resp.StatusCode)
	}
}

func TestWorkspaceAPIRejectsInvalidDepthAndOversize(t *testing.T) {
	ts, _ := workspaceServer(t, 0)
	workspace, revision := workspaceGet(t, ts.URL)
	workspace.Tree.Children = []storage.Node{{Kind: "folder", Name: "child", Children: []storage.Node{}}}
	body, _ := json.Marshal(workspace)
	resp := workspaceRequest(t, http.MethodPut, ts.URL+"/api/v1/workspace", revision, body)
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("depth violation status = %d, want 403", resp.StatusCode)
	}

	workspace.Tree = storage.Node{Kind: "file", Name: ""}
	body, _ = json.Marshal(workspace)
	resp = workspaceRequest(t, http.MethodPut, ts.URL+"/api/v1/workspace", revision, body)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("invalid root status = %d, want 400", resp.StatusCode)
	}

	workspace = storage.Workspace{SchemaVersion: 2, Tree: storage.Node{Kind: "folder", Children: []storage.Node{
		{Kind: "file", Name: "large.pcd", Content: strings.Repeat("x", maxWorkspaceBytes)},
	}}}
	body, _ = json.Marshal(workspace)
	resp = workspaceRequest(t, http.MethodPut, ts.URL+"/api/v1/workspace", revision, body)
	if resp.StatusCode != http.StatusRequestEntityTooLarge {
		t.Errorf("oversize status = %d, want 413", resp.StatusCode)
	}
}

func TestWorkspaceAPIAbsentWithoutConfiguration(t *testing.T) {
	ts := newTestServer(t, testOptions(t))
	resp := get(t, ts.URL+"/api/v1/workspace")
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("unconfigured API status = %d, want 404", resp.StatusCode)
	}
}

func TestWorkspaceCapabilityIsInServedHTML(t *testing.T) {
	ts, _ := workspaceServer(t, -1)
	resp := get(t, ts.URL+"/")
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), `<meta name="panelcraft-storage" content="filesystem">`) {
		t.Errorf("served index lacks storage capability: %s", body)
	}

	static := newTestServer(t, testOptions(t))
	resp = get(t, static.URL+"/")
	body, _ = io.ReadAll(resp.Body)
	if strings.Contains(string(body), "panelcraft-storage") {
		t.Error("static index unexpectedly advertises server storage")
	}
}

func TestWorkspaceAPIMethodNotAllowed(t *testing.T) {
	ts, _ := workspaceServer(t, -1)
	resp := workspaceRequest(t, http.MethodPost, ts.URL+"/api/v1/workspace", "", []byte(`{}`))
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("POST status = %d, want 405", resp.StatusCode)
	}
	if allow := resp.Header.Get("Allow"); !strings.Contains(allow, http.MethodGet) || !strings.Contains(allow, http.MethodPut) {
		t.Errorf("Allow = %q", allow)
	}
}

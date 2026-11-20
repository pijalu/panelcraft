// SPDX-License-Identifier: GPL-3.0-only
package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pijalu/panelcraft/internal/storage"
)

func gitWorkspaceServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	root := t.TempDir()
	store, err := storage.NewGit(root, -1, storage.GitOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	opts := testOptions(t)
	opts.Workspace = store
	opts.StorageType = "git"
	return newTestServer(t, opts), root
}

func putWorkspace(t *testing.T, url string, workspace storage.Workspace, revision string) string {
	t.Helper()
	body, err := json.Marshal(workspace)
	if err != nil {
		t.Fatal(err)
	}
	resp := workspaceRequest(t, http.MethodPut, url+"/api/v1/workspace", revision, body)
	if resp.StatusCode != http.StatusNoContent {
		data, _ := io.ReadAll(resp.Body)
		t.Fatalf("PUT status = %d: %s", resp.StatusCode, data)
	}
	return resp.Header.Get("ETag")
}

func apiVersions(t *testing.T, url string) []storage.Version {
	t.Helper()
	resp := get(t, url+"/api/v1/workspace/history")
	if resp.StatusCode != http.StatusOK || resp.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("history status/cache = %d, %q", resp.StatusCode, resp.Header.Get("Cache-Control"))
	}
	var listed struct {
		Versions []storage.Version `json:"versions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&listed); err != nil {
		t.Fatal(err)
	}
	return listed.Versions
}

func seedGitHistory(t *testing.T) (*httptest.Server, string, string) {
	t.Helper()
	ts, _ := gitWorkspaceServer(t)
	workspace, revision := workspaceGet(t, ts.URL)
	workspace.Tree.Children = []storage.Node{{Kind: "file", Name: "root.pcd", Content: "first"}}
	revision = putWorkspace(t, ts.URL, workspace, revision)
	workspace.Tree.Children[0].Content = "second"
	revision = putWorkspace(t, ts.URL, workspace, revision)
	versions := apiVersions(t, ts.URL)
	if len(versions) != 2 {
		t.Fatalf("versions = %+v", versions)
	}
	return ts, revision, versions[1].ID
}

func TestWorkspaceGitHistoryAndShowAPI(t *testing.T) {
	ts, _, firstID := seedGitHistory(t)
	resp := get(t, ts.URL+"/api/v1/workspace/history/"+firstID)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("show status = %d", resp.StatusCode)
	}
	var shown storage.Workspace
	if err := json.NewDecoder(resp.Body).Decode(&shown); err != nil {
		t.Fatal(err)
	}
	if shown.Tree.Children[0].Content != "first" {
		t.Errorf("shown content = %q", shown.Tree.Children[0].Content)
	}
	resp = get(t, ts.URL+"/")
	page, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(page), `<meta name="panelcraft-storage" content="git">`) {
		t.Errorf("Git capability missing: %s", page)
	}
}

func TestWorkspaceGitRestoreAPI(t *testing.T) {
	ts, revision, firstID := seedGitHistory(t)
	restoreURL := ts.URL + "/api/v1/workspace/history/" + firstID + "/restore"
	resp := workspaceRequest(t, http.MethodPost, restoreURL, "", nil)
	if resp.StatusCode != http.StatusPreconditionRequired {
		t.Errorf("missing restore precondition = %d", resp.StatusCode)
	}
	resp = workspaceRequest(t, http.MethodPost, restoreURL, `"stale"`, nil)
	if resp.StatusCode != http.StatusConflict {
		t.Errorf("stale restore status = %d", resp.StatusCode)
	}
	resp = workspaceRequest(t, http.MethodPost, restoreURL, revision, nil)
	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(resp.Body)
		t.Fatalf("restore status = %d: %s", resp.StatusCode, data)
	}
	var restored storage.Workspace
	if err := json.NewDecoder(resp.Body).Decode(&restored); err != nil {
		t.Fatal(err)
	}
	if restored.Tree.Children[0].Content != "first" || resp.Header.Get("ETag") == revision {
		t.Errorf("restored content/ETag = %q, %q", restored.Tree.Children[0].Content, resp.Header.Get("ETag"))
	}
}

func TestWorkspaceHistoryErrorsAndFilesystemCapability(t *testing.T) {
	ts, _ := workspaceServer(t, -1)
	for _, path := range []string{"/api/v1/workspace/history", "/api/v1/workspace/history/0123456789012345678901234567890123456789"} {
		resp := get(t, ts.URL+path)
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("filesystem %s status = %d", path, resp.StatusCode)
		}
	}

	gitServer, _ := gitWorkspaceServer(t)
	resp := get(t, gitServer.URL+"/api/v1/workspace/history/not-a-hash")
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("malformed version status = %d", resp.StatusCode)
	}
	resp = get(t, gitServer.URL+"/api/v1/workspace/history/0123456789012345678901234567890123456789")
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("unknown version status = %d", resp.StatusCode)
	}
}

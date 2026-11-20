// SPDX-License-Identifier: GPL-3.0-only
package storage

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func textNode(name, content string) Node {
	return Node{Kind: "file", Name: name, Content: content}
}

func folderNode(name string, children ...Node) Node {
	return Node{Kind: "folder", Name: name, Children: children}
}

func sampleWorkspace() Workspace {
	active := "root.pcd"
	return Workspace{
		SchemaVersion: 2,
		Settings:      json.RawMessage(`{"appTheme":"dark"}`),
		IRVersion:     12,
		SavedAt:       42,
		Name:          "demo",
		Tree:          folderNode("", textNode("root.pcd", "pcd 1.0\n")),
		OpenTabs:      []string{"root.pcd"},
		ActivePath:    &active,
	}
}

func newFilesystem(t *testing.T, depth int) (*FilesystemStore, string) {
	t.Helper()
	store, err := NewFilesystem(t.TempDir(), depth)
	if err != nil {
		t.Fatalf("NewFilesystem: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store, store.root.Name()
}

func writeOSFile(t *testing.T, root, name, content string) {
	t.Helper()
	full := filepath.Join(root, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func readOSFile(t *testing.T, root, name string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(name)))
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestFilesystemLoadRealFiles(t *testing.T) {
	store, root := newFilesystem(t, -1)
	writeOSFile(t, root, "root.pcd", "old")
	writeOSFile(t, root, "docs/child.pcd", "child")
	writeOSFile(t, root, ".git/config", "secret")
	writeOSFile(t, root, "binary.pcd", string([]byte{0xff, 0xfe}))

	before, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if before.Workspace.Name != filepath.Base(root) {
		t.Errorf("workspace name = %q, want directory basename", before.Workspace.Name)
	}
	if before.Revision == "" {
		t.Fatal("empty revision")
	}
}

func TestFilesystemCompareSaveReconcilesRealFiles(t *testing.T) {
	store, root := newFilesystem(t, -1)
	writeOSFile(t, root, "root.pcd", "old")
	writeOSFile(t, root, "docs/child.pcd", "child")
	writeOSFile(t, root, ".git/config", "secret")
	writeOSFile(t, root, "binary.pcd", string([]byte{0xff, 0xfe}))
	before, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	next := sampleWorkspace()
	next.Tree = folderNode("",
		textNode("root.pcd", "new"),
		folderNode("empty"),
		folderNode("nested", textNode("new.pcd", "created")),
	)
	after, err := store.Save(context.Background(), next, before.Revision)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if after.Revision == before.Revision {
		t.Error("revision did not change")
	}
	if got := readOSFile(t, root, "root.pcd"); got != "new" {
		t.Errorf("root.pcd = %q, want new", got)
	}
	if got := readOSFile(t, root, "nested/new.pcd"); got != "created" {
		t.Errorf("nested/new.pcd = %q, want created", got)
	}
	if _, err := os.Stat(filepath.Join(root, "empty")); err != nil {
		t.Errorf("empty directory not created: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "docs", "child.pcd")); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("removed file still exists, stat error = %v", err)
	}
	if got := readOSFile(t, root, ".git/config"); got != "secret" {
		t.Errorf(".git content changed: %q", got)
	}
	if got := readOSFile(t, root, "binary.pcd"); got != string([]byte{0xff, 0xfe}) {
		t.Error("non-UTF-8 file was not preserved")
	}
}

func TestFilesystemMetadataRoundTrip(t *testing.T) {
	store, _ := newFilesystem(t, -1)
	before, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if _, err := store.Save(context.Background(), sampleWorkspace(), before.Revision); err != nil {
		t.Fatalf("Save: %v", err)
	}
	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Workspace.Name != "demo" || loaded.Workspace.SavedAt != 42 || loaded.Workspace.ActivePath == nil || *loaded.Workspace.ActivePath != "root.pcd" {
		t.Errorf("metadata not restored: %+v", loaded.Workspace)
	}
	var settings map[string]string
	if err := json.Unmarshal(loaded.Workspace.Settings, &settings); err != nil || settings["appTheme"] != "dark" {
		t.Errorf("settings = %s (decode error %v)", loaded.Workspace.Settings, err)
	}
}

func TestFilesystemDepthPreservesOutOfScopeContent(t *testing.T) {
	store, root := newFilesystem(t, 1)
	writeOSFile(t, root, "root.pcd", "root")
	writeOSFile(t, root, "a/one.pcd", "one")
	writeOSFile(t, root, "a/b/two.pcd", "two")

	before, err := store.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.root.Stat("a/b/two.pcd"); err != nil {
		t.Fatal(err)
	}
	next := sampleWorkspace()
	next.Tree = folderNode("")
	if _, err := store.Save(context.Background(), next, before.Revision); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "root.pcd")); !errors.Is(err, os.ErrNotExist) {
		t.Error("root file was not deleted")
	}
	if _, err := os.Stat(filepath.Join(root, "a", "one.pcd")); !errors.Is(err, os.ErrNotExist) {
		t.Error("depth-one file was not deleted")
	}
	if got := readOSFile(t, root, "a/b/two.pcd"); got != "two" {
		t.Errorf("out-of-depth file = %q, want preserved", got)
	}

	before, err = store.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	next.Tree = folderNode("", folderNode("a", folderNode("b", textNode("too-deep.pcd", "no"))))
	if _, err := store.Save(context.Background(), next, before.Revision); !errors.Is(err, ErrForbidden) {
		t.Errorf("deep write error = %v, want ErrForbidden", err)
	}
}

func TestFilesystemDepthZero(t *testing.T) {
	store, root := newFilesystem(t, 0)
	writeOSFile(t, root, "root.pcd", "root")
	writeOSFile(t, root, "a/one.pcd", "one")
	before, err := store.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(before.Workspace.Tree.Children) != 1 || before.Workspace.Tree.Children[0].Name != "root.pcd" {
		t.Fatalf("depth-zero tree = %+v", before.Workspace.Tree.Children)
	}
	next := sampleWorkspace()
	next.Tree = folderNode("", folderNode("a", textNode("new.pcd", "no")))
	if _, err := store.Save(context.Background(), next, before.Revision); !errors.Is(err, ErrForbidden) {
		t.Errorf("child directory error = %v, want ErrForbidden", err)
	}
}

func TestFilesystemRejectsStaleRevisionAndUnsafeInput(t *testing.T) {
	store, root := newFilesystem(t, -1)
	before, err := store.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	writeOSFile(t, root, "external.pcd", "external")
	if _, err := store.Save(context.Background(), sampleWorkspace(), before.Revision); !errors.Is(err, ErrConflict) {
		t.Errorf("stale save error = %v, want ErrConflict", err)
	}

	current, err := store.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	bad := sampleWorkspace()
	bad.Tree = folderNode("", textNode("../escape.pcd", "bad"))
	if _, err := store.Save(context.Background(), bad, current.Revision); !errors.Is(err, ErrForbidden) {
		t.Errorf("traversal error = %v, want ErrForbidden", err)
	}
	bad.Tree = folderNode("", textNode("bad.pcd", string([]byte{0xff})))
	if _, err := store.Save(context.Background(), bad, current.Revision); !errors.Is(err, ErrInvalid) {
		t.Errorf("invalid UTF-8 error = %v, want ErrInvalid", err)
	}
}

func TestFilesystemSymlinkCannotEscapeRoot(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation requires additional Windows privileges")
	}
	store, root := newFilesystem(t, -1)
	outside := filepath.Join(t.TempDir(), "outside.pcd")
	if err := os.WriteFile(outside, []byte("outside"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "escape.pcd")); err != nil {
		t.Fatal(err)
	}
	before, err := store.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(before.Workspace.Tree.Children) != 0 {
		t.Fatalf("symlink exposed as workspace file: %+v", before.Workspace.Tree.Children)
	}
	next := sampleWorkspace()
	next.Tree = folderNode("", textNode("escape.pcd", "changed"))
	if _, err := store.Save(context.Background(), next, before.Revision); err == nil {
		t.Fatal("write through escaping symlink succeeded")
	}
	if got := readOSFile(t, filepath.Dir(outside), filepath.Base(outside)); got != "outside" {
		t.Errorf("outside file changed: %q", got)
	}
}

func TestFilesystemSaveNormalizesOptionalCollections(t *testing.T) {
	store, _ := newFilesystem(t, -1)
	before, err := store.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	next := sampleWorkspace()
	next.Settings = nil
	next.OpenTabs = nil
	saved, err := store.Save(context.Background(), next, before.Revision)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Revision != saved.Revision {
		t.Errorf("revision changed without an external edit: save %s, load %s", saved.Revision, loaded.Revision)
	}
	if _, err := store.Save(context.Background(), loaded.Workspace, loaded.Revision); err != nil {
		t.Errorf("immediate follow-up save: %v", err)
	}
}

func TestParentPath(t *testing.T) {
	tests := map[string]string{
		"root.pcd":       "",
		"docs/child.pcd": "docs",
		"a/b/":           "a",
		"a/b/c.pcd":      "a/b",
	}
	for name, want := range tests {
		if got := ParentPath(name); got != want {
			t.Errorf("ParentPath(%q) = %q, want %q", name, got, want)
		}
	}
}

func TestFilesystemClearRevisionMatchesReload(t *testing.T) {
	store, _ := newFilesystem(t, -1)
	before, err := store.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	saved, err := store.Save(context.Background(), sampleWorkspace(), before.Revision)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	cleared, err := store.Clear(context.Background(), saved.Revision)
	if err != nil {
		t.Fatalf("Clear: %v", err)
	}
	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Revision != cleared.Revision {
		t.Errorf("revision changed without an external edit: clear %s, load %s", cleared.Revision, loaded.Revision)
	}
}

func TestFilesystemClearPreservesGitAndDeepFiles(t *testing.T) {
	store, root := newFilesystem(t, 0)
	writeOSFile(t, root, "root.pcd", "root")
	writeOSFile(t, root, ".git/config", "git")
	writeOSFile(t, root, "deep/child.pcd", "deep")
	before, err := store.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Clear(context.Background(), before.Revision); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "root.pcd")); !errors.Is(err, os.ErrNotExist) {
		t.Error("visible root file survived clear")
	}
	if got := readOSFile(t, root, ".git/config"); got != "git" {
		t.Error(".git was changed by clear")
	}
	if got := readOSFile(t, root, "deep/child.pcd"); got != "deep" {
		t.Error("out-of-depth file was changed by clear")
	}
}

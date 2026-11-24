// SPDX-License-Identifier: GPL-3.0-only
package main

import (
	"strings"
	"testing"

	"github.com/pijalu/panelcraft/internal/storage"
)

func TestParseServeDefaultsPreserveBrowserStorage(t *testing.T) {
	config, err := parseServeFlags(nil)
	if err != nil {
		t.Fatal(err)
	}
	if config.addr != "127.0.0.1:8080" {
		t.Errorf("addr = %q, want loopback default", config.addr)
	}
	if config.localDir != "" || config.filesDir != "" || config.depth != -1 {
		t.Errorf("unexpected storage config: %+v", config)
	}
}

func TestParseServeFilesystemAliasAndDepth(t *testing.T) {
	config, err := parseServeFlags([]string{"-local", "./diagrams", "-storage-type", "filestorage", "-depth", "0"})
	if err != nil {
		t.Fatal(err)
	}
	if config.localDir != "./diagrams" || config.storageType != "filesystem" || config.depth != 0 {
		t.Errorf("config = %+v", config)
	}
}

func TestParseServeGitStorageAndAuthor(t *testing.T) {
	config, err := parseServeFlags([]string{
		"-local", "./diagrams", "-storage-type", "git",
		"-git-author-name", "Local User", "-git-author-email", "local@example.test",
	})
	if err != nil {
		t.Fatal(err)
	}
	if config.storageType != "git" || config.gitAuthorName != "Local User" || config.gitAuthorEmail != "local@example.test" {
		t.Errorf("config = %+v", config)
	}
}

func TestNewWorkspaceStoreEnablesGitVersions(t *testing.T) {
	store, err := newWorkspaceStore(serveConfig{localDir: t.TempDir(), storageType: "git", depth: -1})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if _, ok := store.(storage.VersionStore); !ok {
		t.Fatalf("Git store does not implement VersionStore: %T", store)
	}
}

func TestParseServeLegacyReadOnlyDirectory(t *testing.T) {
	config, err := parseServeFlags([]string{"--addr", ":8080", "./diagrams"})
	if err != nil {
		t.Fatal(err)
	}
	if config.filesDir != "./diagrams" || config.localDir != "" {
		t.Errorf("config = %+v", config)
	}
}

func TestParseServeRejectsInvalidStorageCombinations(t *testing.T) {
	for _, test := range []struct {
		name string
		args []string
		want string
	}{
		{name: "depth without local", args: []string{"-depth", "1"}, want: "requires -local"},
		{name: "negative depth", args: []string{"-local", "x", "-depth", "-2"}, want: "depth"},
		{name: "unknown backend", args: []string{"-local", "x", "-storage-type", "cloud"}, want: "unknown storage type"},
		{name: "Git author on filesystem", args: []string{"-local", "x", "-git-author-name", "User"}, want: "require git storage"},
		{name: "Git author without local", args: []string{"-git-author-email", "user@example.test"}, want: "requires -local"},
		{name: "two roots", args: []string{"-local", "x", "y"}, want: "cannot be combined"},
		{name: "non loopback wildcard", args: []string{"-local", "x", "-addr", ":8080"}, want: "loopback"},
		{name: "non loopback IP", args: []string{"-local", "x", "-addr", "0.0.0.0:8080"}, want: "loopback"},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, err := parseServeFlags(test.args)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Errorf("error = %v, want substring %q", err, test.want)
			}
		})
	}
}

func TestParseServeAllowsLoopbackHostnameAndIPv6(t *testing.T) {
	for _, addr := range []string{"localhost:8080", "127.0.0.1:8080", "[::1]:8080"} {
		if _, err := parseServeFlags([]string{"-local", "x", "-addr", addr}); err != nil {
			t.Errorf("%s: %v", addr, err)
		}
	}
}

func TestBrowserURLWithLoopbackDefault(t *testing.T) {
	if got := browserURL("127.0.0.1:8080"); got != "http://localhost:8080" {
		t.Errorf("browserURL = %q", got)
	}
	if got := browserURL(":8080"); got != "http://localhost:8080" {
		t.Errorf("wildcard browserURL = %q", got)
	}
}

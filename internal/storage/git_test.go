// SPDX-License-Identifier: GPL-3.0-only
package storage

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

func newGit(t *testing.T, depth int) (*GitStore, string) {
	t.Helper()
	root := t.TempDir()
	store, err := NewGit(root, depth, GitOptions{
		AuthorName: "Test Author", AuthorEmail: "author@example.test",
		Now: func() time.Time { return time.Unix(1_700_000_000, 0) },
	})
	if err != nil {
		t.Fatalf("NewGit: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store, root
}

func gitSave(t *testing.T, store *GitStore, workspace Workspace, revision string) Snapshot {
	t.Helper()
	saved, err := store.Save(context.Background(), workspace, revision)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	return saved
}

func gitRestore(t *testing.T, store *GitStore, id, revision string) Snapshot {
	t.Helper()
	restored, err := store.Restore(context.Background(), id, revision)
	if err != nil {
		t.Fatalf("Restore: %v", err)
	}
	return restored
}

func gitLoad(t *testing.T, store *GitStore) Snapshot {
	t.Helper()
	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	return loaded
}

func gitHistory(t *testing.T, store *GitStore) []Version {
	t.Helper()
	versions, err := store.History(context.Background())
	if err != nil {
		t.Fatalf("History: %v", err)
	}
	return versions
}

func TestGitContentCommitIdentityAndUnrelatedFiles(t *testing.T) {
	store, root := newGit(t, -1)
	if err := os.WriteFile(filepath.Join(root, "asset.bin"), []byte{0xff, 0xfe, 0xfd}, 0o644); err != nil {
		t.Fatal(err)
	}
	initial := gitLoad(t, store)
	versions := gitHistory(t, store)
	if len(versions) != 0 {
		t.Fatalf("empty history = %+v", versions)
	}

	workspace := sampleWorkspace()
	first := gitSave(t, store, workspace, initial.Revision)
	if first.Revision == initial.Revision {
		t.Fatal("content save did not advance Git revision")
	}
	repository, err := git.PlainOpen(root)
	if err != nil {
		t.Fatal(err)
	}
	head, err := repository.Head()
	if err != nil {
		t.Fatal(err)
	}
	commit, err := repository.CommitObject(head.Hash())
	if err != nil {
		t.Fatal(err)
	}
	if commit.Author.Name != "Test Author" || commit.Author.Email != "author@example.test" {
		t.Errorf("author = %+v", commit.Author)
	}
	if _, err := commit.File("asset.bin"); err == nil {
		t.Error("unrelated file was committed")
	}

}

func TestGitFirstCommitIncludesUnchangedWorkspaceFiles(t *testing.T) {
	store, root := newGit(t, -1)
	writeOSFile(t, root, "existing.pcd", "before")
	writeOSFile(t, root, "nested/unchanged.pcd", "keep me")
	loaded := gitLoad(t, store)
	index := childIndex(&loaded.Workspace.Tree, "existing.pcd")
	if index < 0 {
		t.Fatal("existing file missing from loaded workspace")
	}
	loaded.Workspace.Tree.Children[index].Content = "edited"
	saved := gitSave(t, store, loaded.Workspace, loaded.Revision)
	versions := gitHistory(t, store)
	if len(versions) != 1 {
		t.Fatalf("history = %+v", versions)
	}
	shown, err := store.Show(context.Background(), versions[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	entries := entryMap(flattenTree(shown.Workspace.Tree))
	for _, path := range []string{"existing.pcd", "nested/unchanged.pcd"} {
		if _, ok := entries[path]; !ok {
			t.Errorf("first commit omitted %q", path)
		}
	}
	gitRestore(t, store, versions[0].ID, saved.Revision)
	if got := readOSFile(t, root, "nested/unchanged.pcd"); got != "keep me" {
		t.Errorf("restore removed unchanged file: %q", got)
	}
}

func TestGitMetadataOnlyAndSubsequentContentSaves(t *testing.T) {
	store, _ := newGit(t, -1)
	initial := gitLoad(t, store)
	workspace := sampleWorkspace()
	first := gitSave(t, store, workspace, initial.Revision)
	metadataOnly := workspace
	metadataOnly.SavedAt = 99
	metadataOnly.OpenTabs = []string{}
	second := gitSave(t, store, metadataOnly, first.Revision)
	versions := gitHistory(t, store)
	if len(versions) != 1 {
		t.Fatalf("metadata-only history = %+v", versions)
	}
	if second.Revision == first.Revision {
		t.Error("metadata save must still advance content-hash revision")
	}

	workspace.SavedAt = 100
	workspace.Tree.Children[0].Content = "pcd 1.0\nsecond\n"
	gitSave(t, store, workspace, second.Revision)
	versions = gitHistory(t, store)
	if len(versions) != 2 {
		t.Fatalf("content history = %+v", versions)
	}
	if versions[0].ID == versions[1].ID || versions[0].SavedAt != 1_700_000_000_000 {
		t.Errorf("versions = %+v", versions)
	}
}

func TestGitShowAndRestoreCreateForwardCommits(t *testing.T) {
	store, root := newGit(t, -1)
	loaded := gitLoad(t, store)
	workspace := sampleWorkspace()
	first := gitSave(t, store, workspace, loaded.Revision)
	versions := gitHistory(t, store)
	firstID := versions[0].ID
	workspace.Tree.Children[0].Content = "second"
	second := gitSave(t, store, workspace, first.Revision)

	shown, err := store.Show(context.Background(), firstID)
	if err != nil || shown.Workspace.Tree.Children[0].Content != "pcd 1.0\n" {
		t.Fatalf("Show = %+v, %v", shown.Workspace, err)
	}
	restored := gitRestore(t, store, firstID, second.Revision)
	if got := readOSFile(t, root, "root.pcd"); got != "pcd 1.0\n" {
		t.Errorf("restored content = %q", got)
	}
	versions = gitHistory(t, store)
	if len(versions) != 3 || versions[0].Message != "Restore "+firstID[:7] {
		t.Fatalf("restore history = %+v", versions)
	}
	restoredAgain := gitRestore(t, store, firstID, restored.Revision)
	versions = gitHistory(t, store)
	if len(versions) != 4 || restoredAgain.Revision == restored.Revision {
		t.Fatalf("identical restore did not commit: %+v", versions)
	}
	if _, err := store.Save(context.Background(), restoredAgain.Workspace, restoredAgain.Revision); err != nil {
		t.Fatalf("restored revision is not stable: %v", err)
	}
}

func TestGitRejectsStaleContentHeadAndExternalIndex(t *testing.T) {
	t.Run("external content", func(t *testing.T) {
		store, root := newGit(t, -1)
		loaded := gitLoad(t, store)
		writeOSFile(t, root, "root.pcd", "external")
		_, err := store.Save(context.Background(), sampleWorkspace(), loaded.Revision)
		if !errors.Is(err, ErrConflict) {
			t.Fatalf("Save error = %v, want conflict", err)
		}
		if got := readOSFile(t, root, "root.pcd"); got != "external" {
			t.Errorf("external edit overwritten: %q", got)
		}
	})

	t.Run("external HEAD", func(t *testing.T) {
		store, root := newGit(t, -1)
		loaded := gitLoad(t, store)
		repository, _ := git.PlainOpen(root)
		worktree, _ := repository.Worktree()
		_, err := worktree.Commit("external empty commit", &git.CommitOptions{
			AllowEmptyCommits: true,
			Author:            &object.Signature{Name: "External", Email: "external@example.test", When: time.Now()},
		})
		if err != nil {
			t.Fatal(err)
		}
		_, err = store.Save(context.Background(), sampleWorkspace(), loaded.Revision)
		if !errors.Is(err, ErrConflict) {
			t.Fatalf("Save error = %v, want conflict", err)
		}
	})

	t.Run("staged unrelated change", func(t *testing.T) {
		store, root := newGit(t, -1)
		loaded := gitLoad(t, store)
		loaded = gitSave(t, store, sampleWorkspace(), loaded.Revision)
		writeOSFile(t, root, "outside.txt", "staged elsewhere")
		repository, _ := git.PlainOpen(root)
		worktree, _ := repository.Worktree()
		if _, err := worktree.Add("outside.txt"); err != nil {
			t.Fatal(err)
		}
		workspace := loaded.Workspace
		workspace.Tree.Children[0].Content = "must not save"
		_, err := store.Save(context.Background(), workspace, loaded.Revision)
		if !errors.Is(err, ErrConflict) {
			t.Fatalf("Save error = %v, want conflict", err)
		}
		if got := readOSFile(t, root, "root.pcd"); got != "pcd 1.0\n" {
			t.Errorf("file changed despite staged index: %q", got)
		}
	})
}

func TestGitClearDepthAndRevision(t *testing.T) {
	store, root := newGit(t, 0)
	writeOSFile(t, root, "deep/keep.pcd", "outside depth")
	loaded := gitLoad(t, store)
	loaded = gitSave(t, store, sampleWorkspace(), loaded.Revision)
	cleared, err := store.Clear(context.Background(), loaded.Revision)
	if err != nil {
		t.Fatal(err)
	}
	afterClear, err := store.Load(context.Background())
	if err != nil || afterClear.Revision != cleared.Revision {
		t.Errorf("clear revision changed on reload: %q != %q, %v", afterClear.Revision, cleared.Revision, err)
	}
	if _, err := os.Stat(filepath.Join(root, "root.pcd")); !os.IsNotExist(err) {
		t.Errorf("root file survived clear: %v", err)
	}
	if got := readOSFile(t, root, "deep/keep.pcd"); got != "outside depth" {
		t.Errorf("out-of-depth file changed: %q", got)
	}
	versions := gitHistory(t, store)
	if len(versions) != 2 {
		t.Fatalf("clear history = %+v", versions)
	}

}

func TestGitDetachedHeadCommit(t *testing.T) {
	store, root := newGit(t, -1)
	loaded := gitLoad(t, store)
	gitSave(t, store, sampleWorkspace(), loaded.Revision)
	versions := gitHistory(t, store)
	repository, _ := git.PlainOpen(root)
	worktree, _ := repository.Worktree()
	if err := worktree.Checkout(&git.CheckoutOptions{Hash: plumbing.NewHash(versions[0].ID)}); err != nil {
		t.Fatal(err)
	}
	detached := gitLoad(t, store)
	workspace := sampleWorkspace()
	workspace.Tree.Children[0].Content = "detached"
	if _, err := store.Save(context.Background(), workspace, detached.Revision); err != nil {
		t.Fatalf("detached Save: %v", err)
	}
	head, _ := repository.Head()
	if head.Name() != plumbing.HEAD {
		t.Errorf("HEAD is not detached after commit: %v", head)
	}
}

func TestGitRejectsUnsafeRepositoriesAndMerge(t *testing.T) {
	t.Run("linked worktree git file", func(t *testing.T) {
		root := t.TempDir()
		writeOSFile(t, root, ".git", "gitdir: elsewhere\n")
		if _, err := NewGit(root, -1, GitOptions{}); err == nil {
			t.Fatal("NewGit accepted .git file")
		}
	})
	t.Run("bare repository", func(t *testing.T) {
		root := t.TempDir()
		if _, err := git.PlainInit(root, true); err != nil {
			t.Fatal(err)
		}
		if _, err := NewGit(root, -1, GitOptions{}); err == nil {
			t.Fatal("NewGit accepted bare repository")
		}
	})
	t.Run("merge in progress", func(t *testing.T) {
		store, root := newGit(t, -1)
		loaded := gitLoad(t, store)
		loaded = gitSave(t, store, sampleWorkspace(), loaded.Revision)
		repository, _ := git.PlainOpen(root)
		head, _ := repository.Head()
		writeOSFile(t, root, ".git/MERGE_HEAD", head.Hash().String()+"\n")
		workspace := loaded.Workspace
		workspace.Tree.Children[0].Content = "blocked"
		_, err := store.Save(context.Background(), workspace, loaded.Revision)
		if !errors.Is(err, ErrConflict) {
			t.Fatalf("merge Save error = %v", err)
		}
	})
}

func TestGitVersionErrorsAndCancellation(t *testing.T) {
	store, _ := newGit(t, -1)
	if _, err := store.Show(context.Background(), "not-a-hash"); !errors.Is(err, ErrInvalid) {
		t.Errorf("malformed Show error = %v", err)
	}
	if _, err := store.Show(context.Background(), "0123456789012345678901234567890123456789"); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown Show error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := store.Load(ctx); !errors.Is(err, context.Canceled) {
		t.Errorf("canceled Load error = %v", err)
	}
	if _, err := store.History(ctx); !errors.Is(err, context.Canceled) {
		t.Errorf("canceled History error = %v", err)
	}
}

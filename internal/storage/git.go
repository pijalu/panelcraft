// SPDX-License-Identifier: GPL-3.0-only
package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/filemode"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// GitOptions controls local commit identity without reading global Git configuration.
type GitOptions struct {
	AuthorName  string
	AuthorEmail string
	Now         func() time.Time
}

// GitStore composes confined file persistence with local, forward-only commits.
type GitStore struct {
	files *FilesystemStore
	repo  *git.Repository
	opts  GitOptions
	mu    sync.Mutex
}

type gitSnapshot struct {
	snapshot Snapshot
	head     plumbing.Hash
}

// NewGit opens or explicitly initializes a standalone repository at dir.
func NewGit(dir string, depth int, opts GitOptions) (*GitStore, error) {
	files, err := NewFilesystem(dir, depth)
	if err != nil {
		return nil, err
	}
	repo, err := openGitRepository(files.root.Name())
	if err != nil {
		_ = files.Close()
		return nil, err
	}
	if _, err := repo.Worktree(); err != nil {
		_ = files.Close()
		return nil, fmt.Errorf("git storage requires a non-bare worktree: %w", err)
	}
	if opts.AuthorName == "" {
		opts.AuthorName = "PanelCraft"
	}
	if opts.AuthorEmail == "" {
		opts.AuthorEmail = "panelcraft@localhost"
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	return &GitStore{files: files, repo: repo, opts: opts}, nil
}

func openGitRepository(root string) (*git.Repository, error) {
	dotGit := filepath.Join(root, ".git")
	info, err := os.Lstat(dotGit)
	if err == nil && (!info.IsDir() || info.Mode()&os.ModeSymlink != 0) {
		return nil, fmt.Errorf("%w: Git storage requires a real .git directory", ErrInvalid)
	}
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, fmt.Errorf("inspect Git repository: %w", err)
	}
	repo, err := git.PlainOpenWithOptions(root, &git.PlainOpenOptions{})
	if errors.Is(err, git.ErrRepositoryNotExists) {
		if _, statErr := os.Lstat(dotGit); statErr == nil {
			return nil, fmt.Errorf("open Git repository: %w", err)
		}
		repo, err = git.PlainInit(root, false)
	}
	if err != nil {
		return nil, fmt.Errorf("open Git repository: %w", err)
	}
	return repo, nil
}

func (s *GitStore) Close() error {
	return s.files.Close()
}

func (s *GitStore) Load(ctx context.Context) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current, err := s.current(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	return current.snapshot, nil
}

func (s *GitStore) current(ctx context.Context) (gitSnapshot, error) {
	snapshot, err := s.files.Load(ctx)
	if err != nil {
		return gitSnapshot{}, err
	}
	head, err := s.head()
	if err != nil {
		return gitSnapshot{}, err
	}
	snapshot.Revision = gitRevision(head, snapshot.Revision)
	return gitSnapshot{snapshot: snapshot, head: head}, nil
}

func (s *GitStore) head() (plumbing.Hash, error) {
	head, err := s.repo.Head()
	if errors.Is(err, plumbing.ErrReferenceNotFound) {
		return plumbing.ZeroHash, nil
	}
	if err != nil {
		return plumbing.ZeroHash, fmt.Errorf("read Git HEAD: %w", err)
	}
	return head.Hash(), nil
}

func gitRevision(head plumbing.Hash, contentRevision string) string {
	return `"git:` + head.String() + `:` + strings.Trim(contentRevision, `"`) + `"`
}

func (s *GitStore) Save(ctx context.Context, workspace Workspace, expected string) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.save(ctx, workspace, expected, "PanelCraft workspace", false)
}

func (s *GitStore) save(ctx context.Context, workspace Workspace, expected, message string, force bool) (Snapshot, error) {
	if err := ctx.Err(); err != nil {
		return Snapshot{}, err
	}
	current, err := s.current(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	if current.snapshot.Revision != expected {
		return Snapshot{}, ErrConflict
	}
	if err := s.ensureCommittable(); err != nil {
		return Snapshot{}, err
	}
	saved, err := s.files.Save(ctx, workspace, rawContentRevision(current.snapshot.Revision))
	if err != nil {
		return Snapshot{}, err
	}
	if !force && sameVersionableContent(current.snapshot.Workspace.Tree, saved.Workspace.Tree) {
		saved.Revision = gitRevision(current.head, saved.Revision)
		return saved, nil
	}
	head, err := s.commit(current.snapshot.Workspace, saved.Workspace, message, force)
	if err != nil {
		return Snapshot{}, err
	}
	saved.Revision = gitRevision(head, saved.Revision)
	return saved, nil
}

func rawContentRevision(revision string) string {
	parts := strings.Split(strings.Trim(revision, `"`), ":")
	if len(parts) != 3 {
		return ""
	}
	return `"` + parts[2] + `"`
}

func sameVersionableContent(before, after Node) bool {
	return len(changedVersionPaths(before, after)) == 0
}

func (s *GitStore) ensureCommittable() error {
	merging, err := s.files.root.Stat(".git/MERGE_HEAD")
	if err == nil && merging != nil {
		return fmt.Errorf("%w: finish or abort the Git merge before saving", ErrConflict)
	}
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("inspect Git merge state: %w", err)
	}
	worktree, err := s.repo.Worktree()
	if err != nil {
		return err
	}
	status, err := worktree.Status()
	if err != nil {
		return fmt.Errorf("read Git index: %w", err)
	}
	for path, state := range status {
		if state.Staging != git.Unmodified && state.Staging != git.Untracked {
			return fmt.Errorf("%w: externally staged Git path %q", ErrConflict, path)
		}
	}
	return nil
}

func (s *GitStore) commit(before, after Workspace, message string, allowEmpty bool) (plumbing.Hash, error) {
	worktree, err := s.repo.Worktree()
	if err != nil {
		return plumbing.ZeroHash, err
	}
	for _, path := range versionCommitPaths(before.Tree, after.Tree) {
		if _, err := worktree.Add(path); err != nil {
			return plumbing.ZeroHash, fmt.Errorf("stage %q: %w", path, err)
		}
	}
	if _, err := worktree.Add(MetadataPath); err != nil {
		return plumbing.ZeroHash, fmt.Errorf("stage workspace metadata: %w", err)
	}
	now := s.opts.Now()
	signature := &object.Signature{Name: s.opts.AuthorName, Email: s.opts.AuthorEmail, When: now}
	head, err := worktree.Commit(message, &git.CommitOptions{
		Author: signature, Committer: signature, AllowEmptyCommits: allowEmpty,
	})
	if err != nil {
		return plumbing.ZeroHash, fmt.Errorf("commit workspace: %w", err)
	}
	return head, nil
}

// versionCommitPaths keeps every commit a complete visible-workspace snapshot.
// Unchanged files may be untracked when Git is initialized around an existing directory.
func versionCommitPaths(before, after Node) []string {
	changed := changedVersionPaths(before, after)
	seen := make(map[string]bool, len(changed))
	for _, path := range changed {
		seen[path] = true
	}
	for _, entry := range flattenTree(after) {
		if entry.node.Kind == "file" && !seen[entry.path] {
			changed = append(changed, entry.path)
			seen[entry.path] = true
		}
	}
	sort.Strings(changed)
	return changed
}

func changedVersionPaths(before, after Node) []string {
	oldEntries := entryMap(flattenTree(before))
	newEntries := entryMap(flattenTree(after))
	changed := collectVersionChanges(oldEntries, newEntries)
	collectVersionChangesInto(changed, newEntries, oldEntries)
	paths := make([]string, 0, len(changed))
	for path := range changed {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	return paths
}

func collectVersionChanges(entries, other map[string]treeEntry) map[string]bool {
	changed := map[string]bool{}
	collectVersionChangesInto(changed, entries, other)
	return changed
}

func collectVersionChangesInto(changed map[string]bool, entries, other map[string]treeEntry) {
	for path, entry := range entries {
		counterpart, ok := other[path]
		if entry.node.Kind == "file" && (!ok || counterpart.node.Kind != "file" || counterpart.node.Content != entry.node.Content) {
			changed[path] = true
		}
	}
}

func (s *GitStore) Clear(ctx context.Context, expected string) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current, err := s.current(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	if current.snapshot.Revision != expected {
		return Snapshot{}, ErrConflict
	}
	if err := s.ensureCommittable(); err != nil {
		return Snapshot{}, err
	}
	cleared, err := s.files.Clear(ctx, rawContentRevision(current.snapshot.Revision))
	if err != nil {
		return Snapshot{}, err
	}
	if sameVersionableContent(current.snapshot.Workspace.Tree, cleared.Workspace.Tree) {
		cleared.Revision = gitRevision(current.head, cleared.Revision)
		return cleared, nil
	}
	head, err := s.commit(current.snapshot.Workspace, cleared.Workspace, "Clear PanelCraft workspace", false)
	if err != nil {
		return Snapshot{}, err
	}
	cleared.Revision = gitRevision(head, cleared.Revision)
	return cleared, nil
}

func (s *GitStore) History(ctx context.Context) ([]Version, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	head, err := s.repo.Head()
	if errors.Is(err, plumbing.ErrReferenceNotFound) {
		return []Version{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read Git history: %w", err)
	}
	commits, err := s.repo.Log(&git.LogOptions{From: head.Hash(), Order: git.LogOrderCommitterTime})
	if err != nil {
		return nil, fmt.Errorf("read Git history: %w", err)
	}
	defer commits.Close()
	versions := []Version{}
	err = commits.ForEach(func(commit *object.Commit) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		versions = append(versions, Version{
			ID: commit.Hash.String(), Message: commit.Message, SavedAt: commit.Committer.When.UnixMilli(),
		})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("read Git history: %w", err)
	}
	return versions, nil
}

func (s *GitStore) Show(ctx context.Context, id string) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.show(ctx, id)
}

func (s *GitStore) show(ctx context.Context, id string) (Snapshot, error) {
	if err := ctx.Err(); err != nil {
		return Snapshot{}, err
	}
	if len(id) != 40 {
		return Snapshot{}, fmt.Errorf("%w: Git version must be a full commit ID", ErrInvalid)
	}
	hash := plumbing.NewHash(id)
	if hash.IsZero() {
		return Snapshot{}, fmt.Errorf("%w: Git version must be a full commit ID", ErrInvalid)
	}
	commit, err := s.repo.CommitObject(hash)
	if errors.Is(err, plumbing.ErrObjectNotFound) {
		return Snapshot{}, fmt.Errorf("%w: %s", ErrNotFound, id)
	}
	if err != nil {
		return Snapshot{}, fmt.Errorf("read Git version: %w", err)
	}
	workspace, err := s.workspaceAt(ctx, commit)
	if err != nil {
		return Snapshot{}, err
	}
	return Snapshot{Workspace: workspace, Revision: `"` + id + `"`}, nil
}

func (s *GitStore) workspaceAt(ctx context.Context, commit *object.Commit) (Workspace, error) {
	tree, err := commit.Tree()
	if err != nil {
		return Workspace{}, err
	}
	workspace := emptyWorkspace(filepath.Base(s.files.root.Name()))
	if err := readVersionMetadata(tree, &workspace); err != nil {
		return Workspace{}, err
	}
	workspace.Tree = Node{Kind: "folder", Name: "", Children: []Node{}}
	files := tree.Files()
	defer files.Close()
	err = files.ForEach(func(file *object.File) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if file.Mode == filemode.Symlink || !versionPathAllowed(file.Name, s.files.depth) {
			return nil
		}
		content, err := file.Contents()
		if err != nil {
			return err
		}
		if utf8.ValidString(content) {
			insertNode(&workspace.Tree, file.Name, Node{Kind: "file", Name: filepath.Base(file.Name), Content: content})
		}
		return nil
	})
	if err != nil {
		return Workspace{}, fmt.Errorf("read Git version files: %w", err)
	}
	sortTree(&workspace.Tree)
	if err := validateWorkspace(workspace, s.files.depth); err != nil {
		return Workspace{}, err
	}
	return workspace, nil
}

func readVersionMetadata(tree *object.Tree, workspace *Workspace) error {
	file, err := tree.File(MetadataPath)
	if errors.Is(err, object.ErrFileNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	content, err := file.Contents()
	if err != nil {
		return err
	}
	if err := json.Unmarshal([]byte(content), workspace); err != nil {
		return fmt.Errorf("%w: version metadata: %v", ErrInvalid, err)
	}
	if len(workspace.Settings) == 0 {
		workspace.Settings = json.RawMessage(`{}`)
	}
	if workspace.OpenTabs == nil {
		workspace.OpenTabs = []string{}
	}
	return nil
}

func versionPathAllowed(path string, depth int) bool {
	parts := strings.Split(path, "/")
	for index, part := range parts {
		if !validName(part) || part == ".git" || (index == 0 && (part == ".panelcraft" || part == ManifestName)) {
			return false
		}
	}
	return withinDepth(path, false, depth)
}

func (s *GitStore) Restore(ctx context.Context, id, expected string) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	version, err := s.show(ctx, id)
	if err != nil {
		return Snapshot{}, err
	}
	current, err := s.current(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	target := current.snapshot.Workspace
	target.Tree = version.Workspace.Tree
	target.SavedAt = s.opts.Now().UnixMilli()
	return s.save(ctx, target, expected, "Restore "+id[:min(len(id), 7)], true)
}

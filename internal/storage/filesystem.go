// SPDX-License-Identifier: GPL-3.0-only
package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unicode/utf8"
)

// FilesystemStore persists ordinary workspace files beneath one os.Root.
type FilesystemStore struct {
	root  *os.Root
	depth int
	mu    sync.Mutex
}

// NewFilesystem opens an existing or new local directory. Negative depth is unlimited.
func NewFilesystem(dir string, depth int) (*FilesystemStore, error) {
	if dir == "" || depth < -1 {
		return nil, fmt.Errorf("%w: invalid directory or depth", ErrInvalid)
	}
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, fmt.Errorf("create storage directory: %w", err)
	}
	absolute, err := filepath.Abs(dir)
	if err != nil {
		return nil, fmt.Errorf("resolve storage directory: %w", err)
	}
	root, err := os.OpenRoot(absolute)
	if err != nil {
		return nil, fmt.Errorf("open storage directory: %w", err)
	}
	return &FilesystemStore{root: root, depth: depth}, nil
}

func (s *FilesystemStore) Close() error {
	return s.root.Close()
}

func (s *FilesystemStore) Load(ctx context.Context) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.load(ctx)
}

func (s *FilesystemStore) load(ctx context.Context) (Snapshot, error) {
	workspace, err := s.readMetadata()
	if err != nil {
		return Snapshot{}, err
	}
	workspace.Tree = Node{Kind: "folder", Name: "", Children: []Node{}}
	err = fs.WalkDir(s.root.FS(), ".", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		return s.loadEntry(&workspace.Tree, path, entry)
	})
	if err != nil {
		return Snapshot{}, fmt.Errorf("read workspace: %w", err)
	}
	sortTree(&workspace.Tree)
	return snapshotOf(workspace)
}

func (s *FilesystemStore) readMetadata() (Workspace, error) {
	workspace := emptyWorkspace(filepath.Base(s.root.Name()))
	data, err := s.root.ReadFile(MetadataPath)
	if errors.Is(err, fs.ErrNotExist) {
		return workspace, nil
	}
	if err != nil {
		return Workspace{}, fmt.Errorf("read workspace metadata: %w", err)
	}
	if err := json.Unmarshal(data, &workspace); err != nil {
		return Workspace{}, fmt.Errorf("%w: metadata: %v", ErrInvalid, err)
	}
	if len(workspace.Settings) == 0 {
		workspace.Settings = json.RawMessage(`{}`)
	}
	if workspace.OpenTabs == nil {
		workspace.OpenTabs = []string{}
	}
	return workspace, nil
}

func (s *FilesystemStore) loadEntry(tree *Node, name string, entry fs.DirEntry) error {
	skip, err := s.skipEntry(name, entry)
	if err != nil || skip {
		return err
	}
	base := entry.Name()
	if !validName(base) {
		return fmt.Errorf("%w: invalid on-disk name %q", ErrInvalid, name)
	}
	if entry.IsDir() {
		insertNode(tree, name, Node{Kind: "folder", Name: base, Children: []Node{}})
		return nil
	}
	if !entry.Type().IsRegular() {
		return nil
	}
	data, err := s.root.ReadFile(name)
	if err != nil {
		return err
	}
	if !utf8.Valid(data) {
		return nil // Binary files are outside the text workspace and are preserved.
	}
	insertNode(tree, name, Node{Kind: "file", Name: base, Content: string(data)})
	return nil
}

func (s *FilesystemStore) skipEntry(name string, entry fs.DirEntry) (bool, error) {
	if name == "." {
		return true, nil
	}
	folder := entry.IsDir()
	reserved := entry.Name() == ".git" || name == ".panelcraft" || name == ManifestName
	if !reserved && withinDepth(name, folder, s.depth) {
		return false, nil
	}
	if folder {
		return true, fs.SkipDir
	}
	return true, nil
}

func snapshotOf(workspace Workspace) (Snapshot, error) {
	encoded, err := json.Marshal(workspace)
	if err != nil {
		return Snapshot{}, fmt.Errorf("encode workspace revision: %w", err)
	}
	digest := sha256.Sum256(encoded)
	return Snapshot{Workspace: workspace, Revision: `"` + hex.EncodeToString(digest[:]) + `"`}, nil
}

func (s *FilesystemStore) Save(ctx context.Context, workspace Workspace, expected string) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current, err := s.load(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	if current.Revision != expected {
		return Snapshot{}, ErrConflict
	}
	if err := validateWorkspace(workspace, s.depth); err != nil {
		return Snapshot{}, err
	}
	if len(workspace.Settings) == 0 {
		workspace.Settings = json.RawMessage(`{}`)
	}
	if workspace.OpenTabs == nil {
		workspace.OpenTabs = []string{}
	}
	sortTree(&workspace.Tree)
	if err := s.applyTree(ctx, current.Workspace.Tree, workspace.Tree); err != nil {
		return Snapshot{}, err
	}
	if err := s.writeMetadata(workspace); err != nil {
		return Snapshot{}, err
	}
	return snapshotOf(workspace)
}

func (s *FilesystemStore) writeMetadata(workspace Workspace) error {
	data, err := json.MarshalIndent(workspace, "", "  ")
	if err != nil {
		return fmt.Errorf("encode workspace metadata: %w", err)
	}
	if err := s.root.MkdirAll(".panelcraft", 0o750); err != nil {
		return fmt.Errorf("create workspace metadata directory: %w", err)
	}
	data = append(data, '\n')
	if err := s.root.WriteFile(MetadataPath, data, 0o600); err != nil {
		return fmt.Errorf("write workspace metadata: %w", err)
	}
	return nil
}

func (s *FilesystemStore) Clear(ctx context.Context, expected string) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current, err := s.load(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	if current.Revision != expected {
		return Snapshot{}, ErrConflict
	}
	empty := emptyWorkspace(filepath.Base(s.root.Name()))
	if err := s.applyTree(ctx, current.Workspace.Tree, empty.Tree); err != nil {
		return Snapshot{}, err
	}
	if err := s.root.Remove(MetadataPath); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return Snapshot{}, fmt.Errorf("clear workspace metadata: %w", err)
	}
	_ = s.root.Remove(".panelcraft")
	return snapshotOf(empty)
}

func (s *FilesystemStore) applyTree(ctx context.Context, current, target Node) error {
	oldEntries := flattenTree(current)
	newEntries := flattenTree(target)
	oldMap, newMap := entryMap(oldEntries), entryMap(newEntries)
	if err := s.removeOldEntries(oldEntries, newMap); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	return s.writeNewEntries(newEntries, oldMap)
}

func (s *FilesystemStore) removeOldEntries(entries []treeEntry, target map[string]treeEntry) error {
	sortDeepest(entries)
	for _, entry := range entries {
		next, keep := target[entry.path]
		if keep && next.node.Kind == entry.node.Kind {
			continue
		}
		if entry.node.Kind == "file" {
			if err := s.root.Remove(entry.path); err != nil && !errors.Is(err, fs.ErrNotExist) {
				return fmt.Errorf("remove %q: %w", entry.path, err)
			}
			continue
		}
		if err := s.removeEmptyFolder(entry.path); err != nil {
			if keep {
				return fmt.Errorf("%w: cannot replace non-empty folder %q with a file", ErrForbidden, entry.path)
			}
			return fmt.Errorf("remove folder %q: %w", entry.path, err)
		}
	}
	return nil
}

func (s *FilesystemStore) removeEmptyFolder(name string) error {
	err := s.root.Remove(name)
	if err == nil || errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	file, openErr := s.root.Open(name)
	if openErr != nil {
		return err
	}
	defer file.Close()
	_, readErr := file.ReadDir(1)
	if readErr == nil {
		return nil // Hidden or out-of-depth content: keep the directory.
	}
	if errors.Is(readErr, io.EOF) {
		return err
	}
	return readErr
}

func (s *FilesystemStore) writeNewEntries(entries []treeEntry, current map[string]treeEntry) error {
	sortShallowest(entries)
	for _, entry := range entries {
		previous, exists := current[entry.path]
		if entry.node.Kind == "folder" {
			if err := s.root.MkdirAll(entry.path, 0o750); err != nil {
				return fmt.Errorf("create folder %q: %w", entry.path, err)
			}
			continue
		}
		if exists && previous.node.Kind == "file" && previous.node.Content == entry.node.Content {
			continue
		}
		if err := s.root.WriteFile(entry.path, []byte(entry.node.Content), 0o640); err != nil {
			return fmt.Errorf("write %q: %w", entry.path, err)
		}
	}
	return nil
}

// ParentPath validates and converts a workspace-relative path for diagnostics.
func ParentPath(name string) string {
	name = strings.TrimSuffix(name, "/")
	if index := strings.LastIndex(name, "/"); index >= 0 {
		return name[:index]
	}
	return ""
}

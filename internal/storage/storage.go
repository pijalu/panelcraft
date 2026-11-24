// SPDX-License-Identifier: GPL-3.0-only
// Package storage defines the server-side workspace persistence port and its
// concrete local backends. HTTP and CLI code depend on this contract.
package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

const (
	// MetadataPath contains workspace state that is not itself a diagram.
	MetadataPath = ".panelcraft/workspace.json"
	// ManifestName is reserved for workspace ZIP archives.
	ManifestName = "panelcraft.workspace.json"
)

var (
	ErrConflict  = errors.New("workspace changed since it was loaded")
	ErrInvalid   = errors.New("invalid workspace")
	ErrForbidden = errors.New("workspace path is outside the configured storage scope")
	ErrNotFound  = errors.New("workspace version not found")
)

// Node mirrors the browser's virtual filesystem JSON representation.
type Node struct {
	Kind     string `json:"kind"`
	Name     string `json:"name"`
	Content  string `json:"content,omitempty"`
	Children []Node `json:"children,omitempty"`
}

// Workspace is the versioned record shared with the TypeScript storage port.
type Workspace struct {
	SchemaVersion int             `json:"schemaVersion"`
	Settings      json.RawMessage `json:"settings"`
	IRVersion     int             `json:"irVersion"`
	SavedAt       int64           `json:"savedAt"`
	Name          string          `json:"name"`
	Tree          Node            `json:"tree"`
	OpenTabs      []string        `json:"openTabs"`
	ActivePath    *string         `json:"activePath"`
}

// Snapshot couples a workspace with its optimistic-concurrency revision.
type Snapshot struct {
	Workspace Workspace
	Revision  string
}

// Store is the server workspace port. Expected revisions prevent lost updates.
type Store interface {
	Load(ctx context.Context) (Snapshot, error)
	Save(ctx context.Context, workspace Workspace, expectedRevision string) (Snapshot, error)
	Clear(ctx context.Context, expectedRevision string) (Snapshot, error)
}

// VersionStore is deliberately separate: non-Git stores need no history API.
type VersionStore interface {
	Store
	History(ctx context.Context) ([]Version, error)
	Show(ctx context.Context, id string) (Snapshot, error)
	Restore(ctx context.Context, id, expectedRevision string) (Snapshot, error)
}

// Version describes one persisted content revision from a version-capable store.
type Version struct {
	ID      string `json:"id"`
	Message string `json:"message"`
	SavedAt int64  `json:"savedAt"`
}

func emptyWorkspace(name string) Workspace {
	return Workspace{
		SchemaVersion: 2,
		Settings:      json.RawMessage(`{}`),
		Name:          name,
		Tree:          Node{Kind: "folder", Name: "", Children: []Node{}},
		OpenTabs:      []string{},
	}
}

func validateWorkspace(workspace Workspace, depth int) error {
	if workspace.SchemaVersion <= 0 {
		return fmt.Errorf("%w: schemaVersion must be positive", ErrInvalid)
	}
	if len(workspace.Settings) > 0 && !json.Valid(workspace.Settings) {
		return fmt.Errorf("%w: settings must be valid JSON", ErrInvalid)
	}
	if workspace.Tree.Kind != "folder" {
		return fmt.Errorf("%w: root must be a folder", ErrInvalid)
	}
	seen := map[string]bool{}
	return validateChildren(workspace.Tree, "", depth, seen)
}

func validateChildren(folder Node, parent string, depth int, seen map[string]bool) error {
	for _, child := range folder.Children {
		path := child.Name
		if parent != "" {
			path = parent + "/" + child.Name
		}
		if err := validateChild(child, path, parent, depth, seen); err != nil {
			return err
		}
	}
	return nil
}

func validateChild(child Node, path, parent string, depth int, seen map[string]bool) error {
	if !validName(child.Name) || seen[path] || !withinDepth(path, child.Kind == "folder", depth) {
		return fmt.Errorf("%w: %q", ErrForbidden, path)
	}
	if child.Name == ".git" || (parent == "" && (child.Name == ".panelcraft" || child.Name == ManifestName)) {
		return fmt.Errorf("%w: reserved path %q", ErrForbidden, path)
	}
	if !utf8.ValidString(child.Content) {
		return fmt.Errorf("%w: %q is not UTF-8", ErrInvalid, path)
	}
	seen[path] = true
	return validateNodeKind(child, path, depth, seen)
}

func validateNodeKind(child Node, path string, depth int, seen map[string]bool) error {
	switch child.Kind {
	case "file":
		if len(child.Children) != 0 {
			return fmt.Errorf("%w: file %q has children", ErrInvalid, path)
		}
	case "folder":
		return validateChildren(child, path, depth, seen)
	default:
		return fmt.Errorf("%w: unknown node kind %q", ErrInvalid, child.Kind)
	}
	return nil
}

func validName(name string) bool {
	if name == "" || name == "." || name == ".." || len(name) > 255 || !utf8.ValidString(name) {
		return false
	}
	if strings.ContainsAny(name, "/\\\x00") {
		return false
	}
	for _, r := range name {
		if r < 0x20 {
			return false
		}
	}
	return true
}

// Depth counts directory levels: zero admits root files, one admits their
// immediate child directories, and a negative value disables the limit.
func withinDepth(path string, folder bool, depth int) bool {
	if depth < 0 {
		return true
	}
	value := strings.Count(path, "/")
	if folder {
		value++
	}
	return value <= depth
}

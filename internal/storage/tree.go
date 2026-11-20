// SPDX-License-Identifier: GPL-3.0-only
package storage

import (
	"sort"
	"strings"
)

type treeEntry struct {
	path string
	node Node
}

func insertNode(root *Node, path string, node Node) {
	parts := strings.Split(path, "/")
	current := root
	for _, part := range parts[:len(parts)-1] {
		index := childIndex(current, part)
		if index < 0 {
			current.Children = append(current.Children, Node{Kind: "folder", Name: part, Children: []Node{}})
			index = len(current.Children) - 1
		}
		current = &current.Children[index]
	}
	current.Children = append(current.Children, node)
}

func childIndex(folder *Node, name string) int {
	for i := range folder.Children {
		if folder.Children[i].Name == name {
			return i
		}
	}
	return -1
}

func sortTree(node *Node) {
	sort.Slice(node.Children, func(i, j int) bool {
		left, right := node.Children[i], node.Children[j]
		if left.Kind != right.Kind {
			return left.Kind == "folder"
		}
		return left.Name < right.Name
	})
	for i := range node.Children {
		sortTree(&node.Children[i])
	}
}

func flattenTree(root Node) []treeEntry {
	var entries []treeEntry
	var walk func(Node, string)
	walk = func(folder Node, parent string) {
		for _, child := range folder.Children {
			path := child.Name
			if parent != "" {
				path = parent + "/" + child.Name
			}
			entries = append(entries, treeEntry{path: path, node: child})
			if child.Kind == "folder" {
				walk(child, path)
			}
		}
	}
	walk(root, "")
	return entries
}

func entryMap(entries []treeEntry) map[string]treeEntry {
	result := make(map[string]treeEntry, len(entries))
	for _, entry := range entries {
		result[entry.path] = entry
	}
	return result
}

func sortDeepest(entries []treeEntry) {
	sort.Slice(entries, func(i, j int) bool {
		left, right := strings.Count(entries[i].path, "/"), strings.Count(entries[j].path, "/")
		if left != right {
			return left > right
		}
		return entries[i].path > entries[j].path
	})
}

func sortShallowest(entries []treeEntry) {
	sort.Slice(entries, func(i, j int) bool {
		left, right := strings.Count(entries[i].path, "/"), strings.Count(entries[j].path, "/")
		if left != right {
			return left < right
		}
		return entries[i].path < entries[j].path
	})
}

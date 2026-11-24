// SPDX-License-Identifier: GPL-3.0-only
package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/pijalu/panelcraft/internal/storage"
)

const historyPath = "/api/v1/workspace/history/"

func historyCollectionHandler(store storage.Store) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		versions, ok := store.(storage.VersionStore)
		if !ok {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		history, err := versions.History(r.Context())
		if err != nil {
			workspaceError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(struct {
			Versions []storage.Version `json:"versions"`
		}{Versions: history})
	})
}

func historyItemHandler(store storage.Store) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		versions, ok := store.(storage.VersionStore)
		if !ok {
			http.NotFound(w, r)
			return
		}
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, historyPath), "/")
		if len(parts) == 1 {
			showVersion(w, r, versions, parts[0])
			return
		}
		if len(parts) == 2 && parts[1] == "restore" {
			restoreVersion(w, r, versions, parts[0])
			return
		}
		http.NotFound(w, r)
	})
}

func showVersion(w http.ResponseWriter, r *http.Request, store storage.VersionStore, id string) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	snapshot, err := store.Show(r.Context(), id)
	if err != nil {
		workspaceError(w, err)
		return
	}
	writeWorkspaceSnapshot(w, snapshot)
}

func restoreVersion(w http.ResponseWriter, r *http.Request, store storage.VersionStore, id string) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !validMutation(w, r) {
		return
	}
	snapshot, err := store.Restore(r.Context(), id, r.Header.Get("If-Match"))
	if err != nil {
		workspaceError(w, err)
		return
	}
	writeWorkspaceSnapshot(w, snapshot)
}

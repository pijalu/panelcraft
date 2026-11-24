// SPDX-License-Identifier: GPL-3.0-only
package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/pijalu/panelcraft/internal/storage"
)

const maxWorkspaceBytes = 32 << 20

func workspaceHandler(store storage.Store) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if store == nil {
			http.NotFound(w, r)
			return
		}
		switch r.Method {
		case http.MethodGet:
			readWorkspace(w, r, store)
		case http.MethodPut:
			writeWorkspace(w, r, store)
		case http.MethodDelete:
			clearWorkspace(w, r, store)
		default:
			w.Header().Set("Allow", "GET, PUT, DELETE")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
}

func readWorkspace(w http.ResponseWriter, r *http.Request, store storage.Store) {
	snapshot, err := store.Load(r.Context())
	if err != nil {
		workspaceError(w, err)
		return
	}
	writeWorkspaceSnapshot(w, snapshot)
}

func writeWorkspaceSnapshot(w http.ResponseWriter, snapshot storage.Snapshot) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("ETag", snapshot.Revision)
	_ = json.NewEncoder(w).Encode(snapshot.Workspace)
}

func writeWorkspace(w http.ResponseWriter, r *http.Request, store storage.Store) {
	if !validMutation(w, r) {
		return
	}
	workspace, err := decodeWorkspace(w, r)
	if err != nil {
		workspaceError(w, err)
		return
	}
	snapshot, err := store.Save(r.Context(), workspace, r.Header.Get("If-Match"))
	if err != nil {
		workspaceError(w, err)
		return
	}
	w.Header().Set("ETag", snapshot.Revision)
	w.WriteHeader(http.StatusNoContent)
}

func clearWorkspace(w http.ResponseWriter, r *http.Request, store storage.Store) {
	if !validMutation(w, r) {
		return
	}
	snapshot, err := store.Clear(r.Context(), r.Header.Get("If-Match"))
	if err != nil {
		workspaceError(w, err)
		return
	}
	w.Header().Set("ETag", snapshot.Revision)
	w.WriteHeader(http.StatusNoContent)
}

func validMutation(w http.ResponseWriter, r *http.Request) bool {
	if r.Header.Get("X-PanelCraft-Storage") != "1" {
		http.Error(w, "storage mutation header required", http.StatusForbidden)
		return false
	}
	if r.Header.Get("If-Match") == "" {
		http.Error(w, "If-Match revision required", http.StatusPreconditionRequired)
		return false
	}
	if r.Method == http.MethodPut && !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		http.Error(w, "workspace must be application/json", http.StatusUnsupportedMediaType)
		return false
	}
	return true
}

func decodeWorkspace(w http.ResponseWriter, r *http.Request) (storage.Workspace, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxWorkspaceBytes)
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	var workspace storage.Workspace
	if err := decoder.Decode(&workspace); err != nil {
		return storage.Workspace{}, err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return storage.Workspace{}, fmt.Errorf("%w: multiple JSON values", storage.ErrInvalid)
	}
	return workspace, nil
}

func workspaceError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	var tooLarge *http.MaxBytesError
	switch {
	case errors.Is(err, storage.ErrConflict):
		status = http.StatusConflict
	case errors.Is(err, storage.ErrForbidden):
		status = http.StatusForbidden
	case errors.Is(err, storage.ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, storage.ErrInvalid), errors.Is(err, io.EOF):
		status = http.StatusBadRequest
	case errors.As(err, &tooLarge):
		status = http.StatusRequestEntityTooLarge
	}
	if status == http.StatusInternalServerError {
		var syntax *json.SyntaxError
		var typeError *json.UnmarshalTypeError
		if errors.As(err, &syntax) || errors.As(err, &typeError) {
			status = http.StatusBadRequest
		}
	}
	http.Error(w, err.Error(), status)
}

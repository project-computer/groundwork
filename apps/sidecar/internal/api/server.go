// Package api exposes the sidecar's localhost HTTP API to the Tauri webview.
package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/vet-clinic/sidecar/internal/store"
	"github.com/vet-clinic/sidecar/internal/sync"
)

const maxBodyBytes = 64 << 20

type Server struct {
	store  *store.Store
	engine *sync.Engine
}

func New(st *store.Store, engine *sync.Engine) *Server {
	return &Server{store: st, engine: engine}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealth)
	mux.HandleFunc("/state", s.handleState)
	mux.HandleFunc("/sync/run", s.handleSyncRun)
	mux.HandleFunc("/sync/status", s.handleSyncStatus)
	return cors(mux)
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"syncReady": s.engine.Configured(),
	})
}

func (s *Server) handleState(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		content, err := s.store.Load(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if content == nil {
			writeJSON(w, http.StatusOK, map[string]json.RawMessage{"state": nil})
			return
		}
		writeJSON(w, http.StatusOK, map[string]json.RawMessage{"state": content})
	case http.MethodPut:
		body, err := readBody(r)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := s.store.Save(r.Context(), body); err != nil {
			status := http.StatusInternalServerError
			if errors.Is(err, store.ErrInvalidState) {
				status = http.StatusBadRequest
			}
			writeError(w, status, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"saved": true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleSyncRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	body, err := readBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(body) == 0 {
		content, err := s.store.Load(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if content == nil {
			writeError(w, http.StatusBadRequest, "no local state to sync")
			return
		}
		body = content
	}
	result, err := s.engine.Run(r.Context(), body)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, sync.ErrNotConfigured) {
			status = http.StatusServiceUnavailable
		}
		if errors.Is(err, store.ErrInvalidState) {
			status = http.StatusBadRequest
		}
		writeError(w, status, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleSyncStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	cursor, ok, err := s.store.Meta(r.Context(), sync.CursorKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var cursorValue int64
	if ok {
		cursorValue, _ = strconv.ParseInt(cursor, 10, 64)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"configured":  s.engine.Configured(),
		"cursor":      cursorValue,
		"hasCursor":   ok,
	})
}

func readBody(r *http.Request) ([]byte, error) {
	defer r.Body.Close()
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBodyBytes))
	if err != nil {
		return nil, err
	}
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" || trimmed == "null" {
		return nil, nil
	}
	return body, nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"error": message})
}

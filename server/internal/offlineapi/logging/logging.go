// Package logging provides a best-effort, size-capped rotating file writer
// (issue 0017): when the active file overflows it is rotated aside and the
// oldest generation is deleted only after the new file exists. Write errors
// are swallowed — logging must never take the sidecar down.
package logging

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

const (
	// DefaultMaxBytes bounds the active file; DefaultKeep counts the total
	// generations on disk (active + shifted copies).
	DefaultMaxBytes = 5 << 20 // 5 MB
	DefaultKeep     = 3
)

type RotatingWriter struct {
	mu       sync.Mutex
	path     string
	maxBytes int64
	keep     int
	file     *os.File
}

// Open creates the parent directory and opens (or appends to) the active log
// file. Best-effort by contract, but startup errors are returned so callers
// can choose to log that fact once.
func Open(path string, maxBytes int64, keep int) (*RotatingWriter, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	return &RotatingWriter{path: path, maxBytes: maxBytes, keep: keep, file: file}, nil
}

func (w *RotatingWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		return len(p), nil
	}
	if info, err := w.file.Stat(); err == nil && info.Size()+int64(len(p)) > w.maxBytes {
		w.rotateLocked()
	}
	// Best-effort: a failed write is dropped; stderr keeps flowing.
	w.file.Write(p)
	return len(p), nil
}

func (w *RotatingWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		return nil
	}
	err := w.file.Close()
	w.file = nil
	return err
}

// rotateLocked shifts the active file to path.1 and the older generations
// up by one, dropping the oldest, then starts a fresh active file.
func (w *RotatingWriter) rotateLocked() {
	_ = w.file.Close()
	// Drop the oldest generation first — the active data survives in the
	// freshly created file below, so a crash mid-rotation loses nothing but
	// the oldest log content.
	_ = os.Remove(w.generation(w.keep - 1))
	for i := w.keep - 2; i >= 1; i-- {
		_ = os.Rename(w.generation(i), w.generation(i+1))
	}
	_ = os.Rename(w.path, w.generation(1))
	file, err := os.OpenFile(w.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		// Keep serving writes as no-ops; a second attempt may succeed.
		w.file = nil
		return
	}
	w.file = file
}

func (w *RotatingWriter) generation(n int) string {
	return fmt.Sprintf("%s.%d", w.path, n)
}

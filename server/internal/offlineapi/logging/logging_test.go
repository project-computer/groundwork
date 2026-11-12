package logging

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestWriterCreatesFileAndAppends(t *testing.T) {
	path := filepath.Join(t.TempDir(), "logs", "clinic-core.log")
	w, err := Open(path, DefaultMaxBytes, DefaultKeep)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = w.Write([]byte("line one\n"))
	_, _ = w.Write([]byte("line two\n"))
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(content, []byte("line one\nline two\n")) {
		t.Fatalf("unexpected content %q", content)
	}
}

func TestWriterRotatesOnOverflow(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "clinic-core.log")
	w, err := Open(path, 32, 3)
	if err != nil {
		t.Fatal(err)
	}
	defer w.Close()

	for i := 0; i < 10; i++ {
		_, _ = w.Write([]byte("0123456789abcdef0123456789abcdef\n")) // 33 bytes > cap
	}

	// Generations exist: active + shifted copies, bounded by keep.
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) > 3 {
		t.Fatalf("rotation must keep %d files, found %d", 3, len(entries))
	}
	// The active file is fresh — small after the last rotation boundary.
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Size() > 32+33 {
		t.Fatalf("active file did not restart on rotation: %d bytes", info.Size())
	}
}

func TestWriterSurvivesBrokenDir(t *testing.T) {
	// A path where the parent is a file forces MkdirAll to fail: Open must
	// report it and the process stays free to log to stderr only.
	file := filepath.Join(t.TempDir(), "blocker")
	if err := os.WriteFile(file, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(filepath.Join(file, "logs", "app.log"), DefaultMaxBytes, DefaultKeep); err == nil {
		t.Fatal("expected an error when the log dir cannot be created")
	}
}

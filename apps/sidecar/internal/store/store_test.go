package store

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/project-computer/groundwork/sidecar/internal/db"
)

// fixturePath resolves a file in the repo-root fixtures/ directory, the single
// home for cross-language contract fixtures.
func fixturePath(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "fixtures", name))
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	return string(raw)
}

// The document-shape guards in TypeScript (isClinicState), Go (Validate) and
// Rust (validate_state) must all accept the same canonical document.
func TestValidateAcceptsSharedFixture(t *testing.T) {
	if err := Validate([]byte(fixturePath(t, "clinic-document.json"))); err != nil {
		t.Fatalf("shared fixture must validate: %v", err)
	}
}

func TestValidateRejectsMissingCollection(t *testing.T) {
	var state map[string]any
	if err := json.Unmarshal([]byte(fixturePath(t, "clinic-document.json")), &state); err != nil {
		t.Fatal(err)
	}
	for _, key := range requiredArrays {
		broken := make(map[string]any, len(state))
		for k, v := range state {
			broken[k] = v
		}
		delete(broken, key)
		raw, err := json.Marshal(broken)
		if err != nil {
			t.Fatal(err)
		}
		if err := Validate(raw); err == nil {
			t.Fatalf("document without %s must be rejected", key)
		}
	}
}

func TestValidateRejectsNonArrayCollection(t *testing.T) {
	var state map[string]any
	if err := json.Unmarshal([]byte(fixturePath(t, "clinic-document.json")), &state); err != nil {
		t.Fatal(err)
	}
	state["patients"] = "nope"
	raw, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	if err := Validate(raw); err == nil {
		t.Fatal("non-array collection must be rejected")
	}
}

// A crash or disk-full mid-write can leave a truncated row behind. The store
// never persists one (Save validates first), and a truncated row that somehow
// landed is refused on the next Save so the last good document is not
// silently extended with partial data.
func TestSaveRejectsTruncatedDocumentAtomically(t *testing.T) {
	database, err := db.OpenInMemory()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	st := New(database)
	ctx := context.Background()

	// A previous good save is the recovery point.
	if err := st.Save(ctx, []byte(fixturePath(t, "clinic-document.json"))); err != nil {
		t.Fatal(err)
	}

	// A truncated body (as an interrupted write would produce) is refused
	// whole — no partial write, no error swallowed.
	truncated := fixturePath(t, "clinic-document.json")[:200]
	if err := st.Save(ctx, []byte(truncated)); !errors.Is(err, ErrInvalidState) {
		t.Fatalf("truncated document must be rejected with ErrInvalidState, got %v", err)
	}

	// The row still holds the last good document, byte-for-byte.
	loaded, err := st.Load(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if string(loaded) != fixturePath(t, "clinic-document.json") {
		t.Fatal("a rejected save must leave the previous document untouched")
	}
}

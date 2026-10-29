package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
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

package sync

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// The entity registry is hand-synced with server/internal/service/sync_service.go.
// fixtures/sync-entities.json is the single source of truth; both sides are
// pinned to it so adding a type without its counterpart fails a test.
func TestRegistryMatchesSharedFixture(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "fixtures", "sync-entities.json"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var want struct {
		TopLevel map[string]string `json:"topLevel"`
		Nested   map[string]string `json:"nested"`
	}
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(topLevel, want.TopLevel) {
		t.Fatalf("topLevel registry drifted from fixtures/sync-entities.json:\n got %v\nwant %v", topLevel, want.TopLevel)
	}
	if !reflect.DeepEqual(nested, want.Nested) {
		t.Fatalf("nested registry drifted from fixtures/sync-entities.json:\n got %v\nwant %v", nested, want.Nested)
	}
}

package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// The cloud sync registry is hand-synced with apps/sidecar/internal/sync/entities.go.
// fixtures/sync-entities.json is the single source of truth; both sides are
// pinned to it so adding a type without its counterpart fails a test.
func TestSyncRegistryMatchesSharedFixture(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "fixtures", "sync-entities.json"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var fixture struct {
		TopLevel map[string]string `json:"topLevel"`
		Nested   map[string]string `json:"nested"`
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}

	wantTopLevel := map[string]bool{}
	for entityType := range fixture.TopLevel {
		wantTopLevel[entityType] = true
	}
	for entityType := range fixture.Nested {
		wantTopLevel[entityType] = true
	}

	if len(syncEntityTypes) != len(wantTopLevel) {
		t.Fatalf("syncEntityTypes has %d types, fixture has %d", len(syncEntityTypes), len(wantTopLevel))
	}
	for entityType := range wantTopLevel {
		if !syncEntityTypes[entityType] {
			t.Fatalf("syncEntityTypes is missing %q from the fixture", entityType)
		}
	}

	if len(syncNestedEntityTypes) != len(fixture.Nested) {
		t.Fatalf("syncNestedEntityTypes has %d types, fixture has %d", len(syncNestedEntityTypes), len(fixture.Nested))
	}
	for entityType := range fixture.Nested {
		if !syncNestedEntityTypes[entityType] {
			t.Fatalf("syncNestedEntityTypes is missing %q from the fixture", entityType)
		}
	}
}

// Package sync implements the offline-first sync engine: it drains the
// document outbox to the cloud API and merges pulled entities back into the
// local clinic document using last-write-wins per entity version.
package sync

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// CursorKey is the sync_meta row holding the last pulled server version.
const CursorKey = "pull_cursor"

// Change is one entry of ClinicState.outbox.
type Change struct {
	ChangeID   string `json:"changeId"`
	EntityType string `json:"entityType"`
	EntityID   string `json:"entityId"`
	Operation  string `json:"operation"`
	OccurredAt string `json:"occurredAt"`
}

// RemoteChange is the wire format for both push requests and pull results.
// Payload is a JSON envelope: {"entity": {...}, "parentId": "..."}.
type RemoteChange struct {
	EntityType string          `json:"entityType"`
	EntityID   string          `json:"entityId"`
	Operation  string          `json:"operation"`
	Payload    json.RawMessage `json:"payload,omitempty"`
	OccurredAt string          `json:"occurredAt"`
	Version    int64           `json:"version,omitempty"`
}

type PushRequest struct {
	Changes []RemoteChange `json:"changes"`
}

type PushResult struct {
	EntityType string          `json:"entityType"`
	EntityID   string          `json:"entityId"`
	Operation  string          `json:"operation"`
	OccurredAt string          `json:"occurredAt"`
	Status     string          `json:"status"`
	Version    int64           `json:"version"`
	Payload    json.RawMessage `json:"payload,omitempty"`
}

type PushResponse struct {
	Results []PushResult `json:"results"`
}

type PullResponse struct {
	Changes       []RemoteChange `json:"changes"`
	LatestVersion int64          `json:"latestVersion"`
	FullResync    bool           `json:"fullResync"`
}

// Envelope wraps a synced entity with its parent for nested records
// (clinical notes, diagnoses, prescriptions live inside an encounter).
type Envelope struct {
	Entity   json.RawMessage `json:"entity"`
	ParentID string          `json:"parentId,omitempty"`
}

// topLevel maps outbox entity types to ClinicState collection keys.
var topLevel = map[string]string{
	"owner":          "owners",
	"patient":        "patients",
	"appointment":    "appointments",
	"encounter":      "encounters",
	"product":        "products",
	"invoice":        "invoices",
	"payment":        "payments",
	"stock_movement": "stockMovements",
	"user":           "users",
	"vaccination":    "vaccinations",
}

// nested maps entity types to the array key inside an encounter.
var nested = map[string]string{
	"clinical_note": "notes",
	"diagnosis":     "diagnoses",
	"prescription":  "prescriptions",
}

type entityRef struct {
	entity  map[string]any
	parent  map[string]any // encounter for nested entities, nil otherwise
	version int64
}

// resolveEntity finds an entity in the document by type and id.
func resolveEntity(state map[string]any, entityType, entityID string) (entityRef, bool) {
	if key, ok := topLevel[entityType]; ok {
		items, ok := asSlice(state[key])
		if !ok {
			return entityRef{}, false
		}
		for _, item := range items {
			obj, ok := item.(map[string]any)
			if !ok || stringField(obj, "id") != entityID {
				continue
			}
			return entityRef{entity: obj, version: intField(obj, "version")}, true
		}
		return entityRef{}, false
	}
	arrayKey, ok := nested[entityType]
	if !ok {
		return entityRef{}, false
	}
	encounters, ok := asSlice(state["encounters"])
	if !ok {
		return entityRef{}, false
	}
	for _, item := range encounters {
		enc, ok := item.(map[string]any)
		if !ok {
			continue
		}
		items, ok := asSlice(enc[arrayKey])
		if !ok {
			continue
		}
		for _, nestedItem := range items {
			obj, ok := nestedItem.(map[string]any)
			if !ok || stringField(obj, "id") != entityID {
				continue
			}
			return entityRef{entity: obj, parent: enc, version: intField(obj, "version")}, true
		}
	}
	return entityRef{}, false
}

func envelope(entity map[string]any, parentID string) (json.RawMessage, error) {
	body, err := json.Marshal(entity)
	if err != nil {
		return nil, err
	}
	return json.Marshal(Envelope{Entity: body, ParentID: parentID})
}

func asSlice(value any) ([]any, bool) {
	items, ok := value.([]any)
	return items, ok
}

func stringField(obj map[string]any, key string) string {
	value, _ := obj[key].(string)
	return value
}

func intField(obj map[string]any, key string) int64 {
	switch value := obj[key].(type) {
	case json.Number:
		n, err := value.Int64()
		if err == nil {
			return n
		}
	case float64:
		return int64(value)
	case int:
		return int64(value)
	case int64:
		return value
	}
	return 0
}

func decodePayload(raw json.RawMessage) (Envelope, map[string]any, error) {
	var env Envelope
	if len(raw) == 0 {
		return env, nil, fmt.Errorf("empty payload")
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return env, nil, err
	}
	var entity map[string]any
	dec := json.NewDecoder(bytes.NewReader(env.Entity))
	dec.UseNumber()
	if err := dec.Decode(&entity); err != nil {
		return env, nil, err
	}
	return env, entity, nil
}

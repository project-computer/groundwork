package sync

import (
	"fmt"
)

// Merge applies remote changes to the clinic document in place and reports how
// many entities were inserted or replaced.
func Merge(state map[string]any, changes []RemoteChange) (int, error) {
	applied := 0
	for _, change := range changes {
		if change.Operation == "delete" {
			if removeEntity(state, change.EntityType, change.EntityID) {
				applied++
			}
			continue
		}
		env, entity, err := decodePayload(change.Payload)
		if err != nil {
			return applied, fmt.Errorf("invalid payload for %s/%s: %w", change.EntityType, change.EntityID, err)
		}
		if stringField(entity, "id") == "" {
			entity["id"] = change.EntityID
		}
		ok, err := upsertEntity(state, change.EntityType, change.EntityID, env.ParentID, entity)
		if err != nil {
			return applied, err
		}
		if ok {
			applied++
		}
	}
	return applied, nil
}

func shouldReplace(existing, incoming map[string]any) bool {
	incomingServer := intField(incoming, "serverVersion")
	existingServer := intField(existing, "serverVersion")
	if incomingServer > 0 {
		return incomingServer > existingServer
	}
	if existingServer > 0 {
		// Never let a legacy/client-version row overwrite a server-versioned
		// row; server versions are the canonical ordering.
		return false
	}

	incomingVersion := intField(incoming, "version")
	if incomingVersion <= 0 {
		// Append-only records (notes, payments, movements) never overwrite.
		return false
	}
	return incomingVersion > intField(existing, "version")
}

func upsertEntity(state map[string]any, entityType, entityID, parentID string, entity map[string]any) (bool, error) {
	if key, ok := topLevel[entityType]; ok {
		items, ok := asSlice(state[key])
		if !ok {
			items = []any{}
		}
		for i, item := range items {
			existing, ok := item.(map[string]any)
			if !ok || stringField(existing, "id") != entityID {
				continue
			}
			if !shouldReplace(existing, entity) {
				return false, nil
			}
			items[i] = entity
			state[key] = items
			return true, nil
		}
		state[key] = append(items, entity)
		return true, nil
	}

	arrayKey, ok := nested[entityType]
	if !ok {
		return false, fmt.Errorf("unknown entity type %q", entityType)
	}
	parent, ok := findNestedParent(state, parentID)
	if !ok {
		return false, fmt.Errorf("parent encounter %q not found for %s/%s", parentID, entityType, entityID)
	}
	items, ok := asSlice(parent[arrayKey])
	if !ok {
		items = []any{}
	}
	for i, item := range items {
		existing, ok := item.(map[string]any)
		if !ok || stringField(existing, "id") != entityID {
			continue
		}
		if !shouldReplace(existing, entity) {
			return false, nil
		}
		items[i] = entity
		parent[arrayKey] = items
		return true, nil
	}
	parent[arrayKey] = append(items, entity)
	return true, nil
}

func findNestedParent(state map[string]any, parentID string) (map[string]any, bool) {
	encounters, ok := asSlice(state["encounters"])
	if !ok {
		return nil, false
	}
	for _, item := range encounters {
		enc, ok := item.(map[string]any)
		if ok && stringField(enc, "id") == parentID {
			return enc, true
		}
	}
	return nil, false
}

func removeEntity(state map[string]any, entityType, entityID string) bool {
	if key, ok := topLevel[entityType]; ok {
		items, ok := asSlice(state[key])
		if !ok {
			return false
		}
		for i, item := range items {
			obj, ok := item.(map[string]any)
			if ok && stringField(obj, "id") == entityID {
				state[key] = append(append([]any{}, items[:i]...), items[i+1:]...)
				return true
			}
		}
		return false
	}

	arrayKey, ok := nested[entityType]
	if !ok {
		return false
	}
	encounters, ok := asSlice(state["encounters"])
	if !ok {
		return false
	}
	removed := false
	for _, item := range encounters {
		enc, ok := item.(map[string]any)
		if !ok {
			continue
		}
		items, ok := asSlice(enc[arrayKey])
		if !ok {
			continue
		}
		for i, nestedItem := range items {
			obj, ok := nestedItem.(map[string]any)
			if !ok || stringField(obj, "id") != entityID {
				continue
			}
			enc[arrayKey] = append(append([]any{}, items[:i]...), items[i+1:]...)
			removed = true
			break
		}
	}
	return removed
}

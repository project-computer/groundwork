package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/vet-clinic/sidecar/internal/store"
)

var ErrNotConfigured = errors.New("cloud sync is not configured")

// Result is what the sidecar hands back to the UI after a sync pass.
type Result struct {
	State          json.RawMessage `json:"state"`
	AckedChangeIDs []string        `json:"ackedChangeIds"`
	Pushed         int             `json:"pushed"`
	Pulled         int             `json:"pulled"`
	Conflicts      int             `json:"conflicts"`
	LatestVersion  int64           `json:"latestVersion"`
	LastSyncedAt   string          `json:"lastSyncedAt,omitempty"`
}

type Engine struct {
	store  *store.Store
	client *Client
	now    func() time.Time
}

func NewEngine(st *store.Store, client *Client) *Engine {
	return &Engine{store: st, client: client, now: time.Now}
}

func (e *Engine) Configured() bool { return e != nil && e.client != nil }

// Run pushes pending outbox entries, then pulls everything newer than the
// stored cursor, merging both directions into the document before persisting.
func (e *Engine) Run(ctx context.Context, raw []byte) (*Result, error) {
	if !e.Configured() {
		return nil, ErrNotConfigured
	}
	if err := store.Validate(raw); err != nil {
		return nil, err
	}

	var state map[string]any
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	if err := dec.Decode(&state); err != nil {
		return nil, err
	}

	result := &Result{AckedChangeIDs: []string{}}
	changes, err := outboxChanges(state)
	if err != nil {
		return nil, err
	}

	pending := make([]RemoteChange, 0, len(changes))
	ackIndex := map[string][]string{}
	for _, change := range changes {
		key := changeKey(change.EntityType, change.EntityID, change.OccurredAt)
		if change.Operation == "delete" {
			// A tombstone does not need the local entity; the server keeps it
			// for other devices to apply.
			ackIndex[key] = append(ackIndex[key], change.ChangeID)
			pending = append(pending, RemoteChange{
				EntityType: change.EntityType,
				EntityID:   change.EntityID,
				Operation:  change.Operation,
				OccurredAt: change.OccurredAt,
			})
			continue
		}
		ref, ok := resolveEntity(state, change.EntityType, change.EntityID)
		if !ok {
			// The entity no longer exists locally; drop the stale outbox entry.
			result.AckedChangeIDs = append(result.AckedChangeIDs, change.ChangeID)
			continue
		}
		parentID := ""
		if ref.parent != nil {
			parentID = stringField(ref.parent, "id")
		}
		payload, err := envelope(ref.entity, parentID)
		if err != nil {
			return nil, err
		}
		ackIndex[key] = append(ackIndex[key], change.ChangeID)
		pending = append(pending, RemoteChange{
			EntityType: change.EntityType,
			EntityID:   change.EntityID,
			Operation:  change.Operation,
			Payload:    payload,
			OccurredAt: change.OccurredAt,
		})
	}

	// Apply the server's canonical copy for every push result, not only
	// conflicts, so local rows gain serverVersion and future LWW decisions are
	// made against server-assigned versions.
	var canonical []RemoteChange
	if len(pending) > 0 {
		pushResp, err := e.client.Push(ctx, pending)
		if err != nil {
			return nil, err
		}
		for _, pushed := range pushResp.Results {
			key := changeKey(pushed.EntityType, pushed.EntityID, pushed.OccurredAt)
			result.AckedChangeIDs = append(result.AckedChangeIDs, ackIndex[key]...)
			delete(ackIndex, key)
			if pushed.Status == "conflict" {
				result.Conflicts++
			}
			if len(pushed.Payload) > 0 {
				operation := pushed.Operation
				if operation == "" {
					operation = "upsert"
				}
				canonical = append(canonical, RemoteChange{
					EntityType: pushed.EntityType,
					EntityID:   pushed.EntityID,
					Operation:  operation,
					Payload:    pushed.Payload,
					OccurredAt: pushed.OccurredAt,
					Version:    pushed.Version,
				})
			}
		}
		result.Pushed = len(pushResp.Results)
	}

	applied, err := Merge(state, canonical)
	if err != nil {
		return nil, err
	}

	cursor := e.cursor(ctx)
	pullResp, err := e.client.Pull(ctx, cursor)
	if err != nil {
		return nil, err
	}
	pulled, err := Merge(state, pullResp.Changes)
	if err != nil {
		return nil, err
	}
	applied += pulled
	result.Pulled = pulled
	if pullResp.LatestVersion > cursor {
		if err := e.store.SetMeta(ctx, CursorKey, strconv.FormatInt(pullResp.LatestVersion, 10)); err != nil {
			return nil, err
		}
		result.LatestVersion = pullResp.LatestVersion
	} else {
		result.LatestVersion = cursor
	}

	if result.Pushed > 0 || applied > 0 {
		result.LastSyncedAt = e.now().UTC().Format("2006-01-02T15:04:05.000Z07:00")
		state["lastSyncedAt"] = result.LastSyncedAt
	}

	pruneOutbox(state, result.AckedChangeIDs)

	encoded, err := encodeState(state)
	if err != nil {
		return nil, err
	}
	result.State = encoded
	if err := e.store.Save(ctx, encoded); err != nil {
		return nil, err
	}
	return result, nil
}

func (e *Engine) cursor(ctx context.Context) int64 {
	value, ok, err := e.store.Meta(ctx, CursorKey)
	if err != nil || !ok {
		return 0
	}
	cursor, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0
	}
	return cursor
}

func outboxChanges(state map[string]any) ([]Change, error) {
	items, ok := asSlice(state["outbox"])
	if !ok {
		return nil, nil
	}
	changes := make([]Change, 0, len(items))
	for _, item := range items {
		obj, ok := item.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("invalid outbox entry")
		}
		changes = append(changes, Change{
			ChangeID:   stringField(obj, "changeId"),
			EntityType: stringField(obj, "entityType"),
			EntityID:   stringField(obj, "entityId"),
			Operation:  stringField(obj, "operation"),
			OccurredAt: stringField(obj, "occurredAt"),
		})
	}
	return changes, nil
}

func pruneOutbox(state map[string]any, acked []string) {
	if len(acked) == 0 {
		return
	}
	done := make(map[string]bool, len(acked))
	for _, id := range acked {
		done[id] = true
	}
	items, _ := asSlice(state["outbox"])
	kept := make([]any, 0, len(items))
	for _, item := range items {
		obj, ok := item.(map[string]any)
		if ok && done[stringField(obj, "changeId")] {
			continue
		}
		kept = append(kept, item)
	}
	state["outbox"] = kept
}

func changeKey(entityType, entityID, occurredAt string) string {
	return entityType + "|" + entityID + "|" + occurredAt
}

func encodeState(state map[string]any) (json.RawMessage, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(state); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

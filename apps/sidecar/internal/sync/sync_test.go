package sync

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/vet-clinic/sidecar/internal/db"
	"github.com/vet-clinic/sidecar/internal/store"
)

func sampleState() map[string]any {
	return map[string]any{
		"clinic": map[string]any{"id": "clinic-01", "name": "Baan Sathorn", "timezone": "Asia/Bangkok", "currency": "THB", "vatRate": 0.07},
		"users":  []any{},
		"owners": []any{
			map[string]any{"id": "owner-1", "name": "Somchai", "phone": "080", "email": "s@example.com", "version": json.Number("1")},
		},
		"patients": []any{
			map[string]any{"id": "patient-1", "ownerId": "owner-1", "name": "Mochi", "species": "Cat", "breed": "Thai", "sex": "Female", "birthDate": "2020-01-01", "version": json.Number("1")},
		},
		"appointments": []any{},
		"encounters": []any{
			map[string]any{
				"id": "enc-1", "patientId": "patient-1", "attendingId": "u-pim", "status": "open",
				"openedAt": "2026-10-25T10:00:00Z", "version": json.Number("2"),
				"vitals": map[string]any{}, "notes": []any{
					map[string]any{"id": "note-1", "authorId": "u-pim", "body": "stable", "createdAt": "2026-10-25T10:05:00Z"},
				},
				"diagnoses": []any{}, "prescriptions": []any{},
			},
		},
		"products":       []any{},
		"stockMovements": []any{},
		"invoices":       []any{},
		"payments":       []any{},
		"vaccinations": []any{
			map[string]any{"id": "vac-1", "patientId": "patient-1", "vaccineName": "Rabies vaccine", "administeredAt": "2026-10-25T10:00:00Z", "nextDueAt": "2027-10-25", "vetId": "u-pim", "version": json.Number("1")},
		},
		"audit": []any{},
		"outbox": []any{},
	}
}

func encode(t *testing.T, state map[string]any) []byte {
	t.Helper()
	raw, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func newEngine(t *testing.T, server *httptest.Server) (*Engine, *store.Store) {
	t.Helper()
	database, err := db.OpenInMemory()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	st := store.New(database)
	var client *Client
	if server != nil {
		client = NewClient(server.URL, "test-token")
	}
	return NewEngine(st, client), st
}

func TestBuildPushIncludesNestedParentAndPrunesOutbox(t *testing.T) {
	var pushed PushRequest
	var pulledSince int64 = -1
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/sync/push":
			json.NewDecoder(r.Body).Decode(&pushed)
			results := make([]PushResult, 0, len(pushed.Changes))
			for i, change := range pushed.Changes {
				results = append(results, PushResult{
					EntityType: change.EntityType,
					EntityID:   change.EntityID,
					OccurredAt: change.OccurredAt,
					Status:     "applied",
					Version:    int64(i + 1),
				})
			}
			json.NewEncoder(w).Encode(PushResponse{Results: results})
		case "/api/v1/sync/pull":
			pulledSince, _ = strconv.ParseInt(r.URL.Query().Get("since"), 10, 64)
			json.NewEncoder(w).Encode(PullResponse{Changes: []RemoteChange{}, LatestVersion: 7})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	engine, st := newEngine(t, server)
	state := sampleState()
	state["outbox"] = []any{
		map[string]any{"changeId": "c1", "entityType": "owner", "entityId": "owner-1", "operation": "upsert", "occurredAt": "2026-10-25T10:00:00Z"},
		map[string]any{"changeId": "c2", "entityType": "clinical_note", "entityId": "note-1", "operation": "append", "occurredAt": "2026-10-25T10:06:00Z"},
		map[string]any{"changeId": "c3", "entityType": "owner", "entityId": "missing", "operation": "upsert", "occurredAt": "2026-10-25T10:07:00Z"},
	}

	result, err := engine.Run(context.Background(), encode(t, state))
	if err != nil {
		t.Fatal(err)
	}

	if len(pushed.Changes) != 2 {
		t.Fatalf("expected 2 pushed changes, got %d", len(pushed.Changes))
	}
	if pulledSince != 0 {
		t.Fatalf("expected first pull since=0, got %d", pulledSince)
	}
	var env Envelope
	if err := json.Unmarshal(pushed.Changes[1].Payload, &env); err != nil {
		t.Fatal(err)
	}
	if env.ParentID != "enc-1" {
		t.Fatalf("expected nested parent enc-1, got %q", env.ParentID)
	}
	if len(result.AckedChangeIDs) != 3 {
		t.Fatalf("stale outbox entries should be acked too, got %v", result.AckedChangeIDs)
	}

	saved, err := st.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var after map[string]any
	if err := json.Unmarshal(saved, &after); err != nil {
		t.Fatal(err)
	}
	if remaining := after["outbox"].([]any); len(remaining) != 0 {
		t.Fatalf("expected empty outbox, got %d", len(remaining))
	}
	cursor, ok, _ := st.Meta(context.Background(), CursorKey)
	if !ok || cursor != "7" {
		t.Fatalf("expected cursor 7, got %q (%v)", cursor, ok)
	}
}

func TestMergeLastWriteWins(t *testing.T) {
	state := sampleState()
	payload, _ := envelope(map[string]any{
		"id": "owner-1", "name": "Remote Name", "phone": "081", "email": "r@example.com", "version": 2,
	}, "")
	changes := []RemoteChange{{EntityType: "owner", EntityID: "owner-1", Operation: "upsert", Payload: payload}}

	applied, err := Merge(state, changes)
	if err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatalf("expected 1 applied, got %d", applied)
	}
	owners := state["owners"].([]any)
	if got := owners[0].(map[string]any)["name"]; got != "Remote Name" {
		t.Fatalf("expected remote name, got %v", got)
	}

	// Older version must not clobber the newer local row.
	older, _ := envelope(map[string]any{"id": "owner-1", "name": "Stale", "phone": "0", "email": "", "version": 1}, "")
	applied, err = Merge(state, []RemoteChange{{EntityType: "owner", EntityID: "owner-1", Operation: "upsert", Payload: older}})
	if err != nil {
		t.Fatal(err)
	}
	if applied != 0 {
		t.Fatalf("stale update should be ignored, got %d", applied)
	}
	if name := owners[0].(map[string]any)["name"]; name != "Remote Name" {
		t.Fatalf("stale update clobbered row: %v", name)
	}
}

func TestMergeNestedCreatesAndDeletes(t *testing.T) {
	state := sampleState()
	payload, _ := envelope(map[string]any{"id": "note-2", "authorId": "u-pim", "body": "recheck", "createdAt": "2026-10-25T11:00:00Z"}, "enc-1")
	applied, err := Merge(state, []RemoteChange{{EntityType: "clinical_note", EntityID: "note-2", Operation: "upsert", Payload: payload}})
	if err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatalf("expected 1 applied, got %d", applied)
	}
	enc := state["encounters"].([]any)[0].(map[string]any)
	if notes := enc["notes"].([]any); len(notes) != 2 {
		t.Fatalf("expected 2 notes, got %d", len(notes))
	}

	applied, err = Merge(state, []RemoteChange{{EntityType: "clinical_note", EntityID: "note-1", Operation: "delete"}})
	if err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatalf("expected delete applied, got %d", applied)
	}
	enc = state["encounters"].([]any)[0].(map[string]any)
	notes := enc["notes"].([]any)
	if len(notes) != 1 || notes[0].(map[string]any)["id"] != "note-2" {
		t.Fatalf("unexpected notes after delete: %v", notes)
	}
}

func TestRunWithoutCloudReturnsNotConfigured(t *testing.T) {
	engine, _ := newEngine(t, nil)
	_, err := engine.Run(context.Background(), encode(t, sampleState()))
	if err == nil || !strings.Contains(err.Error(), ErrNotConfigured.Error()) {
		t.Fatalf("expected ErrNotConfigured, got %v", err)
	}
}

func TestConflictPayloadReplacesLocalRow(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/sync/push":
			var req PushRequest
			json.NewDecoder(r.Body).Decode(&req)
			serverPayload, _ := envelope(map[string]any{"id": "owner-1", "name": "Server Wins", "phone": "082", "email": "", "version": 3}, "")
			json.NewEncoder(w).Encode(PushResponse{Results: []PushResult{{
				EntityType: "owner", EntityID: "owner-1", OccurredAt: req.Changes[0].OccurredAt,
				Status: "conflict", Version: 9, Payload: serverPayload,
			}}})
		case "/api/v1/sync/pull":
			json.NewEncoder(w).Encode(PullResponse{LatestVersion: 9})
		}
	}))
	defer server.Close()

	engine, _ := newEngine(t, server)
	state := sampleState()
	state["outbox"] = []any{
		map[string]any{"changeId": "c1", "entityType": "owner", "entityId": "owner-1", "operation": "upsert", "occurredAt": "2026-10-25T10:00:00Z"},
	}
	result, err := engine.Run(context.Background(), encode(t, state))
	if err != nil {
		t.Fatal(err)
	}
	if result.Conflicts != 1 {
		t.Fatalf("expected 1 conflict, got %d", result.Conflicts)
	}
	var after map[string]any
	if err := json.Unmarshal(result.State, &after); err != nil {
		t.Fatal(err)
	}
	if name := after["owners"].([]any)[0].(map[string]any)["name"]; name != "Server Wins" {
		t.Fatalf("expected server row to win, got %v", name)
	}
	if outbox := after["outbox"].([]any); len(outbox) != 0 {
		t.Fatalf("conflicted change should be acked, got %d pending", len(outbox))
	}
}

func TestClientSendsClinicHeader(t *testing.T) {
	var clinicID string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clinicID = r.Header.Get("X-Clinic-ID")
		json.NewEncoder(w).Encode(PullResponse{LatestVersion: 0})
	}))
	defer server.Close()

	client := NewClient(server.URL, "token")
	client.ClinicID = "clinic-42"
	if _, err := client.Pull(context.Background(), 0); err != nil {
		t.Fatal(err)
	}
	if clinicID != "clinic-42" {
		t.Fatalf("expected clinic-42 header, got %q", clinicID)
	}

	client.ClinicID = ""
	if _, err := client.Pull(context.Background(), 0); err != nil {
		t.Fatal(err)
	}
	if clinicID != defaultClinicID {
		t.Fatalf("expected default clinic header %q, got %q", defaultClinicID, clinicID)
	}
}

func TestAppliedPushStoresServerVersion(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/sync/push":
			var req PushRequest
			json.NewDecoder(r.Body).Decode(&req)
			payload, _ := envelope(map[string]any{
				"id": "owner-1", "name": "Somchai", "phone": "080", "email": "s@example.com",
				"version": 1, "serverVersion": 12,
			}, "")
			json.NewEncoder(w).Encode(PushResponse{Results: []PushResult{{
				EntityType: "owner", EntityID: "owner-1", Operation: "upsert",
				OccurredAt: req.Changes[0].OccurredAt, Status: "applied", Version: 12, Payload: payload,
			}}})
		case "/api/v1/sync/pull":
			json.NewEncoder(w).Encode(PullResponse{LatestVersion: 12})
		}
	}))
	defer server.Close()

	engine, _ := newEngine(t, server)
	state := sampleState()
	state["outbox"] = []any{
		map[string]any{"changeId": "c1", "entityType": "owner", "entityId": "owner-1", "operation": "upsert", "occurredAt": "2026-10-25T10:00:00Z"},
	}
	result, err := engine.Run(context.Background(), encode(t, state))
	if err != nil {
		t.Fatal(err)
	}
	var after map[string]any
	if err := json.Unmarshal(result.State, &after); err != nil {
		t.Fatal(err)
	}
	owner := after["owners"].([]any)[0].(map[string]any)
	if got := intField(owner, "serverVersion"); got != 12 {
		t.Fatalf("expected serverVersion 12, got %d", got)
	}
	if outbox := after["outbox"].([]any); len(outbox) != 0 {
		t.Fatalf("expected empty outbox, got %d", len(outbox))
	}
}

func TestMergePrefersServerVersion(t *testing.T) {
	state := sampleState()
	owners := state["owners"].([]any)
	owner := owners[0].(map[string]any)
	owner["serverVersion"] = json.Number("9")
	owner["name"] = "Server 9"

	older, _ := envelope(map[string]any{"id": "owner-1", "name": "Version 99", "version": 99, "serverVersion": 8}, "")
	applied, err := Merge(state, []RemoteChange{{EntityType: "owner", EntityID: "owner-1", Operation: "upsert", Payload: older}})
	if err != nil {
		t.Fatal(err)
	}
	if applied != 0 {
		t.Fatalf("older serverVersion should not replace, applied=%d", applied)
	}
	if name := owner["name"]; name != "Server 9" {
		t.Fatalf("older serverVersion clobbered row: %v", name)
	}

	newer, _ := envelope(map[string]any{"id": "owner-1", "name": "Server 10", "version": 1, "serverVersion": 10}, "")
	applied, err = Merge(state, []RemoteChange{{EntityType: "owner", EntityID: "owner-1", Operation: "upsert", Payload: newer}})
	if err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatalf("newer serverVersion should replace, applied=%d", applied)
	}
	if name := owners[0].(map[string]any)["name"]; name != "Server 10" {
		t.Fatalf("newer serverVersion not applied: %v", name)
	}
}

func TestDeleteOutboxSendsTombstone(t *testing.T) {
	var pushed PushRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/sync/push":
			json.NewDecoder(r.Body).Decode(&pushed)
			if len(pushed.Changes) != 1 {
				t.Fatalf("expected 1 change, got %d", len(pushed.Changes))
			}
			json.NewEncoder(w).Encode(PushResponse{Results: []PushResult{{
				EntityType: "owner", EntityID: "owner-gone", Operation: "delete",
				OccurredAt: pushed.Changes[0].OccurredAt, Status: "applied", Version: 8,
			}}})
		case "/api/v1/sync/pull":
			json.NewEncoder(w).Encode(PullResponse{LatestVersion: 8})
		}
	}))
	defer server.Close()

	engine, _ := newEngine(t, server)
	state := sampleState()
	state["outbox"] = []any{
		map[string]any{"changeId": "c1", "entityType": "owner", "entityId": "owner-gone", "operation": "delete", "occurredAt": "2026-10-25T10:00:00Z"},
	}
	result, err := engine.Run(context.Background(), encode(t, state))
	if err != nil {
		t.Fatal(err)
	}
	if len(pushed.Changes) != 1 || pushed.Changes[0].Operation != "delete" {
		t.Fatalf("expected delete tombstone, got %+v", pushed.Changes)
	}
	if len(pushed.Changes[0].Payload) != 0 {
		t.Fatalf("expected empty delete payload, got %s", pushed.Changes[0].Payload)
	}
	if result.Pushed != 1 {
		t.Fatalf("expected 1 pushed, got %d", result.Pushed)
	}
}

func TestVaccinationPushesAndMerges(t *testing.T) {
	var pushed PushRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/sync/push":
			json.NewDecoder(r.Body).Decode(&pushed)
			json.NewEncoder(w).Encode(PushResponse{})
		case "/api/v1/sync/pull":
			json.NewEncoder(w).Encode(PullResponse{Changes: []RemoteChange{}, LatestVersion: 9})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	engine, _ := newEngine(t, server)
	state := sampleState()
	state["outbox"] = []any{
		map[string]any{"changeId": "c1", "entityType": "vaccination", "entityId": "vac-1", "operation": "upsert", "occurredAt": "2026-10-25T10:00:00Z"},
	}
	if _, err := engine.Run(context.Background(), encode(t, state)); err != nil {
		t.Fatal(err)
	}
	if len(pushed.Changes) != 1 || pushed.Changes[0].EntityType != "vaccination" {
		t.Fatalf("expected vaccination push, got %+v", pushed.Changes)
	}

	// A pulled vaccination merges into the vaccinations collection.
	merged := sampleState()
	merged["vaccinations"] = []any{}
	payload, _ := envelope(map[string]any{
		"id": "vac-9", "patientId": "patient-1", "vaccineName": "FVRCP", "administeredAt": "2026-10-25T11:00:00Z", "vetId": "u-pim",
	}, "")
	applied, err := Merge(merged, []RemoteChange{{EntityType: "vaccination", EntityID: "vac-9", Operation: "upsert", Payload: payload}})
	if err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatalf("expected 1 applied, got %d", applied)
	}
	vaccinations := merged["vaccinations"].([]any)
	if len(vaccinations) != 1 || vaccinations[0].(map[string]any)["vaccineName"] != "FVRCP" {
		t.Fatalf("expected merged FVRCP vaccination, got %+v", vaccinations)
	}
}

package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/vet-clinic/api/internal/models"
)

type fakeSyncService struct {
	clinicID string
	changes  []models.SyncChange
	since    int64
}

func (f *fakeSyncService) Push(_ context.Context, clinicID string, req models.SyncPushRequest) (*models.SyncPushResponse, error) {
	f.clinicID = clinicID
	f.changes = req.Changes
	results := make([]models.SyncPushResult, 0, len(req.Changes))
	for i, change := range req.Changes {
		results = append(results, models.SyncPushResult{
			EntityType: change.EntityType,
			EntityID:   change.EntityID,
			Operation:  change.Operation,
			OccurredAt: change.OccurredAt,
			Status:     "applied",
			Version:    int64(i + 1),
		})
	}
	return &models.SyncPushResponse{Results: results}, nil
}

func (f *fakeSyncService) Pull(_ context.Context, clinicID string, since int64) (*models.SyncPullResponse, error) {
	f.clinicID = clinicID
	f.since = since
	return &models.SyncPullResponse{
		Changes: []models.SyncChange{{
			EntityType: "owner",
			EntityID:   "owner-1",
			Operation:  "upsert",
			Payload:    json.RawMessage(`{"entity":{"id":"owner-1"}}`),
			OccurredAt: "2026-10-25T10:00:00Z",
			Version:    5,
		}},
		LatestVersion: 5,
	}, nil
}

func newSyncApp(syncService SyncService) *fiber.App {
	handler := NewSyncHandler(syncService)
	app := fiber.New()
	app.Post("/sync/push", handler.Push)
	app.Get("/sync/pull", handler.Pull)
	return app
}

func TestSyncPushAcceptsBatch(t *testing.T) {
	syncService := &fakeSyncService{}
	app := newSyncApp(syncService)

	body := `{"changes":[{"entityType":"owner","entityId":"owner-1","operation":"upsert","payload":{"entity":{"id":"owner-1"}},"occurredAt":"2026-10-25T10:00:00Z"}]}`
	req := httptest.NewRequest("POST", "/sync/push", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Clinic-ID", "clinic-42")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusOK {
		raw, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, raw)
	}
	if syncService.clinicID != "clinic-42" {
		t.Fatalf("expected clinic-42, got %q", syncService.clinicID)
	}
	if len(syncService.changes) != 1 || syncService.changes[0].EntityID != "owner-1" {
		t.Fatalf("unexpected changes: %+v", syncService.changes)
	}

	var out models.SyncPushResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	if len(out.Results) != 1 || out.Results[0].Status != "applied" {
		t.Fatalf("unexpected results: %+v", out.Results)
	}
}

func TestSyncPushRejectsMissingEntityID(t *testing.T) {
	app := newSyncApp(&fakeSyncService{})
	body := `{"changes":[{"entityType":"owner","entityId":"","operation":"upsert","payload":{},"occurredAt":"2026-10-25T10:00:00Z"}]}`
	req := httptest.NewRequest("POST", "/sync/push", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestSyncPullParsesCursor(t *testing.T) {
	syncService := &fakeSyncService{}
	app := newSyncApp(syncService)

	req := httptest.NewRequest("GET", "/sync/pull?since=17", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if syncService.since != 17 {
		t.Fatalf("expected since=17, got %d", syncService.since)
	}
	if syncService.clinicID != defaultSyncClinicID {
		t.Fatalf("expected default clinic %q, got %q", defaultSyncClinicID, syncService.clinicID)
	}

	var out models.SyncPullResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	if out.LatestVersion != 5 || len(out.Changes) != 1 {
		t.Fatalf("unexpected pull response: %+v", out)
	}
}

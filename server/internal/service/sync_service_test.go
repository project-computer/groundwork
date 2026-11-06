package service

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/project-computer/groundwork/server/internal/models"
)

type fakeSyncRepo struct {
	clinicID string
	changes  []models.SyncChange
	since    int64
	pull     []models.SyncChange
	latest   int64
}

func (f *fakeSyncRepo) Push(_ context.Context, clinicID string, changes []models.SyncChange) ([]models.SyncPushResult, error) {
	f.clinicID = clinicID
	f.changes = changes
	return []models.SyncPushResult{{EntityID: changes[0].EntityID, Status: "applied", Version: 1}}, nil
}

func (f *fakeSyncRepo) Pull(_ context.Context, clinicID string, since int64) ([]models.SyncChange, int64, error) {
	f.clinicID = clinicID
	f.since = since
	return f.pull, f.latest, nil
}

func fixedNow() time.Time {
	return time.Date(2026, 10, 25, 10, 0, 0, 0, time.UTC)
}

func newTestSyncService(repo SyncRepository) *SyncService {
	service := NewSyncService(repo)
	service.now = fixedNow
	return service
}

func validChange() models.SyncChange {
	return models.SyncChange{
		EntityType: "owner",
		EntityID:   "owner-1",
		Operation:  "upsert",
		Payload:    json.RawMessage(`{"entity":{"id":"owner-1","name":"Somchai"}}`),
		OccurredAt: "2026-10-25T10:01:00Z",
	}
}

func TestSyncPushValidatesAndDelegates(t *testing.T) {
	repo := &fakeSyncRepo{}
	service := newTestSyncService(repo)

	resp, err := service.Push(context.Background(), "clinic-01", models.SyncPushRequest{
		Changes: []models.SyncChange{validChange()},
	})
	if err != nil {
		t.Fatal(err)
	}
	if repo.clinicID != "clinic-01" || len(repo.changes) != 1 {
		t.Fatalf("unexpected repository call: %+v", repo)
	}
	if len(resp.Results) != 1 || resp.Results[0].Status != "applied" {
		t.Fatalf("unexpected response: %+v", resp)
	}
}

func TestSyncPushRejectsInvalidChanges(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*models.SyncChange)
		want   error
	}{
		{name: "unknown type", mutate: func(c *models.SyncChange) { c.EntityType = "unicorn" }, want: ErrSyncInvalidChange},
		{name: "bad operation", mutate: func(c *models.SyncChange) { c.Operation = "merge" }, want: ErrSyncInvalidChange},
		{name: "bad timestamp", mutate: func(c *models.SyncChange) { c.OccurredAt = "yesterday" }, want: ErrSyncInvalidChange},
		{name: "clock skew", mutate: func(c *models.SyncChange) { c.OccurredAt = "2026-10-25T10:10:00Z" }, want: ErrSyncClockSkew},
		{name: "missing payload", mutate: func(c *models.SyncChange) { c.Payload = nil }, want: ErrSyncInvalidChange},
		{name: "missing entity", mutate: func(c *models.SyncChange) { c.Payload = json.RawMessage(`{}`) }, want: ErrSyncInvalidChange},
		{name: "mismatched id", mutate: func(c *models.SyncChange) {
			c.Payload = json.RawMessage(`{"entity":{"id":"other"}}`)
		}, want: ErrSyncInvalidChange},
		{name: "nested without parent", mutate: func(c *models.SyncChange) {
			c.EntityType = "clinical_note"
			c.Payload = json.RawMessage(`{"entity":{"id":"owner-1"}}`)
		}, want: ErrSyncInvalidChange},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			change := validChange()
			tt.mutate(&change)
			_, err := newTestSyncService(&fakeSyncRepo{}).Push(context.Background(), "clinic-01", models.SyncPushRequest{
				Changes: []models.SyncChange{change},
			})
			if !errors.Is(err, tt.want) {
				t.Fatalf("expected %v, got %v", tt.want, err)
			}
		})
	}
}

func TestSyncPushRequiresClinicID(t *testing.T) {
	_, err := newTestSyncService(&fakeSyncRepo{}).Push(context.Background(), "", models.SyncPushRequest{
		Changes: []models.SyncChange{validChange()},
	})
	if !errors.Is(err, ErrSyncInvalidChange) {
		t.Fatalf("expected ErrSyncInvalidChange, got %v", err)
	}
}

func TestSyncPullNormalizesNegativeCursor(t *testing.T) {
	repo := &fakeSyncRepo{pull: []models.SyncChange{}, latest: 4}
	resp, err := newTestSyncService(repo).Pull(context.Background(), "clinic-01", -5)
	if err != nil {
		t.Fatal(err)
	}
	if repo.since != 0 {
		t.Fatalf("expected since=0, got %d", repo.since)
	}
	if resp.LatestVersion != 4 || resp.FullResync || resp.Changes == nil {
		t.Fatalf("unexpected pull response: %+v", resp)
	}
}

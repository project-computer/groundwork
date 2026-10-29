package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/vet-clinic/api/internal/models"
)

var (
	ErrSyncInvalidChange = errors.New("invalid sync change")
	ErrSyncClockSkew     = errors.New("sync timestamp is too far in the future")
)

// maxClockSkew keeps last-write-wins from being hijacked by a device with a
// clock set in the future.
const maxClockSkew = 5 * time.Minute

var syncEntityTypes = map[string]bool{
	"owner":          true,
	"patient":        true,
	"appointment":    true,
	"encounter":      true,
	"product":        true,
	"stock_movement": true,
	"invoice":        true,
	"payment":        true,
	"user":           true,
	"vaccination":    true,
	"case_transfer":  true,
	"clinical_note":  true,
	"diagnosis":      true,
	"prescription":   true,
}

var syncNestedEntityTypes = map[string]bool{
	"clinical_note": true,
	"diagnosis":     true,
	"prescription":  true,
}

type SyncRepository interface {
	Push(ctx context.Context, clinicID string, changes []models.SyncChange) ([]models.SyncPushResult, error)
	Pull(ctx context.Context, clinicID string, since int64) ([]models.SyncChange, int64, error)
}

type SyncService struct {
	repo SyncRepository
	now  func() time.Time
}

func NewSyncService(repo SyncRepository) *SyncService {
	return &SyncService{repo: repo, now: time.Now}
}

func (s *SyncService) Push(ctx context.Context, clinicID string, req models.SyncPushRequest) (*models.SyncPushResponse, error) {
	if clinicID == "" {
		return nil, fmt.Errorf("%w: clinic id is required", ErrSyncInvalidChange)
	}
	for _, change := range req.Changes {
		if err := s.validateChange(change); err != nil {
			return nil, err
		}
	}

	results, err := s.repo.Push(ctx, clinicID, req.Changes)
	if err != nil {
		return nil, err
	}
	return &models.SyncPushResponse{Results: results}, nil
}

func (s *SyncService) Pull(ctx context.Context, clinicID string, since int64) (*models.SyncPullResponse, error) {
	if clinicID == "" {
		return nil, fmt.Errorf("%w: clinic id is required", ErrSyncInvalidChange)
	}
	if since < 0 {
		since = 0
	}
	changes, latest, err := s.repo.Pull(ctx, clinicID, since)
	if err != nil {
		return nil, err
	}
	if changes == nil {
		changes = []models.SyncChange{}
	}
	return &models.SyncPullResponse{
		Changes:       changes,
		LatestVersion: latest,
		FullResync:    false,
	}, nil
}

func (s *SyncService) validateChange(change models.SyncChange) error {
	if !syncEntityTypes[change.EntityType] {
		return fmt.Errorf("%w: unknown entity type %q", ErrSyncInvalidChange, change.EntityType)
	}
	if change.EntityID == "" {
		return fmt.Errorf("%w: entity id is required", ErrSyncInvalidChange)
	}
	switch change.Operation {
	case "upsert", "append", "delete":
	default:
		return fmt.Errorf("%w: invalid operation %q", ErrSyncInvalidChange, change.Operation)
	}

	occurredAt, err := time.Parse(time.RFC3339Nano, change.OccurredAt)
	if err != nil {
		return fmt.Errorf("%w: invalid occurredAt %q", ErrSyncInvalidChange, change.OccurredAt)
	}
	if occurredAt.After(s.now().Add(maxClockSkew)) {
		return ErrSyncClockSkew
	}

	if change.Operation == "delete" {
		return nil
	}
	return validateSyncPayload(change)
}

func validateSyncPayload(change models.SyncChange) error {
	if len(change.Payload) == 0 {
		return fmt.Errorf("%w: payload is required for %s", ErrSyncInvalidChange, change.Operation)
	}
	var env struct {
		Entity   map[string]any `json:"entity"`
		ParentID string         `json:"parentId"`
	}
	dec := json.NewDecoder(bytes.NewReader(change.Payload))
	dec.UseNumber()
	if err := dec.Decode(&env); err != nil {
		return fmt.Errorf("%w: payload must be an envelope: %v", ErrSyncInvalidChange, err)
	}
	if env.Entity == nil {
		return fmt.Errorf("%w: payload.entity is required", ErrSyncInvalidChange)
	}
	if id, _ := env.Entity["id"].(string); id == "" {
		env.Entity["id"] = change.EntityID
	} else if id != change.EntityID {
		return fmt.Errorf("%w: entity id %q does not match %q", ErrSyncInvalidChange, id, change.EntityID)
	}
	if syncNestedEntityTypes[change.EntityType] && env.ParentID == "" {
		return fmt.Errorf("%w: parentId is required for %s", ErrSyncInvalidChange, change.EntityType)
	}
	return nil
}

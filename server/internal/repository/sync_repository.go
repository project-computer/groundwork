package repository

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
)

const syncPullLimit = 1000

type SyncRepository struct {
	db *pgxpool.Pool
}

func NewSyncRepository(db *pgxpool.Pool) *SyncRepository {
	return &SyncRepository{db: db}
}

// Push applies a batch of changes in one transaction. Version allocation is
// serialized per clinic with an advisory lock so versions commit in order and
// a pull cursor can never skip a change that committed late.
func (r *SyncRepository) Push(ctx context.Context, clinicID string, changes []models.SyncChange) ([]models.SyncPushResult, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", "sync:"+clinicID); err != nil {
		return nil, err
	}

	results := make([]models.SyncPushResult, 0, len(changes))
	for _, change := range changes {
		occurredAt, err := time.Parse(time.RFC3339Nano, change.OccurredAt)
		if err != nil {
			return nil, err
		}

		var (
			existingVersion  int64
			existingOccurred time.Time
			existingPayload  []byte
			existingOp       string
		)
		err = tx.QueryRow(ctx, `
			SELECT version, occurred_ts, payload, operation
			FROM sync_entities
			WHERE clinic_id = $1 AND entity_type = $2 AND entity_id = $3
		`, clinicID, change.EntityType, change.EntityID).Scan(
			&existingVersion, &existingOccurred, &existingPayload, &existingOp,
		)

		switch {
		case errors.Is(err, pgx.ErrNoRows):
			version, err := nextSyncVersion(ctx, tx)
			if err != nil {
				return nil, err
			}
			payload, parentID, err := canonicalSyncPayload(change, version)
			if err != nil {
				return nil, err
			}
			if err := insertSyncEntity(ctx, tx, clinicID, change, parentID, payload, version, occurredAt); err != nil {
				return nil, err
			}
			results = append(results, syncResult(change, "applied", version, payload))
		case err != nil:
			return nil, err
		case !occurredAt.After(existingOccurred):
			// Equal timestamps are an idempotent retry; older ones lose to the
			// copy already on the server.
			status := "conflict"
			if occurredAt.Equal(existingOccurred) {
				status = "applied"
			}
			results = append(results, models.SyncPushResult{
				EntityType: change.EntityType,
				EntityID:   change.EntityID,
				Operation:  existingOp,
				OccurredAt: change.OccurredAt,
				Status:     status,
				Version:    existingVersion,
				Payload:    json.RawMessage(existingPayload),
			})
		default:
			version, err := nextSyncVersion(ctx, tx)
			if err != nil {
				return nil, err
			}
			payload, parentID, err := canonicalSyncPayload(change, version)
			if err != nil {
				return nil, err
			}
			if err := updateSyncEntity(ctx, tx, clinicID, change, parentID, payload, version, occurredAt); err != nil {
				return nil, err
			}
			results = append(results, syncResult(change, "applied", version, payload))
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return results, nil
}

func (r *SyncRepository) Pull(ctx context.Context, clinicID string, since int64) ([]models.SyncChange, int64, error) {
	rows, err := r.db.Query(ctx, `
		SELECT entity_type, entity_id, operation, payload, occurred_at, version
		FROM sync_entities
		WHERE clinic_id = $1 AND version > $2
		ORDER BY version ASC
		LIMIT $3
	`, clinicID, since, syncPullLimit)
	if err != nil {
		return nil, since, err
	}
	defer rows.Close()

	changes := []models.SyncChange{}
	latest := since
	for rows.Next() {
		var (
			change  models.SyncChange
			payload []byte
		)
		if err := rows.Scan(
			&change.EntityType, &change.EntityID, &change.Operation,
			&payload, &change.OccurredAt, &change.Version,
		); err != nil {
			return nil, since, err
		}
		change.Payload = json.RawMessage(payload)
		changes = append(changes, change)
		latest = change.Version
	}
	if err := rows.Err(); err != nil {
		return nil, since, err
	}
	return changes, latest, nil
}

func nextSyncVersion(ctx context.Context, tx pgx.Tx) (int64, error) {
	var version int64
	err := tx.QueryRow(ctx, "SELECT nextval('sync_version_seq')").Scan(&version)
	return version, err
}

func insertSyncEntity(
	ctx context.Context,
	tx pgx.Tx,
	clinicID string,
	change models.SyncChange,
	parentID string,
	payload json.RawMessage,
	version int64,
	occurredAt time.Time,
) error {
	var deletedAt any
	if change.Operation == "delete" {
		deletedAt = time.Now().UTC()
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO sync_entities (
			clinic_id, entity_type, entity_id, parent_id, operation, payload,
			version, occurred_at, occurred_ts, deleted_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
	`, clinicID, change.EntityType, change.EntityID, nullableString(parentID), change.Operation,
		payload, version, change.OccurredAt, occurredAt, deletedAt)
	return err
}

func updateSyncEntity(
	ctx context.Context,
	tx pgx.Tx,
	clinicID string,
	change models.SyncChange,
	parentID string,
	payload json.RawMessage,
	version int64,
	occurredAt time.Time,
) error {
	var deletedAt any
	if change.Operation == "delete" {
		deletedAt = time.Now().UTC()
	}
	_, err := tx.Exec(ctx, `
		UPDATE sync_entities
		SET parent_id = $4, operation = $5, payload = $6, version = $7,
		    occurred_at = $8, occurred_ts = $9, deleted_at = $10, updated_at = NOW()
		WHERE clinic_id = $1 AND entity_type = $2 AND entity_id = $3
	`, clinicID, change.EntityType, change.EntityID, nullableString(parentID), change.Operation,
		payload, version, change.OccurredAt, occurredAt, deletedAt)
	return err
}

func canonicalSyncPayload(change models.SyncChange, version int64) (json.RawMessage, string, error) {
	var env struct {
		Entity   map[string]any `json:"entity"`
		ParentID string         `json:"parentId"`
	}
	if len(change.Payload) > 0 {
		dec := json.NewDecoder(bytes.NewReader(change.Payload))
		dec.UseNumber()
		if err := dec.Decode(&env); err != nil {
			return nil, "", err
		}
	}
	if env.Entity == nil {
		env.Entity = map[string]any{}
	}
	if id, _ := env.Entity["id"].(string); id == "" {
		env.Entity["id"] = change.EntityID
	}
	env.Entity["serverVersion"] = version

	encoded, err := json.Marshal(env)
	if err != nil {
		return nil, "", err
	}
	return encoded, env.ParentID, nil
}

func syncResult(change models.SyncChange, status string, version int64, payload json.RawMessage) models.SyncPushResult {
	result := models.SyncPushResult{
		EntityType: change.EntityType,
		EntityID:   change.EntityID,
		Operation:  change.Operation,
		OccurredAt: change.OccurredAt,
		Status:     status,
		Version:    version,
	}
	if change.Operation != "delete" {
		result.Payload = payload
	}
	return result
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

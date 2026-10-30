package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AuditRepository struct {
	db *pgxpool.Pool
}

func NewAuditRepository(db *pgxpool.Pool) *AuditRepository {
	return &AuditRepository{db: db}
}

// Insert appends an audit entry. Failures are returned to the caller, which
// decides whether they are fatal (typically not — auditing must not block the
// primary operation, but should be logged).
func (r *AuditRepository) Insert(ctx context.Context, clinicID, userID int, action, entityType string, entityID int, newValues json.RawMessage) error {
	query := `
		INSERT INTO audit_logs (clinic_id, user_id, action, entity_type, entity_id, new_values)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	var uid *int
	if userID > 0 {
		uid = &userID
	}
	var eid *int
	if entityID > 0 {
		eid = &entityID
	}
	result, err := r.db.Exec(ctx, query, clinicID, uid, action, entityType, eid, newValues)
	if err != nil {
		return fmt.Errorf("failed to insert audit log: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("audit log insert affected no rows")
	}
	return nil
}

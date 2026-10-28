package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ClinicRepository struct {
	db *pgxpool.Pool
}

func NewClinicRepository(db *pgxpool.Pool) *ClinicRepository {
	return &ClinicRepository{db: db}
}

// GetSettings returns the clinic's settings JSONB verbatim. Shape is owned by
// clients (opening hours, services, pricing, invoice numbering, tax — see the
// feature list); the backend only guarantees it is a JSON object.
func (r *ClinicRepository) GetSettings(ctx context.Context, clinicID int) (json.RawMessage, error) {
	var settings json.RawMessage
	err := r.db.QueryRow(ctx, "SELECT settings FROM clinics WHERE id = $1", clinicID).Scan(&settings)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("clinic not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch clinic settings: %w", err)
	}
	return settings, nil
}

// UpdateSettings merges the given object into clinics.settings. Merge (not
// replace) so clients PATCH individual sections without clobbering others.
func (r *ClinicRepository) UpdateSettings(ctx context.Context, clinicID int, settings json.RawMessage) (json.RawMessage, error) {
	query := `
		UPDATE clinics
		SET settings = settings || $2, updated_at = NOW()
		WHERE id = $1
		RETURNING settings
	`
	var updated json.RawMessage
	err := r.db.QueryRow(ctx, query, clinicID, settings).Scan(&updated)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("clinic not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to update clinic settings: %w", err)
	}
	return updated, nil
}

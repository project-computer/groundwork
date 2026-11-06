// Package store owns the single clinic document persisted in SQLite, matching
// the frontend ClinicState shape and the Rust state_load/state_save commands.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/project-computer/groundwork/sidecar/internal/db"
)

var ErrInvalidState = errors.New("invalid clinic state")

// requiredArrays mirrors fixtures/clinic-document.json and the frontend
// CLINIC_STATE_COLLECTIONS: every collection must be present before a
// document is persisted. Pinned by store_test.go.
var requiredArrays = []string{
	"users",
	"owners",
	"patients",
	"appointments",
	"encounters",
	"products",
	"stockMovements",
	"suppliers",
	"inventoryItems",
	"inventoryLots",
	"invoices",
	"payments",
	"vaccinations",
	"caseTransfers",
	"audit",
	"outbox",
}

type Store struct {
	db *db.DB
}

func New(database *db.DB) *Store {
	return &Store{db: database}
}

// Validate mirrors the Rust validate_state guard and the frontend isClinicState
// check: core collections must be present before a document is persisted.
func Validate(raw []byte) error {
	var state map[string]any
	if err := json.Unmarshal(raw, &state); err != nil {
		return fmt.Errorf("%w: state must be a JSON object", ErrInvalidState)
	}
	if _, ok := state["clinic"]; !ok {
		return fmt.Errorf("%w: state.clinic is required", ErrInvalidState)
	}
	for _, key := range requiredArrays {
		value, ok := state[key]
		if !ok {
			return fmt.Errorf("%w: state.%s is required", ErrInvalidState, key)
		}
		if _, ok := value.([]any); !ok {
			return fmt.Errorf("%w: state.%s must be an array", ErrInvalidState, key)
		}
	}
	return nil
}

// Load returns the raw clinic document, or nil when nothing has been saved yet.
func (s *Store) Load(ctx context.Context) (json.RawMessage, error) {
	var content string
	err := s.db.Conn.QueryRowContext(ctx,
		"SELECT content FROM clinic_state WHERE id = 1",
	).Scan(&content)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(content), nil
}

func (s *Store) Save(ctx context.Context, raw []byte) error {
	if err := Validate(raw); err != nil {
		return err
	}
	_, err := s.db.Conn.ExecContext(ctx,
		`INSERT INTO clinic_state (id, content, updated_at) VALUES (1, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
		string(raw), db.UtcNow(),
	)
	return err
}

func (s *Store) Meta(ctx context.Context, key string) (string, bool, error) {
	var value string
	err := s.db.Conn.QueryRowContext(ctx,
		"SELECT value FROM sync_meta WHERE key = ?", key,
	).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return value, true, nil
}

func (s *Store) SetMeta(ctx context.Context, key, value string) error {
	_, err := s.db.Conn.ExecContext(ctx,
		`INSERT INTO sync_meta (key, value, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		key, value, db.UtcNow(),
	)
	return err
}

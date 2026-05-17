package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vet-clinic/api/internal/models"
)

type TransferRepository struct {
	db *pgxpool.Pool
}

func NewTransferRepository(db *pgxpool.Pool) *TransferRepository {
	return &TransferRepository{db: db}
}

func (r *TransferRepository) Create(ctx context.Context, clinicID, userID int, t *models.CaseTransfer) error {
	var count int
	err := r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM case_transfers WHERE clinic_id = $1",
		clinicID,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("failed to count transfers: %w", err)
	}

	t.CustomID = fmt.Sprintf("TRF-%d", count+1)
	t.ClinicID = clinicID
	t.Status = "pending"
	t.ShareToken = uuid.New().String()
	t.ExpiresAt = models.NewNullTime(time.Now().Add(30 * 24 * time.Hour))
	t.CreatedBy = userID

	transferDataJSON, err := json.Marshal(t.TransferData)
	if err != nil {
		return fmt.Errorf("failed to marshal transfer data: %w", err)
	}

	query := `
		INSERT INTO case_transfers (
			clinic_id, custom_id, pet_id, source_visit_id, pet_name, owner_name,
			owner_phone, referral_clinic_name, referral_reason, transfer_data,
			status, share_token, expires_at, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		RETURNING id, created_at, updated_at
	`

	return r.db.QueryRow(ctx, query,
		t.ClinicID, t.CustomID, t.PetID, t.SourceVisitID,
		t.PetName, t.OwnerName, t.OwnerPhone, t.ReferralClinic,
		t.ReferralReason, transferDataJSON, t.Status, t.ShareToken,
		t.ExpiresAt, t.CreatedBy,
	).Scan(&t.ID, &t.CreatedAt, &t.UpdatedAt)
}

func (r *TransferRepository) GetByID(ctx context.Context, id int) (*models.CaseTransfer, error) {
	t := &models.CaseTransfer{}

	var transferDataJSON json.RawMessage

	query := `
		SELECT id, clinic_id, custom_id, pet_id, source_visit_id, pet_name, owner_name,
		       owner_phone, referral_clinic_name, referral_reason, transfer_data,
		       status, share_token, expires_at, created_by,
		       created_at, updated_at
		FROM case_transfers
		WHERE id = $1
	`

	err := r.db.QueryRow(ctx, query, id).Scan(
		&t.ID, &t.ClinicID, &t.CustomID, &t.PetID, &t.SourceVisitID,
		&t.PetName, &t.OwnerName, &t.OwnerPhone, &t.ReferralClinic,
		&t.ReferralReason, &transferDataJSON, &t.Status, &t.ShareToken,
		&t.ExpiresAt, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
	)

	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("transfer not found")
	}

	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(transferDataJSON, &t.TransferData); err != nil {
		return nil, fmt.Errorf("failed to unmarshal transfer data: %w", err)
	}

	return t, nil
}

func (r *TransferRepository) GetByShareToken(ctx context.Context, token string) (*models.CaseTransfer, error) {
	t := &models.CaseTransfer{}

	var transferDataJSON json.RawMessage

	query := `
		SELECT id, clinic_id, custom_id, pet_id, source_visit_id, pet_name, owner_name,
		       owner_phone, referral_clinic_name, referral_reason, transfer_data,
		       status, share_token, expires_at, created_by,
		       created_at, updated_at
		FROM case_transfers
		WHERE share_token = $1 AND (expires_at IS NULL OR expires_at > NOW())
	`

	err := r.db.QueryRow(ctx, query, token).Scan(
		&t.ID, &t.ClinicID, &t.CustomID, &t.PetID, &t.SourceVisitID,
		&t.PetName, &t.OwnerName, &t.OwnerPhone, &t.ReferralClinic,
		&t.ReferralReason, &transferDataJSON, &t.Status, &t.ShareToken,
		&t.ExpiresAt, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
	)

	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("transfer not found or expired")
	}

	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(transferDataJSON, &t.TransferData); err != nil {
		return nil, fmt.Errorf("failed to unmarshal transfer data: %w", err)
	}

	return t, nil
}

func (r *TransferRepository) List(ctx context.Context, clinicID int, query models.TransferListQuery) ([]*models.CaseTransfer, int, error) {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.Limit < 1 || query.Limit > 100 {
		query.Limit = 20
	}
	offset := (query.Page - 1) * query.Limit

	whereClauses := []string{"clinic_id = $1"}
	args := []interface{}{clinicID}
	argIdx := 2

	if query.Status != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, query.Status)
		argIdx++
	}

	if query.PetID > 0 {
		whereClauses = append(whereClauses, fmt.Sprintf("pet_id = $%d", argIdx))
		args = append(args, query.PetID)
		argIdx++
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	var total int
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM case_transfers WHERE %s", whereSQL)
	err := r.db.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count transfers: %w", err)
	}

	listQuery := fmt.Sprintf(`
		SELECT id, clinic_id, custom_id, pet_id, source_visit_id, pet_name, owner_name,
		       owner_phone, referral_clinic_name, referral_reason, transfer_data,
		       status, share_token, expires_at, created_by,
		       created_at, updated_at
		FROM case_transfers
		WHERE %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argIdx, argIdx+1)
	args = append(args, query.Limit, offset)

	rows, err := r.db.Query(ctx, listQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query transfers: %w", err)
	}
	defer rows.Close()

	var transfers []*models.CaseTransfer
	for rows.Next() {
		t := &models.CaseTransfer{}
		var transferDataJSON json.RawMessage
		err := rows.Scan(
			&t.ID, &t.ClinicID, &t.CustomID, &t.PetID, &t.SourceVisitID,
			&t.PetName, &t.OwnerName, &t.OwnerPhone, &t.ReferralClinic,
			&t.ReferralReason, &transferDataJSON, &t.Status, &t.ShareToken,
			&t.ExpiresAt, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan transfer: %w", err)
		}
		if err := json.Unmarshal(transferDataJSON, &t.TransferData); err != nil {
			return nil, 0, fmt.Errorf("failed to unmarshal transfer data: %w", err)
		}
		transfers = append(transfers, t)
	}

	return transfers, total, rows.Err()
}

func (r *TransferRepository) UpdateStatus(ctx context.Context, id int, status string) error {
	query := `UPDATE case_transfers SET status = $1, updated_at = NOW() WHERE id = $2`
	result, err := r.db.Exec(ctx, query, status, id)
	if err != nil {
		return fmt.Errorf("failed to update transfer status: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("transfer not found")
	}
	return nil
}
